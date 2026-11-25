"""Send one completed SIP call to the Tatravet dashboard without logging call data."""

import asyncio
import json
import logging
import os
import re
from pathlib import Path

from livekit.agents import ChatContext, inference, utils

logger = logging.getLogger("pr011-livekit-eocr")
REASONS = {
    "appointment", "appointment_change", "animal_health", "services_prices",
    "test_results", "clinic_info", "other", "unknown",
}
MAX_AUDIO_BYTES = 100 * 1024 * 1024


def reporting_configured() -> bool:
    return all(os.environ.get(name) for name in (
        "LIVEKIT_EOCR_URL", "LIVEKIT_EOCR_SECRET", "AWS_ENDPOINT_URL",
        "AWS_S3_BUCKET_NAME", "AWS_DEFAULT_REGION", "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
    ))


def _storage():
    import boto3
    from botocore.config import Config

    return boto3.client(
        "s3", endpoint_url=os.environ["AWS_ENDPOINT_URL"],
        region_name=os.environ["AWS_DEFAULT_REGION"],
        aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
        config=Config(
            s3={"addressing_style": "virtual"},
            connect_timeout=5, read_timeout=10,
            retries={"max_attempts": 3},
        ),
    )


def _turns(report) -> list[dict]:
    history = report.chat_history.to_dict(exclude_timestamp=False)
    started = report.started_at or report.timestamp
    result = []
    total_chars = 0
    for item in history.get("items", []):
        if item.get("type") != "message" or item.get("role") not in ("user", "assistant"):
            continue
        content = item.get("content") or []
        message = " ".join(part for part in content if isinstance(part, str)).strip()
        if not message:
            continue
        remaining = 100_000 - total_chars
        if remaining <= 0:
            break
        message = message[: min(2_000, remaining)]
        total_chars += len(message)
        result.append({
            "role": item["role"], "text": message[:10_000],
            "secondsFromStart": max(0, min(86_400, round(item.get("created_at", started) - started, 2))),
        })
    return result[:500]


async def _analyse(turns: list[dict]) -> tuple[str | None, str | None, str | None, bool]:
    if not turns:
        return None, None, None, False
    transcript = "\n".join(f'{turn["role"]}: {turn["text"]}' for turn in turns)
    context = ChatContext()
    context.add_message(role="system", content=(
        "Analyse a Polish veterinary clinic call. Return only a JSON object with keys "
        "summary, contactReason, callbackNumber. summary: a brief factual Polish summary, "
        "at most 500 characters. contactReason: exactly one of appointment, "
        "appointment_change, animal_health, services_prices, test_results, clinic_info, "
        "other, unknown. Use unknown if unclear. callbackNumber: a phone number only if "
        "the caller explicitly gave it for a callback; otherwise null. Do not infer facts."
    ))
    context.add_message(role="user", content=transcript[-30_000:])
    model = inference.LLM(model="openai/gpt-5.4-mini", inference_class="low")
    response = await asyncio.wait_for(model.chat(chat_ctx=context).collect(), timeout=25)
    data = json.loads(response.text)
    if not isinstance(data, dict) or data.get("contactReason") not in REASONS:
        raise ValueError("Invalid post-call analysis")
    summary = data.get("summary")
    if not isinstance(summary, str) or not summary.strip():
        summary = None
    number = data.get("callbackNumber")
    if not isinstance(number, str) or not re.fullmatch(r"\+?[0-9 ()-]{9,30}", number):
        number = None
    return summary[:500] if summary else None, data["contactReason"], number, True


def _upload_audio(path: Path, room_id: str) -> tuple[str, int]:
    size = path.stat().st_size
    if size <= 0 or size > MAX_AUDIO_BYTES:
        raise ValueError("Invalid audio size")
    key = f"calls/livekit/{room_id}/audio.oga"
    with path.open("rb") as audio:
        _storage().put_object(
            Bucket=os.environ["AWS_S3_BUCKET_NAME"], Key=key,
            Body=audio, ContentType="audio/ogg",
        )
    return key, size


def _put_outbox(key: str, body: bytes) -> None:
    _storage().put_object(
        Bucket=os.environ["AWS_S3_BUCKET_NAME"], Key=key,
        Body=body, ContentType="application/json",
    )


def _delete_outbox(key: str) -> None:
    _storage().delete_object(Bucket=os.environ["AWS_S3_BUCKET_NAME"], Key=key)


async def _deliver(body: bytes) -> bool:
    session = utils.http_context.http_session()
    for attempt in range(3):
        try:
            async with asyncio.timeout(12):
                async with session.post(
                    os.environ["LIVEKIT_EOCR_URL"], data=body,
                    headers={
                        "Authorization": f'Bearer {os.environ["LIVEKIT_EOCR_SECRET"]}',
                        "Content-Type": "application/json",
                    },
                ) as response:
                    result = await response.json()
                    if response.status == 200 and result.get("accepted") is True:
                        return True
                    if response.status in (400, 401, 403):
                        logger.error("LiveKit report rejected: status %s", response.status)
                        return False
        except Exception:
            logger.warning("LiveKit report delivery attempt failed")
        await asyncio.sleep(2 ** attempt)
    return False


async def deliver_session_report(report, *, caller: str | None, is_sip: bool, agent_name: str) -> None:
    if not is_sip and os.environ.get("LIVEKIT_EOCR_INCLUDE_BROWSER") != "true":
        return
    if not reporting_configured():
        logger.error("LiveKit report integration is not configured")
        return
    room_id = report.room_id
    if not re.fullmatch(r"RM_[A-Za-z0-9]+", room_id):
        logger.error("LiveKit report has an invalid room ID")
        return
    turns = _turns(report)
    try:
        summary, reason, supplied_number, analysis_ok = await _analyse(turns)
    except Exception:
        logger.warning("LiveKit post-call analysis failed")
        summary, reason, supplied_number, analysis_ok = None, None, None, False
    recording = {"state": "FAILED", "key": None, "bytes": None}
    if report.audio_recording_path:
        try:
            key, size = await asyncio.wait_for(
                asyncio.to_thread(_upload_audio, report.audio_recording_path, room_id), timeout=45,
            )
            recording = {"state": "ARCHIVED", "key": key, "bytes": size}
        except Exception:
            logger.warning("LiveKit audio archive failed")
    started = report.started_at or report.timestamp
    payload = {
        "version": 1, "provider": "livekit", "agentName": agent_name,
        "roomId": room_id, "jobId": report.job_id,
        "caller": caller or supplied_number,
        "startedAt": _iso(started), "endedAt": _iso(report.timestamp),
        "endReason": _end_reason(report), "turns": turns, "summary": summary,
        "contactReason": reason, "analysisOk": analysis_ok,
        "recording": recording,
    }
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
    outbox_key = f"livekit-eocr/{room_id}.json"
    queued = False
    for attempt in range(3):
        try:
            await asyncio.wait_for(asyncio.to_thread(_put_outbox, outbox_key, body), timeout=20)
            queued = True
            break
        except Exception:
            await asyncio.sleep(2 ** attempt)
    if not queued:
        logger.error("LiveKit report outbox write failed")
    if await _deliver(body):
        try:
            await asyncio.wait_for(asyncio.to_thread(_delete_outbox, outbox_key), timeout=20)
        except Exception:
            logger.warning("LiveKit report outbox cleanup failed")
    else:
        logger.error("LiveKit report delivery failed; queued=%s", queued)


def _iso(timestamp: float) -> str:
    from datetime import UTC, datetime
    return datetime.fromtimestamp(timestamp, UTC).isoformat().replace("+00:00", "Z")


def _end_reason(report) -> str | None:
    for event in reversed(report.events):
        if event.type == "close":
            return str(event.reason.value if hasattr(event.reason, "value") else event.reason)
    return None

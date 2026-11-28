import asyncio
import json
import logging
import os
import re
import sys
import time
import unicodedata
from collections.abc import AsyncIterable
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv
from livekit import agents, rtc
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    ChatContext,
    ChatMessage,
    ConversationItemAddedEvent,
    inference,
    room_io,
)

from livekit_upstash_faq import query_pr011_faq
from livekit_eocr import deliver_session_report, reporting_configured
from opening_hours import NO_CONFIRMED_HOURS, current_clinic_status, opening_hours_answer
from temporal_context import (
    calendar_only_answer,
    faq_query_with_poland_date,
    is_opening_hours_question,
    runtime_calendar_context,
)

load_dotenv(ROOT / ".env")

required_env = (
    "LIVEKIT_URL",
    "LIVEKIT_API_KEY",
    "LIVEKIT_API_SECRET",
    "PR011_UPSTASH_VECTOR_REST_URL",
    "PR011_UPSTASH_VECTOR_REST_TOKEN",
)
missing_env = [name for name in required_env if not os.environ.get(name)]
if missing_env:
    raise RuntimeError(f"Missing required environment variables: {', '.join(missing_env)}")

logger = logging.getLogger("pr011-livekit-benchmark")
PROMPT_FILE = Path(__file__).with_name("prompt.md")
SETTINGS_FILE = Path(__file__).with_name("settings.json")
# GPT-Live context-channel appends are capped at 500 tokens; stay conservatively below it.
MAX_KNOWLEDGE_CHARS = 1_200


def _markdown_block(text: str, heading: str) -> str:
    marker = f"## {heading}"
    try:
        remainder = text.split(marker, 1)[1]
        fenced = remainder.split("```", 2)[1]
    except IndexError as exc:
        raise ValueError(f"Missing fenced block under '{marker}'") from exc
    return fenced.split("\n", 1)[1].rsplit("\n", 1)[0].strip()


def _format_knowledge(results: list[dict]) -> str:
    facts: list[str] = []
    used = 0
    for result in results:
        data = result.get("data")
        if not isinstance(data, str) or not data.strip():
            continue
        remaining = MAX_KNOWLEDGE_CHARS - used
        if remaining <= 0:
            break
        # Upstash data starts with internal Category/Question labels. Commentary is
        # speech-oriented, so pass only the approved answer body to GPT-Live.
        fact = data.strip().split("\n\n", 1)[-1][:remaining]
        facts.append(fact)
        used += len(fact)

    if not facts:
        return (
            "Nie mam potwierdzonej informacji. Najlepiej sprawdzić to bezpośrednio "
            "z personelem Tatravet."
        )

    return "\n\n".join(facts)


def _grounded_answer(question: str, results: list[dict]) -> tuple[str, str]:
    if is_opening_hours_question(question):
        answer = opening_hours_answer(question, results)
        return answer, "missing" if answer == NO_CONFIRMED_HOURS else "ok"
    return _format_knowledge(results), "ok" if results else "missing"


prompt = PROMPT_FILE.read_text(encoding="utf-8")
SHARED_PROMPT = _markdown_block(prompt, "System Prompt")
GPT_LIVE_ADDENDUM = _markdown_block(prompt, "GPT-Live Client Addendum")
CASCADE_ADDENDUM = _markdown_block(prompt, "Cascaded RAG Addendum")
FIRST_MESSAGE = _markdown_block(prompt, "First Message")
URGENT_REFERRAL_MATCH = re.search(r"Immediately say:\n„([^”]+)”", SHARED_PROMPT)
if URGENT_REFERRAL_MATCH is None:
    raise ValueError("Missing urgent veterinary referral in the shared prompt")
URGENT_REFERRAL = URGENT_REFERRAL_MATCH.group(1)


def _plain_polish(text: str) -> str:
    return "".join(
        character for character in unicodedata.normalize("NFD", text.casefold().replace("ł", "l"))
        if unicodedata.category(character) != "Mn"
    )


def _urgent_veterinary_request(text: str, clinic_status: str = "unknown") -> bool:
    """Route clear current animal emergencies before asking the clinic FAQ."""
    words = _plain_polish(text)
    animal = bool(re.search(
        r"\b(pies|psa|psu|psie|kot|kota|kotu|zwierze|zwierzecia|szczeniak|szczenie|suka|suke)\b",
        words,
    ))
    past_or_hypothetical = bool(re.search(
        r"gdyby|co jesli|co gdy|hipotetycz|teoretycz|czy w razie|"
        r"miesiac temu|tydzien temu|wczoraj|kiedys|dawno|rok temu",
        words,
    ))
    if past_or_hypothetical and not re.search(r"\b(teraz|wlasnie|dzis|dzisiaj|aktualnie)\b", words):
        return False
    current_symptom = animal and bool(re.search(
        r"umier|nie oddych|dusi|krwaw|drgawk|nieprzytom|zatruc|otru|zaslab|traci przytomn|trudnosci z oddych",
        words,
    ))
    if current_symptom:
        return True
    accident = bool(re.search(r"potrac|uderz\w* samochod|\bwypad(ek|ku|ki)\b", words))
    if accident and not re.search(r"nie (potrac|uderz)|nie mam psa", words):
        return animal or "potrac" in words
    closed = clinic_status == "closed" or bool(re.search(r"jestescie zamknieci|klinika jest zamknieta|po godzinach", words))
    cannot_wait = bool(re.search(r"nie moze czekac|potrzebuje pomocy teraz|pilnej pomocy|pomocy przed otwarciem", words))
    return animal and closed and cannot_wait


def _session_instructions(addendum: str, caller_number: str | None = None, clinic_status: str = "unknown") -> str:
    marker = "# Context\n"
    if SHARED_PROMPT.count(marker) != 1:
        raise ValueError("Expected one Context heading in the shared prompt")
    phone_context = caller_number or "unavailable in call metadata"
    shared = SHARED_PROMPT.replace(
        marker,
        f"{marker}{runtime_calendar_context()}\n"
        f"- Tatravet status at call start, based on approved opening hours: {clinic_status}.\n"
        f"- Lead's phone number: {phone_context}\n",
        1,
    )
    return f"{shared}\n\n{addendum}"


def _sip_caller_number(participant) -> str | None:
    if participant.kind != rtc.ParticipantKind.PARTICIPANT_KIND_SIP:
        return None
    identity = participant.identity
    candidates = (
        participant.attributes.get("sip.phoneNumber"),
        identity[4:] if identity.startswith("sip_") else None,
    )
    for value in candidates:
        if isinstance(value, str) and re.fullmatch(r"\+[1-9]\d{7,14}", value):
            return value
    return None

settings = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
config = settings["livekit"]
variant_name = os.environ.get("PR011_LIVEKIT_VARIANT", config["default_variant"])
try:
    variant = config["variants"][variant_name]
except KeyError as exc:
    available = ", ".join(sorted(config["variants"]))
    raise RuntimeError(
        f"Unknown PR011_LIVEKIT_VARIANT '{variant_name}'. Available: {available}"
    ) from exc


class GPTLiveClientAssistant(Agent):
    def __init__(self, caller_number: str | None = None, clinic_status: str = "unknown") -> None:
        super().__init__(
            instructions=_session_instructions(GPT_LIVE_ADDENDUM, caller_number, clinic_status)
        )
        self._clinic_status = clinic_status
        self._pending_delegations: set[str] = set()

    async def on_enter(self) -> None:
        self.duplex_session.on("delegation_created", self._on_delegation)
        self.duplex_session.append_instructions(
            "After delegating a factual question, remain silent until the client result. "
            "When it arrives, start with the supplied answer immediately. "
            "Do not add an acknowledgment, filler, progress phrase, or unrelated fact."
        )

    def _on_delegation(self, delegation) -> None:
        self._pending_delegations.add(delegation.id)
        # Stop already queued filler; the audio node drops new frames until the
        # approved answer has been returned to GPT-Live.
        if (audio_output := self.session.output.audio) is not None:
            audio_output.clear_buffer()
        asyncio.create_task(self._resolve_delegation(delegation))

    async def realtime_audio_output_node(
        self, audio: AsyncIterable[rtc.AudioFrame], model_settings
    ) -> AsyncIterable[rtc.AudioFrame]:
        async for frame in audio:
            if not self._pending_delegations:
                yield frame

    async def _resolve_delegation(self, delegation) -> None:
        started = time.perf_counter()
        question = delegation.pending_transcript.strip()
        try:
            if _urgent_veterinary_request(question, self._clinic_status):
                commentary, status = URGENT_REFERRAL, "urgent"
            elif (calendar_answer := calendar_only_answer(question)) is not None:
                commentary, status = calendar_answer, "calendar"
            else:
                query = faq_query_with_poland_date(question)
                results = await query_pr011_faq(query)
                commentary, status = _grounded_answer(question, results)
        except Exception:
            logger.exception("PR011 client-delegation lookup failed")
            commentary = _format_knowledge([])
            status = "error"

        duration_ms = round((time.perf_counter() - started) * 1000)
        logger.info(
            "PR011 client delegation resolved",
            extra={
                "benchmark_variant": variant_name,
                "knowledge_status": status,
                "knowledge_duration_ms": duration_ms,
            },
        )
        try:
            instruction = (
                "This is an urgent veterinary situation. Speak only the supplied referral, "
                "then end the call. Do not use clinic FAQ facts, offer a callback, or ask questions."
                if status == "urgent" else
                "For this delegated question, speak only the approved answer supplied by "
                "the client. Start with its first factual word. Do not add a preamble, "
                "status update, or fact from another topic."
            )
            self.duplex_session.append_instructions(instruction, delegation_id=delegation.id)
            self.duplex_session.append_commentary(
                commentary,
                delegation_id=delegation.id,
            )
        finally:
            self._pending_delegations.discard(delegation.id)


class CascadedRAGAssistant(Agent):
    def __init__(self, caller_number: str | None = None) -> None:
        super().__init__(
            instructions=_session_instructions(CASCADE_ADDENDUM, caller_number)
        )

    async def on_user_turn_completed(
        self,
        turn_ctx: ChatContext,
        new_message: ChatMessage,
    ) -> None:
        started = time.perf_counter()
        try:
            question = new_message.text_content
            if (calendar_answer := calendar_only_answer(question)) is not None:
                knowledge, status = calendar_answer, "calendar"
            else:
                results = await query_pr011_faq(
                    faq_query_with_poland_date(question)
                )
                knowledge, status = _grounded_answer(question, results)
        except Exception:
            logger.exception("PR011 cascaded RAG lookup failed")
            knowledge = _format_knowledge([])
            status = "error"

        duration_ms = round((time.perf_counter() - started) * 1000)
        logger.info(
            "PR011 pre-generation RAG resolved",
            extra={
                "benchmark_variant": variant_name,
                "knowledge_status": status,
                "knowledge_duration_ms": duration_ms,
            },
        )
        turn_ctx.add_message(role="assistant", content=knowledge)


server = AgentServer()
_sip_sessions: dict[str, dict[str, object]] = {}


async def on_session_end(ctx: agents.JobContext) -> None:
    report = ctx.make_session_report()
    try:
        report_dir = ROOT / ".tmp" / "livekit-session-reports"
        report_dir.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
        room_name = "".join(
            character if character.isalnum() or character in "-_" else "_"
            for character in ctx.room.name
        )
        path = report_dir / f"{timestamp}_{variant_name}_{room_name}.json"
        payload = {
            "benchmark_variant": variant_name,
            "report": report.to_dict(),
        }
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        logger.info("Saved PR011 session report locally")
    except Exception:
        logger.warning("Could not save local PR011 session report")
    sip = _sip_sessions.pop(ctx.job.id, {})
    try:
        await deliver_session_report(
            report, caller=sip.get("caller"), is_sip=bool(sip.get("is_sip")),
            agent_name=config["agent_name"],
        )
    except Exception:
        logger.error("PR011 LiveKit end-of-call delivery failed")


@server.rtc_session(agent_name=config["agent_name"], on_session_end=on_session_end)
async def entrypoint(ctx: agents.JobContext):
    sip = {"is_sip": False, "caller": None}
    _sip_sessions[ctx.job.id] = sip

    def capture_sip(participant) -> None:
        if participant.kind != rtc.ParticipantKind.PARTICIPANT_KIND_SIP:
            return
        sip["is_sip"] = True
        sip["caller"] = _sip_caller_number(participant) or sip["caller"]

    @ctx.room.on("participant_connected")
    def on_participant_connected(participant) -> None:
        capture_sip(participant)

    @ctx.room.on("participant_attributes_changed")
    def on_participant_attributes_changed(_changed, participant) -> None:
        capture_sip(participant)

    if not reporting_configured():
        logger.warning("PR011 end-of-call integration is not configured")
    await ctx.connect()
    for participant in ctx.room.remote_participants.values():
        capture_sip(participant)
    if not ctx.room.remote_participants:
        try:
            capture_sip(await asyncio.wait_for(ctx.wait_for_participant(), timeout=2))
        except TimeoutError:
            pass

    caller_number = sip["caller"] if isinstance(sip["caller"], str) else None
    pipeline = variant["pipeline"]
    if pipeline == "gpt-live-client":
        clinic_status = "unknown"
        try:
            hours = await asyncio.wait_for(
                query_pr011_faq("W jakich godzinach Tatravet jest otwarte w tygodniu, weekendy i święta?"),
                timeout=2,
            )
            clinic_status = current_clinic_status(hours)
        except Exception:
            logger.warning("Approved opening hours unavailable at session start")
        session = AgentSession(
            llm=inference.DuplexModel(
                model=variant["model"],
                voice=variant["voice"],
                extra_kwargs={"delegation": "client"},
            )
        )
        assistant: Agent = GPTLiveClientAssistant(caller_number, clinic_status)
    elif pipeline == "cascade-rag":
        session = AgentSession(
            stt=inference.STT(
                model=variant["stt_model"],
                language=variant["language"],
            ),
            llm=inference.LLM(model=variant["llm_model"]),
            tts=inference.TTS(
                model=variant["tts_model"],
                voice=variant["voice"],
                language=variant["language"],
            ),
        )
        assistant = CascadedRAGAssistant(caller_number)
    else:
        raise RuntimeError(f"Unsupported PR011 LiveKit pipeline: {pipeline}")

    @session.on("conversation_item_added")
    def close_after_farewell(event: ConversationItemAddedEvent) -> None:
        item = event.item
        if not isinstance(item, ChatMessage) or item.role != "assistant":
            return
        normalized = " ".join(item.text_content.casefold().split()).rstrip(".!… ")
        if normalized.endswith("dziękujemy za kontakt z tatravet. do widzenia"):
            logger.info("Farewell committed; draining audio and closing session")
            session.shutdown(drain=True)

    logger.info("Starting PR011 LiveKit benchmark variant: %s", variant_name)
    await session.start(
        room=ctx.room,
        agent=assistant,
        room_options=room_io.RoomOptions(delete_room_on_close=True),
    )
    await session.generate_reply(instructions=f"Say exactly in Polish: {FIRST_MESSAGE}")


if __name__ == "__main__":
    agents.cli.run_app(server)

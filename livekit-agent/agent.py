import asyncio
import json
import logging
import os
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv
from livekit import agents
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


prompt = PROMPT_FILE.read_text(encoding="utf-8")
SHARED_PROMPT = _markdown_block(prompt, "System Prompt")
GPT_LIVE_ADDENDUM = _markdown_block(prompt, "GPT-Live Client Addendum")
CASCADE_ADDENDUM = _markdown_block(prompt, "Cascaded RAG Addendum")
FIRST_MESSAGE = _markdown_block(prompt, "First Message")

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
    def __init__(self) -> None:
        super().__init__(instructions=f"{SHARED_PROMPT}\n\n{GPT_LIVE_ADDENDUM}")

    async def on_enter(self) -> None:
        self.duplex_session.on("delegation_created", self._on_delegation)

    def _on_delegation(self, delegation) -> None:
        asyncio.create_task(self._resolve_delegation(delegation))

    async def _resolve_delegation(self, delegation) -> None:
        started = time.perf_counter()
        query = delegation.pending_transcript.strip()
        try:
            results = await query_pr011_faq(query)
            commentary = _format_knowledge(results)
            status = "ok"
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
        self.duplex_session.append_thinking(
            "Answer the caller's factual question directly from the approved facts. "
            "Start with the answer. Add no preamble, acknowledgment, status update, "
            "source label or explanation of how the information was obtained.",
            delegation_id=delegation.id,
        )
        self.duplex_session.append_commentary(
            commentary,
            delegation_id=delegation.id,
        )


class CascadedRAGAssistant(Agent):
    def __init__(self) -> None:
        super().__init__(instructions=f"{SHARED_PROMPT}\n\n{CASCADE_ADDENDUM}")

    async def on_user_turn_completed(
        self,
        turn_ctx: ChatContext,
        new_message: ChatMessage,
    ) -> None:
        started = time.perf_counter()
        try:
            results = await query_pr011_faq(new_message.text_content)
            knowledge = _format_knowledge(results)
            status = "ok"
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


async def on_session_end(ctx: agents.JobContext) -> None:
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
        "report": ctx.make_session_report().to_dict(),
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    logger.info("Saved PR011 session report: %s", path)


@server.rtc_session(agent_name=config["agent_name"], on_session_end=on_session_end)
async def entrypoint(ctx: agents.JobContext):
    pipeline = variant["pipeline"]
    if pipeline == "gpt-live-client":
        session = AgentSession(
            llm=inference.DuplexModel(
                model=variant["model"],
                voice=variant["voice"],
                extra_kwargs={"delegation": "client"},
            )
        )
        assistant: Agent = GPTLiveClientAssistant()
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
        assistant = CascadedRAGAssistant()
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
    await ctx.connect()
    await session.generate_reply(instructions=f"Say exactly in Polish: {FIRST_MESSAGE}")


if __name__ == "__main__":
    agents.cli.run_app(server)

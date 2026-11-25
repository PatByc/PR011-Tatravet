import asyncio
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from livekit.agents import utils

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from livekit_upstash_faq import query_pr011_faq

load_dotenv(ROOT / ".env")


async def main() -> None:
    async with utils.http_context.open():
        results = await query_pr011_faq("Jakie są godziny otwarcia kliniki Tatravet?")
    assert results, "Expected at least one Tatravet FAQ result"
    assert all(isinstance(item, dict) for item in results)
    sources = {item.get("metadata", {}).get("source") for item in results}
    assert sources == {"KB_PR011_Tatravet_v2.md"}, f"Unexpected KB sources: {sources}"
    print(f"OK: received {len(results)} result(s) from KB_PR011_Tatravet_v2.md")


if __name__ == "__main__":
    if not os.environ.get("PR011_UPSTASH_VECTOR_REST_TOKEN"):
        raise SystemExit("Load .env before running this check")
    asyncio.run(main())

import os

import aiohttp
from livekit.agents import RunContext, function_tool, utils
from livekit.agents.llm import ToolError


async def query_pr011_faq(data: str) -> list[dict]:
    url = os.environ.get("PR011_UPSTASH_VECTOR_REST_URL", "").rstrip("/")
    token = os.environ.get("PR011_UPSTASH_VECTOR_REST_TOKEN", "")
    if not url or not token:
        raise RuntimeError("PR011 Upstash credentials are required")

    timeout = aiohttp.ClientTimeout(total=20)
    async with utils.http_context.http_session().post(
        f"{url}/query-data/pr011-faq",
        headers={"Authorization": f"Bearer {token}"},
        json={"data": data, "topK": 3, "includeData": True, "includeMetadata": True},
        timeout=timeout,
    ) as response:
        if response.status != 200:
            raise RuntimeError(f"Upstash returned HTTP {response.status}")
        result = await response.json()

    if isinstance(result, dict):
        result = result.get("result")
    if not isinstance(result, list):
        raise RuntimeError("Upstash returned malformed search results")
    return result


@function_tool(name="search_pr011_faq")
async def search_pr011_faq(context: RunContext, data: str) -> list[dict]:
    """Search approved Tatravet clinic information before answering a clinic-specific factual question.

    Args:
        data: Complete caller question with relevant conversational context, not keywords alone.
    """
    try:
        return await query_pr011_faq(data)
    except Exception as exc:
        raise ToolError("No reliable Tatravet knowledge result is available. Do not guess; refer the caller to clinic staff.") from exc

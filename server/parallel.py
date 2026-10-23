"""Run independent tools concurrently with per-tool timeouts."""

from __future__ import annotations

import asyncio
from typing import Any, Awaitable, Callable

TIMEOUTS = {
    # web_search may try keyed API then DuckDuckGo HTML; 4s was cutting fallbacks off.
    "web_search": 15.0,
    "followup_search": 15.0,
    "gap_search": 15.0,
    # docs pages via r.jina.ai often need >6s; short cap caused false timeouts.
    "read_url": 9.0,
    "weather_compare": 8.0,
    "youtube_summarize": 20.0,
    "local_video_summarize": 120.0,
    "read_image": 45.0,
    "generate_image": 120.0,
    "memory_search": 2.0,
    "consult_knowledge": 2.0,
    "run_cmd": 120.0,
    "git_status": 20.0,
    "git_diff": 20.0,
    "apply_patch": 15.0,
    "write_file": 15.0,
    "read_file": 10.0,
    "grep": 25.0,
}

SEM = 6


async def run_many(
    jobs: list[tuple[str, dict[str, Any], Callable[[str, dict[str, Any]], Awaitable[str]]]],
    timeout_override: dict[str, float] | None = None,
) -> list[tuple[str, dict[str, Any], str]]:
    """jobs: (name, args, runner). Returns (name, args, observation). Failures become empty obs."""
    sem = asyncio.Semaphore(SEM)
    timeouts = {**TIMEOUTS, **(timeout_override or {})}

    async def one(name: str, args: dict[str, Any], runner: Callable) -> tuple[str, dict[str, Any], str]:
        async with sem:
            t = timeouts.get(name, 12.0)
            try:
                obs = await asyncio.wait_for(runner(name, args), timeout=t)
            except asyncio.TimeoutError:
                obs = f"timeout ({name} > {t}s)"
            except Exception as e:
                obs = f"tool error ({name}): {e}"
            return name, args, obs or ""

    if not jobs:
        return []
    return list(await asyncio.gather(*[one(n, a, r) for n, a, r in jobs]))

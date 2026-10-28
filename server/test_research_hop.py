import asyncio
import json

from server.reason import Plan
from server.research import gather, hop_query


def test_hop_query_picks_new_entity_or_nothing():
    hopped = hop_query(
        "Who led Rome",
        "The Senate met in Rome under Augustus during the empire.",
    )
    assert isinstance(hopped, str)
    assert "Augustus" in hopped or "Senate" in hopped
    assert "This" not in (hopped or "")
    assert hop_query("Who led Rome", "Rome rome") is None
    skipped = hop_query("Who led Rome", "This history started under Augustus.")
    assert skipped is not None
    assert "Augustus" in skipped
    assert "This" not in skipped


def test_gather_second_search_after_first_page(monkeypatch):
    calls: list[tuple[str, dict]] = []

    async def fake_run_tool(name, args):
        calls.append((name, dict(args)))
        if name == "web_search":
            query = str(args.get("query") or "")
            if "Augustus" in query or "Senate" in query:
                return json.dumps(
                    [
                        {
                            "title": "Augustus",
                            "url": "https://example.com/augustus",
                            "snippet": "Augustus ruled Rome",
                        }
                    ]
                )
            return json.dumps(
                [
                    {
                        "title": "Rome",
                        "url": "https://example.com/rome",
                        "snippet": "Rome was a city",
                    }
                ]
            )
        if name == "read_url":
            url = str(args.get("url") or "")
            if url == "https://example.com/rome":
                return (
                    "The Senate met in Rome under Augustus during the empire "
                    "and the Senate kept meeting."
                )
            if url == "https://example.com/augustus":
                return "Augustus was the first emperor of Rome."
            return ""
        return ""

    monkeypatch.setattr("server.research.run_tool", fake_run_tool)
    plan = Plan(goal="Who led Rome", search_queries=["Who led Rome"], fetch_urls=1)

    async def _run():
        out = []
        async for item in gather(plan, max_steps=8, history=[]):
            out.append(item)
        return out

    asyncio.run(_run())
    searches = [args for name, args in calls if name == "web_search"]
    assert len(searches) >= 2
    assert any(
        "Augustus" in str(args.get("query") or "") or "Senate" in str(args.get("query") or "")
        for args in searches[1:]
    )

import json

from server.local_brain import _queries, ask_parts
from server.local_reason import reason_from_observations
from server.reason import Plan
from server.tools import _plain_news_text

_COMPOUND = "hello! is anthropic going ipo? then what happened in serbia?"


def test_capital_answer_leads_with_paris_not_banana_filler():
    filler = (
        "The weather is humid and sticky while bananas ripen slowly in outdoor markets, "
        "yellow bunches sit under cloudy skies, and a passing traveler mentions capital "
        "affairs plus France only once during long warm afternoons, sudden showers, "
        "harvest delays, coastal breezes, ripe fruit stalls, and endless gray clouds."
    )
    paris = "The capital of France is Paris, on the Seine river."
    observations = [("read_url", f"{filler} {paris}")]
    answer = reason_from_observations(
        "What is the capital of France?",
        Plan(
            goal="What is the capital of France?",
            search_queries=["What is the capital of France?"],
        ),
        observations,
    )
    first = answer.split("\n\n")[0]
    assert "Paris" in first
    assert not first.startswith(filler)


def test_ask_parts_splits_greeting_and_two_questions():
    assert ask_parts(_COMPOUND) == [
        "is anthropic going ipo?",
        "what happened in serbia?",
    ]
    assert ask_parts("hello!") == ["hello!"]


def test_queries_search_each_substantive_question():
    found = [q.lower().strip() for q in _queries(_COMPOUND, [], "research", "", _COMPOUND)]
    assert "is anthropic going ipo?" in found
    assert "what happened in serbia?" in found


def test_reason_keeps_anthropic_and_serbia():
    ipo = "Anthropic filed confidential paperwork for an IPO and bankers expect the listing to follow."
    serbia = "Serbia saw mass protests in Belgrade after officials confirmed the station canopy collapse."
    assert len(ipo) > 32 and len(serbia) > 32
    observations = [
        (
            "web_search",
            json.dumps(
                [
                    {
                        "title": "Anthropic IPO",
                        "url": "https://example.com/anthropic-ipo",
                        "snippet": ipo,
                    }
                ]
            ),
        ),
        (
            "web_search",
            json.dumps(
                [
                    {
                        "title": "Serbia protests",
                        "url": "https://example.com/serbia",
                        "snippet": serbia,
                    }
                ]
            ),
        ),
    ]
    answer = reason_from_observations(
        _COMPOUND,
        Plan(goal=_COMPOUND, search_queries=["is anthropic going ipo?", "what happened in serbia?"]),
        observations,
    )
    assert "Anthropic" in answer or "IPO" in answer
    assert "Serbia" in answer


def test_news_text_cleaner_turns_nbsp_into_space():
    cleaned = _plain_news_text("Anthropic&nbsp;IPO")
    assert cleaned == "Anthropic IPO"
    assert "&nbsp;" not in cleaned
    assert "\u00a0" not in cleaned

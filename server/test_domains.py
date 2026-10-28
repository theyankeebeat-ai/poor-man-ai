import json
from pathlib import Path

from server.local_brain import cheap_answer, try_math
from server.mcp.domains import DOMAIN_DIR, load_cards, valid_card
from server.mcp.knowledge import consult

EXPECTED = {
    "optics",
    "mechanics",
    "algebra",
    "trigonometry",
    "statistics",
    "grammar",
    "vocabulary",
    "psychology",
    "coding",
    "web-search",
    "conversation",
    "communication",
    "calculus",
    "biology",
    "astronomy",
    "geology",
    "economy",
    "chemistry",
    "critical-thinking",
}


def test_nineteen_cards_are_valid():
    cards = load_cards()
    names = {card["name"] for card in cards}
    assert names == EXPECTED
    for card in cards:
        assert valid_card(card) == [], card["name"]
        assert Path(card["_path"]).with_suffix(".md").exists()
        json.loads(Path(card["_path"]).read_text(encoding="utf-8"))


def test_subject_question_uses_its_card_not_an_unrelated_fact():
    answer = cheap_answer("Explain refraction with Snell's law.", [])
    assert answer is not None
    assert "Snell" in answer
    assert "Earth" not in answer
    hits = [hit["name"] for hit in consult("Explain refraction with Snell's law.")]
    assert hits[0] == "optics"


def test_triangle_perimeter_and_area_are_computed():
    answer = cheap_answer("I have a triangle 10 cm + 5 cm + 10 cm what is the perimeter and surface?", [])
    assert answer is not None
    assert "25 cm" in answer
    assert "24.21" in answer
    assert "Earth" not in answer


def test_plain_arithmetic_still_wins():
    assert try_math("What is 2 + 2?") is not None
    answer = cheap_answer("What is 2 + 2?", [])
    assert answer is not None
    assert "4" in answer
    assert "method card" not in answer.lower()


def test_code_edit_is_not_captured_by_the_coding_card():
    answer = cheap_answer("add a /health route and a pytest for it", [])
    assert answer is None or "local method card" not in answer

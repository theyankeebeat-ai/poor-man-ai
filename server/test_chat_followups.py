from server.local_brain import try_math, try_math_followup
from server.reason import Turn


def test_arithmetic_followup_chain():
    first = try_math("What is 12 times 8?")
    history = [Turn(role="user", text="What is 12 times 8?"), Turn(role="assistant", text=first)]
    second = try_math_followup("Now divide that result by 4.", history)
    assert second == "96/4 = **24**."
    history += [Turn(role="user", text="Now divide that result by 4."), Turn(role="assistant", text=second)]
    explanation = try_math_followup("Explain why the answer is correct.", history)
    assert "24 multiplied by 4 equals 96" in explanation


def test_followup_does_not_invent_context():
    assert try_math_followup("Divide that by 4.", []) is None
    unrelated = [Turn(role="assistant", text="The year was 1996.")]
    assert try_math_followup("Divide that by 4.", unrelated) is None
    inconsistent = [Turn(role="assistant", text="12*8 = **97**.")]
    assert try_math_followup("Divide that by 4.", inconsistent) is None
    valid = [Turn(role="assistant", text="12*8 = **96**.")]
    assert try_math_followup("What is the weather?", valid) is None
    assert try_math_followup("Divide that by 0.", valid) is None

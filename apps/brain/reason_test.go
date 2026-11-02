package main

import (
	"strings"
	"testing"
)

func TestReasoningPrefersTheYearOverTheDefinition(t *testing.T) {
	blob := "The tower is a wrought-iron lattice tower on the Champ de Mars in Paris. The tower opened to the public in 1889 during the world's fair."
	part := "what year did the tower open"
	draft, _ := answerPart(part, blob, nil)
	if strings.Contains(draft, "1889") {
		t.Fatalf("one-shot already had the year: %q", draft)
	}
	got := reasonAnswer(part, blob, nil)
	if !strings.Contains(got.Lead, "1889") {
		t.Fatalf("lead=%q notes=%v", got.Lead, got.Notes)
	}
	if !got.Held {
		t.Fatal("a revised answer was not held")
	}
	if len(got.Notes) != 4 || !strings.HasPrefix(got.Notes[0], "Understand:") || !strings.HasPrefix(got.Notes[3], "Revise:") {
		t.Fatalf("notes=%v", got.Notes)
	}
}

func TestReasoningAdmitsAMissingYear(t *testing.T) {
	blob := "The tower is a wrought-iron lattice tower on the Champ de Mars in Paris."
	got := reasonAnswer("what year did the tower open", blob, nil)
	if strings.Contains(strings.ToLower(got.Lead), "wrought-iron") {
		t.Fatalf("definition presented as the year: %q", got.Lead)
	}
	if !strings.Contains(got.Lead, "do not state the year") {
		t.Fatalf("lead=%q", got.Lead)
	}
	if !got.Held || !guarded([]answerBlock{{Lead: got.Lead, Support: got.Support}}) {
		t.Fatal("the gap was left open to a later draft")
	}
}

func TestReasoningPrefersTheCount(t *testing.T) {
	blob := "Tokyo is the capital of Japan. Tokyo had about 14 million residents in 2020."
	part := "how many people live in tokyo"
	draft, _ := answerPart(part, blob, nil)
	if strings.Contains(draft, "14") {
		t.Fatalf("one-shot already had the count: %q", draft)
	}
	got := reasonAnswer(part, blob, nil)
	if !strings.Contains(got.Lead, "14") {
		t.Fatalf("lead=%q notes=%v", got.Lead, got.Notes)
	}
}

func TestReasoningPrefersBothSides(t *testing.T) {
	blob := "The moon is larger than many asteroids and is the brightest object in the night sky. Astronomers say the sun exceeds the moon."
	part := "which is larger the moon or the sun"
	draft, _ := answerPart(part, blob, nil)
	if strings.Contains(strings.ToLower(draft), "sun") {
		t.Fatalf("one-shot already compared both: %q", draft)
	}
	got := reasonAnswer(part, blob, nil)
	if !strings.Contains(strings.ToLower(got.Lead), "sun") || !strings.Contains(strings.ToLower(got.Lead), "moon") {
		t.Fatalf("lead=%q", got.Lead)
	}
}

func TestReasoningNamesThePerson(t *testing.T) {
	blob := "The tower is a wrought-iron lattice tower on the Champ de Mars. Gustave Eiffel built the tower with his engineering company."
	part := "who built the tower"
	draft, _ := answerPart(part, blob, nil)
	if strings.Contains(draft, "Eiffel") {
		t.Fatalf("one-shot already named Eiffel: %q", draft)
	}
	got := reasonAnswer(part, blob, nil)
	if !strings.Contains(got.Lead, "Eiffel") {
		t.Fatalf("lead=%q notes=%v", got.Lead, got.Notes)
	}
}

func TestReasoningKeepsASoundDraft(t *testing.T) {
	got := reasonAnswer("what is the capital of France", "The capital of France is Paris.", nil)
	if got.Lead != "The capital of France is Paris." {
		t.Fatalf("lead=%q", got.Lead)
	}
	if got.Held {
		t.Fatal("a sound draft was held against a later writer")
	}
	if !strings.HasPrefix(got.Notes[3], "Keep:") {
		t.Fatalf("notes=%v", got.Notes)
	}

	blob := "In vacuum the speed of light is defined as 299792458 meters per second exactly. In air the speed of light is slightly slower than that vacuum figure at ordinary pressure."
	air, _ := answerPart("how fast does light travel in the air", blob, nil)
	got = reasonAnswer("how fast does light travel in the air", blob, nil)
	if got.Lead != air || strings.Contains(got.Lead, "299792458") {
		t.Fatalf("reason changed a good quantity answer: %q vs %q", got.Lead, air)
	}

	who := reasonAnswer("who is gillian mbappe", "Kylian Mbappé apologised on Tuesday and said the comment was ill judged during the interview.", nil)
	if !strings.Contains(who.Lead, "Kylian") || !strings.Contains(who.Support, "Sources name") {
		t.Fatalf("lead=%q support=%q", who.Lead, who.Support)
	}
}

func TestCheapReplyCorrectsABadCalc(t *testing.T) {
	th := think("2+2", nil)
	reply, notes := cheapReply("2+2", th, "5")
	if reply != "4" && reply != "4." && !strings.Contains(reply, "4") {
		t.Fatalf("reply=%q notes=%v mode=%s", reply, notes, th.Mode)
	}
	if th.Mode != "calc" {
		t.Fatalf("mode=%s", th.Mode)
	}
	joined := strings.Join(notes, " ")
	if !strings.Contains(joined, "Revise:") && !strings.Contains(joined, "Keep:") {
		t.Fatalf("notes=%v reply=%q", notes, reply)
	}
}

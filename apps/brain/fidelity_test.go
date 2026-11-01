package main

import (
	"strings"
	"testing"
)

func TestNearMissDoesNotMergeDifferentNames(t *testing.T) {
	if !tokensClose("controvery", "controversy") {
		t.Fatal("a one-edit misspelling should still match")
	}
	if tokensClose("gillian", "kylian") {
		t.Fatal("a different given name must not match")
	}
	if tokensClose("light", "right") {
		t.Fatal("a different first letter on a short word must not match")
	}
	toks := tokenize("Kylian Mbappé")
	if fuzzyOverlap([]string{"mbappe"}, toks) < 1 {
		t.Fatalf("accent fold failed: %#v", toks)
	}
}

func TestAskPartsSeparatesNewSubjects(t *testing.T) {
	parts := askParts("what is the dispute between alpha and beta. what is the latest from alpha. so what is the mira smith row?")
	if len(parts) != 3 {
		t.Fatalf("parts = %#v", parts)
	}
	if strings.Contains(parts[2], "alpha") && strings.Contains(parts[2], "latest") {
		t.Fatalf("third part inherited the second: %#v", parts)
	}
	four := askParts("one? two? three? four?")
	if len(four) != 4 {
		t.Fatalf("cap dropped a question: %#v", four)
	}
}

func TestThinkDoesNotGlueNewSubject(t *testing.T) {
	h := []turn{{Role: "user", Text: "what is the latest from alpha"}}
	th := think("so what is the mira smith row", h)
	if strings.Contains(th.Goal, "alpha") || strings.Contains(th.Goal, "continuing") {
		t.Fatalf("goal glued the previous subject: %q", th.Goal)
	}
	if th.Follow != "no" {
		t.Fatalf("follow = %q", th.Follow)
	}
	bound := resolveFollow("how fast does it travel", []turn{{Role: "user", Text: "define light"}})
	if !strings.Contains(bound, "light") {
		t.Fatalf("pronoun was not bound: %q", bound)
	}
	inAir := resolveFollow("how fast does it travel in the air", []turn{{Role: "user", Text: "define light"}})
	if !strings.Contains(inAir, "light") {
		t.Fatalf("condition was treated as a new subject: %q", inAir)
	}
	local := resolveFollow("why does the beam bend when it enters water", h)
	if strings.Contains(local, "alpha") || strings.Contains(local, "latest") {
		t.Fatalf("a named question inherited the previous subject: %q", local)
	}
	named := resolveFollow("so what is the mira smith row", h)
	if strings.Contains(named, "alpha") || strings.Contains(named, "latest") {
		t.Fatalf("new subject was rewritten: %q", named)
	}
}

func TestQuantityStaysOnItsCondition(t *testing.T) {
	blob := "In vacuum the speed of light is defined as 299792458 meters per second exactly. In air the speed of light is slightly slower than that vacuum figure at ordinary pressure."
	lead, _ := answerPart("how fast does light travel in the air", blob, nil)
	if !strings.Contains(strings.ToLower(lead), "air") {
		t.Fatalf("lead ignored the asked condition: %q", lead)
	}
	if strings.Contains(lead, "299792458") {
		t.Fatalf("vacuum figure used for air: %q", lead)
	}

	cross := "In air the speed of sound is about 343 meters per second under standard conditions. In water the speed of sound is about 1480 meters per second under standard conditions."
	lead, support := answerPart("how fast does sound travel from air to water", cross, nil)
	if !strings.Contains(lead, "do not give one value") {
		t.Fatalf("crossing was given a single speed: %q", lead)
	}
	if !strings.Contains(support, "343") || !strings.Contains(support, "1480") {
		t.Fatalf("side values dropped: %q", support)
	}
}

func TestSeveralEventsStaySeparate(t *testing.T) {
	blob := "Alpha and beta sent a joint letter asking for a new trade limit on imported goods last month. A player who was born in alpha joked about a beta leader during a televised interview this week."
	_, support := answerPart("what is the dispute between alpha and beta", blob, nil)
	if !strings.Contains(support, "A separate account:") {
		t.Fatalf("two events were left as one story: %q", support)
	}
}

func TestSerbiaFollowUpKeepsTheCountry(t *testing.T) {
	prev := []turn{{Role: "user", Text: "what are the latest news on serbia"}}
	got := resolveFollow("did they had elections", prev)
	if !strings.Contains(fold(got), "serbia") {
		t.Fatalf("pronoun dropped the country: %q", got)
	}
	named := resolveFollow("why does the beam bend when it enters water", []turn{{Role: "user", Text: "what is the latest from alpha"}})
	if strings.Contains(named, "alpha") {
		t.Fatalf("a named subject inherited the previous topic: %q", named)
	}
}

func TestNewsSkipsTheCountryDefinition(t *testing.T) {
	blob := "Serbia is a parliamentary republic, with its constitution ensuring the separation of powers between the executive and the legislature. Early parliamentary elections were held in Serbia on 25 October 2026 to elect members of the National Assembly."
	lead, _ := answerPart("what are the latest news on serbia", blob, nil)
	if strings.Contains(strings.ToLower(lead), "parliamentary republic") {
		t.Fatalf("definition used as the news: %q", lead)
	}
	if !strings.Contains(lead, "25 October 2026") {
		t.Fatalf("election sentence lost: %q", lead)
	}
}

func TestElectionWordingIsNotAPersonName(t *testing.T) {
	blob := "Free Elections were discussed in a textbook chapter about voting systems in general. Early parliamentary elections were held in Serbia on 25 October 2026 to elect members of the National Assembly. The elections were originally due by December."
	lead, support := answerPart("did serbia had elections this month", blob, nil)
	if strings.Contains(lead+" "+support, "Sources name") {
		t.Fatalf("election wording became a name caveat: lead=%q support=%q", lead, support)
	}
	if !strings.Contains(lead, "25 October 2026") {
		t.Fatalf("election sentence lost: %q", lead)
	}
	if strings.Contains(support, "25 October 2026") {
		t.Fatalf("lead repeated in support: %q", support)
	}
}

func TestNameCaveatUsesSourceSpelling(t *testing.T) {
	cases := []struct {
		part, blob, want string
		warn             bool
	}{
		{
			"who is gillian mbappe",
			"Kylian Mbappé apologised on Tuesday and said the comment was ill judged during the interview.",
			"Kylian",
			true,
		},
		{
			"who is mira smith",
			"John Smith filed the complaint with the registry office on Monday morning.",
			"John",
			true,
		},
		{
			"who is jon smith",
			"John Smith filed the complaint with the registry office on Monday morning.",
			"",
			false,
		},
	}
	for _, tc := range cases {
		_, support := answerPart(tc.part, tc.blob, nil)
		if tc.warn {
			if !strings.Contains(support, "Sources name") || !strings.Contains(support, tc.want) {
				t.Fatalf("%q support = %q", tc.part, support)
			}
			continue
		}
		if strings.Contains(support, "Sources name") {
			t.Fatalf("typo was treated as a different person: %q", support)
		}
	}
}

func TestWhyKeepsTheLimiter(t *testing.T) {
	blob := "A beam from air into water will bend toward the normal because the wave slows on entry into the slower medium. It does not bend when the beam meets the surface straight on along the normal."
	_, support := answerPart("why does the beam bend from air to water", blob, nil)
	if !strings.Contains(strings.ToLower(support), "does not bend") {
		t.Fatalf("exception dropped: %q", support)
	}
}

func TestWriterCannotFuseParts(t *testing.T) {
	parts := []string{"what is the dispute between alpha and beta", "so what is the mira smith row"}
	if answersStaySeparate("The dispute is the mira smith row about alpha.", parts) {
		t.Fatal("one paragraph was accepted")
	}
	split := "Alpha and beta sent a trade letter.\n\nMira Smith is a different matter from that letter."
	if !answersStaySeparate(split, parts) {
		t.Fatal("separate sections were rejected")
	}
}

func TestDiversifyKeepsTheOtherStory(t *testing.T) {
	hits := []webHit{
		{Title: "Player jokes about alpha and beta", URL: "http://a", Snippet: "player interview joke television"},
		{Title: "Player jokes about alpha and beta again", URL: "http://b", Snippet: "player interview joke television clip"},
		{Title: "Alpha and beta trade letter", URL: "http://c", Snippet: "joint letter imported goods limit"},
	}
	out := diversifyHits("dispute between alpha and beta", hits)
	if len(out) < 2 || out[1].URL != "http://c" {
		t.Fatalf("diverse hit was buried: %#v", out)
	}
}

func TestAskedThingBeatsAPassingMention(t *testing.T) {
	def := "As a result of the watershed's integrity and undisturbed natural water filtration system, New York is one of only four major cities in the United States. Water is an inorganic compound with the chemical formula H2O. It is a transparent, tasteless, odorless, and nearly colorless chemical substance."
	lead, _ := answerPart("what is water", def, nil)
	if !strings.HasPrefix(lead, "Water is an inorganic") {
		t.Fatalf("definition lost: %q", lead)
	}
	where := "This unit is now famed throughout the world for producing high quality programmes with Attenborough such as Life on Earth, The Private Life of Plants, The Blue Planet, and Planet Earth. The Earth is unique among known planets in having oceans of liquid water on its surface."
	lead, _ = answerPart("where can water be found on planet earth", where, nil)
	if !strings.Contains(strings.ToLower(lead), "ocean") || strings.Contains(lead, "Attenborough") {
		t.Fatalf("place lost: %q", lead)
	}
	ordered := "Condensing water vapor, augmented by ice delivered from comets, produced the oceans. The Earth is unique among known planets in having oceans of liquid water on its surface."
	lead, _ = answerPart("where can water be found on planet earth", ordered, nil)
	if !strings.Contains(strings.ToLower(lead), "surface") {
		t.Fatalf("origin story beat the location: %q", lead)
	}
}

func TestWikiSuggestionParsed(t *testing.T) {
	body := []byte(`{"query":{"searchinfo":{"suggestion":"controversy"},"search":[{"title":"Controversy","snippet":"A <span>controversy</span>"}]}}`)
	hits, suggestion := parseWikiSearch(body)
	if suggestion != "controversy" || len(hits) != 1 || hits[0].Title != "Controversy" {
		t.Fatalf("hits=%#v suggestion=%q", hits, suggestion)
	}
}

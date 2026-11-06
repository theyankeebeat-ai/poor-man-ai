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

func TestParseAIModeKeepsAIHits(t *testing.T) {
	body := []byte(`{"items":[
		{"title":"Google AI Mode","snippet":"Paris is the capital.","url":"https://www.google.com/search?udm=50&q=France","source":"google-ai"},
		{"title":"Empty","snippet":"","url":"https://example.com/empty","source":"bing"}
	],"trace":[
		{"source":"google-ai","label":"Google AI Mode","ok":true,"steps":[{"ok":true,"detail":"Read the answer panel."}]},
		{"source":"yandex","label":"Yandex","ok":false,"steps":[{"ok":false,"detail":"Yandex blocked the lookup with a challenge page."}]},
		{"source":"duck-ai","label":"Duck.ai","ok":false,"steps":[{"ok":false,"detail":"Duck.ai replied with web search off, so that panel was not used."}]}
	]}`)
	hits, misses := parseAIMode(body)
	if len(hits) != 1 || hits[0].Source != "google-ai" || hits[0].Title != "Google AI Mode" {
		t.Fatalf("hits=%#v", hits)
	}
	if !aiModeHit(hits[0]) {
		t.Fatalf("hit=%#v", hits[0])
	}
	if len(misses) != 2 {
		t.Fatalf("misses=%#v", misses)
	}
	if misses[0].Source != "yandex" || misses[0].Status != "challenge" || misses[0].Detail == "" {
		t.Fatalf("challenge miss=%#v", misses[0])
	}
	if misses[1].Source != "duck-ai" || misses[1].Status != "miss" {
		t.Fatalf("duck miss=%#v", misses[1])
	}
}

func TestDuckChromeIsNotTheDefinition(t *testing.T) {
	table := "Duck.ai said Gemma 4 31B In furniture, a table is a piece of furniture with a flat top and one or more legs."
	parts := splitSentences(table)
	if len(parts) != 1 || parts[0] == "Duck." || strings.HasPrefix(parts[0], "ai said") {
		t.Fatalf("split=%q", parts)
	}
	lead, _ := answerPart("what is a table?", table, nil)
	if strings.Contains(strings.ToLower(lead), "ai said") || strings.Contains(lead, "Gemma") {
		t.Fatalf("table lead=%q", lead)
	}
	if !strings.Contains(lead, "a table is a piece of furniture") {
		t.Fatalf("table lead=%q", lead)
	}
	bowl := "Duck.ai said Gemma 4 31B A bowl is a round, open-top container used for food."
	lead, _ = answerPart("what is a bowl?", bowl, nil)
	if strings.Contains(strings.ToLower(lead), "ai said") || strings.Contains(lead, "Gemma") || !strings.Contains(lead, "A bowl is a round") {
		t.Fatalf("bowl lead=%q", lead)
	}
	frag := "ai said Gemma 4 31B In furniture, a table is a piece of furniture with a flat top and one or more legs."
	if bestDefinition([]string{frag}, "table") != "" {
		t.Fatal("chrome fragment was kept")
	}
	defined := "A bowl is primarily a round, deep dish or container that is open at the top and used for preparing food. The word also refers to: The contents of a bowl (e.g., \"a bowl of soup\"). A large stadium shaped like a bowl often hosts sports."
	lead, _ = answerPart("define a bowl?", defined, nil)
	if !strings.HasPrefix(lead, "A bowl is primarily") {
		t.Fatalf("primary definition lost: %q", lead)
	}
	us := splitSentences("U.S. officials said the vote was held on Tuesday morning.")
	if len(us) != 1 {
		t.Fatalf("abbreviation split=%q", us)
	}
	two := splitSentences("A table is a piece of furniture. A bowl is a round container.")
	if len(two) != 2 {
		t.Fatalf("sentences=%q", two)
	}
}

func TestCitationAmpersandIsNotEscaped(t *testing.T) {
	out := renderAnswer([]answerBlock{{Lead: "A bowl is a container."}}, []source{{
		Title: "Brave Ask",
		URL:   "https://search.brave.com/ask?q=bowl&source=web",
	}})
	if strings.Contains(out, "&amp;") || strings.Contains(out, "&#") {
		t.Fatalf("escaped citation: %s", out)
	}
	if !strings.Contains(out, "q=bowl&source=web") {
		t.Fatalf("url missing: %s", out)
	}
}

func TestWebSearchEnginesDisabled(t *testing.T) {
	hits, misses := webSearch("what is the capital of France")
	if len(hits) != 0 || len(misses) != 0 {
		t.Fatalf("expected empty search, got hits=%#v misses=%#v", hits, misses)
	}
}

func TestShortFactualAnswerDropsSearchChrome(t *testing.T) {
	if got := stripAnswerChrome("Finished +6", "what is the capital of France"); got != "" {
		t.Fatalf("status chrome = %q", got)
	}
	if got := stripAnswerChrome("YouTube · Abela +4", "what is the capital of France"); got != "" {
		t.Fatalf("citation chip = %q", got)
	}
	kept := stripAnswerChrome("The party gained +4 seats in the assembly election last night.", "assembly election")
	if !strings.Contains(kept, "+4") {
		t.Fatalf("a quantity was stripped: %q", kept)
	}
	abbrev := stripAnswerChrome("U.S. officials said the vote was held on Tuesday morning.", "the vote")
	if !strings.Contains(abbrev, "U.S. officials") {
		t.Fatalf("abbreviation split: %q", abbrev)
	}

	blob := "YouTube ·Abela +4 The capital of France is Paris. YouTube ·Abela +4 what is the capital of France Finished +6 The capital of France is Paris. France is a country in Western Europe with a long history of kings and republics."
	lead, support := answerPart("what is the capital of France", blob, nil)
	if lead != "The capital of France is Paris." {
		t.Fatalf("lead = %q support = %q", lead, support)
	}
	glued := lead + " " + support
	for _, junk := range []string{"YouTube", "Abela", "Finished", "+4", "+6"} {
		if strings.Contains(glued, junk) {
			t.Fatalf("junk %q in lead=%q support=%q", junk, lead, support)
		}
	}

	saved := "what is the capital of France Finished +6 Paris is the capital of France."
	lead, support = answerPart("what is the capital of France", saved, nil)
	if lead != "Paris is the capital of France." {
		t.Fatalf("saved lead = %q support = %q", lead, support)
	}
	if strings.Contains(lead+" "+support, "Finished") {
		t.Fatalf("status survived: lead=%q support=%q", lead, support)
	}
}

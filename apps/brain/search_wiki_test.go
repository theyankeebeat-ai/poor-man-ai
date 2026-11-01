package main

import "testing"

func TestIsWikipediaURL(t *testing.T) {
	yes := []string{
		"https://en.wikipedia.org/wiki/Montevideo",
		"http://es.wikipedia.org/wiki/Primavera",
		"https://www.wikipedia.org/",
		"en.wikipedia.org/wiki/Spring",
		"https://commons.wikimedia.org/wiki/File:X.png",
		"https://www.wikidata.org/wiki/Q123",
	}
	for _, u := range yes {
		if !isWikipediaURL(u) {
			t.Fatalf("expected wikipedia block for %q", u)
		}
	}
	no := []string{
		"https://search.brave.com/ask?q=montevideo+season",
		"https://news.google.com/rss/search?q=uruguay",
		"https://open-meteo.com/",
		"",
	}
	for _, u := range no {
		if isWikipediaURL(u) {
			t.Fatalf("unexpected wikipedia block for %q", u)
		}
	}
}

func TestDedupeHitsDropsWikipedia(t *testing.T) {
	in := []webHit{
		{Title: "Wiki", URL: "https://en.wikipedia.org/wiki/Montevideo", Snippet: "capital"},
		{Title: "Brave", URL: "https://search.brave.com/ask?q=season", Snippet: "spring"},
		{Title: "Wiki2", URL: "https://en.wikipedia.org/wiki/Uruguay", Snippet: "country"},
	}
	out := dedupeHits(in, 8)
	if len(out) != 1 || out[0].URL != "https://search.brave.com/ask?q=season" {
		t.Fatalf("got %#v", out)
	}
}

func TestReadPageBlocksWikipedia(t *testing.T) {
	page := readPage("https://en.wikipedia.org/wiki/Montevideo", 1000)
	if page.Text != "" {
		t.Fatalf("expected empty body, got %q", clip(page.Text, 80))
	}
	if page.Title != "Wikipedia is blocked as a source" {
		t.Fatalf("title %q", page.Title)
	}
}

func TestRenderAnswerSkipsWikipediaCitations(t *testing.T) {
	out := renderAnswer(
		[]answerBlock{{Lead: "Spring in the Southern Hemisphere."}},
		[]source{
			{Title: "Montevideo", URL: "https://en.wikipedia.org/wiki/Montevideo"},
			{Title: "Brave Ask", URL: "https://search.brave.com/ask?q=montevideo+season"},
		},
	)
	if contains(out, "wikipedia.org") {
		t.Fatalf("wikipedia citation leaked:\n%s", out)
	}
	if !contains(out, "https://search.brave.com/ask?q=montevideo+season") {
		t.Fatalf("kept source missing:\n%s", out)
	}
}

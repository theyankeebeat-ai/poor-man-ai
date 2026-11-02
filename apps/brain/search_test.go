package main

import (
	"regexp"
	"strings"
	"testing"
)

func TestPlaceFromCityCountry(t *testing.T) {
	got := placeFrom("what is the weather in belgrade serbia?")
	if got != "belgrade serbia" {
		t.Fatalf("place %q", got)
	}
	got = placeFrom("what is the weather in Belgrade, Serbia?")
	if got != "Belgrade, Serbia" {
		t.Fatalf("comma place %q", got)
	}
}

func TestPlaceAttemptsSplitsCountry(t *testing.T) {
	attempts := placeAttempts("belgrade serbia")
	if len(attempts) < 2 {
		t.Fatalf("attempts %#v", attempts)
	}
	if attempts[0].name != "belgrade serbia" || attempts[0].hint != "" {
		t.Fatalf("full %#v", attempts[0])
	}
	if attempts[1].name != "belgrade" || attempts[1].hint != "serbia" {
		t.Fatalf("split %#v", attempts[1])
	}
}

func TestPickGeoPrefersNamedCountry(t *testing.T) {
	hits := []geoPlace{
		{Name: "Belgrade", Country: "United States", Code: "US", Admin1: "Montana", Pop: 8000, Feature: "PPL"},
		{Name: "Belgrade", Country: "Serbia", Code: "RS", Admin1: "Central Serbia", Pop: 1273651, Feature: "PPLC"},
		{Name: "Belgrade", Country: "Belgium", Code: "BE", Admin1: "Wallonia", Pop: 4756, Feature: "PPL"},
	}
	got, ok := pickGeo(hits, "serbia")
	if !ok || got.Code != "RS" {
		t.Fatalf("serbia %#v %v", got, ok)
	}
	got, ok = pickGeo(hits, "montana")
	if !ok || got.Admin1 != "Montana" {
		t.Fatalf("montana %#v %v", got, ok)
	}
}

func TestHitCoversRejectsWrongRegion(t *testing.T) {
	paris := geoPlace{Name: "Paris", Country: "France", Code: "FR", Admin1: "Ile-de-France"}
	if hitCovers(paris, "paris texas") {
		t.Fatal("Paris, France must not cover paris texas")
	}
	if !hitCovers(paris, "Paris") {
		t.Fatal("Paris should cover Paris")
	}
}

func TestLocateBelgradeSerbia(t *testing.T) {
	got, err := locatePlace("belgrade serbia")
	if err != nil {
		t.Fatal(err)
	}
	if got.Code != "RS" {
		t.Fatalf("located %#v", got)
	}
	line, hits := weatherReport("what is the weather in belgrade serbia?")
	if len(hits) == 0 || hits[0].Snippet == "" {
		t.Fatalf("weather %q", line)
	}
	low := strings.ToLower(line)
	if !strings.Contains(low, "belgrade") || !strings.Contains(low, "serbia") {
		t.Fatalf("line %q", line)
	}
}

func TestClockQuestionRoutesToTime(t *testing.T) {
	q := "what time is it in belgrade serbia ?"
	if got := modeOf(q, q); got != "time" {
		t.Fatalf("mode %s", got)
	}
	th := think(q, nil)
	if th.Mode != "time" || th.NeedsWeb {
		t.Fatalf("thought %+v", th)
	}
	if modeOf("what time are they playing", "what time are they playing") == "time" {
		t.Fatal("kickoff routed to the clock")
	}
	weather := "what is the weather in Belgrade, Serbia?"
	if modeOf(weather, weather) != "weather" {
		t.Fatal("weather question left the weather handler")
	}
}

func TestTimeInBelgradeSerbia(t *testing.T) {
	line, hits := timeReport("what time is it in belgrade serbia ?")
	if len(hits) == 0 || hits[0].Snippet == "" {
		t.Fatalf("time %q", line)
	}
	low := strings.ToLower(line)
	if !strings.Contains(low, "belgrade") || !strings.Contains(low, "serbia") || !strings.Contains(line, "Europe/Belgrade") {
		t.Fatalf("line %q", line)
	}
	if !regexp.MustCompile(`\d{2}:\d{2}`).MatchString(line) {
		t.Fatalf("no clock in %q", line)
	}
	tokyo, tokyoHits := timeReport("what time is it in Tokyo, Japan?")
	if len(tokyoHits) == 0 || !strings.Contains(tokyo, "Asia/Tokyo") || !strings.Contains(tokyo, "Japan") {
		t.Fatalf("tokyo %q", tokyo)
	}
}

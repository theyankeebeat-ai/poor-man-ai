package main

import "testing"

func TestRouterParamCount(t *testing.T) {
	if got := paramsPerNet(); got != 3713 {
		t.Fatalf("params = %d, want 3713", got)
	}
	a := nets["reason"].forward(features("what is the capital of France?", "research", 0))
	b := nets["reason"].forward(features("what is the capital of France?", "research", 0))
	if a != b {
		t.Fatalf("router is not deterministic: %v vs %v", a, b)
	}
	if a < 0 || a > 1 {
		t.Fatalf("score out of range %v", a)
	}
}

func TestRenderAnswerCites(t *testing.T) {
	out := renderAnswer(
		[]answerBlock{{Lead: "Paris is the capital of France."}},
		[]source{{Title: "France", URL: "https://en.wikipedia.org/wiki/France"}},
	)
	if !stringsContainsAll(out, "Paris is the capital", "Citations:", "https://en.wikipedia.org/wiki/France") {
		t.Fatalf("rendered:\n%s", out)
	}
}

func stringsContainsAll(s string, parts ...string) bool {
	for _, p := range parts {
		if !contains(s, p) {
			return false
		}
	}
	return true
}

func contains(s, sub string) bool {
	return len(sub) == 0 || (len(s) >= len(sub) && (s == sub || len(s) > 0 && (indexOf(s, sub) >= 0)))
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}

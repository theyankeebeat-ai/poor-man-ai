package main

import (
	"regexp"
	"strings"
	"time"
)

var jailbreaks = []*regexp.Regexp{
	regexp.MustCompile(`(?i)ignore\s+(all\s+)?(previous|prior)\s+instructions`),
	regexp.MustCompile(`(?i)you\s+are\s+now\s+(DAN|unfiltered|jailbroken)`),
	regexp.MustCompile(`(?i)developer\s+mode\s+enabled`),
	regexp.MustCompile(`(?i)do\s+anything\s+now`),
	regexp.MustCompile(`(?i)bypass\s+(safety|content)\s+filters`),
}

var piiPats = map[string]*regexp.Regexp{
	"email":       regexp.MustCompile(`\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,7}\b`),
	"ssn":         regexp.MustCompile(`\b\d{3}-\d{2}-\d{4}\b`),
	"credit_card": regexp.MustCompile(`\b(?:\d{4}[-\s]?){3}\d{4}\b`),
	"api_key":     regexp.MustCompile(`(?i)(?:api[_-]?key|secret|token|bearer)\s*[:=]\s*['\"]?[A-Za-z0-9_\-]{20,}`),
}

type safetyReport struct {
	Passed            bool           `json:"passed"`
	JailbreakDetected bool           `json:"jailbreak_detected"`
	MatchedRules      []string       `json:"matched_rules"`
	PIIDetected       map[string]int `json:"pii_detected"`
	Timestamp         float64        `json:"timestamp"`
	ScrubbedText      string         `json:"scrubbed_text"`
}

func evaluateSafety(text string) safetyReport {
	var matched []string
	for _, re := range jailbreaks {
		if m := re.FindString(text); m != "" {
			matched = append(matched, m)
		}
	}
	if matched == nil {
		matched = []string{}
	}
	pii := map[string]int{}
	for name, re := range piiPats {
		n := len(re.FindAllString(text, -1))
		if n > 0 {
			pii[name] = n
		}
	}
	return safetyReport{
		Passed:            len(matched) == 0,
		JailbreakDetected: len(matched) > 0,
		MatchedRules:      matched,
		PIIDetected:       pii,
		Timestamp:         float64(time.Now().UnixNano()) / 1e9,
		ScrubbedText:      scrubPII(text),
	}
}

func scrubPII(text string) string {
	out := piiPats["email"].ReplaceAllString(text, "[REDACTED_EMAIL]")
	out = piiPats["ssn"].ReplaceAllString(out, "[REDACTED_SSN]")
	out = piiPats["credit_card"].ReplaceAllString(out, "[REDACTED_CARD]")
	out = piiPats["api_key"].ReplaceAllString(out, "api_key=[REDACTED_KEY]")
	return out
}

func refusal(report safetyReport) string {
	return "I can't follow that. It matches a jailbreak pattern (" + strings.Join(report.MatchedRules, "; ") + "). Ask the question directly."
}

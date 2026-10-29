package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

func xaiKey() string {
	return strings.TrimSpace(os.Getenv("XAI_API_KEY"))
}

func grokAnswer(question, evidence string) (string, error) {
	key := xaiKey()
	if key == "" {
		return "", nil
	}
	prompt := "You are Poor Man AI.\n" + answerRules + "\n\nQuestion:\n" + question + "\n\nEvidence:\n" + clip(evidence, 12000)
	body, _ := json.Marshal(map[string]any{
		"model": "grok-4.7",
		"input": prompt,
	})
	req, err := http.NewRequest(http.MethodPost, "https://api.x.ai/v1/responses", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 45 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 2_000_000))
	if res.StatusCode >= 400 {
		return "", errStatus(res.StatusCode, raw)
	}
	text := parseResponses(raw)
	return strings.TrimSpace(text), nil
}

type statusErr struct {
	code int
	body string
}

func (e statusErr) Error() string {
	return "xai status " + itoa(e.code) + ": " + clip(e.body, 180)
}

func errStatus(code int, raw []byte) error {
	return statusErr{code: code, body: string(raw)}
}

func itoa(n int) string {
	return strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(
		jsonNumber(n), "\n", ""), " ", ""))
}

func jsonNumber(n int) string {
	b, _ := json.Marshal(n)
	return string(b)
}

func parseResponses(raw []byte) string {
	var payload map[string]any
	if json.Unmarshal(raw, &payload) != nil {
		return ""
	}
	if s, ok := payload["output_text"].(string); ok && strings.TrimSpace(s) != "" {
		return s
	}
	out, _ := payload["output"].([]any)
	var b strings.Builder
	for _, item := range out {
		obj, _ := item.(map[string]any)
		content, _ := obj["content"].([]any)
		for _, part := range content {
			p, _ := part.(map[string]any)
			if text, ok := p["text"].(string); ok {
				b.WriteString(text)
			}
		}
	}
	return b.String()
}

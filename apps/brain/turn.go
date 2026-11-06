package main

import (
	"encoding/json"
	"strings"
	"time"
)

type event struct {
	Type string         `json:"type"`
	Text string         `json:"text,omitempty"`
	Name string         `json:"name,omitempty"`
	Args map[string]any `json:"args,omitempty"`
}

type emitter func(event)

func runTurn(message string, history []turn, mode string, thinking string, emit emitter) {
	start := time.Now()
	llmCalls := 0
	toolCalls := 0
	safety := evaluateSafety(message)
	if !safety.Passed {
		emit(event{Type: "plan", Text: "Safety guardrail triggered: " + strings.Join(safety.MatchedRules, "; ")})
		emit(event{Type: "token", Text: refusal(safety)})
		emit(event{Type: "done", Text: ""})
		return
	}
	th := think(message, history)
	if mode == "code" {
		th.Mode = "code"
		th.Cheap = false
		th.NeedsWeb = false
	}
	packs := consultPacks(th.Goal, 2)
	for _, p := range packs {
		th.Packs = append(th.Packs, p.Name)
	}
	crew := rankCrew(message, th.Mode, len(history))
	if th.Mode == "weather" || th.Mode == "time" {
		th.NeedsWeb = false
	}
	plan := planText(th)
	if th.Mode == "weather" {
		plan = strings.Replace(plan, "Cheap path — skip web and crew.", "Open-Meteo current conditions. No web search.", 1)
	}
	if th.Mode == "time" {
		plan = strings.Replace(plan, "Cheap path — skip web and crew.", "Open-Meteo timezone and the civil clock. No web search.", 1)
	}
	emit(event{Type: "plan", Text: plan + " · Crew rank: " + strings.Join(crew, ", ")})

	if mode == "code" && xaiKey() == "" {
		emit(event{Type: "error", Text: "code mode needs a model key: set XAI_API_KEY. This Go runtime does not run a shell."})
		return
	}

	if text, ok := cheapAnswer(message, history, th); ok && mode != "code" {
		if thinking != "off" {
			var notes []string
			text, notes = cheapReply(message, th, text)
			for _, note := range notes {
				emit(event{Type: "thinking", Text: note})
			}
		}
		emit(event{Type: "plan", Text: "max_steps=0 mode=" + th.Mode})
		emit(event{Type: "tool", Name: "brain:" + th.Mode, Args: map[string]any{"mode": th.Mode, "cheap": true}})
		emit(event{Type: "observation", Name: "brain:" + th.Mode, Text: "One brain, handler=" + th.Mode + ". Skipped web and crew."})
		emitTokens(emit, text)
		emit(event{Type: "done", Text: text})
		emit(latency(start, 0, 0))
		return
	}

	steps := 8
	if thinking == "low" {
		steps = 5
	}
	emit(event{Type: "plan", Text: "max_steps=" + jsonNumber(steps) + " mode=" + th.Mode})

	if th.Mode == "weather" || th.Mode == "time" {
		tool := "weather_compare"
		place := placeFrom(message)
		var text string
		var hits []webHit
		remember := true
		if th.Mode == "time" {
			tool = "local_time"
			place = clockPlace(message)
			text, hits = timeReport(message)
			remember = false
		} else {
			text, hits = weatherReport(message)
		}
		toolCalls++
		emit(event{Type: "tool", Name: tool, Args: map[string]any{"place": place}})
		raw, _ := json.Marshal(hits)
		emit(event{Type: "observation", Name: tool, Text: string(raw)})
		finish(emit, text, hitsToSources(hits), start, llmCalls, toolCalls, remember)
		return
	}

	parts := th.Parts
	if len(parts) == 0 {
		parts = []string{message}
	}
	var blocks []answerBlock
	var sources []source
	evidence := ""
	held := false
	var reasonLog []string
	for _, part := range parts {
		if math, ok := tryMath(part); ok {
			if thinking != "off" {
				for _, note := range mathThought() {
					line := note
					if len(parts) > 1 {
						line = clip(part, 72) + " — " + note
					}
					reasonLog = append(reasonLog, line)
					emit(event{Type: "thinking", Text: line})
				}
			}
			blocks = append(blocks, answerBlock{Heading: headingFor(parts, part), Lead: math})
			continue
		}
		searchText := resolveFollow(part, history)
		q := focusQuery(searchText)
		// Live AI-mode search engines are disabled on 500MB hosts. Research uses local RAG only.
		var localText []string
		if th.NeedsWeb {
			ensureBrainData()
		}
		if th.NeedsWeb && corpus != nil {
			hits := corpus.search(q, 4)
			if len(hits) > 0 {
				toolCalls++
				emit(event{Type: "tool", Name: "rag_search", Args: map[string]any{"query": part, "k": 4}})
				obs := make([]map[string]any, 0, len(hits))
				for _, h := range hits {
					// SQuAD passages are local copies; never cite their Wikipedia URLs.
					citeURL := h.doc.URL
					if isWikipediaURL(citeURL) {
						citeURL = ""
					}
					obs = append(obs, map[string]any{"title": h.doc.Title, "url": citeURL, "snippet": clip(h.doc.Text, 240)})
					localText = append(localText, h.doc.Text)
					if citeURL != "" {
						sources = append(sources, source{Title: h.doc.Title, URL: citeURL})
					}
				}
				b, _ := json.Marshal(obs)
				emit(event{Type: "observation", Name: "rag_search", Text: string(b)})
			} else if thinking != "off" {
				emit(event{Type: "observation", Name: "rag_search", Text: `{"hits":[],"note":"no local passage; live web search engines are disabled"}`})
			}
		}
		blob := strings.Join(localText, "\n")
		evidence += "\n## " + part + "\n" + clip(blob, 4000)
		var lead, support string
		if thinking != "off" {
			d := reasonAnswer(part, blob, parts)
			lead, support = d.Lead, d.Support
			if d.Held {
				held = true
			}
			for _, note := range d.Notes {
				line := note
				if len(parts) > 1 {
					line = clip(part, 72) + " — " + note
				}
				reasonLog = append(reasonLog, line)
				emit(event{Type: "thinking", Text: line})
			}
		} else {
			lead, support = answerPart(part, blob, parts)
		}
		blocks = append(blocks, answerBlock{Heading: headingFor(parts, part), Lead: lead, Support: support})
	}

	text := renderAnswer(blocks, sources)
	if held {
		emit(event{Type: "plan", Text: "Kept the checked answer so a later draft cannot drop a year, a count, a person, a comparison, or an admitted gap."})
	} else if guarded(blocks) {
		emit(event{Type: "plan", Text: "Kept one block per question so a later draft cannot merge subjects, rename a person, or reuse a number."})
	} else if xaiKey() != "" && thinking != "low" && th.Mode != "calc" {
		if len(reasonLog) > 0 {
			evidence += "\n\nChecks already made (obey them; do not quote them):\n- " + strings.Join(reasonLog, "\n- ")
		}
		if got, err := grokAnswer(writerQuestion(parts, message), evidence); err == nil && strings.TrimSpace(got) != "" && answersStaySeparate(got, parts) {
			llmCalls++
			text = strings.TrimSpace(got)
			emit(event{Type: "plan", Text: "Writer: grok-4.7 grounded on retrieved evidence."})
		} else if err == nil && strings.TrimSpace(got) != "" {
			emit(event{Type: "plan", Text: "Writer mixed separate questions; keeping one block per question."})
		} else if err != nil {
			emit(event{Type: "plan", Text: "Writer fallback: local extractive answer (" + clip(err.Error(), 160) + ")."})
		}
	}
	if mode == "code" && xaiKey() != "" {
		if got, err := grokAnswer(message, "No workspace shell is available. Propose the code in the reply. Do not claim files were edited.\n\n"+message); err == nil && got != "" {
			llmCalls++
			text = got
		}
	}
	finish(emit, text, sources, start, llmCalls, toolCalls, th.Mode == "research" || th.Mode == "howto")
}

func finish(emit emitter, text string, sources []source, start time.Time, llm, tools int, remember bool) {
	if !strings.Contains(text, "Citations:") && len(sources) > 0 {
		text = renderAnswer([]answerBlock{{Lead: text}}, sources)
	}
	emitTokens(emit, text)
	emit(event{Type: "done", Text: text})
	if remember && !junkFact(text) {
		fact := clip(text, 500)
		row := writeFact(fact, firstURL(sources))
		emit(event{Type: "tool", Name: "memory_write", Args: map[string]any{"fact": clip(fact, 120)}})
		b, _ := json.Marshal(row)
		emit(event{Type: "observation", Name: "memory_write", Text: string(b)})
	}
	emit(latency(start, llm, tools))
}

func headingFor(parts []string, part string) string {
	if len(parts) < 2 {
		return ""
	}
	return "**" + part + "**\n\n"
}

func firstURL(sources []source) string {
	for _, s := range sources {
		if s.URL != "" && !isWikipediaURL(s.URL) {
			return s.URL
		}
	}
	return ""
}

func hitsToSources(hits []webHit) []source {
	out := make([]source, 0, len(hits))
	for _, h := range hits {
		out = append(out, source{Title: h.Title, URL: h.URL})
	}
	return out
}

func emitTokens(emit emitter, text string) {
	runes := []rune(text)
	for i := 0; i < len(runes); i += 48 {
		j := i + 48
		if j > len(runes) {
			j = len(runes)
		}
		emit(event{Type: "token", Text: string(runes[i:j])})
	}
}

func latency(start time.Time, llm, tools int) event {
	payload := map[string]any{
		"n_llm_calls": llm,
		"n_tools":     tools,
		"t_ms":        time.Since(start).Milliseconds(),
		"cache":       map[string]any{"hits": cacheHits.Load(), "misses": cacheMisses.Load(), "hit_rate": hitRate()},
	}
	b, _ := json.Marshal(payload)
	return event{Type: "plan", Text: "latency " + string(b)}
}

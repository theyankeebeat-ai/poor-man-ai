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
	emit(event{Type: "plan", Text: planText(th) + " · Crew rank: " + strings.Join(crew, ", ")})

	if mode == "code" && xaiKey() == "" {
		emit(event{Type: "error", Text: "code mode needs a model key: set XAI_API_KEY. This Go runtime does not run a shell."})
		return
	}

	if text, ok := cheapAnswer(message, history, th); ok && mode != "code" {
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

	if th.Mode == "weather" {
		text, hits := weatherReport(message)
		toolCalls++
		emit(event{Type: "tool", Name: "weather_compare", Args: map[string]any{"place": placeFrom(message)}})
		raw, _ := json.Marshal(hits)
		emit(event{Type: "observation", Name: "weather_compare", Text: string(raw)})
		finish(emit, text, hitsToSources(hits), start, llmCalls, toolCalls, true)
		return
	}

	parts := th.Parts
	if len(parts) == 0 {
		parts = []string{message}
	}
	var blocks []answerBlock
	var sources []source
	evidence := ""
	for _, part := range parts {
		if math, ok := tryMath(part); ok {
			blocks = append(blocks, answerBlock{Heading: headingFor(parts, part), Lead: math})
			continue
		}
		searchText := resolveFollow(part, history)
		q := focusQuery(searchText)
		var localText []string
		if corpus != nil {
			hits := corpus.search(q, 4)
			if len(hits) > 0 {
				toolCalls++
				emit(event{Type: "tool", Name: "rag_search", Args: map[string]any{"query": part, "k": 4}})
				obs := make([]map[string]any, 0, len(hits))
				for _, h := range hits {
					obs = append(obs, map[string]any{"title": h.doc.Title, "url": h.doc.URL, "snippet": clip(h.doc.Text, 240)})
					localText = append(localText, h.doc.Text)
					sources = append(sources, source{Title: h.doc.Title, URL: h.doc.URL})
				}
				b, _ := json.Marshal(obs)
				emit(event{Type: "observation", Name: "rag_search", Text: string(b)})
			}
		}
		var webText []string
		var newsHeads []string
		var titled string
		newsish := newsRE.MatchString(part) || newsRE.MatchString(searchText)
		if th.NeedsWeb && thinking != "off" {
			var found []webHit
			for _, sq := range lookupQueries(searchText) {
				found = append(found, webSearch(sq)...)
			}
			found = diversifyHits(part, rankHits(searchText, dedupeHits(found, 12)))
			if len(found) > 8 {
				found = found[:8]
			}
			toolCalls++
			emit(event{Type: "tool", Name: "web_search", Args: map[string]any{"query": searchText}})
			b, _ := json.Marshal(found)
			emit(event{Type: "observation", Name: "web_search", Text: string(b)})
			fetchN := th.Fetch
			if thinking == "low" {
				fetchN = min(fetchN, 1)
			}
			for i, hit := range found {
				sources = append(sources, source{Title: hit.Title, URL: hit.URL})
				if hit.Snippet != "" {
					webText = append(webText, hit.Snippet)
				}
				if newsish && strings.Contains(hit.URL, "news.google.com") && strings.TrimSpace(hit.Title) != "" {
					newsHeads = append(newsHeads, strings.TrimRight(strings.TrimSpace(hit.Title), ".")+".")
				}
				if i >= fetchN {
					continue
				}
				if !strings.Contains(hit.URL, "wikipedia.org") {
					continue
				}
				page := readPage(hit.URL, 4000)
				toolCalls++
				emit(event{Type: "tool", Name: "read_url", Args: map[string]any{"url": hit.URL}})
				emit(event{Type: "observation", Name: "read_url", Text: clip(page.Text, 1200)})
				if page.Text != "" {
					webText = append(webText, page.Text)
					// A news question must not be answered from the country article's opening definition.
					if !newsish {
						if sub := askedSubject(part); sub != "" && (fold(page.Title) == sub || fold(hit.Title) == sub) {
							titled = page.Text
						}
					}
				}
			}
		}
		chunks := make([]string, 0, len(localText)+len(webText)+2)
		if len(newsHeads) > 0 {
			chunks = append(chunks, strings.Join(newsHeads, " "))
		}
		if titled != "" {
			chunks = append(chunks, titled)
		}
		chunks = append(chunks, localText...)
		chunks = append(chunks, webText...)
		blob := strings.Join(chunks, "\n")
		evidence += "\n## " + part + "\n" + clip(blob, 4000)
		lead, support := answerPart(part, blob, parts)
		blocks = append(blocks, answerBlock{Heading: headingFor(parts, part), Lead: lead, Support: support})
	}

	text := renderAnswer(blocks, sources)
	if guarded(blocks) {
		emit(event{Type: "plan", Text: "Kept one block per question so a later draft cannot merge subjects, rename a person, or reuse a number."})
	} else if xaiKey() != "" && thinking != "low" && th.Mode != "calc" {
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
		if s.URL != "" {
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

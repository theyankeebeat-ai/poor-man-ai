package main

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type memoryFact struct {
	TS        string `json:"ts"`
	Fact      string `json:"fact"`
	SourceURL string `json:"source_url,omitempty"`
}

var memoryMu sync.Mutex

func memoryPath() string {
	dir := writableDir()
	_ = os.MkdirAll(dir, 0o755)
	return filepath.Join(dir, "memory.jsonl")
}

func writableDir() string {
	if d := os.Getenv("BRAIN_DATA"); d != "" {
		return d
	}
	if os.Getenv("VERCEL") == "1" {
		return filepath.Join(os.TempDir(), "poor-man-ai")
	}
	return "data"
}

func readFacts() []memoryFact {
	f, err := os.Open(memoryPath())
	if err != nil {
		return nil
	}
	defer f.Close()
	var out []memoryFact
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		var row memoryFact
		if json.Unmarshal([]byte(line), &row) != nil || strings.TrimSpace(row.Fact) == "" {
			continue
		}
		if junkFact(row.Fact) {
			continue
		}
		out = append(out, row)
	}
	return out
}

func junkFact(fact string) bool {
	l := strings.ToLower(fact)
	bad := []string{"from the pages i read", "jina", "401", "couldn't pull", "could not pull", "blocked the fetch"}
	for _, b := range bad {
		if strings.Contains(l, b) {
			return true
		}
	}
	return strings.TrimSpace(fact) == ""
}

func writeFact(fact, source string) memoryFact {
	row := memoryFact{
		TS:        time.Now().UTC().Format(time.RFC3339),
		Fact:      strings.TrimSpace(fact),
		SourceURL: source,
	}
	memoryMu.Lock()
	defer memoryMu.Unlock()
	f, err := os.OpenFile(memoryPath(), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return row
	}
	defer f.Close()
	b, _ := json.Marshal(row)
	_, _ = f.Write(append(b, '\n'))
	return row
}

func searchMemory(query string, limit int) []memoryFact {
	facts := readFacts()
	q := tokenize(query)
	if len(q) == 0 {
		if len(facts) > limit {
			return facts[len(facts)-limit:]
		}
		return facts
	}
	type hit struct {
		row   memoryFact
		score int
	}
	var hits []hit
	for _, row := range facts {
		score := overlap(q, tokenize(row.Fact))
		if score > 0 {
			hits = append(hits, hit{row, score})
		}
	}
	for i := 0; i < len(hits); i++ {
		for j := i + 1; j < len(hits); j++ {
			if hits[j].score > hits[i].score {
				hits[i], hits[j] = hits[j], hits[i]
			}
		}
	}
	if len(hits) > limit {
		hits = hits[:limit]
	}
	out := make([]memoryFact, len(hits))
	for i, h := range hits {
		out[i] = h.row
	}
	return out
}

func overlap(a, b []string) int {
	set := map[string]struct{}{}
	for _, t := range b {
		set[t] = struct{}{}
	}
	n := 0
	for _, t := range a {
		if _, ok := set[t]; ok {
			n++
		}
	}
	return n
}

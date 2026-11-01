package main

import (
	_ "embed"
	"regexp"
	"strings"

	"github.com/flosch/pongo2/v6"
)

//go:embed templates/answer.jinja
var answerTpl string

var compiledAnswer *pongo2.Template

func init() {
	tpl, err := pongo2.FromString(answerTpl)
	if err == nil {
		compiledAnswer = tpl
	}
}

type source struct {
	Title string
	URL   string
}

type answerBlock struct {
	Heading string
	Lead    string
	Support string
}

func renderAnswer(blocks []answerBlock, sources []source) string {
	var cites []string
	seen := map[string]struct{}{}
	for _, s := range sources {
		if s.URL == "" {
			continue
		}
		if _, ok := seen[s.URL]; ok {
			continue
		}
		seen[s.URL] = struct{}{}
		title := s.Title
		if title == "" {
			title = s.URL
		}
		cites = append(cites, "- "+title+" — "+s.URL)
		if len(cites) >= 6 {
			break
		}
	}
	ctxBlocks := make([]map[string]string, 0, len(blocks))
	for _, b := range blocks {
		ctxBlocks = append(ctxBlocks, map[string]string{
			"heading": b.Heading,
			"lead":    strings.TrimSpace(b.Lead),
			"support": strings.TrimSpace(b.Support),
		})
	}
	if compiledAnswer != nil {
		out, err := compiledAnswer.Execute(pongo2.Context{
			"blocks":    ctxBlocks,
			"citations": strings.Join(cites, "\n"),
		})
		if err == nil {
			return strings.TrimSpace(out)
		}
	}
	var b strings.Builder
	for _, block := range blocks {
		b.WriteString(block.Heading)
		b.WriteString(block.Lead)
		if block.Support != "" {
			b.WriteString("\n\n")
			b.WriteString(block.Support)
		}
		b.WriteString("\n\n")
	}
	if len(cites) > 0 {
		b.WriteString("Citations:\n")
		b.WriteString(strings.Join(cites, "\n"))
	}
	return strings.TrimSpace(b.String())
}

var (
	copulaAfterHead = regexp.MustCompile(`(?i)\b(is|are|was|were)\b`)
	newsEventRE     = regexp.MustCompile(`(?i)\b(election|elections|vote|voted|won|resign|resigned|killed|attack|parliament|majority)\b`)
	yearRE          = regexp.MustCompile(`\b20\d{2}\b`)
)

func leadSentence(query, text string) (lead, support string) {
	text = collapseSpace(text)
	if text == "" {
		return "I could not extract a supported sentence for that question.", ""
	}
	parts := splitSentences(text)
	q := tokenize(query)
	head := ""
	if len(q) > 0 {
		head = q[0]
	}
	bestI, bestS := -1, -1
	secondI, secondS := -1, -1
	for i, sent := range parts {
		score := fuzzyOverlap(q, tokenize(sent)) + proximityBonus(query, sent)
		if head != "" && regexp.MustCompile(`(?i)(?:^|\.\s+)`+regexp.QuoteMeta(head)+`\s+(is|are|was|were)\b`).MatchString(fold(sent)) {
			score += 8
		} else if head != "" && regexp.MustCompile(`(?i)\b`+regexp.QuoteMeta(head)+`\s+(is|are|was|were)\s+(a|an|the)\b`).MatchString(fold(sent)) {
			score += 6
		} else if copulaAfterHead.MatchString(sent) && score > 0 {
			score += 1
		}
		if len(sent) > 320 {
			score--
		}
		if newsRE.MatchString(query) {
			if newsEventRE.MatchString(sent) {
				score += 6
			}
			if yearRE.MatchString(sent) {
				score += 3
			}
			if definitionOpen.MatchString(strings.TrimSpace(sent)) {
				score -= 8
			}
		}
		if score > bestS {
			secondI, secondS = bestI, bestS
			bestI, bestS = i, score
		} else if score > secondS {
			secondI, secondS = i, score
		}
	}
	if bestI < 0 || bestS < 1 {
		return clip(parts[0], 500), ""
	}
	lead = parts[bestI]
	if secondI >= 0 && secondS >= 1 && secondI != bestI {
		prefix := lead
		if len(prefix) > 40 {
			prefix = prefix[:40]
		}
		if !strings.HasPrefix(parts[secondI], prefix) {
			support = parts[secondI]
		}
	}
	return lead, support
}

func proximityBonus(query, sentence string) int {
	want := tokenize(query)
	if len(want) < 2 {
		return 0
	}
	var pos []int
	for i, w := range strings.Fields(sentence) {
		if tokenMatches(w, want) {
			pos = append(pos, i)
		}
	}
	if len(pos) < 2 {
		return 0
	}
	best := pos[1] - pos[0]
	for i := 1; i < len(pos); i++ {
		if d := pos[i] - pos[i-1]; d < best {
			best = d
		}
	}
	if best <= 4 {
		return 4
	}
	if best <= 12 {
		return 2
	}
	return 0
}

func splitSentences(text string) []string {
	var out []string
	var b strings.Builder
	runes := []rune(text)
	for i, r := range runes {
		if r == '\n' {
			s := strings.TrimSpace(b.String())
			if len(s) > 40 {
				out = append(out, s)
			}
			b.Reset()
			continue
		}
		b.WriteRune(r)
		if r == '.' && i > 0 && i+1 < len(runes) && runes[i-1] >= '0' && runes[i-1] <= '9' && runes[i+1] >= '0' && runes[i+1] <= '9' {
			continue
		}
		if r == '.' || r == '!' || r == '?' {
			s := strings.TrimSpace(b.String())
			if len(s) > 40 {
				out = append(out, s)
			}
			b.Reset()
		}
	}
	if tail := strings.TrimSpace(b.String()); len(tail) > 40 {
		out = append(out, tail)
	}
	if len(out) == 0 && strings.TrimSpace(text) != "" {
		return []string{clip(text, 500)}
	}
	return out
}

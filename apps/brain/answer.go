package main

import (
	_ "embed"
	"regexp"
	"strings"
	"unicode"

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
		if s.URL == "" || isWikipediaURL(s.URL) {
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
	copulaAfterHead  = regexp.MustCompile(`(?i)\b(is|are|was|were)\b`)
	newsEventRE      = regexp.MustCompile(`(?i)\b(election|elections|vote|voted|won|resign|resigned|killed|attack|parliament|majority)\b`)
	yearRE           = regexp.MustCompile(`\b20\d{2}\b`)
	echoQuestion     = regexp.MustCompile(`(?i)^(what|who|where|when|why|how|define)\b`)
	answerChipRE     = regexp.MustCompile(`(?:^|\s)[^\s·•∙⋅|.!?]{1,40}(?:\s+[^\s·•∙⋅|.!?]{1,40}){0,3}\s*[·•∙⋅|]\s*[^\s·•∙⋅|.!?]{1,40}(?:\s+[^\s·•∙⋅|.!?]{1,40}){0,3}\s+\+\d+\b`)
	answerFinishedRE = regexp.MustCompile(`(?:^|\s)Finished(?:\s+\+\d+\b)?(\s+\p{Lu}|$)`)
	answerBadgeRE    = regexp.MustCompile(`(?:^|\s)\+\d+\b(\s+\p{Lu}|\s*[.!?]|$)`)
)

func leadSentence(query, text string) (lead, support string) {
	text = collapseSpace(text)
	if text == "" {
		return "I could not extract a supported sentence for that question.", ""
	}
	parts := splitSentences(text)
	if len(parts) == 0 {
		return "I could not extract a supported sentence for that question.", ""
	}
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
			keepSentence(&out, b.String())
			b.Reset()
			continue
		}
		b.WriteRune(r)
		if r == '.' && i > 0 && i+1 < len(runes) && runes[i-1] >= '0' && runes[i-1] <= '9' && runes[i+1] >= '0' && runes[i+1] <= '9' {
			continue
		}
		if r == '.' || r == '!' || r == '?' {
			keepSentence(&out, b.String())
			b.Reset()
		}
	}
	keepSentence(&out, b.String())
	if len(out) == 0 {
		whole := strings.TrimSpace(text)
		if sentenceOK(whole) {
			return []string{clip(whole, 500)}
		}
		return nil
	}
	return out
}

func keepSentence(out *[]string, raw string) {
	s := strings.TrimSpace(raw)
	if sentenceOK(s) {
		*out = append(*out, s)
	}
}

// Short factual answers stay. Status chrome does not, even when a chip
// prefix would have pushed it past 40 characters.
func sentenceOK(s string) bool {
	s = strings.TrimSpace(s)
	if s == "" || isAnswerChrome(s) {
		return false
	}
	if len([]rune(s)) > 40 {
		return true
	}
	if echoQuestion.MatchString(s) || strings.HasSuffix(s, "?") {
		return false
	}
	if len(strings.Fields(s)) < 4 {
		return false
	}
	return strings.ContainsAny(s, ".!") || copulaAfterHead.MatchString(s)
}

func isAnswerChrome(s string) bool {
	t := strings.TrimSpace(s)
	if t == "" || strings.EqualFold(t, "finished") {
		return true
	}
	rest := answerChipRE.ReplaceAllString(t, " ")
	rest = answerFinishedRE.ReplaceAllString(rest, "$1")
	rest = answerBadgeRE.ReplaceAllString(rest, "$1")
	return strings.TrimSpace(collapseSpace(rest)) == ""
}

func stripAnswerChrome(text, query string) string {
	text = collapseSpace(text)
	if text == "" {
		return ""
	}
	text = answerChipRE.ReplaceAllString(text, " ")
	text = answerFinishedRE.ReplaceAllString(text, "$1")
	text = answerBadgeRE.ReplaceAllString(text, "$1")
	text = stripEchoedQuestion(text, query)
	return dedupeAnswer(collapseSpace(text))
}

func stripEchoedQuestion(text, query string) string {
	q := strings.Trim(collapseSpace(query), " ?.!")
	if len([]rune(q)) < 6 {
		return text
	}
	// Go's regexp has no lookahead. Keep the boundary and the following capital.
	re := regexp.MustCompile(`(?i)(^|[.!?]\s+)` + regexp.QuoteMeta(q) + `[.?!]?(\s+\p{Lu}|$)`)
	return re.ReplaceAllString(text, "$1$2")
}

func dedupeAnswer(text string) string {
	text = strings.TrimSpace(text)
	if text == "" {
		return ""
	}
	runes := []rune(text)
	var parts []string
	start := 0
	for i := 0; i < len(runes); i++ {
		r := runes[i]
		if r != '.' && r != '!' && r != '?' {
			continue
		}
		if i+1 < len(runes) && runes[i+1] != ' ' {
			continue
		}
		j := i + 1
		for j < len(runes) && runes[j] == ' ' {
			j++
		}
		if j >= len(runes) || unicode.IsUpper(runes[j]) {
			if piece := strings.TrimSpace(string(runes[start : i+1])); piece != "" {
				parts = append(parts, piece)
			}
			start = j
			i = j - 1
		}
	}
	if tail := strings.TrimSpace(string(runes[start:])); tail != "" {
		parts = append(parts, tail)
	}
	var kept []string
	seen := map[string]struct{}{}
	for _, piece := range parts {
		key := strings.TrimRight(strings.ToLower(piece), ".!? ")
		if key == "" {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		kept = append(kept, piece)
	}
	return strings.Join(kept, " ")
}

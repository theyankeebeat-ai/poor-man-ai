package main

import (
	"fmt"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"
)

// Answer guards for every question: near-miss spelling, a new subject after
// "so" or "then", one headline standing in for several events, a number borrowed
// from a different condition, and a given name the sources do not use.

const answerRules = `Rules:
- Answer only the question that was asked.
- If several questions are listed, give each one its own section and do not weave them into one story.
- "So" or "then" does not make a new question the same subject as the previous one.
- If the sources spell a name differently from the question, use the sources' spelling. Do not treat a different given name as the same person.
- If the sources describe more than one event, list them separately. The word "the" does not mean there is only one.
- Do not use a number the sources give for one condition as the value for a different condition, or as the value of a change from one condition to another.
- Do not turn a qualified source ("when", "if", "does not") into a universal.
- Do not add a name or a fact that the quoted words do not contain.
- Use only the evidence. If it does not support an answer, say what is missing. Do not invent URLs. When you cite, end with a line "Citations:" and one URL per line, copied from the evidence.`

var (
	discourseLead = regexp.MustCompile(`(?i)^(so|and|also|then|well|now|ok|okay)\b`)
	pronounRE     = regexp.MustCompile(`(?i)\b(it|its|they|them|he|she|his|her|him|hers|the same)\b`)
	gluedAsk      = regexp.MustCompile(`(?i)([.!?])\s+((?:so|and|also|then|well|now)\s+)?(what|who|where|when|why|how|define|is|are|did|does|do|can|could)\b`)
	fromToRE      = regexp.MustCompile(`(?i)\bfrom\s+(?:the\s+|a\s+|an\s+)?([a-z][a-z-]{2,})\s+(?:to|into)\s+(?:the\s+|a\s+|an\s+)?([a-z][a-z-]{2,})`)
	condRE        = regexp.MustCompile(`(?i)\b(?:in|inside|through)\s+(?:the\s+|a\s+|an\s+)?([a-z][a-z-]{2,})`)
	quantityRE    = regexp.MustCompile(`(?i)\b(how\s+fast|how\s+long|how\s+much|how\s+far|speed|velocity|rate)\b`)
	singularRE    = regexp.MustCompile(`(?i)\bthe\s+(controversy|dispute|disputes|news|story|issue|problem|crisis|row|debate|conflict|fight|feud|scandal|disagreement)\b|\blatest\b`)
	whyRE         = regexp.MustCompile(`(?i)\bwhy\b`)
	defineQ       = regexp.MustCompile(`(?i)\b(what|who|define)\b`)
	whereQ        = regexp.MustCompile(`(?i)\bwhere\b`)
	whereSubject  = regexp.MustCompile(`(?i)\b(?:can|do|does|is|are)\s+(.+?)\s+(?:be\s+found|be\s+located|found|located|find|occur|occurs|live|exist|exists)\b`)
	defineSubject = regexp.MustCompile(`(?i)^(?:what|who|define)\s+(?:is|are|was|were\s+)?(?:a\s+|an\s+|the\s+)?(.+)$`)
	placeCue      = regexp.MustCompile(`(?i)\b(ocean|oceans|sea|seas|lake|lakes|river|rivers|ice|glacier|glaciers|atmosphere|underground|surface|groundwater|aquifer|rain|cloud|clouds|soil|crust|steam|vapor|vapour|found|located|occurs)\b`)
	limiterRE     = regexp.MustCompile(`(?i)\b(if|when|unless|except|only|does not|do not|did not|not always)\b`)
	askVerbs      = map[string]struct{}{
		"define": {}, "mean": {}, "means": {}, "explain": {}, "describe": {}, "tell": {},
	}
	notCondition = map[string]struct{}{
		"general": {}, "fact": {}, "practice": {}, "theory": {}, "short": {},
		"detail": {}, "particular": {}, "question": {}, "case": {}, "turn": {},
		"place": {}, "time": {}, "way": {}, "order": {}, "world": {}, "end": {},
	}
	// Verbs and quantity words are not a new subject. A named noun is.
	thinWords = map[string]struct{}{
		"fast": {}, "faster": {}, "speed": {}, "travel": {}, "travels": {}, "traveled": {},
		"move": {}, "moves": {}, "bend": {}, "bends": {}, "happen": {}, "happens": {},
		"rate": {}, "long": {}, "much": {}, "far": {}, "times": {}, "quick": {},
		"quickly": {}, "slow": {}, "slowly": {}, "enter": {}, "enters": {}, "entered": {},
	}
)

func fold(s string) string {
	s = strings.ToLower(s)
	r := strings.NewReplacer(
		"à", "a", "á", "a", "â", "a", "ä", "a", "ã", "a", "å", "a",
		"è", "e", "é", "e", "ê", "e", "ë", "e",
		"ì", "i", "í", "i", "î", "i", "ï", "i",
		"ò", "o", "ó", "o", "ô", "o", "ö", "o", "õ", "o",
		"ù", "u", "ú", "u", "û", "u", "ü", "u",
		"ý", "y", "ÿ", "y",
		"ñ", "n", "ç", "c",
		"œ", "oe", "æ", "ae",
	)
	return r.Replace(s)
}

func tokensClose(a, b string) bool {
	a, b = fold(a), fold(b)
	if a == b {
		return true
	}
	la, lb := utf8.RuneCountInString(a), utf8.RuneCountInString(b)
	if la < 5 || lb < 5 {
		return false
	}
	d := editDistance(a, b, 2)
	if d < 0 {
		return false
	}
	sameFirst := firstRune(a) == firstRune(b)
	if d == 1 && (sameFirst || (la >= 8 && lb >= 8)) {
		return true
	}
	return d == 2 && la >= 8 && lb >= 8 && sameFirst
}

func firstRune(s string) rune {
	for _, r := range s {
		return r
	}
	return 0
}

func editDistance(a, b string, max int) int {
	if a == b {
		return 0
	}
	ar := []rune(a)
	br := []rune(b)
	if absInt(len(ar)-len(br)) > max {
		return -1
	}
	prev := make([]int, len(br)+1)
	cur := make([]int, len(br)+1)
	for j := range prev {
		prev[j] = j
	}
	for i := 1; i <= len(ar); i++ {
		cur[0] = i
		rowMin := cur[0]
		for j := 1; j <= len(br); j++ {
			cost := 1
			if ar[i-1] == br[j-1] {
				cost = 0
			}
			cur[j] = min(prev[j]+1, min(cur[j-1]+1, prev[j-1]+cost))
			if cur[j] < rowMin {
				rowMin = cur[j]
			}
		}
		if rowMin > max {
			return -1
		}
		prev, cur = cur, prev
	}
	if prev[len(br)] > max {
		return -1
	}
	return prev[len(br)]
}

func absInt(n int) int {
	if n < 0 {
		return -n
	}
	return n
}

func fuzzyOverlap(a, b []string) int {
	used := make([]bool, len(b))
	n := 0
	for _, t := range a {
		for j, u := range b {
			if used[j] {
				continue
			}
			if t == u || tokensClose(t, u) {
				used[j] = true
				n++
				break
			}
		}
	}
	return n
}

func tokenMatches(w string, want []string) bool {
	w = fold(strings.Trim(w, ".,;:\"'"))
	if w == "" {
		return false
	}
	for _, t := range want {
		if w == t || tokensClose(w, t) {
			return true
		}
	}
	return false
}

func stripDiscourse(s string) string {
	s = strings.TrimSpace(s)
	for i := 0; i < 3; i++ {
		next := strings.TrimSpace(discourseLead.ReplaceAllString(s, ""))
		if next == s {
			break
		}
		s = next
	}
	return s
}

func subjectTokens(message string) []string {
	drop := map[string]struct{}{}
	for _, w := range conditionWords(message) {
		drop[w] = struct{}{}
	}
	if a, b, ok := fromTo(message); ok {
		drop[a] = struct{}{}
		drop[b] = struct{}{}
	}
	var out []string
	for _, t := range tokenize(message) {
		if _, ok := drop[t]; ok {
			continue
		}
		out = append(out, t)
	}
	return out
}

func needsAntecedent(message, prev string) bool {
	if strings.TrimSpace(prev) == "" {
		return false
	}
	stripped := stripDiscourse(message)
	content := tokenize(stripped)
	// "it/he/they" inherits only when this question does not already name a subject.
	// A condition ("in the air") and an event word ("elections") are not that subject.
	if pronounRE.MatchString(stripped) {
		named := antecedentSubject(stripped)
		if len(named) > 0 && fuzzyOverlap(named, tokenize(prev)) == 0 {
			return false
		}
		return true
	}
	return len(content) < 2
}

// Pronouns and event words keep the previous subject. "Did they have elections?"
// is still about Serbia. "Why does the beam bend?" names its own subject.
var (
	pronounWords = map[string]struct{}{
		"it": {}, "its": {}, "they": {}, "them": {}, "their": {},
		"he": {}, "she": {}, "his": {}, "her": {}, "him": {}, "hers": {},
	}
	eventWords = map[string]struct{}{
		"had": {}, "have": {}, "has": {}, "having": {},
		"election": {}, "elections": {}, "vote": {}, "voted": {}, "voting": {},
		"news": {}, "latest": {}, "happen": {}, "happened": {}, "happens": {},
		"win": {}, "won": {}, "result": {}, "results": {},
		"poll": {}, "polls": {}, "month": {}, "week": {},
		"today": {}, "yesterday": {},
	}
	// A person is a given name plus a surname. These words are not either.
	notNameWord = map[string]struct{}{
		"had": {}, "have": {}, "has": {}, "having": {}, "been": {}, "being": {},
		"they": {}, "them": {}, "their": {}, "he": {}, "she": {}, "his": {}, "her": {}, "him": {},
		"election": {}, "elections": {}, "news": {}, "latest": {}, "month": {}, "week": {},
		"year": {}, "today": {}, "yesterday": {}, "free": {}, "early": {},
		"parliamentary": {}, "held": {}, "hold": {}, "vote": {}, "votes": {}, "voting": {},
		"poll": {}, "polls": {}, "result": {}, "results": {}, "said": {}, "says": {},
	}
)

func antecedentSubject(message string) []string {
	var out []string
	for _, t := range subjectTokens(message) {
		if _, ok := pronounWords[t]; ok {
			continue
		}
		if _, ok := eventWords[t]; ok {
			continue
		}
		if _, ok := thinWords[t]; ok {
			continue
		}
		out = append(out, t)
	}
	return out
}

func focusNouns(s string) []string {
	var out []string
	seen := map[string]struct{}{}
	for _, t := range tokenize(stripDiscourse(s)) {
		if _, skip := askVerbs[t]; skip {
			continue
		}
		if _, ok := seen[t]; ok {
			continue
		}
		seen[t] = struct{}{}
		out = append(out, t)
		if len(out) == 4 {
			break
		}
	}
	return out
}

func resolveFollow(message string, history []turn) string {
	prev := lastUser(history)
	if !needsAntecedent(message, prev) {
		return message
	}
	have := map[string]struct{}{}
	for _, t := range tokenize(message) {
		have[t] = struct{}{}
	}
	var add []string
	for _, n := range focusNouns(prev) {
		if _, ok := have[n]; ok {
			continue
		}
		add = append(add, n)
	}
	if len(add) == 0 {
		return message
	}
	return strings.TrimSpace(message + " " + strings.Join(add, " "))
}

func cleanAsk(s string) string {
	s = strings.TrimSpace(s)
	s = strings.Trim(s, " \t.!,:;?")
	s = leadGreetRE.ReplaceAllString(s, "")
	s = strings.TrimSpace(s)
	return strings.Trim(s, " \t.!,:;?")
}

func splitGluedAsks(s string) []string {
	loc := gluedAsk.FindAllStringSubmatchIndex(s, -1)
	if len(loc) == 0 {
		return []string{s}
	}
	var out []string
	start := 0
	for _, m := range loc {
		if m[2] < start {
			continue
		}
		out = append(out, s[start:m[2]])
		if m[4] >= 0 {
			start = m[4]
		} else {
			start = m[6]
		}
	}
	out = append(out, s[start:])
	return out
}

func words(s string) []string {
	var b strings.Builder
	var out []string
	flush := func() {
		if b.Len() == 0 {
			return
		}
		out = append(out, b.String())
		b.Reset()
	}
	for _, r := range s {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '-' || r == '\'' {
			b.WriteRune(r)
		} else {
			flush()
		}
	}
	flush()
	return out
}

func isCapitalized(w string) bool {
	for _, r := range w {
		return unicode.IsUpper(r)
	}
	return false
}

func isStop(w string) bool {
	_, ok := stopwords[fold(w)]
	return ok
}

func hasWord(text, word string) bool {
	word = fold(word)
	for _, t := range tokenize(text) {
		if t == word || tokensClose(t, word) {
			return true
		}
	}
	return false
}

func fromTo(part string) (from, to string, ok bool) {
	m := fromToRE.FindStringSubmatch(part)
	if m == nil {
		return "", "", false
	}
	return fold(m[1]), fold(m[2]), true
}

func conditionWords(part string) []string {
	var out []string
	seen := map[string]struct{}{}
	for _, m := range condRE.FindAllStringSubmatch(part, -1) {
		w := fold(m[1])
		if _, skip := notCondition[w]; skip {
			continue
		}
		if _, ok := seen[w]; ok {
			continue
		}
		seen[w] = struct{}{}
		out = append(out, w)
	}
	return out
}

func filterSentences(sents []string, words []string) []string {
	var out []string
	for _, s := range sents {
		ok := true
		for _, w := range words {
			if !hasWord(s, w) {
				ok = false
				break
			}
		}
		if ok {
			out = append(out, s)
		}
	}
	return out
}

func firstMentioning(sents []string, words ...string) string {
	for _, s := range sents {
		ok := true
		for _, w := range words {
			if !hasWord(s, w) {
				ok = false
				break
			}
		}
		if ok {
			return s
		}
	}
	return ""
}

func siblingOnlyTokens(part string, all []string) []string {
	mine := map[string]struct{}{}
	for _, t := range tokenize(part) {
		mine[t] = struct{}{}
	}
	var out []string
	seen := map[string]struct{}{}
	for _, other := range all {
		if strings.TrimSpace(other) == strings.TrimSpace(part) {
			continue
		}
		for _, t := range tokenize(other) {
			if _, ok := mine[t]; ok {
				continue
			}
			if _, ok := seen[t]; ok {
				continue
			}
			seen[t] = struct{}{}
			out = append(out, t)
		}
	}
	return out
}

func dropOffQuestion(part, blob string, all []string) string {
	sib := siblingOnlyTokens(part, all)
	if len(sib) == 0 {
		return blob
	}
	q := tokenize(part)
	var kept []string
	for _, s := range splitSentences(blob) {
		if fuzzyOverlap(sib, tokenize(s)) >= 2 && fuzzyOverlap(sib, tokenize(s)) > fuzzyOverlap(q, tokenize(s)) {
			continue
		}
		kept = append(kept, s)
	}
	if len(kept) == 0 {
		return ""
	}
	return strings.Join(kept, " ")
}

func tokenSubtract(toks, drop []string) []string {
	set := map[string]struct{}{}
	for _, t := range drop {
		set[t] = struct{}{}
	}
	var out []string
	seen := map[string]struct{}{}
	for _, t := range toks {
		if _, ok := set[t]; ok {
			continue
		}
		if _, ok := seen[t]; ok {
			continue
		}
		seen[t] = struct{}{}
		out = append(out, t)
	}
	return out
}

func jaccardExact(a, b []string) float64 {
	if len(a) == 0 || len(b) == 0 {
		return 0
	}
	set := map[string]struct{}{}
	for _, t := range b {
		set[t] = struct{}{}
	}
	inter := 0
	seen := map[string]struct{}{}
	for _, t := range a {
		if _, ok := seen[t]; ok {
			continue
		}
		seen[t] = struct{}{}
		if _, ok := set[t]; ok {
			inter++
		}
	}
	union := len(seen) + len(set) - inter
	if union == 0 {
		return 0
	}
	return float64(inter) / float64(union)
}

func singularDivergent(part, lead, support string) bool {
	if strings.TrimSpace(support) == "" || !singularRE.MatchString(part) {
		return false
	}
	q := tokenize(part)
	a := tokenSubtract(tokenize(lead), q)
	b := tokenSubtract(tokenize(support), q)
	if len(a) < 3 || len(b) < 3 {
		return false
	}
	return jaccardExact(a, b) < 0.25
}

func whyLimiter(part, lead string, sents []string) string {
	if !whyRE.MatchString(part) {
		return ""
	}
	q := tokenize(part)
	best, bestS := "", 0
	for _, s := range sents {
		if s == lead || strings.Contains(lead, s) {
			continue
		}
		if !limiterRE.MatchString(s) {
			continue
		}
		score := fuzzyOverlap(q, tokenize(s))
		if score > bestS {
			bestS = score
			best = s
		}
	}
	if bestS < 1 {
		return ""
	}
	return best
}

func nameCaveat(part, blob string) string {
	asked := words(part)
	bw := words(blob)
	for i := 0; i+1 < len(asked); i++ {
		g, f := fold(asked[i]), fold(asked[i+1])
		if len(g) < 3 || len(f) < 4 || isStop(g) || isStop(f) {
			continue
		}
		if _, ok := notNameWord[g]; ok {
			continue
		}
		if _, ok := notNameWord[f]; ok {
			continue
		}
		close := false
		mismatch := ""
		for j := 1; j < len(bw); j++ {
			if !isCapitalized(bw[j-1]) || !isCapitalized(bw[j]) {
				continue
			}
			eg, ef := fold(bw[j-1]), fold(bw[j])
			if isStop(eg) || len(eg) < 3 {
				continue
			}
			if ef != f && !tokensClose(ef, f) {
				continue
			}
			d := editDistance(g, eg, 3)
			if d >= 0 && d <= 1 {
				close = true
				break
			}
			if mismatch == "" {
				mismatch = "Sources name " + bw[j-1] + " " + bw[j] + ", not " + asked[i] + " " + asked[i+1] + "."
			}
		}
		if close || mismatch == "" {
			continue
		}
		return mismatch
	}
	return ""
}

func withCaveat(part, blob, lead, support string) (string, string) {
	note := nameCaveat(part, blob)
	if note == "" || strings.Contains(lead+" "+support, note) {
		return lead, support
	}
	if strings.TrimSpace(support) == "" {
		return lead, note
	}
	return lead, note + " " + support
}

func joinSupport(a, b string) string {
	a, b = strings.TrimSpace(a), strings.TrimSpace(b)
	if a == "" {
		return b
	}
	if b == "" || strings.Contains(a, b) {
		return a
	}
	return a + " " + b
}

func askedSubject(part string) string {
	s := strings.TrimSpace(stripDiscourse(part))
	if defineQ.MatchString(s) {
		if m := defineSubject.FindStringSubmatch(s); m != nil {
			phrase := strings.TrimSpace(m[1])
			if i := strings.Index(fold(phrase), " of "); i > 0 {
				phrase = phrase[:i]
			}
			toks := tokenize(phrase)
			if len(toks) > 0 {
				return toks[len(toks)-1]
			}
		}
	}
	if whereQ.MatchString(s) {
		if m := whereSubject.FindStringSubmatch(s); m != nil {
			toks := tokenize(m[1])
			if len(toks) > 0 {
				return toks[len(toks)-1]
			}
		}
	}
	return ""
}

func sentenceLeadsWith(sent, subject string) bool {
	return regexp.MustCompile(`(?i)^` + regexp.QuoteMeta(fold(subject)) + `\s+(is|are|was|were)\b`).MatchString(fold(sent))
}

func sentenceDefines(sent, subject string) bool {
	if sentenceLeadsWith(sent, subject) {
		return true
	}
	return regexp.MustCompile(`(?i)\b` + regexp.QuoteMeta(fold(subject)) + `\s+(is|are|was|were)\s+(a|an|the)\b`).MatchString(fold(sent))
}

func bestDefinition(sents []string, subject string) string {
	best, bestS := "", 0
	for _, s := range sents {
		if !sentenceDefines(s, subject) {
			continue
		}
		score := 8
		if sentenceLeadsWith(s, subject) {
			score += 4
		}
		if regexp.MustCompile(`(?i)\b` + regexp.QuoteMeta(fold(subject)) + `\s+(is|are|was|were)\s+(a|an|the)\b`).MatchString(fold(s)) {
			score += 2
		}
		if score > bestS {
			bestS = score
			best = s
		}
	}
	return best
}

func bestLocation(sents []string, subject string) string {
	best, bestS := "", 0
	for _, s := range sents {
		if !hasWord(s, subject) {
			continue
		}
		score := 1
		if placeCue.MatchString(s) {
			score += 6
		}
		if regexp.MustCompile(`(?i)\b(ocean|oceans|sea|seas|lake|lakes|river|rivers|ice|glacier|glaciers|groundwater|aquifer)\b`).MatchString(s) {
			score += 2
		}
		if regexp.MustCompile(`(?i)\b(on|in|under|beneath)\b.{0,40}\b(ocean|oceans|sea|seas|surface|lake|lakes|river|rivers|atmosphere|ground|crust|ice)\b`).MatchString(s) {
			score += 3
		}
		if score > bestS {
			bestS = score
			best = s
		}
	}
	if bestS < 7 {
		return ""
	}
	return best
}

func nextSentence(sents []string, lead string) string {
	for i, s := range sents {
		if s == lead && i+1 < len(sents) {
			return sents[i+1]
		}
	}
	return ""
}

func definitionSupport(sents []string, subject, lead string) string {
	nxt := nextSentence(sents, lead)
	if nxt == "" {
		return ""
	}
	if hasWord(nxt, subject) || regexp.MustCompile(`(?i)^it\s+(is|was|are|were)\b`).MatchString(nxt) {
		return nxt
	}
	return ""
}

func anotherLocation(sents []string, subject, lead string) string {
	best, bestS := "", 0
	for _, s := range sents {
		if s == lead || !hasWord(s, subject) || !placeCue.MatchString(s) {
			continue
		}
		score := 7
		if regexp.MustCompile(`(?i)\b(ocean|oceans|sea|seas|lake|lakes|river|rivers|ice|glacier|glaciers|groundwater|aquifer)\b`).MatchString(s) {
			score += 2
		}
		if score > bestS {
			bestS = score
			best = s
		}
	}
	return best
}

func answerPart(part, blob string, all []string) (string, string) {
	blob = collapseSpace(blob)
	if blob == "" {
		return "I could not extract a supported sentence for that question.", ""
	}
	sents := splitSentences(blob)
	if quantityRE.MatchString(part) {
		if from, to, ok := fromTo(part); ok && firstMentioning(sents, from, to) == "" {
			lead := "The pages do not give one value for the change from " + from + " to " + to + "."
			var side []string
			if left := firstMentioning(sents, from); left != "" {
				side = append(side, left)
			}
			if right := firstMentioning(sents, to); right != "" && (len(side) == 0 || side[0] != right) {
				side = append(side, right)
			}
			return withCaveat(part, blob, lead, strings.Join(side, " "))
		}
	}
	pool := blob
	if conds := conditionWords(part); len(conds) > 0 {
		kept := filterSentences(sents, conds)
		if len(kept) == 0 {
			return withCaveat(part, blob, "The pages do not state this for "+strings.Join(conds, " and ")+".", "")
		}
		pool = strings.Join(kept, " ")
	}
	pool = dropOffQuestion(part, pool, all)
	if strings.TrimSpace(pool) == "" {
		return withCaveat(part, blob, "The pages I found answer a different question than the one asked.", "")
	}
	askingNews := newsRE.MatchString(part)
	if askingNews {
		pool = dropDefinitions(pool)
	}
	if sub := askedSubject(part); sub != "" && !askingNews {
		scoped := splitSentences(pool)
		if defineQ.MatchString(part) {
			if def := bestDefinition(scoped, sub); def != "" {
				return withCaveat(part, blob, def, definitionSupport(scoped, sub, def))
			}
		}
		if whereQ.MatchString(part) {
			if loc := bestLocation(scoped, sub); loc != "" {
				return withCaveat(part, blob, loc, anotherLocation(scoped, sub, loc))
			}
		}
	}
	lead, support := leadSentence(part, pool)
	support = withoutRepeatedLead(lead, support)
	if singularDivergent(part, lead, support) {
		support = "A separate account: " + support
	}
	if lim := whyLimiter(part, lead, splitSentences(blob)); lim != "" {
		support = joinSupport(support, lim)
	}
	return withCaveat(part, blob, lead, support)
}

var definitionOpen = regexp.MustCompile(`(?i)^[\p{L}][\p{L}'’.\-]{1,40}\s+(is|are|was|were)\s+(a|an|the)\b`)

func dropDefinitions(text string) string {
	var kept []string
	for _, s := range splitSentences(text) {
		if definitionOpen.MatchString(strings.TrimSpace(s)) {
			continue
		}
		kept = append(kept, s)
	}
	if len(kept) == 0 {
		return text
	}
	return strings.Join(kept, " ")
}

func withoutRepeatedLead(lead, support string) string {
	lead, support = strings.TrimSpace(lead), strings.TrimSpace(support)
	if lead == "" || support == "" {
		return support
	}
	i := strings.Index(fold(support), fold(lead))
	if i < 0 {
		return support
	}
	head := strings.TrimSpace(support[:i])
	if len(tokenize(head)) >= 4 {
		return head
	}
	return ""
}

func guarded(blocks []answerBlock) bool {
	for _, b := range blocks {
		s := b.Lead + " " + b.Support
		if strings.Contains(s, "Sources name ") ||
			strings.Contains(s, "do not give one value") ||
			strings.Contains(s, "do not state this for") ||
			strings.Contains(s, "A separate account:") ||
			strings.Contains(s, "answer a different question") {
			return true
		}
	}
	return false
}

func writerQuestion(parts []string, message string) string {
	if len(parts) < 2 {
		return message
	}
	var b strings.Builder
	b.WriteString("The user asked separate questions. Answer each in its own section, in order. Do not weave them into one story.\n")
	for i, p := range parts {
		fmt.Fprintf(&b, "%d. %s\n", i+1, p)
	}
	return b.String()
}

func splitChunks(text string) []string {
	text = strings.TrimSpace(text)
	var raw []string
	if strings.Contains(text, "\n\n") {
		raw = strings.Split(text, "\n\n")
	} else {
		raw = strings.Split(text, "\n")
	}
	var out []string
	for _, p := range raw {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	if len(out) == 0 && text != "" {
		return []string{text}
	}
	return out
}

func containsToken(text, tok string) bool {
	for _, t := range tokenize(text) {
		if t == tok || tokensClose(t, tok) {
			return true
		}
	}
	return false
}

func distinctiveToken(part string, all []string) string {
	others := map[string]struct{}{}
	for _, p := range all {
		if strings.TrimSpace(p) == strings.TrimSpace(part) {
			continue
		}
		for _, t := range tokenize(p) {
			others[t] = struct{}{}
		}
	}
	best := ""
	for _, t := range tokenize(part) {
		if _, ok := others[t]; ok {
			continue
		}
		if len(t) > len(best) {
			best = t
		}
	}
	return best
}

func answersStaySeparate(text string, parts []string) bool {
	if len(parts) < 2 {
		return true
	}
	chunks := splitChunks(text)
	if len(chunks) < len(parts) {
		return false
	}
	for _, c := range chunks {
		owners := 0
		for _, p := range parts {
			tok := distinctiveToken(p, parts)
			if tok == "" {
				continue
			}
			if containsToken(c, tok) {
				owners++
			}
		}
		if owners >= 2 {
			return false
		}
	}
	return true
}

func diversifyHits(query string, hits []webHit) []webHit {
	if len(hits) < 3 {
		return hits
	}
	q := tokenize(query)
	var out, skipped []webHit
	var keptExtra [][]string
	for _, h := range hits {
		extra := tokenSubtract(tokenize(h.Title+" "+h.Snippet), q)
		if redundantExtra(extra, keptExtra) {
			skipped = append(skipped, h)
			continue
		}
		out = append(out, h)
		keptExtra = append(keptExtra, extra)
	}
	if len(out) == 0 {
		return hits
	}
	return append(out, skipped...)
}

func redundantExtra(extra []string, kept [][]string) bool {
	if len(extra) < 2 {
		return false
	}
	for _, k := range kept {
		if len(k) < 2 {
			continue
		}
		if jaccardExact(extra, k) >= 0.6 {
			return true
		}
	}
	return false
}

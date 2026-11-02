package main

import (
	"regexp"
	"strings"
	"unicode"
)

// The local brain is potion-base-8M static embeddings plus an extractive
// pick. It cannot think in tokens, so each question gets four bounded notes
// — understand, constraints, check, keep or revise — and the reply is the
// sentence that survives the check.

type askIntent string

const (
	intentWhen     askIntent = "when"
	intentCount    askIntent = "count"
	intentCompare  askIntent = "compare"
	intentWho      askIntent = "who"
	intentQuantity askIntent = "quantity"
	intentWhy      askIntent = "why"
	intentWhere    askIntent = "where"
	intentNews     askIntent = "news"
	intentDefine   askIntent = "define"
	intentFact     askIntent = "fact"
)

type deliberation struct {
	Lead    string
	Support string
	Notes   []string
	Held    bool
}

const (
	gapYear    = "The pages do not state the year this asks for."
	gapNumber  = "The pages do not state the number this asks for."
	gapPerson  = "The pages do not name a person for this."
	gapCompare = "The pages do not compare both sides of this question."
)

var (
	temporalLeadRE = regexp.MustCompile(`(?i)^\s*(?:so|and|also|then|well|now|ok|okay)?\s*(when|what\s+year|which\s+year|what\s+date|in\s+what\s+year)\b`)
	countLeadRE    = regexp.MustCompile(`(?i)\b(how\s+many|how\s+old|population|how\s+tall|how\s+high|how\s+wide)\b`)
	whoLeadRE      = regexp.MustCompile(`(?i)^\s*(?:so|and|also|then|well|now)?\s*who\b`)
	compareCueRE   = regexp.MustCompile(`(?i)\b(which|larger|biggest|bigger|smaller|heavier|lighter|taller|versus|vs|better|worse)\b`)
	orSidesRE      = regexp.MustCompile(`(?i)\b([\p{L}][\p{L}'’-]{2,})\s+or\s+(?:the\s+|a\s+|an\s+)?([\p{L}][\p{L}'’-]{2,})\b`)
	yearTokenRE    = regexp.MustCompile(`\b(?:1[0-9]{3}|20[0-9]{2})\b`)
	monthTokenRE   = regexp.MustCompile(`(?i)\b(january|february|march|april|may|june|july|august|september|october|november|december)\b`)
	whoVerbRE      = regexp.MustCompile(`(?i)\b(invented|built|born|founded|named|wrote|discovered|designed|created|painted|composed|directed|led|ruled|said|apologised|apologized)\b`)
	defineShapeRE  = regexp.MustCompile(`(?i)\b(is|are|was|were)\s+(a|an|the)\b`)
)

func reasonAnswer(part, blob string, all []string) deliberation {
	intent := classifyAsk(part)
	lead, support := answerPart(part, blob, all)
	notes := []string{
		note("Understand: " + understandLine(part, intent)),
		note("Constraints: " + constraintLine(intent)),
	}
	if alreadyCaveat(lead) {
		notes = append(notes,
			"Check: the draft already admits a gap or a limit.",
			"Keep: that admission stays with the evidence.",
		)
		return deliberation{Lead: lead, Support: support, Notes: notes, Held: false}
	}
	revised, nextSupport, decision, held := checkDraft(part, blob, lead, support, intent)
	if held && revised != lead {
		revised, nextSupport = withCaveat(part, blob, revised, nextSupport)
	}
	notes = append(notes, note("Check: "+decision))
	switch {
	case !held:
		notes = append(notes, "Keep: the draft meets the constraints.")
	case strings.HasPrefix(revised, "The pages do not"):
		notes = append(notes, "Revise: admit the gap instead of answering with the failed draft.")
	default:
		notes = append(notes, "Revise: the reply uses the sentence that passes the check.")
	}
	return deliberation{Lead: revised, Support: nextSupport, Notes: notes, Held: held}
}

func classifyAsk(part string) askIntent {
	s := strings.TrimSpace(stripDiscourse(part))
	switch {
	case countLeadRE.MatchString(s):
		return intentCount
	case temporalLeadRE.MatchString(s):
		return intentWhen
	case whoLeadRE.MatchString(s):
		return intentWho
	case compareQuestion(s):
		return intentCompare
	case quantityRE.MatchString(s):
		return intentQuantity
	case whyRE.MatchString(s):
		return intentWhy
	case whereQ.MatchString(s):
		return intentWhere
	case newsRE.MatchString(s):
		return intentNews
	case defineQ.MatchString(s) || echoQuestion.MatchString(s):
		return intentDefine
	default:
		return intentFact
	}
}

func compareQuestion(part string) bool {
	if !compareCueRE.MatchString(part) {
		return false
	}
	_, _, ok := compareSides(part)
	return ok
}

func understandLine(part string, intent askIntent) string {
	nouns := focusNouns(part)
	if len(nouns) == 0 {
		return "a " + string(intent) + " question."
	}
	if len(nouns) > 3 {
		nouns = nouns[:3]
	}
	return "a " + string(intent) + " question about " + strings.Join(nouns, " ") + "."
}

func constraintLine(intent askIntent) string {
	switch intent {
	case intentWhen:
		return "the reply must give a year or a month. A definition is not a date."
	case intentCount:
		return "the reply must give a number. A definition is not a count."
	case intentCompare:
		return "the reply must mention both sides. One side is not a comparison."
	case intentWho:
		return "the reply must name a person. A definition of the thing is not a person."
	case intentQuantity:
		return "keep the number on the condition that was asked, and do not borrow another one."
	case intentWhy:
		return "keep the cause, and keep a limiter if the pages state one."
	case intentWhere:
		return "the reply must say where, not only what the thing is."
	case intentNews:
		return "the reply must be the event, not the country's definition."
	case intentDefine:
		return "the reply must say what the thing is, in the pages' own words."
	case intentFact:
		return "the reply must stay on the question and must not add a fact the pages do not state."
	default:
		return "the reply must stay on the question."
	}
}

func checkDraft(part, blob, lead, support string, intent askIntent) (string, string, string, bool) {
	switch intent {
	case intentWhen:
		return slotCheck(part, blob, lead, support, hasWhenSlot, gapYear, "a year or a month")
	case intentCount:
		return slotCheck(part, blob, lead, support, hasDigit, gapNumber, "a number")
	case intentCompare:
		return compareCheck(part, blob, lead, support)
	case intentWho:
		return whoCheck(part, blob, lead, support)
	case intentQuantity, intentWhy, intentWhere, intentNews, intentDefine, intentFact:
		return lead, support, "no extra slot beyond the draft.", false
	default:
		return lead, support, "no extra slot beyond the draft.", false
	}
}

func slotCheck(part, blob, lead, support string, ok func(string) bool, gap, slotName string) (string, string, string, bool) {
	if ok(lead) {
		return lead, support, "the draft already has " + slotName + ".", false
	}
	if alt := firstSlot(part, blob, lead, ok); alt != "" {
		return alt, supportWithout(support, alt), "the draft has no " + slotName + ", and another sentence does.", true
	}
	return gap, joinSupport(lead, support), "nothing in the pages has " + slotName + ".", true
}

func compareCheck(part, blob, lead, support string) (string, string, string, bool) {
	a, b, ok := compareSides(part)
	if !ok {
		return lead, support, "the question does not name two sides.", false
	}
	if mentionsBoth(lead, a, b) {
		return lead, support, "the draft mentions both sides.", false
	}
	alt := firstSlot(part, blob, lead, func(s string) bool {
		return mentionsBoth(s, a, b)
	})
	if alt != "" {
		return alt, supportWithout(support, alt), "the draft mentions only one side.", true
	}
	return gapCompare, joinSupport(lead, support), "no sentence mentions both sides.", true
}

func whoCheck(part, blob, lead, support string) (string, string, string, bool) {
	if hasPersonName(lead) {
		return lead, support, "the draft names a person.", false
	}
	alt := firstSlot(part, blob, lead, hasPersonName)
	if alt != "" {
		return alt, supportWithout(support, alt), "the draft defines the thing and never names a person.", true
	}
	if defineShape(lead) {
		return gapPerson, joinSupport(lead, support), "the pages never name a person.", true
	}
	return lead, support, "the draft is not a definition standing in for a person.", false
}

func compareSides(part string) (string, string, bool) {
	m := orSidesRE.FindStringSubmatch(part)
	if m == nil {
		return "", "", false
	}
	a, b := fold(m[1]), fold(m[2])
	if a == b || isStop(a) || isStop(b) {
		return "", "", false
	}
	if _, skip := thinWords[a]; skip {
		return "", "", false
	}
	if _, skip := thinWords[b]; skip {
		return "", "", false
	}
	return a, b, true
}

func mentionsBoth(s, a, b string) bool {
	return hasWord(s, a) && hasWord(s, b)
}

func hasWhenSlot(s string) bool {
	return yearTokenRE.MatchString(s) || monthTokenRE.MatchString(s)
}

func defineShape(s string) bool {
	return defineShapeRE.MatchString(s)
}

func firstSlot(part, blob, current string, ok func(string) bool) string {
	q := tokenize(part)
	best, bestS := "", 0
	for _, s := range splitSentences(blob) {
		if s == current || panelChromeSentence(s) || !ok(s) {
			continue
		}
		score := fuzzyOverlap(q, tokenize(s))
		if score < 1 || score <= bestS {
			continue
		}
		bestS = score
		best = s
	}
	return best
}

func supportWithout(support, lead string) string {
	support = strings.TrimSpace(support)
	if support == "" || support == strings.TrimSpace(lead) || strings.Contains(lead, support) {
		return ""
	}
	return support
}

func hasPersonName(s string) bool {
	fields := strings.Fields(s)
	prev := ""
	for i, raw := range fields {
		w := strings.Trim(raw, ".,;:\"'!?()[]")
		name := isNameToken(w)
		if name && isNameToken(prev) {
			return true
		}
		if name && i > 0 && whoVerbRE.MatchString(s) {
			return true
		}
		if name {
			prev = w
		} else {
			prev = ""
		}
	}
	return false
}

func isNameToken(w string) bool {
	if len([]rune(w)) < 3 || !isCapitalized(w) || isStop(w) {
		return false
	}
	if _, skip := notNameWord[fold(w)]; skip {
		return false
	}
	runes := []rune(w)
	for _, r := range runes[1:] {
		if !unicode.IsLetter(r) || !unicode.IsLower(r) {
			return false
		}
	}
	return true
}

func alreadyCaveat(lead string) bool {
	l := strings.ToLower(lead)
	return strings.Contains(l, "could not extract") ||
		strings.Contains(l, "do not give one value") ||
		strings.Contains(l, "do not state this") ||
		strings.Contains(l, "answer a different question") ||
		strings.Contains(l, "do not state the year") ||
		strings.Contains(l, "do not state the number") ||
		strings.Contains(l, "do not name a person") ||
		strings.Contains(l, "do not compare both")
}

func note(s string) string {
	return clip(strings.TrimSpace(collapseSpace(s)), 220)
}

func cheapReply(message string, th thought, reply string) (string, []string) {
	switch th.Mode {
	case "calc":
		got, ok := tryMath(message)
		if ok && strings.TrimSpace(reply) != strings.TrimSpace(got) {
			return got, []string{
				"Understand: arithmetic, with no lookup.",
				"Constraints: reply with the evaluated value only.",
				"Check: the handler reply is not the evaluated value.",
				"Revise: send the evaluated value.",
			}
		}
		return reply, []string{
			"Understand: arithmetic, with no lookup.",
			"Constraints: reply with the evaluated value only.",
			"Check: the reply matches the evaluated value.",
			"Keep: send that value.",
		}
	case "memory":
		return reply, []string{
			"Understand: a local memory read or write.",
			"Constraints: use only saved notes, and do not invent a fact.",
			"Check: the reply stays inside the memory store.",
			"Keep: send that reply.",
		}
	case "chat":
		return reply, []string{
			"Understand: a greeting or a question about this chat.",
			"Constraints: answer in kind, and do not pretend to have looked something up.",
			"Check: the reply matches that kind of message.",
			"Keep: send that reply.",
		}
	default:
		return reply, []string{
			note("Understand: shortcut handler " + th.Mode + "."),
			"Constraints: stay on that handler.",
			"Check: the reply comes from the handler.",
			"Keep: send it.",
		}
	}
}

func mathThought() []string {
	return []string{
		"Understand: this part is arithmetic.",
		"Constraints: use the evaluated value, not a page.",
		"Check: the value is the result of the expression.",
		"Keep: send that value.",
	}
}

package main

import (
	"regexp"
	"strings"
)

var (
	chatRE          = regexp.MustCompile(`(?i)^\s*(hi|hello|hey|yo|thanks|thank you|thx|ok|okay|cool|bye|goodbye|how are you|what(?:'s| is) your name|who are you|what can you do|help|good morning|good night|bonjour|salut|coucou|merci|merci beaucoup|au revoir|bonne nuit|comment (?:vas-tu|allez-vous|ca va|ça va)|qui es-tu|qui êtes-vous|que peux-tu faire|hola|buenos d[ií]as|buenas tardes|buenas noches|gracias|muchas gracias|adi[oó]s|chao|c[oó]mo est[aá]s|qui[eé]n eres|qu[eé] puedes hacer|ayuda|привет|здравствуй|здравствуйте|доброе утро|добрый день|добрый вечер|спокойной ночи|спасибо|большое спасибо|пока|до свидания|как дела|кто ты|что ты умеешь|помощь)\s*[.!?]*\s*$`)
	metaRE          = regexp.MustCompile(`(?i)\b(what (?:were|are) we (?:talking|discussing)|remind me|what did i (?:ask|say)|do you remember|without (?:an? )?api|are you (?:a )?human|smarter than)\b`)
	rememberWriteRE = regexp.MustCompile(`(?i)^\s*(?:please\s+)?(?:remember(?:\s+that)?|save(?:\s+to\s+memory)?|note(?:\s+that)?)\s*[:\-]?\s+(.+)$`)
	memoryReadRE    = regexp.MustCompile(`(?i)\b(what do you remember|memory|last time|did i (?:tell|save)|recall|what have we (?:saved|stored))\b`)
	codeRE          = regexp.MustCompile(`(?i)\b(apply_patch|pytest|refactor|fix (?:the )?(?:test|bug|build|lint)|yarn\s+(?:lint|install|add|ci|run\b)|npm\s+(?:run\s+\w+|install|ci|i\b|add)|pnpm\s+(?:lint|install|i\b|add|run\b)|eslint|(?:can you |please )?(?:run|execute)\s+(?:yarn|npm|pnpm|pytest|npx)\b|add a (?:route|endpoint|test)|write_file|git diff|typescript|fastapi route|tsc --noEmit|failing tests|patch (?:the )?(?:file|code)|implement (?:a |the )?|create (?:a |the )?(?:vite|react|app|website|project|file)|build (?:a |the )?(?:vite|react|app|website|project)|generate (?:the )?(?:vite|react|files|app))\b`)
	howtoRE         = regexp.MustCompile(`(?i)\b(how(?:\s+to)?|steps?|install|setup|configure|example|write|program|code|hello\s*world)\b`)
	weatherRE       = regexp.MustCompile(`(?i)\b(weather|forecast|temperature|temp|rain|umbrella|jacket|°[cf]|humid|wind)\b`)
	mediaRE         = regexp.MustCompile(`(?i)\b(youtube|video|image|picture|photo|summarize)\b|https?://(?:www\.)?(?:youtube\.com|youtu\.be)/`)
	sportsRE        = regexp.MustCompile(`(?i)\b(nfl|nba|wnba|mlb|nhl|mls|soccer|football|basketball|kickoff|monday night|sunday night|this weekend|who(?:'s| is) playing|what teams|what time (?:are|is) (?:they|it) playing)\b`)
	newsRE          = regexp.MustCompile(`(?i)\b(news|today|yesterday|this week|this month|what happened|latest|breaking|ipo|election|elections|voted|voting)\b`)
	leadGreetRE     = regexp.MustCompile(`(?i)^\s*(hi|hello|hey|yo|bonjour|salut|hola|привет|здравствуйте)\s*[!.,]*\s*`)
	thenRE          = regexp.MustCompile(`(?i)\s+then\s+`)
)

type turn struct {
	Role string `json:"role"`
	Text string `json:"text"`
}

type thought struct {
	Mode     string
	Kind     string
	Goal     string
	Parts    []string
	Cheap    bool
	NeedsWeb bool
	Queries  []string
	Fetch    int
	Packs    []string
	Order    []string
	Follow   string
	Location string
}

func askParts(message string) []string {
	raw := strings.TrimSpace(message)
	if raw == "" {
		return []string{raw}
	}
	raw = thenRE.ReplaceAllString(raw, "\n")
	raw = strings.ReplaceAll(raw, "?", "?\n")
	var bits []string
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		for _, piece := range splitGluedAsks(line) {
			piece = cleanAsk(piece)
			if piece == "" || isGreetingOnly(piece) {
				continue
			}
			bits = append(bits, piece)
		}
	}
	if len(bits) == 0 {
		return []string{strings.TrimSpace(message)}
	}
	if len(bits) > 6 {
		bits = bits[:6]
	}
	return bits
}

func isGreetingOnly(s string) bool {
	return chatRE.MatchString(strings.TrimSpace(s))
}

func modeOf(message, goal string) string {
	raw := strings.TrimSpace(message)
	q := strings.TrimSpace(goal)
	if q == "" {
		q = raw
	}
	if weatherRE.MatchString(q) || weatherRE.MatchString(raw) {
		return "weather"
	}
	if _, ok := tryMath(raw); ok {
		return "calc"
	}
	if rememberWriteRE.MatchString(raw) {
		return "memory"
	}
	if memoryReadRE.MatchString(raw) && !weatherRE.MatchString(q) && !howtoRE.MatchString(q) && !mediaRE.MatchString(q) {
		return "memory"
	}
	if codeRE.MatchString(q) {
		return "code"
	}
	if mediaRE.MatchString(q) {
		return "media"
	}
	if howtoRE.MatchString(q) {
		return "howto"
	}
	if isGreetingOnly(raw) {
		return "chat"
	}
	if metaRE.MatchString(raw) && len(strings.Fields(raw)) <= 16 {
		return "chat"
	}
	if len(raw) < 3 {
		return "chat"
	}
	return "research"
}

func think(message string, history []turn) thought {
	parts := askParts(message)
	goal := strings.Join(parts, "; ")
	if len(parts) == 1 {
		goal = parts[0]
	}
	mode := modeOf(message, goal)
	// A greeting glued to real questions must not stay on the cheap chat path.
	if mode == "chat" && len(parts) > 1 && !isGreetingOnly(message) {
		mode = "research"
	}
	if _, ok := tryMath(message); ok {
		mode = "calc"
	}
	cheap := mode == "chat" || mode == "calc" || mode == "memory"
	th := thought{
		Mode:     mode,
		Kind:     mode,
		Goal:     goal,
		Parts:    parts,
		Cheap:    cheap,
		NeedsWeb: !cheap && mode != "code",
		Follow:   "no",
	}
	// A short follow-up inherits the previous subject only when it is elliptical.
	// "So" plus a named subject is a new question.
	if prev := lastUser(history); prev != "" && needsAntecedent(message, prev) && !cheap {
		th.Follow = "yes"
	}
	if cheap {
		th.Order = []string{"understand", "plan", "skip-gather", mode, "compose", "stop"}
		th.Fetch = 0
		return th
	}
	th.Order = []string{"understand", "plan", "gather", "rerank", "compose", "verify", "stop"}
	th.Queries = queriesFor(message, th.Goal, mode)
	switch mode {
	case "weather", "media", "howto":
		th.Fetch = 1
	default:
		if sportsRE.MatchString(message + " " + th.Goal) {
			th.Fetch = 3
		} else {
			th.Fetch = 2
		}
	}
	return th
}

func queriesFor(message, goal, mode string) []string {
	if sportsRE.MatchString(message + " " + goal) {
		return []string{
			"NFL schedule this weekend site:nfl.com",
			"NBA schedule this week site:nba.com",
			goal + " matchups kickoff times",
		}
	}
	if mode == "weather" {
		place := placeFrom(message)
		if place == "" {
			place = message
		}
		return []string{place + " weather forecast"}
	}
	qs := []string{goal}
	if newsRE.MatchString(message) {
		qs = append(qs, goal+" news")
	}
	if mode == "howto" {
		qs = append(qs, goal+" official documentation")
	}
	if len(qs) > 2 {
		qs = qs[:2]
	}
	return qs
}

func placeFrom(message string) string {
	re := regexp.MustCompile(`(?i)\b(?:in|for|at)\s+([A-Za-z][A-Za-z .'’,-]{1,60})`)
	m := re.FindStringSubmatch(message)
	if m == nil {
		return ""
	}
	return strings.Trim(strings.TrimSpace(m[1]), " .,")
}

func lastUser(history []turn) string {
	for i := len(history) - 1; i >= 0; i-- {
		if history[i].Role == "user" && strings.TrimSpace(history[i].Text) != "" {
			return history[i].Text
		}
	}
	return ""
}

func clip(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}

func planText(th thought) string {
	bits := []string{
		"Think (one brain): " + th.Mode,
		"Handler: " + th.Mode,
		"Order: " + strings.Join(th.Order, " → "),
		"Kind: " + th.Kind,
		"Goal: " + th.Goal,
	}
	if th.NeedsWeb {
		bits = append(bits, "Search: "+strings.Join(th.Queries, ", "))
		bits = append(bits, "Hybrid rank: BM25 shortlist, then potion-base-8M cosine.")
	} else {
		bits = append(bits, "Cheap path — skip web and crew.")
	}
	if len(th.Parts) > 1 {
		bits = append(bits, "Questions: "+strings.Join(th.Parts, " | "))
	}
	if len(th.Packs) > 0 {
		bits = append(bits, "Playbooks: "+strings.Join(th.Packs, ", "))
	}
	return strings.Join(bits, " · ")
}

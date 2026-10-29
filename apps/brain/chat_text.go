package main

import (
	"fmt"
	"regexp"
	"strings"
)

func cheapAnswer(message string, history []turn, th thought) (string, bool) {
	if math, ok := tryMath(message); ok {
		return math, true
	}
	switch th.Mode {
	case "calc":
		return chatReply(message, history), true
	case "chat":
		return chatReply(message, history), true
	case "memory":
		return memoryReply(message, history), true
	default:
		return "", false
	}
}

func chatReply(message string, history []turn) string {
	q := strings.TrimSpace(message)
	switch {
	case regexp.MustCompile(`(?i)\b(merci|merci beaucoup)\b`).MatchString(q):
		return "De rien ! Je reste à votre entière disposition."
	case regexp.MustCompile(`(?i)\b(au revoir|bonne nuit)\b`).MatchString(q):
		return "Au revoir ! Cet échange reste accessible dans l'historique."
	case regexp.MustCompile(`(?i)\b(comment (?:vas-tu|allez-vous|ca va|ça va))\b`).MatchString(q):
		return "Je fonctionne parfaitement. N'hésitez pas à me poser une question ou à me donner des instructions."
	case regexp.MustCompile(`(?i)\b(qui (?:es-tu|êtes-vous)|quel est ton nom)\b`).MatchString(q):
		return "Je suis l'agent local Poor Man AI. Recherche, calcul, et réponses ancrées dans un corpus, sans Python."
	case regexp.MustCompile(`(?i)^\s*(bonjour|salut|coucou)\b`).MatchString(q):
		return "Bonjour ! Comment puis-je vous aider aujourd'hui ?"
	case regexp.MustCompile(`(?i)\b(gracias|muchas gracias)\b`).MatchString(q):
		return "¡De nada! Es un placer ayudarte. Pregúntame lo que necesites."
	case regexp.MustCompile(`(?i)\b(adi[oó]s|hasta luego|buenas noches|chao)\b`).MatchString(q):
		return "¡Hasta pronto! Nuestra conversación permanecerá guardada en el historial."
	case regexp.MustCompile(`(?i)\b(c[oó]mo est[aá]s|qu[eé] tal)\b`).MatchString(q):
		return "¡Todo excelente! Estoy listo para ayudarte con tus preguntas."
	case regexp.MustCompile(`(?i)^\s*(hola|buenos d[ií]as|buenas tardes)\b`).MatchString(q):
		return "¡Hola! ¿En qué te puedo ayudar hoy?"
	case regexp.MustCompile(`(?i)\b(спасибо|большое спасибо|благодарю)\b`).MatchString(q):
		return "Пожалуйста! Всегда рад помочь."
	case regexp.MustCompile(`(?i)\b(пока|до свидания|спокойной ночи)\b`).MatchString(q):
		return "До свидания! История нашей беседы сохранена."
	case regexp.MustCompile(`(?i)\b(как дела|как жизнь)\b`).MatchString(q):
		return "Всё отлично. Чем я могу помочь вам сегодня?"
	case regexp.MustCompile(`(?i)^\s*(привет|здравствуй|здравствуйте|доброе утро|добрый день|добрый вечер)\b`).MatchString(q):
		return "Здравствуйте! Чем я могу помочь вам сегодня?"
	case regexp.MustCompile(`(?i)smarter than|are you (?:a )?human`).MatchString(q):
		return "No. One local brain routes the turn. Static embeddings rerank passages. I am not smarter than you."
	case regexp.MustCompile(`(?i)without (?:an? )?api|no (?:api )?key|offline|local`).MatchString(q):
		return "Yes. Chat, math, and memory run with no key. Research uses the local Simple Wikipedia slice, then Wikipedia and Google News when the question needs the live web. Grok 4.7 is used only when XAI_API_KEY is set."
	case regexp.MustCompile(`(?i)who are you|what(?:'s| is) your name`).MatchString(q):
		return "I am Poor Man AI: a Next.js cockpit and a Go brain. Retrieval is potion-base-8M (7,559,168 static parameters, int8) over a Simple English Wikipedia passage slice. Memory is append-only JSONL, not training."
	case regexp.MustCompile(`(?i)what can you do|help`).MatchString(q):
		return "One brain, several modes:\n- **chat** — greetings in English, French, Russian, and Spanish\n- **calc** — arithmetic, no web\n- **memory** — `remember …` / `what do you remember`\n- **research** — hybrid BM25 + static embeddings, then live Wikipedia and Google News\n\nA turn with several questions is answered one at a time."
	case regexp.MustCompile(`(?i)how are you`).MatchString(q):
		return "I'm doing great, thank you for asking. What's on your mind?"
	case regexp.MustCompile(`(?i)thanks|thank you|thx`).MatchString(q):
		return "You're welcome. What else is on your mind?"
	case regexp.MustCompile(`(?i)bye|goodbye|good night`).MatchString(q):
		return "Take care. Come back whenever you want to talk."
	case metaRE.MatchString(q):
		return recap(history)
	case chatRE.MatchString(q):
		return "Hello. We can talk, calculate, or look something up. What's on your mind?"
	default:
		if len(history) > 0 {
			return recap(history)
		}
		return "I'm here. Ask a question, or say hi."
	}
}

func recap(history []turn) string {
	var users, asst []string
	for _, t := range history {
		if t.Role == "user" && strings.TrimSpace(t.Text) != "" {
			users = append(users, t.Text)
		}
		if t.Role == "assistant" && strings.TrimSpace(t.Text) != "" {
			asst = append(asst, t.Text)
		}
	}
	if len(users) == 0 {
		return "We have not started a topic yet. Ask a question or say hi."
	}
	lastA := "I have not answered yet."
	if len(asst) > 0 {
		lastA = clip(asst[len(asst)-1], 280)
	}
	return fmt.Sprintf("We were on: **%s**\n\nLast answer (short): %s", clip(users[len(users)-1], 240), lastA)
}

func memoryReply(message string, history []turn) string {
	if m := rememberWriteRE.FindStringSubmatch(strings.TrimSpace(message)); m != nil {
		fact := strings.TrimSpace(m[1])
		if len([]rune(fact)) < 3 {
			return "Tell me what to remember, e.g. `remember Austin uses metric`."
		}
		if junkFact(fact) {
			return "That note looks like a tool error, so I did not save it."
		}
		row := writeFact(fact, "")
		return fmt.Sprintf("Saved to local memory (not training): **%s**.", row.Fact)
	}
	q := message
	if regexp.MustCompile(`(?i)^(memory|last time)$`).MatchString(strings.TrimSpace(q)) {
		q = lastUser(history)
		if q == "" {
			q = message
		}
	}
	hits := searchMemory(q, 8)
	if len(hits) == 0 {
		return "Nothing in local memory matches that. Save a note with `remember …` or ask a research question."
	}
	lines := []string{"From local memory (JSONL, not a trained model):"}
	n := len(hits)
	if n > 6 {
		n = 6
	}
	for _, row := range hits[:n] {
		line := "- " + clip(row.Fact, 280)
		if row.TS != "" {
			ts := row.TS
			if len(ts) > 19 {
				ts = ts[:19]
			}
			line += " _" + ts + "_"
		}
		lines = append(lines, line)
	}
	return strings.Join(lines, "\n")
}

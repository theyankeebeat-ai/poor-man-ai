package main

import (
	"strings"
	"unicode"
)

var stopwords = map[string]struct{}{
	"a": {}, "an": {}, "the": {}, "and": {}, "or": {}, "of": {}, "to": {}, "in": {},
	"on": {}, "for": {}, "with": {}, "is": {}, "are": {}, "was": {}, "were": {},
	"be": {}, "by": {}, "at": {}, "from": {}, "as": {}, "that": {}, "this": {},
	"it": {}, "its": {}, "what": {}, "who": {}, "how": {}, "when": {}, "where": {},
	"why": {}, "did": {}, "do": {}, "does": {}, "about": {}, "into": {}, "than": {},
}

func tokenize(s string) []string {
	s = fold(s)
	var b strings.Builder
	var out []string
	flush := func() {
		if b.Len() == 0 {
			return
		}
		w := b.String()
		b.Reset()
		if len(w) < 2 {
			return
		}
		if _, skip := stopwords[w]; skip {
			return
		}
		out = append(out, w)
	}
	for _, r := range s {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
		} else {
			flush()
		}
	}
	flush()
	return out
}

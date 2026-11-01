package main

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
	"unicode"
)

var (
	mathLead = regexp.MustCompile(`(?i)^\s*(?:what(?:'s| is)|calculate|compute|how much is)\s*`)
	mathTail = regexp.MustCompile(`(?i)[.!?]\s+(?:reply|answer|just|only|please|give|show|return)\b`)
	justNum  = regexp.MustCompile(`(?i)\bjust\s+the\s+number\b`)
)

// tryMath evaluates a safe arithmetic expression. Weather prose and letters return ok=false.
func tryMath(message string) (text string, ok bool) {
	raw := strings.TrimSpace(message)
	if raw == "" {
		return "", false
	}
	head := raw
	if loc := mathTail.FindStringIndex(raw); loc != nil {
		head = raw[:loc[0]]
	}
	expr := mathLead.ReplaceAllString(strings.TrimSpace(head), "")
	expr = strings.TrimRight(expr, ".!?")
	expr = strings.NewReplacer("×", "*", "÷", "/").Replace(expr)
	repls := []struct{ re, to string }{
		{`(?i)\s+plus\s+`, "+"},
		{`(?i)\s+minus\s+`, "-"},
		{`(?i)\s+(?:times|multiplied\s+by)\s+`, "*"},
		{`(?i)\s+(?:divided\s+by|over)\s+`, "/"},
	}
	for _, r := range repls {
		expr = regexp.MustCompile(r.re).ReplaceAllString(expr, r.to)
	}
	expr = strings.ReplaceAll(expr, " ", "")
	expr = strings.ReplaceAll(expr, "^", "**")
	if expr == "" || strings.Contains(expr, "**") == false && !safeExpr(expr) {
		if !safeExpr(expr) {
			return "", false
		}
	}
	if !safeExpr(expr) {
		return "", false
	}
	val, err := evalExpr(expr)
	if err != nil || math.IsNaN(val) || math.IsInf(val, 0) {
		return "", false
	}
	num := formatNum(val)
	if justNum.MatchString(raw) {
		return num, true
	}
	shown := strings.ReplaceAll(expr, "**", "^")
	return fmt.Sprintf("%s = **%s**.", shown, num), true
}

func safeExpr(expr string) bool {
	if expr == "" {
		return false
	}
	for _, r := range expr {
		switch r {
		case '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
			'+', '-', '*', '/', '(', ')', '.', '%':
		default:
			return false
		}
	}
	return true
}

func formatNum(val float64) string {
	if val == math.Trunc(val) && !math.IsInf(val, 0) {
		return strconv.FormatInt(int64(val), 10)
	}
	return strconv.FormatFloat(val, 'g', -1, 64)
}

type parser struct {
	s string
	i int
}

func evalExpr(src string) (float64, error) {
	p := &parser{s: src}
	v, err := p.parseExpr()
	if err != nil {
		return 0, err
	}
	p.skipStarStar()
	if p.i != len(p.s) {
		return 0, fmt.Errorf("trailing")
	}
	return v, nil
}

func (p *parser) parseExpr() (float64, error) {
	left, err := p.parseTerm()
	if err != nil {
		return 0, err
	}
	for p.i < len(p.s) {
		switch p.s[p.i] {
		case '+':
			p.i++
			right, err := p.parseTerm()
			if err != nil {
				return 0, err
			}
			left += right
		case '-':
			p.i++
			right, err := p.parseTerm()
			if err != nil {
				return 0, err
			}
			left -= right
		default:
			return left, nil
		}
	}
	return left, nil
}

func (p *parser) parseTerm() (float64, error) {
	left, err := p.parsePower()
	if err != nil {
		return 0, err
	}
	for p.i < len(p.s) {
		op := p.s[p.i]
		if op != '*' && op != '/' && op != '%' {
			break
		}
		if op == '*' && p.i+1 < len(p.s) && p.s[p.i+1] == '*' {
			break
		}
		p.i++
		right, err := p.parsePower()
		if err != nil {
			return 0, err
		}
		switch op {
		case '*':
			left *= right
		case '/':
			if right == 0 {
				return 0, fmt.Errorf("div0")
			}
			left /= right
		case '%':
			if right == 0 {
				return 0, fmt.Errorf("mod0")
			}
			left = math.Mod(left, right)
		}
	}
	return left, nil
}

func (p *parser) parsePower() (float64, error) {
	base, err := p.parseUnary()
	if err != nil {
		return 0, err
	}
	if p.i+1 < len(p.s) && p.s[p.i] == '*' && p.s[p.i+1] == '*' {
		p.i += 2
		exp, err := p.parsePower()
		if err != nil {
			return 0, err
		}
		return math.Pow(base, exp), nil
	}
	return base, nil
}

func (p *parser) parseUnary() (float64, error) {
	if p.i < len(p.s) && (p.s[p.i] == '+' || p.s[p.i] == '-') {
		sign := p.s[p.i]
		p.i++
		v, err := p.parseUnary()
		if err != nil {
			return 0, err
		}
		if sign == '-' {
			return -v, nil
		}
		return v, nil
	}
	return p.parsePrimary()
}

func (p *parser) parsePrimary() (float64, error) {
	if p.i >= len(p.s) {
		return 0, fmt.Errorf("eof")
	}
	if p.s[p.i] == '(' {
		p.i++
		v, err := p.parseExpr()
		if err != nil {
			return 0, err
		}
		if p.i >= len(p.s) || p.s[p.i] != ')' {
			return 0, fmt.Errorf("paren")
		}
		p.i++
		return v, nil
	}
	start := p.i
	if p.s[p.i] == '.' || unicode.IsDigit(rune(p.s[p.i])) {
		p.i++
		for p.i < len(p.s) && (unicode.IsDigit(rune(p.s[p.i])) || p.s[p.i] == '.') {
			p.i++
		}
		return strconv.ParseFloat(p.s[start:p.i], 64)
	}
	return 0, fmt.Errorf("token")
}

func (p *parser) skipStarStar() {}

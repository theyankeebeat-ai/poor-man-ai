package main

import (
	"math"
	"strings"
	"unicode"
)

// Router nets are 24×64×32×1. They rank layers and crew roles.
// They do not write the answer. 3,713 weights each.
const (
	routerIn   = 24
	routerHid1 = 64
	routerHid2 = 32
	routerOut  = 1
)

func paramsPerNet() int {
	return routerIn*routerHid1 + routerHid1 + routerHid1*routerHid2 + routerHid2 + routerHid2*routerOut + routerOut
}

type layerNet struct {
	w1 [routerHid1][routerIn]float64
	b1 [routerHid1]float64
	w2 [routerHid2][routerHid1]float64
	b2 [routerHid2]float64
	w3 [routerOut][routerHid2]float64
	b3 [routerOut]float64
}

func archLabel() string { return "24x64x32x1" }

var (
	layerBanks = []string{"reason", "skills", "hooks", "tools", "agents"}
	crewRoles  = []string{
		"context", "thread", "skill_router", "knowledge", "planner", "scout", "librarian",
		"api", "facts", "numbers", "units", "time", "schedule", "compare", "howto", "risk",
		"skeptic", "logic", "gap", "exchange", "companion", "citations", "memory", "judge", "verifier",
	}
	nets = map[string]*layerNet{}
)

func init() {
	for _, name := range layerBanks {
		nets[name] = newNet(name)
	}
	for _, role := range crewRoles {
		nets["crew:"+role] = newNet("crew:" + role)
	}
}

func newNet(name string) *layerNet {
	n := &layerNet{}
	rng := xorshift(hashName(name))
	for i := 0; i < routerHid1; i++ {
		n.b1[i] = rng.next()*0.2 - 0.1
		for j := 0; j < routerIn; j++ {
			n.w1[i][j] = rng.next()*0.2 - 0.1
		}
	}
	for i := 0; i < routerHid2; i++ {
		n.b2[i] = rng.next()*0.2 - 0.1
		for j := 0; j < routerHid1; j++ {
			n.w2[i][j] = rng.next()*0.2 - 0.1
		}
	}
	for i := 0; i < routerOut; i++ {
		n.b3[i] = rng.next()*0.2 - 0.1
		for j := 0; j < routerHid2; j++ {
			n.w3[i][j] = rng.next()*0.2 - 0.1
		}
	}
	return n
}

type xorshift uint64

func (x *xorshift) next() float64 {
	v := uint64(*x)
	v ^= v << 13
	v ^= v >> 7
	v ^= v << 17
	*x = xorshift(v)
	return float64(v%10000) / 10000
}

func hashName(s string) uint64 {
	var h uint64 = 1469598103934665603
	for i := 0; i < len(s); i++ {
		h ^= uint64(s[i])
		h *= 1099511628211
	}
	if h == 0 {
		h = 1
	}
	return h
}

func (n *layerNet) forward(x [routerIn]float64) float64 {
	var h1 [routerHid1]float64
	for i := 0; i < routerHid1; i++ {
		s := n.b1[i]
		for j := 0; j < routerIn; j++ {
			s += n.w1[i][j] * x[j]
		}
		h1[i] = math.Tanh(s)
	}
	var h2 [routerHid2]float64
	for i := 0; i < routerHid2; i++ {
		s := n.b2[i]
		for j := 0; j < routerHid1; j++ {
			s += n.w2[i][j] * h1[j]
		}
		h2[i] = math.Tanh(s)
	}
	s := n.b3[0]
	for j := 0; j < routerHid2; j++ {
		s += n.w3[0][j] * h2[j]
	}
	return 1 / (1 + math.Exp(-s))
}

func features(message, mode string, history int) [routerIn]float64 {
	l := strings.ToLower(message)
	var x [routerIn]float64
	fields := len(strings.Fields(l))
	x[0] = math.Min(float64(fields)/32, 1)
	x[1] = boolFeat(hasDigit(l))
	x[2] = boolFeat(strings.Contains(l, "http"))
	x[3] = boolFeat(strings.Contains(l, "?"))
	x[4] = boolFeat(mode == "weather" || weatherRE.MatchString(l))
	x[5] = boolFeat(sportsRE.MatchString(l))
	x[6] = boolFeat(mode == "code" || codeRE.MatchString(l))
	x[7] = boolFeat(mode == "howto" || howtoRE.MatchString(l))
	x[8] = boolFeat(newsRE.MatchString(l))
	x[9] = boolFeat(mode == "memory")
	x[10] = boolFeat(mode == "chat")
	x[11] = boolFeat(strings.Contains(l, " vs ") || strings.Contains(l, "versus"))
	x[12] = math.Min(float64(countCaps(message))/5, 1)
	x[13] = boolFeat(strings.Contains(l, "km") || strings.Contains(l, "mile"))
	x[14] = boolFeat(fields <= 16 && history > 0)
	x[15] = boolFeat(mode == "media")
	x[16] = boolFeat(strings.Contains(l, "stock") || strings.Contains(l, "price"))
	x[17] = boolFeat(strings.Contains(l, "where") || strings.Contains(l, "capital"))
	x[18] = boolFeat(hasNonASCII(message))
	x[19] = boolFeat(strings.Contains(l, "cite") || strings.Contains(l, "source"))
	x[20] = math.Min(float64(len(l))/400, 1)
	x[21] = boolFeat(history > 0)
	x[22] = boolFeat(mode == "research")
	x[23] = boolFeat(mode != "chat" && mode != "calc")
	return x
}

func hasDigit(s string) bool {
	for _, r := range s {
		if unicode.IsDigit(r) {
			return true
		}
	}
	return false
}

func countCaps(s string) int {
	n := 0
	for _, r := range s {
		if unicode.IsUpper(r) {
			n++
		}
	}
	return n
}

func hasNonASCII(s string) bool {
	for _, r := range s {
		if r > 127 {
			return true
		}
	}
	return false
}

func boolFeat(b bool) float64 {
	if b {
		return 1
	}
	return 0
}

func rankCrew(message, mode string, history int) []string {
	x := features(message, mode, history)
	type sc struct {
		name  string
		score float64
	}
	var rows []sc
	for _, role := range crewRoles {
		rows = append(rows, sc{role, nets["crew:"+role].forward(x)})
	}
	for i := 0; i < len(rows); i++ {
		for j := i + 1; j < len(rows); j++ {
			if rows[j].score > rows[i].score {
				rows[i], rows[j] = rows[j], rows[i]
			}
		}
	}
	out := make([]string, 0, 3)
	for i := 0; i < 3 && i < len(rows); i++ {
		out = append(out, rows[i].name)
	}
	return out
}

func layerScores(message, mode string, history int) map[string]float64 {
	x := features(message, mode, history)
	out := map[string]float64{}
	for _, name := range layerBanks {
		out[name] = round4(nets[name].forward(x))
	}
	return out
}

func round4(v float64) float64 {
	return math.Round(v*10000) / 10000
}

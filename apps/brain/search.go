package main

import (
	"context"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"html"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode"
)

type webHit struct {
	Title   string `json:"title"`
	URL     string `json:"url"`
	Snippet string `json:"snippet"`
	Source  string `json:"source,omitempty"`
}

var httpClient = &http.Client{Timeout: 8 * time.Second}

type aiModeMemo struct {
	mu sync.Mutex
	m  map[string][]webHit
}

var aiMemo = aiModeMemo{m: map[string][]webHit{}}

func (c *aiModeMemo) get(q string) ([]webHit, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	hits, ok := c.m[q]
	if !ok {
		return nil, false
	}
	return append([]webHit(nil), hits...), true
}

func (c *aiModeMemo) put(q string, hits []webHit) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.m) > 32 {
		c.m = map[string][]webHit{}
	}
	c.m[q] = append([]webHit(nil), hits...)
}

func webSearch(query string) []webHit {
	var hits []webHit
	hits = append(hits, aiModeSearch(query)...)
	if len(hits) == 0 || newsRE.MatchString(query) || sportsRE.MatchString(query) {
		hits = append(hits, googleNews(query)...)
	}
	return dedupeHits(hits, 8)
}

// isWikipediaURL is true for Wikipedia / Wikimedia hosts. Those pages are never
// fetched, ranked, or cited — search uses AI-mode engines and Google News only.
func isWikipediaURL(raw string) bool {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return false
	}
	if !strings.Contains(raw, "://") {
		raw = "https://" + raw
	}
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	host := strings.ToLower(u.Hostname())
	host = strings.TrimPrefix(host, "www.")
	if host == "wikipedia.org" || strings.HasSuffix(host, ".wikipedia.org") {
		return true
	}
	if host == "wikimedia.org" || strings.HasSuffix(host, ".wikimedia.org") {
		return true
	}
	if host == "wikidata.org" || strings.HasSuffix(host, ".wikidata.org") {
		return true
	}
	if host == "mediawiki.org" || strings.HasSuffix(host, ".mediawiki.org") {
		return true
	}
	return false
}

func dedupeHits(in []webHit, limit int) []webHit {
	seen := map[string]struct{}{}
	var out []webHit
	for _, h := range in {
		if h.URL == "" || isWikipediaURL(h.URL) {
			continue
		}
		if _, ok := seen[h.URL]; ok {
			continue
		}
		seen[h.URL] = struct{}{}
		out = append(out, h)
		if len(out) >= limit {
			break
		}
	}
	return out
}

func aiModeSearch(query string) []webHit {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil
	}
	if hits, ok := aiMemo.get(query); ok {
		return hits
	}
	hits := runAIModeSearch(query)
	aiMemo.put(query, hits)
	return hits
}

func runAIModeSearch(query string) []webHit {
	script := findBrowserSearch()
	if script == "" {
		log.Printf("search-engine AI mode: browser_search.py was not found")
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 110*time.Second)
	defer cancel()
	cmd := pythonCommand(ctx, "-c", aiModeRunner, filepath.Dir(script), query)
	if cmd == nil {
		log.Printf("search-engine AI mode: python was not found")
		return nil
	}
	out, err := cmd.Output()
	if err != nil {
		log.Printf("search-engine AI mode: %v", err)
		return nil
	}
	return parseAIMode(out)
}

const aiModeRunner = `import json, sys
sys.path.insert(0, sys.argv[1])
import browser_search
json.dump(browser_search.search(sys.argv[2]), sys.stdout)
`

func pythonCommand(ctx context.Context, args ...string) *exec.Cmd {
	if path, err := exec.LookPath("python"); err == nil {
		return exec.CommandContext(ctx, path, args...)
	}
	if path, err := exec.LookPath("py"); err == nil {
		return exec.CommandContext(ctx, path, append([]string{"-3"}, args...)...)
	}
	return nil
}

func findBrowserSearch() string {
	if p := strings.TrimSpace(os.Getenv("BROWSER_SEARCH_PY")); p != "" {
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return p
		}
	}
	names := []string{
		filepath.Join("_archive_python_server", "browser_search.py"),
		filepath.Join("server", "browser_search.py"),
	}
	var dirs []string
	if wd, err := os.Getwd(); err == nil {
		dirs = append(dirs, wd)
	}
	if exe, err := os.Executable(); err == nil {
		dirs = append(dirs, filepath.Dir(exe))
	}
	for _, dir := range dirs {
		for i := 0; i < 5; i++ {
			for _, name := range names {
				candidate := filepath.Join(dir, name)
				if st, err := os.Stat(candidate); err == nil && !st.IsDir() {
					return candidate
				}
			}
			parent := filepath.Dir(dir)
			if parent == dir {
				break
			}
			dir = parent
		}
	}
	return ""
}

func parseAIMode(body []byte) []webHit {
	var payload struct {
		Items []struct {
			Title   string `json:"title"`
			URL     string `json:"url"`
			Snippet string `json:"snippet"`
			Source  string `json:"source"`
		} `json:"items"`
	}
	if json.Unmarshal(body, &payload) != nil {
		return nil
	}
	var out []webHit
	for _, item := range payload.Items {
		if strings.TrimSpace(item.Snippet) == "" {
			continue
		}
		out = append(out, webHit{
			Title:   item.Title,
			URL:     item.URL,
			Snippet: item.Snippet,
			Source:  item.Source,
		})
	}
	return out
}

func aiModeHit(hit webHit) bool {
	switch hit.Source {
	case "duck-ai", "google-ai", "brave-ask", "bing", "yandex":
		return true
	default:
		return false
	}
}

func googleNews(query string) []webHit {
	u := "https://news.google.com/rss/search?hl=en-US&gl=US&ceid=US:en&q=" + url.QueryEscape(query)
	body, err := getBody(u)
	if err != nil {
		return nil
	}
	var rss struct {
		Channel struct {
			Items []struct {
				Title string `xml:"title"`
				Link  string `xml:"link"`
			} `xml:"item"`
		} `xml:"channel"`
	}
	if xml.Unmarshal(body, &rss) != nil {
		return nil
	}
	var out []webHit
	for _, item := range rss.Channel.Items {
		if item.Link == "" {
			continue
		}
		out = append(out, webHit{Title: item.Title, URL: item.Link, Snippet: item.Title})
		if len(out) >= 4 {
			break
		}
	}
	return out
}

type page struct {
	Title string
	URL   string
	Text  string
}

func readPage(raw string, maxChars int) page {
	if maxChars <= 0 {
		maxChars = 12000
	}
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return page{URL: raw, Text: ""}
	}
	if !strings.Contains(raw, "://") {
		raw = "https://" + raw
	}
	if isWikipediaURL(raw) {
		return page{URL: raw, Text: "", Title: "Wikipedia is blocked as a source"}
	}
	body, err := getBody(raw)
	if err != nil {
		return page{URL: raw, Text: "", Title: err.Error()}
	}
	text := stripTags(string(body))
	text = collapseSpace(text)
	if len(text) > maxChars {
		text = text[:maxChars]
	}
	return page{Title: raw, URL: raw, Text: text}
}

func weatherReport(message string) (string, []webHit) {
	place := placeFrom(message)
	if place == "" {
		place = strings.TrimSpace(message)
	}
	g, err := locatePlace(place)
	if err != nil {
		if errors.Is(err, errPlaceNotFound) {
			return "I could not find that place in the Open-Meteo gazetteer.", nil
		}
		return "Open-Meteo did not respond, so I could not look up the weather.", nil
	}
	unit := "celsius"
	speed := "kmh"
	label := "°C"
	if regexp.MustCompile(`(?i)\b(fahrenheit|°f|imperial)\b`).MatchString(message) {
		unit = "fahrenheit"
		speed = "mph"
		label = "°F"
	}
	varcast := fmt.Sprintf(
		"https://api.open-meteo.com/v1/forecast?latitude=%f&longitude=%f&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&temperature_unit=%s&wind_speed_unit=%s",
		g.Latitude, g.Longitude, unit, speed,
	)
	var wx struct {
		Current struct {
			Temp     float64 `json:"temperature_2m"`
			Humidity float64 `json:"relative_humidity_2m"`
			Code     int     `json:"weather_code"`
			Wind     float64 `json:"wind_speed_10m"`
		} `json:"current"`
	}
	if getJSON(varcast, &wx) != nil {
		return "Open-Meteo did not return a forecast for " + g.Name + ".", nil
	}
	src := "https://open-meteo.com/"
	line := fmt.Sprintf("%s, %s: Open-Meteo · %.0f%s · %s · wind %.0f %s · humidity %.0f%%.",
		g.Name, g.Country, wx.Current.Temp, label, weatherCode(wx.Current.Code), wx.Current.Wind, speed, wx.Current.Humidity)
	return line, []webHit{{Title: "Open-Meteo", URL: src, Snippet: line}}
}

func weatherCode(code int) string {
	switch code {
	case 0:
		return "clear"
	case 1, 2, 3:
		return "cloudy"
	case 45, 48:
		return "fog"
	case 51, 53, 55, 61, 63, 65, 80, 81, 82:
		return "rain"
	case 71, 73, 75, 85, 86:
		return "snow"
	case 95, 96, 99:
		return "thunderstorm"
	default:
		return "conditions"
	}
}

var errPlaceNotFound = errors.New("place not found")

type geoPlace struct {
	Name      string
	Country   string
	Code      string
	Admin1    string
	Latitude  float64
	Longitude float64
	Pop       int
	Feature   string
}

type placeAttempt struct {
	name string
	hint string
}

// countryAlias maps everyday names that do not appear inside the Open-Meteo country string.
var countryAlias = map[string]string{
	"usa": "US", "us": "US", "america": "US", "united states": "US", "united states of america": "US",
	"uk": "GB", "u.k": "GB", "britain": "GB", "great britain": "GB", "england": "GB", "scotland": "GB", "wales": "GB", "united kingdom": "GB",
	"uae": "AE", "united arab emirates": "AE",
	"south korea": "KR", "korea": "KR", "north korea": "KP",
	"russia": "RU", "russian federation": "RU",
	"czech republic": "CZ", "czechia": "CZ",
	"holland": "NL", "the netherlands": "NL",
}

func locatePlace(place string) (geoPlace, error) {
	var sawOK bool
	var lastErr error
	for _, attempt := range placeAttempts(place) {
		hits, err := geoSearch(attempt.name)
		if err != nil {
			lastErr = err
			continue
		}
		sawOK = true
		if attempt.hint == "" {
			for _, hit := range hits {
				if hitCovers(hit, attempt.name) {
					return hit, nil
				}
			}
			continue
		}
		if best, ok := pickGeo(hits, attempt.hint); ok {
			return best, nil
		}
	}
	if !sawOK && lastErr != nil {
		return geoPlace{}, lastErr
	}
	return geoPlace{}, errPlaceNotFound
}

func placeAttempts(place string) []placeAttempt {
	place = strings.Trim(strings.TrimSpace(place), "?.!")
	place = strings.ReplaceAll(place, ",", " ")
	place = collapseSpace(place)
	fields := strings.Fields(place)
	if len(fields) == 0 {
		return nil
	}
	out := []placeAttempt{{name: strings.Join(fields, " ")}}
	for n := 1; n <= 3 && n < len(fields); n++ {
		name := strings.Join(fields[:len(fields)-n], " ")
		if len([]rune(name)) < 2 {
			continue
		}
		out = append(out, placeAttempt{
			name: name,
			hint: strings.Join(fields[len(fields)-n:], " "),
		})
	}
	return out
}

func geoSearch(name string) ([]geoPlace, error) {
	var geo struct {
		Results []struct {
			Name        string  `json:"name"`
			Country     string  `json:"country"`
			CountryCode string  `json:"country_code"`
			Admin1      string  `json:"admin1"`
			Latitude    float64 `json:"latitude"`
			Longitude   float64 `json:"longitude"`
			Population  int     `json:"population"`
			FeatureCode string  `json:"feature_code"`
		} `json:"results"`
	}
	raw := "https://geocoding-api.open-meteo.com/v1/search?count=10&name=" + url.QueryEscape(name)
	if err := getJSON(raw, &geo); err != nil {
		return nil, err
	}
	out := make([]geoPlace, 0, len(geo.Results))
	for _, row := range geo.Results {
		out = append(out, geoPlace{
			Name: row.Name, Country: row.Country, Code: row.CountryCode, Admin1: row.Admin1,
			Latitude: row.Latitude, Longitude: row.Longitude, Pop: row.Population, Feature: row.FeatureCode,
		})
	}
	return out, nil
}

func pickGeo(hits []geoPlace, hint string) (geoPlace, bool) {
	var matched []geoPlace
	for _, hit := range hits {
		if countryMatches(hit, hint) {
			matched = append(matched, hit)
		}
	}
	if len(matched) == 0 {
		return geoPlace{}, false
	}
	best := matched[0]
	for _, hit := range matched[1:] {
		if hit.Feature == "PPLC" && best.Feature != "PPLC" {
			best = hit
			continue
		}
		if hit.Feature == best.Feature && hit.Pop > best.Pop {
			best = hit
		}
	}
	return best, true
}

func countryMatches(hit geoPlace, hint string) bool {
	h := strings.ToLower(strings.Trim(strings.TrimSpace(hint), "."))
	if h == "" {
		return true
	}
	if alias, ok := countryAlias[h]; ok && strings.EqualFold(alias, hit.Code) {
		return true
	}
	country := strings.ToLower(hit.Country)
	admin := strings.ToLower(hit.Admin1)
	if strings.EqualFold(h, hit.Country) || strings.EqualFold(h, hit.Code) || strings.EqualFold(h, hit.Admin1) {
		return true
	}
	if country != "" && (strings.Contains(country, h) || strings.Contains(h, country)) {
		return true
	}
	if admin != "" && (admin == h || strings.Contains(admin, h)) {
		return true
	}
	return false
}

func hitCovers(hit geoPlace, phrase string) bool {
	blob := strings.ToLower(strings.Join([]string{hit.Name, hit.Country, hit.Admin1, hit.Code}, " "))
	for _, word := range strings.Fields(strings.ToLower(phrase)) {
		word = strings.Trim(word, ".,")
		if word == "" {
			continue
		}
		if alias, ok := countryAlias[word]; ok && strings.EqualFold(alias, hit.Code) {
			continue
		}
		if !strings.Contains(blob, word) {
			return false
		}
	}
	return true
}

func getJSON(raw string, dest any) error {
	body, err := getBody(raw)
	if err != nil {
		return err
	}
	return json.Unmarshal(body, dest)
}

func getBody(raw string) ([]byte, error) {
	req, err := http.NewRequest(http.MethodGet, raw, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "PoorManAI/2.0 (https://poor-man-ai.vercel.app; local research)")
	req.Header.Set("Accept", "application/json, application/xml, text/html;q=0.8")
	res, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, 1_500_000))
	if err != nil {
		return nil, err
	}
	if res.StatusCode >= 400 {
		return nil, fmt.Errorf("status %d", res.StatusCode)
	}
	return body, nil
}

func stripTags(s string) string {
	var b strings.Builder
	in := false
	for _, r := range s {
		switch {
		case r == '<':
			in = true
		case r == '>':
			in = false
			b.WriteByte(' ')
		case !in:
			b.WriteRune(r)
		}
	}
	return collapseSpace(html.UnescapeString(b.String()))
}

var questionLead = regexp.MustCompile(`(?i)^(what|who|where|when|why|how|is|are|did|does|do|the|a|an)\b`)

func ofRelation(q string) (head, tail string, ok bool) {
	parts := regexp.MustCompile(`(?i)^(.+?)\s+of\s+(.+)$`).FindStringSubmatch(strings.TrimSpace(q))
	if parts == nil {
		return "", "", false
	}
	return strings.TrimSpace(parts[1]), strings.TrimSpace(parts[2]), true
}

func focusQuery(q string) string {
	s := strings.TrimSpace(strings.TrimRight(q, " ?.!"))
	s = stripDiscourse(s)
	for i := 0; i < 6; i++ {
		next := strings.TrimSpace(questionLead.ReplaceAllString(s, ""))
		if next == "" || next == s {
			break
		}
		s = next
	}
	if s == "" {
		return strings.TrimSpace(q)
	}
	return s
}

func rankHits(query string, hits []webHit) []webHit {
	sort.SliceStable(hits, func(i, j int) bool {
		return hitScore(query, hits[i]) > hitScore(query, hits[j])
	})
	return hits
}

func hitScore(query string, hit webHit) int {
	qt := tokenize(query)
	score := fuzzyOverlap(qt, tokenize(hit.Title))*3 + fuzzyOverlap(qt, tokenize(hit.Snippet)) + proximityBonus(query, hit.Title+" "+hit.Snippet)
	if sub := askedSubject(query); sub != "" {
		title := fold(hit.Title)
		if title == sub || title == "the "+sub {
			if newsRE.MatchString(query) {
				score -= 12
			} else {
				score += 15
			}
		}
		if !hasWord(hit.Title+" "+hit.Snippet, sub) {
			score -= 8
		}
	}
	if newsRE.MatchString(query) && strings.Contains(hit.URL, "news.google.com") {
		score += 6
	}
	if aiModeHit(hit) {
		score += 18
	}
	if _, tail, ok := ofRelation(query); ok {
		title := strings.ToLower(hit.Title)
		tail = strings.ToLower(tail)
		if title == tail || strings.HasPrefix(title, tail+" ") {
			score += 8
		}
		if strings.Contains(strings.ToLower(hit.Snippet), tail) && strings.Contains(strings.ToLower(hit.Snippet), " is ") {
			score += 2
		}
	}
	return score
}

func collapseSpace(s string) string {
	var b strings.Builder
	space := false
	for _, r := range s {
		if unicode.IsSpace(r) {
			space = true
			continue
		}
		if space && b.Len() > 0 {
			b.WriteByte(' ')
		}
		space = false
		b.WriteRune(r)
	}
	return strings.TrimSpace(b.String())
}

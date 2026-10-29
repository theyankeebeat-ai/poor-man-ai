package main

import (
	"encoding/json"
	"encoding/xml"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode"
)

type webHit struct {
	Title   string `json:"title"`
	URL     string `json:"url"`
	Snippet string `json:"snippet"`
}

var httpClient = &http.Client{Timeout: 8 * time.Second}

func webSearch(query string) []webHit {
	var hits []webHit
	wikiHits, suggestion := wikiSearch(query)
	hits = append(hits, wikiHits...)
	wantNews := newsRE.MatchString(query) || sportsRE.MatchString(query) || len(wikiHits) < 3
	if wantNews {
		newsQ := []string{query}
		if suggestion != "" && !sameFold(suggestion, query) {
			newsQ = append([]string{suggestion}, newsQ...)
		}
		for _, q := range newsQ {
			hits = append(hits, googleNews(q)...)
		}
	}
	return dedupeHits(hits, 8)
}

func sameFold(a, b string) bool {
	return fold(collapseSpace(a)) == fold(collapseSpace(b))
}

func dedupeHits(in []webHit, limit int) []webHit {
	seen := map[string]struct{}{}
	var out []webHit
	for _, h := range in {
		if h.URL == "" {
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

func wikiSearch(query string) ([]webHit, string) {
	hits, suggestion := wikiOnce(query)
	if suggestion != "" && !sameFold(suggestion, query) {
		more, _ := wikiOnce(suggestion)
		hits = append(more, hits...)
	}
	return dedupeHits(hits, 8), suggestion
}

func wikiOnce(query string) ([]webHit, string) {
	u := "https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&utf8=1&srlimit=4&srinfo=suggestion&srsearch=" + url.QueryEscape(query)
	body, err := getBody(u)
	if err != nil {
		return nil, ""
	}
	return parseWikiSearch(body)
}

func parseWikiSearch(body []byte) ([]webHit, string) {
	var payload struct {
		Query struct {
			SearchInfo struct {
				Suggestion string `json:"suggestion"`
			} `json:"searchinfo"`
			Search []struct {
				Title   string `json:"title"`
				Snippet string `json:"snippet"`
			} `json:"search"`
		} `json:"query"`
	}
	if json.Unmarshal(body, &payload) != nil {
		return nil, ""
	}
	var out []webHit
	for _, row := range payload.Query.Search {
		out = append(out, webHit{
			Title:   row.Title,
			URL:     "https://en.wikipedia.org/wiki/" + url.PathEscape(strings.ReplaceAll(row.Title, " ", "_")),
			Snippet: stripTags(row.Snippet),
		})
	}
	return out, strings.TrimSpace(payload.Query.SearchInfo.Suggestion)
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
	if title, ok := wikiTitle(raw); ok {
		if text := html.UnescapeString(wikiExtract(title)); text != "" {
			if len(text) > maxChars {
				text = text[:maxChars]
			}
			return page{Title: title, URL: raw, Text: text}
		}
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

func wikiTitle(raw string) (string, bool) {
	u, err := url.Parse(raw)
	if err != nil {
		return "", false
	}
	if !strings.Contains(u.Host, "wikipedia.org") {
		return "", false
	}
	path := strings.TrimPrefix(u.Path, "/wiki/")
	if path == "" || path == u.Path {
		return "", false
	}
	title, err := url.PathUnescape(path)
	if err != nil {
		return "", false
	}
	return strings.ReplaceAll(title, "_", " "), true
}

func wikiExtract(title string) string {
	u := "https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exintro=1&format=json&titles=" + url.QueryEscape(title)
	var payload struct {
		Query struct {
			Pages map[string]struct {
				Title   string `json:"title"`
				Extract string `json:"extract"`
			} `json:"pages"`
		} `json:"query"`
	}
	if getJSON(u, &payload) != nil {
		return ""
	}
	for _, p := range payload.Query.Pages {
		return p.Extract
	}
	return ""
}

func weatherReport(message string) (string, []webHit) {
	place := placeFrom(message)
	if place == "" {
		place = strings.TrimSpace(message)
	}
	var geo struct {
		Results []struct {
			Name      string  `json:"name"`
			Country   string  `json:"country"`
			Latitude  float64 `json:"latitude"`
			Longitude float64 `json:"longitude"`
		} `json:"results"`
	}
	geoURL := "https://geocoding-api.open-meteo.com/v1/search?count=1&name=" + url.QueryEscape(place)
	if getJSON(geoURL, &geo) != nil || len(geo.Results) == 0 {
		return "I could not find that place in the Open-Meteo gazetteer.", nil
	}
	g := geo.Results[0]
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

func lookupQueries(q string) []string {
	focused := focusQuery(q)
	out := []string{focused}
	if _, tail, ok := ofRelation(focused); ok && tail != "" && !strings.EqualFold(tail, focused) {
		out = append(out, tail)
	}
	return out
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

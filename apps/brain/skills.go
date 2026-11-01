package main

import (
	"embed"
	"io/fs"
	"path"
	"sort"
	"strconv"
	"strings"
)

//go:embed mcp/skills mcp/knowledge
var skillFS embed.FS

type skill struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Hooks       []string `json:"hooks"`
	Tools       []string `json:"tools"`
	Phase       string   `json:"phase"`
	Priority    int      `json:"priority"`
}

type pack struct {
	Name    string   `json:"name"`
	Topics  []string `json:"topics"`
	Excerpt string   `json:"excerpt"`
	body    string
}

func loadSkills() []skill {
	var out []skill
	_ = fs.WalkDir(skillFS, "mcp/skills", func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(p, "SKILL.md") {
			return nil
		}
		b, err := skillFS.ReadFile(p)
		if err != nil {
			return nil
		}
		meta, body := splitFront(string(b))
		name := meta["name"]
		if name == "" {
			name = path.Base(path.Dir(p))
		}
		pri, _ := strconv.Atoi(strings.TrimSpace(meta["priority"]))
		out = append(out, skill{
			Name:        name,
			Description: meta["description"],
			Hooks:       splitList(meta["hooks"]),
			Tools:       splitList(meta["tools"]),
			Phase:       meta["phase"],
			Priority:    pri,
		})
		_ = body
		return nil
	})
	sort.Slice(out, func(i, j int) bool {
		if out[i].Priority == out[j].Priority {
			return out[i].Name < out[j].Name
		}
		return out[i].Priority < out[j].Priority
	})
	return out
}

func loadPacks() []pack {
	var out []pack
	entries, err := fs.ReadDir(skillFS, "mcp/knowledge")
	if err != nil {
		return nil
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".md") {
			continue
		}
		b, err := skillFS.ReadFile(path.Join("mcp/knowledge", e.Name()))
		if err != nil {
			continue
		}
		body := string(b)
		name := strings.TrimSuffix(e.Name(), ".md")
		excerpt := body
		if len(excerpt) > 400 {
			excerpt = excerpt[:400]
		}
		out = append(out, pack{
			Name:    name,
			Topics:  tokenize(body)[:min(8, len(tokenize(body)))],
			Excerpt: excerpt,
			body:    body,
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

func consultPacks(query string, limit int) []pack {
	q := tokenize(query)
	packs := loadPacks()
	type row struct {
		p pack
		s int
	}
	var rows []row
	for _, p := range packs {
		s := overlap(q, tokenize(p.body))
		if s > 0 {
			rows = append(rows, row{p, s})
		}
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].s > rows[j].s })
	if len(rows) > limit {
		rows = rows[:limit]
	}
	out := make([]pack, len(rows))
	for i, r := range rows {
		out[i] = r.p
	}
	return out
}

func splitFront(s string) (map[string]string, string) {
	meta := map[string]string{}
	s = strings.ReplaceAll(s, "\r\n", "\n")
	if !strings.HasPrefix(s, "---\n") {
		return meta, s
	}
	rest := s[4:]
	end := strings.Index(rest, "\n---")
	if end < 0 {
		return meta, s
	}
	front := rest[:end]
	body := rest[end+4:]
	for _, line := range strings.Split(front, "\n") {
		k, v, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		meta[strings.TrimSpace(k)] = strings.TrimSpace(v)
	}
	return meta, strings.TrimSpace(body)
}

func splitList(v string) []string {
	v = strings.TrimSpace(v)
	v = strings.Trim(v, "[]")
	if v == "" {
		return []string{}
	}
	parts := strings.Split(v, ",")
	var out []string
	for _, p := range parts {
		p = strings.Trim(strings.TrimSpace(p), `"'`)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

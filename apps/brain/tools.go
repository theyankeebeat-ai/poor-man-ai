package main

func toolList() []map[string]any {
	specs := []struct {
		name, desc string
		params     map[string]any
	}{
		{"web_search", "Wikipedia search plus Google News RSS when the question is news or sports.", objSchema("query")},
		{"read_url", "Read a public page. Wikipedia URLs use the extracts API. HTML is tag-stripped. JavaScript rendering is not available.", objSchema("url")},
		{"rag_search", "Hybrid BM25 plus potion-base-8M cosine over the SQuAD v2 passage index.", objSchema("query")},
		{"rag_index", "Append a passage to the session index.", map[string]any{"type": "object", "properties": map[string]any{"content": map[string]any{"type": "string"}}}},
		{"memory_write", "Append one JSONL fact. This does not train weights.", objSchema("fact")},
		{"memory_search", "Token-overlap search over memory.jsonl.", objSchema("query")},
		{"weather_compare", "Open-Meteo geocode plus current conditions.", objSchema("place")},
		{"final_answer", "Jinja answer template: one block per question, then Citations.", objSchema("text")},
		{"consult_knowledge", "Rank markdown playbooks shipped with the Go binary.", objSchema("query")},
	}
	out := make([]map[string]any, 0, len(specs))
	for _, s := range specs {
		out = append(out, map[string]any{
			"type": "function",
			"function": map[string]any{
				"name":        s.name,
				"description": s.desc,
				"parameters":  s.params,
			},
		})
	}
	return out
}

func objSchema(field string) map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			field: map[string]any{"type": "string"},
		},
		"required": []string{field},
	}
}

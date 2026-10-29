package main

import (
	"crypto/sha1"
	"encoding/hex"
	"sync"
	"time"
)

type ragDoc struct {
	ID        string         `json:"id"`
	Content   string         `json:"content"`
	Metadata  map[string]any `json:"metadata"`
	Dims      int            `json:"embedding_dims"`
	CreatedAt float64        `json:"created_at"`
}

var (
	ragMu   sync.Mutex
	ragDocs []ragDoc
)

func indexRAG(content string, meta map[string]any) ragDoc {
	if meta == nil {
		meta = map[string]any{}
	}
	sum := sha1.Sum([]byte(content))
	dims := 0
	if embeddings != nil {
		dims = embeddings.dim
	}
	doc := ragDoc{
		ID:        hex.EncodeToString(sum[:8]),
		Content:   content,
		Metadata:  meta,
		Dims:      dims,
		CreatedAt: float64(time.Now().UnixNano()) / 1e9,
	}
	ragMu.Lock()
	ragDocs = append(ragDocs, doc)
	ragMu.Unlock()
	return doc
}

func listRAG() []ragDoc {
	ragMu.Lock()
	defer ragMu.Unlock()
	out := make([]ragDoc, 0, len(ragDocs)+1)
	if corpus != nil && corpus.meta.Passages > 0 {
		out = append(out, ragDoc{
			ID:        "squad-v2",
			Content:   corpus.meta.Note,
			Metadata:  map[string]any{"source": corpus.meta.Source, "passages": corpus.meta.Passages, "tokens": corpus.meta.Tokens},
			Dims:      embedInfo.Dim,
			CreatedAt: 0,
		})
	}
	out = append(out, ragDocs...)
	return out
}

func searchRAG(query string, topK int, minScore float64) []map[string]any {
	if topK <= 0 {
		topK = 4
	}
	qTok := tokenize(query)
	var qv []float32
	if embeddings != nil {
		qv = embeddings.vector(query)
	}
	ragMu.Lock()
	docs := append([]ragDoc(nil), ragDocs...)
	ragMu.Unlock()
	var rows []map[string]any
	for _, doc := range docs {
		lex := float64(overlap(qTok, tokenize(doc.Content)))
		cos := 0.0
		if qv != nil && embeddings != nil {
			cos = cosine(qv, embeddings.vector(doc.Content))
		}
		hybrid := 0.5*cos + 0.5*lex/float64(max(len(qTok), 1))
		if hybrid < minScore && lex < 1 {
			continue
		}
		rows = append(rows, map[string]any{
			"id":           doc.ID,
			"content":      clip(doc.Content, 400),
			"metadata":     doc.Metadata,
			"similarity":   cos,
			"hybrid_score": hybrid,
			"created_at":   doc.CreatedAt,
		})
	}
	if corpus != nil {
		for _, hit := range corpus.search(query, topK) {
			rows = append(rows, map[string]any{
				"id":           hit.doc.URL,
				"content":      clip(hit.doc.Text, 400),
				"metadata":     map[string]any{"title": hit.doc.Title, "url": hit.doc.URL},
				"similarity":   hit.cos,
				"hybrid_score": hit.fused,
				"created_at":   0,
			})
		}
	}
	if len(rows) > topK {
		rows = rows[:topK]
	}
	return rows
}

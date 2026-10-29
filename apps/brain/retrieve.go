package main

import (
	"bufio"
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type passage struct {
	Title string `json:"title"`
	Text  string `json:"text"`
	URL   string `json:"url"`
}

type corpusMeta struct {
	Name     string `json:"name"`
	Source   string `json:"source"`
	License  string `json:"license"`
	Note     string `json:"note"`
	Tokens   int    `json:"tokens"`
	Bytes    int64  `json:"bytes"`
	Passages int    `json:"passages"`
}

type indexDoc struct {
	passage
	tf  map[string]int
	len int
}

type corpusIndex struct {
	docs   []indexDoc
	df     map[string]int
	avgLen float64
	meta   corpusMeta
}

var corpus *corpusIndex

func corpusRoot() string {
	if d := os.Getenv("BRAIN_CORPUS"); d != "" {
		return d
	}
	return "data"
}

func loadCorpus() {
	root := corpusRoot()
	idx := &corpusIndex{df: map[string]int{}}
	if b, err := os.ReadFile(filepath.Join(root, "corpus.meta.json")); err == nil {
		_ = json.Unmarshal(b, &idx.meta)
	}
	f, err := os.Open(filepath.Join(root, "corpus.jsonl"))
	if err != nil {
		corpus = idx
		return
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 64*1024), 2*1024*1024)
	var total int
	for sc.Scan() {
		var p passage
		if json.Unmarshal(sc.Bytes(), &p) != nil || strings.TrimSpace(p.Text) == "" {
			continue
		}
		toks := tokenize(p.Text + " " + p.Title)
		tf := map[string]int{}
		for _, t := range toks {
			tf[t]++
		}
		for t := range tf {
			idx.df[t]++
		}
		total += len(toks)
		idx.docs = append(idx.docs, indexDoc{passage: p, tf: tf, len: len(toks)})
	}
	if len(idx.docs) > 0 {
		idx.avgLen = float64(total) / float64(len(idx.docs))
	}
	if idx.meta.Passages == 0 {
		idx.meta.Passages = len(idx.docs)
		idx.meta.Tokens = total
	}
	corpus = idx
}

const (
	bm25K1 = 1.5
	bm25B  = 0.75
)

type scored struct {
	doc   indexDoc
	bm25  float64
	cos   float64
	fused float64
}

func (idx *corpusIndex) search(query string, limit int) []scored {
	if idx == nil || len(idx.docs) == 0 {
		return nil
	}
	q := tokenize(query)
	if len(q) == 0 {
		return nil
	}
	n := float64(len(idx.docs))
	idf := map[string]float64{}
	for _, t := range q {
		df := float64(idx.df[t])
		idf[t] = math.Log((n-df+0.5)/(df+0.5) + 1)
	}
	short := make([]scored, 0, 32)
	for _, doc := range idx.docs {
		var score float64
		for _, t := range q {
			tf := float64(doc.tf[t])
			if tf == 0 {
				continue
			}
			denom := tf + bm25K1*(1-bm25B+bm25B*float64(doc.len)/math.Max(idx.avgLen, 1))
			score += idf[t] * (tf * (bm25K1 + 1) / denom)
		}
		if score <= 0 {
			continue
		}
		short = append(short, scored{doc: doc, bm25: score})
	}
	sort.Slice(short, func(i, j int) bool { return short[i].bm25 > short[j].bm25 })
	if len(short) > 32 {
		short = short[:32]
	}
	if embeddings != nil {
		qv := embeddings.vector(query)
		for i := range short {
			short[i].cos = cosine(qv, embeddings.vector(short[i].doc.Text))
		}
		order := append([]scored(nil), short...)
		sort.Slice(order, func(i, j int) bool { return order[i].cos > order[j].cos })
		cosRank := map[string]int{}
		for i, row := range order {
			cosRank[row.doc.URL+"\n"+row.doc.Text[:min(80, len(row.doc.Text))]] = i + 1
		}
		for i := range short {
			key := short[i].doc.URL + "\n" + short[i].doc.Text[:min(80, len(short[i].doc.Text))]
			bm := i + 1
			cr := cosRank[key]
			if cr == 0 {
				cr = 32
			}
			short[i].fused = 1/float64(60+bm) + 1/float64(60+cr)
		}
		sort.Slice(short, func(i, j int) bool { return short[i].fused > short[j].fused })
	}
	if len(short) > limit {
		short = short[:limit]
	}
	return short
}

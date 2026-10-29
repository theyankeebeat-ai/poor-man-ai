package main

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"
	"unicode"
)

// embedTable is minishlab/potion-base-8M quantized to int8.
// Rows follow vocab.txt. Inference is WordPiece then mean-pool, then L2.
type embedTable struct {
	rows   int
	dim    int
	scale  []float32
	weight []int8
	vocab  map[string]int
	unk    int
}

type embedMeta struct {
	Name       string `json:"name"`
	Parameters int    `json:"parameters"`
	Dim        int    `json:"dim"`
	Vocab      int    `json:"vocab"`
	Dtype      string `json:"dtype"`
	License    string `json:"license"`
	Source     string `json:"source"`
	Teacher    string `json:"teacher"`
	Bytes      int64  `json:"bytes"`
}

var embeddings *embedTable
var embedInfo embedMeta

func loadEmbeddings() {
	root := corpusRoot()
	metaPath := filepath.Join(root, "embed.meta.json")
	b, err := os.ReadFile(metaPath)
	if err == nil {
		_ = json.Unmarshal(b, &embedInfo)
	}
	table, err := readInt8(filepath.Join(root, "potion-base-8M.int8"), filepath.Join(root, "vocab.txt"))
	if err != nil {
		embeddings = nil
		return
	}
	embeddings = table
	if embedInfo.Parameters == 0 {
		embedInfo.Parameters = table.rows * table.dim
		embedInfo.Dim = table.dim
		embedInfo.Vocab = table.rows
		embedInfo.Name = "minishlab/potion-base-8M"
		embedInfo.Dtype = "int8"
	}
}

func readInt8(path, vocabPath string) (*embedTable, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	magic := make([]byte, 8)
	if _, err := f.Read(magic); err != nil {
		return nil, err
	}
	if string(magic) != "PMEMB01\n" {
		return nil, fmt.Errorf("bad embedding magic")
	}
	var rows, cols uint32
	if err := binary.Read(f, binary.LittleEndian, &rows); err != nil {
		return nil, err
	}
	if err := binary.Read(f, binary.LittleEndian, &cols); err != nil {
		return nil, err
	}
	if rows == 0 || rows > 200_000 || cols == 0 || cols > 4096 {
		return nil, fmt.Errorf("embedding shape %d x %d is not usable", rows, cols)
	}
	scale := make([]float32, rows)
	if err := binary.Read(f, binary.LittleEndian, scale); err != nil {
		return nil, err
	}
	weight := make([]int8, int(rows)*int(cols))
	raw := make([]byte, len(weight))
	if _, err := f.Read(raw); err != nil {
		return nil, err
	}
	for i, c := range raw {
		weight[i] = int8(c)
	}
	vocab, err := readVocab(vocabPath, int(rows))
	if err != nil {
		return nil, err
	}
	unk := -1
	if id, ok := vocab["[UNK]"]; ok {
		unk = id
	}
	return &embedTable{rows: int(rows), dim: int(cols), scale: scale, weight: weight, vocab: vocab, unk: unk}, nil
}

func readVocab(path string, rows int) (map[string]int, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	lines := strings.Split(strings.ReplaceAll(string(b), "\r\n", "\n"), "\n")
	vocab := map[string]int{}
	id := 0
	for _, line := range lines {
		if line == "" && id >= rows {
			break
		}
		if id >= rows {
			break
		}
		vocab[line] = id
		id++
	}
	return vocab, nil
}

func (e *embedTable) vector(text string) []float32 {
	if e == nil || e.dim == 0 {
		return nil
	}
	ids := e.wordpiece(text)
	if len(ids) == 0 && e.unk >= 0 {
		ids = []int{e.unk}
	}
	out := make([]float32, e.dim)
	if len(ids) == 0 {
		return out
	}
	for _, id := range ids {
		if id < 0 || id >= e.rows {
			continue
		}
		base := id * e.dim
		sc := e.scale[id]
		for d := 0; d < e.dim; d++ {
			out[d] += float32(e.weight[base+d]) * sc
		}
	}
	inv := float32(len(ids))
	var norm float64
	for d := 0; d < e.dim; d++ {
		out[d] /= inv
		norm += float64(out[d]) * float64(out[d])
	}
	if norm == 0 {
		return out
	}
	n := float32(math.Sqrt(norm))
	for d := 0; d < e.dim; d++ {
		out[d] /= n
	}
	return out
}

func (e *embedTable) wordpiece(text string) []int {
	words := basicTokens(text)
	var ids []int
	for _, word := range words {
		ids = append(ids, e.pieces(word)...)
	}
	return ids
}

func (e *embedTable) pieces(word string) []int {
	if id, ok := e.vocab[word]; ok {
		return []int{id}
	}
	var ids []int
	rest := word
	first := true
	for len(rest) > 0 {
		matched := -1
		end := len(rest)
		for end > 0 {
			frag := rest[:end]
			if !first {
				frag = "##" + frag
			}
			if id, ok := e.vocab[frag]; ok {
				matched = id
				break
			}
			end--
		}
		if matched < 0 || end == 0 {
			if e.unk >= 0 {
				return []int{e.unk}
			}
			return nil
		}
		ids = append(ids, matched)
		rest = rest[end:]
		first = false
	}
	return ids
}

func basicTokens(text string) []string {
	text = strings.ToLower(text)
	var b strings.Builder
	var out []string
	flush := func() {
		if b.Len() > 0 {
			out = append(out, b.String())
			b.Reset()
		}
	}
	for _, r := range text {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
		} else {
			flush()
		}
	}
	flush()
	return out
}

func cosine(a, b []float32) float64 {
	if len(a) == 0 || len(a) != len(b) {
		return 0
	}
	var dot float64
	for i := range a {
		dot += float64(a[i]) * float64(b[i])
	}
	return dot
}

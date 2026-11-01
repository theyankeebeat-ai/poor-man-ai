// Command prepare downloads potion-base-8M and SQuAD v2, then writes the
// files the Go brain loads: an int8 embedding table and a deduped passage JSONL.
package main

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"hash/fnv"
	"io"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/parquet-go/parquet-go"
)

const (
	modelURL = "https://huggingface.co/minishlab/potion-base-8M/resolve/main/model.safetensors"
	vocabURL = "https://huggingface.co/minishlab/potion-base-8M/resolve/main/vocab.txt"
	trainURL = "https://huggingface.co/datasets/rajpurkar/squad_v2/resolve/main/squad_v2/train-00000-of-00001.parquet"
	validURL = "https://huggingface.co/datasets/rajpurkar/squad_v2/resolve/main/squad_v2/validation-00000-of-00001.parquet"
	maxBytes = 24_000_000
)

func main() {
	root := "data"
	raw := filepath.Join(root, "raw")
	if err := os.MkdirAll(raw, 0o755); err != nil {
		fatal(err)
	}
	safetensors := filepath.Join(raw, "model.safetensors")
	vocab := filepath.Join(root, "vocab.txt")
	if err := download(modelURL, safetensors); err != nil {
		fatal(err)
	}
	if err := download(vocabURL, vocab); err != nil {
		fatal(err)
	}
	rows, dim, params, nbytes, err := quantize(safetensors, filepath.Join(root, "potion-base-8M.int8"))
	if err != nil {
		fatal(err)
	}
	meta := map[string]any{
		"name":       "minishlab/potion-base-8M",
		"parameters": params,
		"dim":        dim,
		"vocab":      rows,
		"dtype":      "int8",
		"license":    "MIT",
		"source":     "https://huggingface.co/minishlab/potion-base-8M",
		"teacher":    "BAAI/bge-base-en-v1.5 distilled with Model2Vec Tokenlearn",
		"bytes":      nbytes,
		"note":       "Published float32 safetensors is about 30 MB. This file is the same matrix, per-row int8, so it stays under 25 MB.",
	}
	if err := writeJSON(filepath.Join(root, "embed.meta.json"), meta); err != nil {
		fatal(err)
	}
	fmt.Printf("embeddings %d x %d = %d params, int8 file %d bytes\n", rows, dim, params, nbytes)

	train := filepath.Join(raw, "squad-train.parquet")
	valid := filepath.Join(raw, "squad-valid.parquet")
	if err := download(trainURL, train); err != nil {
		fatal(err)
	}
	if err := download(validURL, valid); err != nil {
		fatal(err)
	}
	stats, err := writeCorpus(root, train, valid)
	if err != nil {
		fatal(err)
	}
	fmt.Printf("corpus passages=%d tokens=%d bytes=%d\n", stats.Passages, stats.Tokens, stats.Bytes)
}

type corpusStats struct {
	Name     string `json:"name"`
	Source   string `json:"source"`
	License  string `json:"license"`
	Note     string `json:"note"`
	Tokens   int    `json:"tokens"`
	Bytes    int64  `json:"bytes"`
	Passages int    `json:"passages"`
}

type squadRow struct {
	Title   string `parquet:"title"`
	Context string `parquet:"context"`
}

func writeCorpus(root, train, valid string) (corpusStats, error) {
	outPath := filepath.Join(root, "corpus.jsonl")
	out, err := os.Create(outPath)
	if err != nil {
		return corpusStats{}, err
	}
	defer out.Close()
	seen := map[uint64]struct{}{}
	stats := corpusStats{
		Name:    "rajpurkar/squad_v2",
		Source:  "https://huggingface.co/datasets/rajpurkar/squad_v2",
		License: "CC BY-SA 4.0",
		Note:    "Unique Wikipedia passages from SQuAD 2.0. Questions repeat a context, so contexts are deduped before indexing. This is a question-answering corpus, not a language-model dump.",
	}
	for _, path := range []string{train, valid} {
		rows, err := parquet.ReadFile[squadRow](path)
		if err != nil {
			return corpusStats{}, fmt.Errorf("%s: %w", path, err)
		}
		for _, row := range rows {
			text := strings.TrimSpace(row.Context)
			if len(text) < 80 {
				continue
			}
			h := fnv.New64a()
			_, _ = h.Write([]byte(text))
			sum := h.Sum64()
			if _, ok := seen[sum]; ok {
				continue
			}
			if stats.Bytes >= maxBytes {
				break
			}
			title := strings.TrimSpace(row.Title)
			url := "https://en.wikipedia.org/wiki/" + strings.ReplaceAll(title, " ", "_")
			line, _ := json.Marshal(map[string]string{"title": title, "text": text, "url": url})
			if int64(len(line)+1)+stats.Bytes > maxBytes {
				break
			}
			if _, err := out.Write(append(line, '\n')); err != nil {
				return corpusStats{}, err
			}
			seen[sum] = struct{}{}
			stats.Bytes += int64(len(line) + 1)
			stats.Passages++
			stats.Tokens += len(strings.Fields(text))
		}
	}
	if err := writeJSON(filepath.Join(root, "corpus.meta.json"), stats); err != nil {
		return corpusStats{}, err
	}
	return stats, nil
}

func quantize(src, dst string) (rows, dim, params int, nbytes int64, err error) {
	f, err := os.Open(src)
	if err != nil {
		return 0, 0, 0, 0, err
	}
	defer f.Close()
	var headerLen uint64
	if err := binary.Read(f, binary.LittleEndian, &headerLen); err != nil {
		return 0, 0, 0, 0, err
	}
	header := make([]byte, headerLen)
	if _, err := io.ReadFull(f, header); err != nil {
		return 0, 0, 0, 0, err
	}
	var spec map[string]struct {
		Dtype       string   `json:"dtype"`
		Shape       []int    `json:"shape"`
		DataOffsets [2]int64 `json:"data_offsets"`
	}
	if err := json.Unmarshal(header, &spec); err != nil {
		return 0, 0, 0, 0, err
	}
	var name string
	var tensor struct {
		Dtype       string
		Shape       []int
		DataOffsets [2]int64
	}
	for k, v := range spec {
		if strings.HasPrefix(k, "__") || v.Dtype != "F32" || len(v.Shape) != 2 {
			continue
		}
		name = k
		tensor.Dtype = v.Dtype
		tensor.Shape = v.Shape
		tensor.DataOffsets = v.DataOffsets
		break
	}
	if name == "" {
		return 0, 0, 0, 0, fmt.Errorf("no F32 matrix in safetensors")
	}
	rows, dim = tensor.Shape[0], tensor.Shape[1]
	params = rows * dim
	raw := make([]byte, tensor.DataOffsets[1]-tensor.DataOffsets[0])
	if _, err := f.Seek(8+int64(headerLen)+tensor.DataOffsets[0], io.SeekStart); err != nil {
		return 0, 0, 0, 0, err
	}
	if _, err := io.ReadFull(f, raw); err != nil {
		return 0, 0, 0, 0, err
	}
	scales := make([]float32, rows)
	weights := make([]byte, params)
	for r := 0; r < rows; r++ {
		maxAbs := float32(0)
		base := r * dim * 4
		vals := make([]float32, dim)
		for c := 0; c < dim; c++ {
			bits := binary.LittleEndian.Uint32(raw[base+c*4 : base+c*4+4])
			v := math.Float32frombits(bits)
			vals[c] = v
			if abs := float32(math.Abs(float64(v))); abs > maxAbs {
				maxAbs = abs
			}
		}
		scale := maxAbs / 127
		if scale == 0 {
			scale = 1
		}
		scales[r] = scale
		for c := 0; c < dim; c++ {
			q := int(math.Round(float64(vals[c] / scale)))
			if q > 127 {
				q = 127
			}
			if q < -127 {
				q = -127
			}
			weights[r*dim+c] = byte(int8(q))
		}
	}
	out, err := os.Create(dst)
	if err != nil {
		return 0, 0, 0, 0, err
	}
	defer out.Close()
	if _, err := out.Write([]byte("PMEMB01\n")); err != nil {
		return 0, 0, 0, 0, err
	}
	if err := binary.Write(out, binary.LittleEndian, uint32(rows)); err != nil {
		return 0, 0, 0, 0, err
	}
	if err := binary.Write(out, binary.LittleEndian, uint32(dim)); err != nil {
		return 0, 0, 0, 0, err
	}
	if err := binary.Write(out, binary.LittleEndian, scales); err != nil {
		return 0, 0, 0, 0, err
	}
	if _, err := out.Write(weights); err != nil {
		return 0, 0, 0, 0, err
	}
	info, err := out.Stat()
	if err != nil {
		return rows, dim, params, 0, err
	}
	return rows, dim, params, info.Size(), nil
}

func download(rawURL, dest string) error {
	if st, err := os.Stat(dest); err == nil && st.Size() > 0 {
		fmt.Println("have", dest)
		return nil
	}
	fmt.Println("get", rawURL)
	req, err := http.NewRequest(http.MethodGet, rawURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "PoorManAI/2.0 dataset-prepare")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode >= 400 {
		return fmt.Errorf("%s: %s", rawURL, res.Status)
	}
	tmp := dest + ".part"
	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	if _, err := io.Copy(f, res.Body); err != nil {
		f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	return os.Rename(tmp, dest)
}

func writeJSON(path string, v any) error {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(b, '\n'), 0o644)
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}

package main

import (
	"math"
	"strconv"
)

type archSpec struct {
	Name              string  `json:"name"`
	Family            string  `json:"family"`
	HiddenDim         int     `json:"hidden_dim"`
	NumLayers         int     `json:"num_layers"`
	NumAttentionHeads int     `json:"num_attention_heads"`
	NumKVHeads        int     `json:"num_kv_heads"`
	VocabSize         int     `json:"vocab_size"`
	MaxContextLength  int     `json:"max_context_length"`
	IntermediateDim   int     `json:"intermediate_dim"`
	NumExperts        int     `json:"num_experts"`
	ActiveExperts     int     `json:"active_experts"`
	NormType          string  `json:"norm_type"`
	Activation        string  `json:"activation"`
	RopeTheta         float64 `json:"rope_theta"`
	TieWordEmbeddings bool    `json:"tie_word_embeddings"`
	SlidingWindow     int     `json:"sliding_window"`
	QKNorm            bool    `json:"qk_norm"`
	UseFlashAttn      bool    `json:"use_flash_attn"`
	Dropout           float64 `json:"dropout"`
	AttentionDropout  float64 `json:"attention_dropout"`
}

func (s archSpec) params() int {
	if s.Family == "static_embedding" {
		if embedInfo.Parameters > 0 {
			return embedInfo.Parameters
		}
		return s.VocabSize * s.HiddenDim
	}
	heads := max(1, s.NumAttentionHeads)
	headDim := s.HiddenDim / heads
	attn := s.HiddenDim*(s.NumAttentionHeads*headDim) + 2*s.HiddenDim*(s.NumKVHeads*headDim) + (s.NumAttentionHeads*headDim)*s.HiddenDim
	mlp := 3 * (s.HiddenDim * s.IntermediateDim) * max(1, s.NumExperts)
	norm := 2 * s.HiddenDim
	layers := (attn + mlp + norm) * max(1, s.NumLayers)
	embed := s.VocabSize * s.HiddenDim
	lm := 0
	if !s.TieWordEmbeddings {
		lm = s.VocabSize * s.HiddenDim
	}
	return embed + layers + lm + s.HiddenDim
}

func (s archSpec) gb(bytesPer float64) float64 {
	w := float64(s.params()) * bytesPer
	return math.Round((w/(1024*1024*1024))*1.15*100) / 100
}

func blueprint(key string, spec archSpec, recommended bool) map[string]any {
	n := spec.params()
	formatted := formatParams(n)
	return map[string]any{
		"key":              key,
		"recommended":      recommended,
		"spec":             spec,
		"total_parameters": n,
		"formatted_params": formatted,
		"memory_estimates": map[string]any{
			"fp16_gb": spec.gb(2),
			"int8_gb": spec.gb(1),
			"int4_gb": spec.gb(0.5),
		},
	}
}

func formatParams(n int) string {
	if n >= 1_000_000_000 {
		return strconv.FormatFloat(float64(n)/1e9, 'f', 2, 64) + "B"
	}
	if n >= 1_000_000 {
		return strconv.FormatFloat(float64(n)/1e6, 'f', 1, 64) + "M"
	}
	return strconv.FormatFloat(float64(n)/1e3, 'f', 1, 64) + "K"
}

func loadedPotion() archSpec {
	dim := 256
	vocab := 29528
	if embedInfo.Dim > 0 {
		dim = embedInfo.Dim
	}
	if embedInfo.Vocab > 0 {
		vocab = embedInfo.Vocab
	}
	return archSpec{
		Name:              "potion-base-8M-int8",
		Family:            "static_embedding",
		HiddenDim:         dim,
		NumLayers:         1,
		NumAttentionHeads: 1,
		NumKVHeads:        1,
		VocabSize:         vocab,
		MaxContextLength:  512,
		IntermediateDim:   dim,
		NumExperts:        1,
		ActiveExperts:     1,
		NormType:          "L2",
		Activation:        "mean-pool",
		RopeTheta:         0,
		UseFlashAttn:      false,
	}
}

func presetArchitectures() []map[string]any {
	potion := blueprint("potion_base_8m", loadedPotion(), true)
	others := []struct {
		key  string
		spec archSpec
	}{
		{"poor_man_1b", archSpec{Name: "PoorMan-Mini-1B", Family: "transformer_decoder", HiddenDim: 2048, NumLayers: 16, NumAttentionHeads: 16, NumKVHeads: 4, VocabSize: 32000, MaxContextLength: 8192, IntermediateDim: 5632, NumExperts: 1, ActiveExperts: 1, NormType: "RMSNorm", Activation: "SwiGLU", RopeTheta: 10000, UseFlashAttn: true}},
		{"poor_man_router", archSpec{Name: "PoorMan-NeuralBank-Router", Family: "tiny_neuron_router", HiddenDim: 64, NumLayers: 2, NumAttentionHeads: 1, NumKVHeads: 1, VocabSize: 24, MaxContextLength: 512, IntermediateDim: 32, NumExperts: 1, ActiveExperts: 1, NormType: "tanh", Activation: "sigmoid", RopeTheta: 0, UseFlashAttn: false}},
	}
	out := []map[string]any{potion}
	for _, o := range others {
		out = append(out, blueprint(o.key, o.spec, false))
	}
	return out
}

func hyperPresets() map[string]any {
	return map[string]any{
		"creative_chat":  map[string]any{"temperature": 0.85, "top_p": 0.92, "top_k": 50, "min_p": 0.05, "repetition_penalty": 1.08, "frequency_penalty": 0.0, "presence_penalty": 0.0, "max_new_tokens": 1024, "context_window": 8192, "seed": 0, "reasoning_effort": "low", "verify_claims": false, "self_critique": false, "require_citations": false, "consensus_search": false, "coverage_threshold": 0.35, "max_plan_tools": 3, "memory_snippets": 3, "use_crew": false, "planner_temperature": 0.4, "writer_temperature": 0.85},
		"precise_code":   map[string]any{"temperature": 0.15, "top_p": 0.95, "top_k": 20, "min_p": 0.05, "repetition_penalty": 1.05, "frequency_penalty": 0.0, "presence_penalty": 0.0, "max_new_tokens": 2048, "context_window": 8192, "seed": 0, "reasoning_effort": "high", "verify_claims": true, "self_critique": true, "require_citations": false, "consensus_search": false, "coverage_threshold": 0.5, "max_plan_tools": 4, "memory_snippets": 4, "use_crew": false, "planner_temperature": 0.05, "writer_temperature": 0.12},
		"deep_research":  map[string]any{"temperature": 0.35, "top_p": 0.90, "top_k": 40, "min_p": 0.05, "repetition_penalty": 1.12, "frequency_penalty": 0.0, "presence_penalty": 0.0, "max_new_tokens": 2048, "context_window": 8192, "seed": 0, "reasoning_effort": "high", "verify_claims": true, "self_critique": true, "require_citations": true, "consensus_search": true, "coverage_threshold": 0.70, "max_plan_tools": 6, "memory_snippets": 10, "use_crew": true, "planner_temperature": 0.1, "writer_temperature": 0.25},
		"fast_heuristic": map[string]any{"temperature": 0.0, "top_p": 1.0, "top_k": 1, "min_p": 0.0, "repetition_penalty": 1.0, "frequency_penalty": 0.0, "presence_penalty": 0.0, "max_new_tokens": 512, "context_window": 4096, "seed": 0, "reasoning_effort": "low", "verify_claims": false, "self_critique": false, "require_citations": false, "consensus_search": false, "coverage_threshold": 0.35, "max_plan_tools": 2, "memory_snippets": 3, "use_crew": false, "planner_temperature": 0.0, "writer_temperature": 0.0},
		"smarter_agent":  map[string]any{"temperature": 0.22, "top_p": 0.90, "top_k": 30, "min_p": 0.04, "repetition_penalty": 1.12, "frequency_penalty": 0.0, "presence_penalty": 0.0, "max_new_tokens": 3072, "context_window": 16384, "seed": 0, "reasoning_effort": "high", "verify_claims": true, "self_critique": true, "require_citations": true, "consensus_search": true, "coverage_threshold": 0.72, "max_plan_tools": 6, "memory_snippets": 12, "use_crew": true, "planner_temperature": 0.05, "writer_temperature": 0.18},
	}
}

func runtimeProfile() map[string]any {
	bp := blueprint("potion_base_8m", loadedPotion(), true)
	return map[string]any{
		"id":               "potion_int8_hybrid",
		"arch_key":         "potion_base_8m",
		"name":             "potion-base-8M-int8",
		"formatted_params": bp["formatted_params"],
		"precision":        "int8",
		"quant_method":     "per-row-int8",
		"thinking_level":   "medium",
		"preset":           "smarter_agent",
		"max_steps":        8,
		"int4_gb":          bp["memory_estimates"].(map[string]any)["int4_gb"],
		"dataset":          datasetMeta(),
		"hyperparameters":  hyperPresets()["smarter_agent"],
		"reason":           "Loaded weights are potion-base-8M (Model2Vec static embeddings distilled from bge-base). Shipped as per-row int8 so the file stays under 25 MB. The 1B decoder cards are estimates only and are not loaded.",
	}
}

func datasetMeta() corpusMeta {
	if corpus == nil {
		return corpusMeta{}
	}
	return corpus.meta
}

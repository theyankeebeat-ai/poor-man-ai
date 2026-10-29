package main

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func main() {
	loadCorpus()
	loadEmbeddings()
	mux := http.NewServeMux()
	mux.HandleFunc("/health", health)
	mux.HandleFunc("/api/health", health)
	mux.HandleFunc("/memory", memoryHandler)
	mux.HandleFunc("/tools", toolsHandler)
	mux.HandleFunc("/read-url", readURL)
	mux.HandleFunc("/api/read-url", readURL)
	mux.HandleFunc("/debug/route", debugRoute)
	mux.HandleFunc("/mcp/knowledge", knowledgeHandler)
	mux.HandleFunc("/mcp/neurons", neuronsHandler)
	mux.HandleFunc("/mcp/skills", skillsHandler)
	mux.HandleFunc("/model/architecture", archHandler)
	mux.HandleFunc("/model/train", trainHandler)
	mux.HandleFunc("/crew/router", crewRouter)
	mux.HandleFunc("/crew/broadcast-test", crewBroadcast)
	mux.HandleFunc("/chat", chatHandler)
	mux.HandleFunc("/tts/voices", voicesHandler)
	mux.HandleFunc("/tts", ttsHandler)
	mux.HandleFunc("/upload", uploadHandler)
	mux.HandleFunc("/api/real-ai/providers", providersHandler)
	mux.HandleFunc("/api/real-ai/rag/documents", ragDocsHandler)
	mux.HandleFunc("/api/real-ai/rag/index", ragIndexHandler)
	mux.HandleFunc("/api/real-ai/rag/search", ragSearchHandler)
	mux.HandleFunc("/api/real-ai/guardrails/evaluate", guardHandler)
	mux.Handle("/static/uploads/", http.StripPrefix("/static/uploads/", http.FileServer(http.Dir(uploadDir()))))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8000"
	}
	srv := &http.Server{
		Addr:              "0.0.0.0:" + port,
		Handler:           withCORS(mux),
		ReadHeaderTimeout: 10 * time.Second,
	}
	if err := srv.ListenAndServe(); err != nil {
		panic(err)
	}
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Accept")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(v)
}

func readJSON(r *http.Request, dest any) error {
	defer r.Body.Close()
	return json.NewDecoder(io.LimitReader(r.Body, 1_000_000)).Decode(dest)
}

func health(w http.ResponseWriter, r *http.Request) {
	passages := 0
	if corpus != nil {
		passages = len(corpus.docs)
	}
	noteCache(passages > 0)
	writeJSON(w, 200, map[string]any{
		"status": "ok",
		"cache": map[string]any{
			"hits":     cacheHits.Load(),
			"misses":   cacheMisses.Load(),
			"hit_rate": hitRate(),
		},
		"memory_scrub": map[string]int{"kept": len(readFacts()), "dropped": 0},
		"note":         "Poor Man AI Go brain. No Python. NDJSON /chat.",
		"runtime":      "go",
		"model":        embedInfo.Name,
		"parameters":   embedInfo.Parameters,
		"passages":     passages,
	})
}

func memoryHandler(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"facts": readFacts()})
}

func toolsHandler(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"tools": toolList()})
}

func readURL(w http.ResponseWriter, r *http.Request) {
	var body struct {
		URL          string `json:"url"`
		RenderJS     bool   `json:"render_js"`
		MaxChars     int    `json:"max_chars"`
		ForceRefresh bool   `json:"force_refresh"`
	}
	if r.Method == http.MethodGet {
		body.URL = r.URL.Query().Get("url")
	} else if err := readJSON(r, &body); err != nil {
		writeJSON(w, 400, map[string]string{"detail": "invalid json"})
		return
	}
	if body.MaxChars == 0 {
		body.MaxChars = 15000
	}
	page := readPage(body.URL, body.MaxChars)
	method := "http"
	if _, ok := wikiTitle(page.URL); ok && page.Text != "" {
		method = "wikipedia-extract"
	}
	resp := map[string]any{
		"title": page.Title, "description": clip(page.Text, 240), "url": page.URL,
		"markdown": page.Text, "text": page.Text, "method": method, "chars": len(page.Text),
	}
	if page.Text == "" {
		resp["error"] = "empty page"
		resp["method"] = "error"
	}
	if body.RenderJS {
		resp["note"] = "render_js is ignored. This runtime does not launch a browser."
	}
	writeJSON(w, 200, resp)
}

func debugRoute(w http.ResponseWriter, r *http.Request) {
	var req chatBody
	if err := readJSON(r, &req); err != nil {
		writeJSON(w, 400, map[string]string{"detail": "invalid json"})
		return
	}
	th := think(req.Message, req.History)
	cheap, _ := cheapAnswer(req.Message, req.History, th)
	writeJSON(w, 200, map[string]any{
		"message":       req.Message,
		"mode":          th.Mode,
		"skip_grok":     th.Cheap || xaiKey() == "",
		"max_steps":     map[bool]int{true: 0, false: 8}[th.Cheap],
		"cheap_preview": clip(cheap, 300),
		"parts":         th.Parts,
		"layers":        layerScores(req.Message, th.Mode, len(req.History)),
	})
}

func knowledgeHandler(w http.ResponseWriter, r *http.Request) {
	packs := loadPacks()
	out := make([]map[string]any, 0, len(packs))
	for _, p := range packs {
		out = append(out, map[string]any{"name": p.Name, "topics": p.Topics, "excerpt": p.Excerpt})
	}
	writeJSON(w, 200, map[string]any{"packs": out})
}

func neuronsHandler(w http.ResponseWriter, r *http.Request) {
	banks := append([]string{}, layerBanks...)
	crew := make([]string, 0, len(crewRoles))
	for _, role := range crewRoles {
		name := "crew:" + role
		banks = append(banks, name)
		crew = append(crew, name)
	}
	writeJSON(w, 200, map[string]any{
		"arch":           archLabel(),
		"params_per_net": paramsPerNet(),
		"banks":          banks,
		"crew":           crew,
		"embed_model":    embedInfo.Name,
		"embed_params":   embedInfo.Parameters,
		"note":           "24×64×32×1 routing nets (" + jsonNumber(paramsPerNet()) + " weights each) only rank layers and crew. Answers come from retrieval and, when XAI_API_KEY is set, grok-4.7.",
	})
}

func skillsHandler(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"skills": loadSkills()})
}

func archHandler(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"architectures": presetArchitectures(),
		"presets":       hyperPresets(),
		"runtime":       runtimeProfile(),
		"recommended":   "potion_base_8m",
	})
}

func trainHandler(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	_ = readJSON(r, &body)
	method, _ := body["method"].(string)
	if method == "" {
		method = "qlora"
	}
	target, _ := body["target_model"].(string)
	if target == "" {
		target = "potion-base-8M-int8"
	}
	epochs := 3
	if v, ok := body["epochs"].(float64); ok {
		epochs = int(v)
	}
	writeJSON(w, 200, map[string]any{
		"status":          "not_trained",
		"method":          method,
		"target":          target,
		"epochs":          epochs,
		"dataset_samples": 0,
		"message":         "No weights were updated. potion-base-8M stays frozen. Memory JSONL and the answer template can still change.",
	})
}

func crewRouter(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"topology":          "hybrid_hub_and_spoke_broadcast_bus",
		"description":       "The Go brain ranks crew roles with the 24×64×32×1 nets, then one writer composes the answer.",
		"max_debate_rounds": 1,
		"supported_topics":  []string{"task_init", "fill_gaps", "debate:action_plan", "verdict:action_plan", "clarification"},
		"cost_efficiency":   "O(N) message complexity vs O(N^2) for full cross-mesh.",
	})
}

func crewBroadcast(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	_ = readJSON(r, &body)
	sender, _ := body["sender"].(string)
	if sender == "" {
		sender = "coordinator"
	}
	topic, _ := body["topic"].(string)
	if topic == "" {
		topic = "task_init"
	}
	msg, _ := body["message"].(string)
	if msg == "" {
		msg = "Task initialized"
	}
	log := "[BUS:NORMAL] " + sender + " on '" + topic + "': " + msg
	writeJSON(w, 200, map[string]any{
		"status": "ok", "bus_log": log, "broadcast_count": 1, "arbitrated_verdict": nil,
	})
}

type chatBody struct {
	Message       string         `json:"message"`
	MaxSteps      int            `json:"max_steps"`
	History       []turn         `json:"history"`
	Workspace     string         `json:"workspace"`
	Mode          string         `json:"mode"`
	ThinkingLevel string         `json:"thinking_level"`
	Intelligence  map[string]any `json:"intelligence"`
}

func chatHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, 405, map[string]string{"detail": "POST"})
		return
	}
	var req chatBody
	if err := readJSON(r, &req); err != nil {
		writeJSON(w, 400, map[string]string{"detail": "invalid json"})
		return
	}
	thinking := strings.ToLower(req.ThinkingLevel)
	if thinking == "" {
		thinking = "medium"
	}
	w.Header().Set("Content-Type", "application/x-ndjson")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	flusher, _ := w.(http.Flusher)
	emit := func(ev event) {
		if r.Context().Err() != nil {
			return
		}
		b, _ := json.Marshal(ev)
		_, _ = w.Write(append(b, '\n'))
		if flusher != nil {
			flusher.Flush()
		}
	}
	runTurn(req.Message, req.History, req.Mode, thinking, emit)
}

func voicesHandler(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"voices": []map[string]string{
			{"id": "browser-en", "name": "Browser English", "lang": "en-US", "gender": "neutral"},
			{"id": "browser-fr", "name": "Browser French", "lang": "fr-FR", "gender": "neutral"},
			{"id": "browser-es", "name": "Browser Spanish", "lang": "es-ES", "gender": "neutral"},
			{"id": "browser-ru", "name": "Browser Russian", "lang": "ru-RU", "gender": "neutral"},
		},
		"cached": true,
		"note":   "Neural Edge TTS needs Python. The chat page falls back to the browser speech engine.",
	})
}

func ttsHandler(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusNotImplemented, map[string]string{
		"detail": "TTS audio is not synthesized on the server. The browser speech engine is the voice.",
	})
}

func uploadDir() string {
	dir := filepath.Join(writableDir(), "uploads")
	_ = os.MkdirAll(dir, 0o755)
	return dir
}

func uploadHandler(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(8 << 20); err != nil {
		writeJSON(w, 400, map[string]string{"detail": "Upload failed: " + err.Error()})
		return
	}
	file, hdr, err := r.FormFile("file")
	if err != nil {
		writeJSON(w, 400, map[string]string{"detail": "Upload failed: missing file"})
		return
	}
	defer file.Close()
	ext := filepath.Ext(hdr.Filename)
	name := strconvHex(time.Now().UnixNano()) + ext
	dst := filepath.Join(uploadDir(), name)
	out, err := os.Create(dst)
	if err != nil {
		writeJSON(w, 500, map[string]string{"detail": "Upload failed: " + err.Error()})
		return
	}
	n, err := io.Copy(out, io.LimitReader(file, 8<<20))
	_ = out.Close()
	if err != nil {
		writeJSON(w, 500, map[string]string{"detail": "Upload failed: " + err.Error()})
		return
	}
	isImage := imageExt(ext)
	writeJSON(w, 200, map[string]any{
		"status": "ok", "filename": hdr.Filename, "saved_name": name,
		"url": "/static/uploads/" + name, "size": n, "is_image": isImage, "preview": nil,
	})
}

func imageExt(ext string) bool {
	switch strings.ToLower(ext) {
	case ".png", ".jpg", ".jpeg", ".gif", ".webp":
		return true
	default:
		return false
	}
}

func strconvHex(n int64) string {
	const hexdigits = "0123456789abcdef"
	var b [16]byte
	for i := 15; i >= 0; i-- {
		b[i] = hexdigits[n&0xf]
		n >>= 4
	}
	return string(b[:])
}

func providersHandler(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"providers": []map[string]any{
			{
				"id": "local", "name": "Local Go brain", "configured": true,
				"default_model": "potion-base-8M-int8", "models": []string{"potion-base-8M-int8"},
				"base_url": "in-process", "supports_vision": false, "supports_function_calling": true,
			},
			{
				"id": "xai", "name": "SpaceXAI", "configured": xaiKey() != "",
				"default_model": "grok-4.7", "models": []string{"grok-4.7"},
				"base_url": "https://api.x.ai/v1", "supports_vision": true, "supports_function_calling": true,
			},
		},
		"timestamp": float64(time.Now().UnixNano()) / 1e9,
	})
}

func ragDocsHandler(w http.ResponseWriter, r *http.Request) {
	docs := listRAG()
	writeJSON(w, 200, map[string]any{"total": len(docs), "documents": docs})
}

func ragIndexHandler(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Content  string         `json:"content"`
		Metadata map[string]any `json:"metadata"`
	}
	if err := readJSON(r, &body); err != nil || strings.TrimSpace(body.Content) == "" {
		writeJSON(w, 400, map[string]string{"detail": "Content cannot be empty."})
		return
	}
	doc := indexRAG(body.Content, body.Metadata)
	writeJSON(w, 200, map[string]any{
		"status": "indexed", "document_id": doc.ID, "embedding_dims": doc.Dims, "created_at": doc.CreatedAt,
	})
}

func ragSearchHandler(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Query    string  `json:"query"`
		TopK     int     `json:"top_k"`
		MinScore float64 `json:"min_score"`
	}
	if err := readJSON(r, &body); err != nil || strings.TrimSpace(body.Query) == "" {
		writeJSON(w, 400, map[string]string{"detail": "Query cannot be empty."})
		return
	}
	rows := searchRAG(body.Query, body.TopK, body.MinScore)
	writeJSON(w, 200, map[string]any{"query": body.Query, "matches_count": len(rows), "results": rows})
}

func guardHandler(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Text string `json:"text"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSON(w, 400, map[string]string{"detail": "invalid json"})
		return
	}
	writeJSON(w, 200, evaluateSafety(body.Text))
}

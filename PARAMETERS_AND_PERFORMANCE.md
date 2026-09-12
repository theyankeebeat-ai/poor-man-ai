# ⚡ Poor Man AI: Parameters, Latency & Performance Guide

This reference explains how adding parameters and features affects performance in **Poor Man AI**, and why adding configuration, UI, and agent controls will **not** cause lag.

---

## 1. Quick Answer: Will Adding Parameters Make It Slow?

* **Configuration & UI Parameters?** **NO.** (0% lag — takes < 0.2 ms to process).
* **Cloud / API Models (Gemini, Grok, OpenAI, Claude)?** **NO.** (Computed on remote clusters; your PC only streams tokens).
* **Agentic Tool Steps (`max_steps`)?** **YES, if set too high.** (Each extra tool run adds network/execution time).
* **Local Offline Neural Weights (1B vs 70B on GPU)?** **Only if your VRAM budget is exceeded.**

---

## 2. Parameter Category Breakdown

```
                    ┌────────────────────────────────────────────────────────────────────────┐
                    │                      PARAMETER & FEATURE TAXONOMY                      │
                    └────────────────────────────────────────────────────────────────────────┘
                                     │                                  │
            ┌────────────────────────┴─────────┐              ┌─────────┴────────────────────────┐
            ▼                                  ▼              ▼                                  ▼
┌───────────────────────┐ ┌─────────────────────────┐ ┌───────────────────┐ ┌────────────────────┐
│ Configuration & UI    │ │ Agentic Step Budget &   │ │ Cloud API Weights │ │ Local GPU Weights  │
│ (Temp, Thinking Level,│ │ Tool Loops (max_steps,  │ │ (Grok, Gemini,    │ │ (Ollama, GGUF,     │
│  TTS, Vision, Mode)   │ │  search, patch, verify) │ │  OpenAI, Claude)  │ │  AWQ, NF4, QLoRA)  │
├───────────────────────┤ ├─────────────────────────┤ ├───────────────────┤ ├────────────────────┤
│ ⚡ Latency: < 0.2 ms  │ │ ⏳ 0.5s - 2s per tool   │ │ 🚀 Constant speed │ │ ⚠️ Depends on VRAM │
│ 🧠 Impact: ZERO LAG   │ │ ⚙️ Dynamically budgeted │ │ 🌐 Remote compute │ │ 💾 INT4 = Snappy   │
│ 🎛️ Infinite controls  │ │    via Thinking Level   │ │ 🏎️ High throughput│ │ 🛑 CPU = Sluggish  │
└───────────────────────┘ └─────────────────────────┘ └───────────────────┘ └────────────────────┘
```

---

## 3. Comprehensive Feature & Parameter Reference Matrix

The following table covers all active and extendable parameters across the frontend, agent orchestrator, and neural engine:

| Category | Parameter / Feature | Range / Options | Performance & Latency Impact | Recommended Default |
|---|---|---|---|---|
| **Agent Reasoning** | `thinking_level` | `low`, `medium`, `high` | **Major impact on step count & depth.** Low skips chain-of-thought hops; High expands thorough multi-step checks. | `medium` (or `low` for instant chats) |
| **Agent Budget** | `max_steps` | `1` to `32` steps | **Direct latency driver.** Each step executes a tool (0.2s - 2s). Bounded dynamically by thinking level. | `5` (low), `8-10` (medium), `16-24` (deep) |
| **Agent Mode** | `mode` | `agent` vs `code` | **Zero lag overhead.** Switches prompt system and available tool surface (Research vs Workspace tools). | `agent` |
| **Sampling** | `temperature` | `0.0` to `2.0` | **Zero lag (< 0.1 ms).** Mathematical scaling of logits during token generation. | `0.7` |
| **Sampling** | `top_p` (Nucleus) | `0.0` to `1.0` | **Zero lag (< 0.1 ms).** Truncates cumulative probability distribution. | `0.95` |
| **Sampling** | `top_k` | `1` to `100` | **Zero lag (< 0.1 ms).** Caps candidate token pool size. | `40` |
| **Sampling** | `min_p` | `0.0` to `0.2` | **Zero lag (< 0.1 ms).** Filters tokens below relative threshold. | `0.05` |
| **Penalties** | `repetition_penalty` | `1.0` to `2.0` | **Zero lag (< 0.1 ms).** Prevents degenerative loops in long generations. | `1.1` |
| **Penalties** | `frequency_penalty` / `presence_penalty` | `-2.0` to `2.0` | **Zero lag (< 0.1 ms).** Discourages topic repetition. | `0.0` |
| **Token Budget** | `max_new_tokens` | `64` to `8192` | **Proportional to generation length.** Output streaming latency is determined by tokens/sec. | `2048` |
| **Context Window** | `context_window` | `2048` to `128k` | **Memory footprint.** Larger context increases KV-cache VRAM linearly. Cloud APIs handle this remotely. | `8192` |
| **Audio / TTS** | `voice` | Neural voice IDs (e.g. `en-US-AriaNeural`, `en-US-GuyNeural`) | **Zero local CPU lag.** Edge TTS voice list is cached for 1 hour to prevent API stampedes; synthesizes asynchronously in chunks. | `en-US-AriaNeural` |
| **Audio / TTS** | `rate` & `pitch` | `"-50%"` to `"+50%"`, `"-50Hz"` to `"+50Hz"` | **Zero lag.** Passed directly as SSML parameters. | `"+0%"`, `"+0Hz"` |
| **Speech-to-Text** | `isListening` | Toggle (Web Speech API) | **Zero server lag.** Client-side streaming speech recognition running on hardware audio DSP. | Off |
| **Multimodal Vision** | Screen Sharing Vision (`getDisplayMedia`) | Frame capture downsampled to 1024x768 JPEG | **Negligible.** Captures on user trigger or query; compression keeps payloads under 250 KB. | Off |
| **Web Retrieval** | `render_js` (Web Reader) | `true` vs `false` | **Noticeable on slow sites.** Fast HTTP fetch (~0.3s) vs full headless browser evaluation (~1.8s). | `false` (only enabled when scraping SPAs) |
| **Web Retrieval** | `max_chars` (Web Reader) | `2000` to `50000` chars | **Minimal.** Controls chunk trimming before prompt ingestion to protect context window. | `15000` |
| **Quantization** | `precision` | `FP16`, `INT8`, `INT4`, `NF4` | **Massive VRAM reduction.** INT4/NF4 cuts memory usage by ~75% vs FP16 with near-identical perplexity. | `INT4` (AWQ) |
| **Fine-Tuning** | LoRA rank `r` & `lora_alpha` | `r=8..64`, `alpha=16..128` | **Low training footprint.** Adapts < 1% of total model weights via low-rank decomposition. | `r=16`, `alpha=32` |
| **Fine-Tuning** | `optimizer` | `paged_adamw_8bit`, `adamw_torch` | **Huge VRAM protection.** 8-bit paged optimizer prevents out-of-memory spikes during gradient spikes. | `paged_adamw_8bit` |
| **Session Control** | Multi-Session Drawer & History | LocalStorage / IndexedDB | **Zero lag (< 1 ms).** Saves conversation checkpoints client-side without round-tripping. | Auto-saved |

---

## 4. Deep Dive by Architectural Category

### A. Configuration & UI Parameters (Zero Speed Cost)
When you add parameters to TypeScript (`TSX`) or Python (`FastAPI`), such as:
* `thinking_level` (`low`, `medium`, `high`)
* `temperature`, `top_p`, `top_k`, `min_p`, `repetition_penalty`
* Voice choices, speech pitch/rate, auto-speak toggles
* Session titles, workspace paths, themes, screen capture resolution
* Target module selections for LoRA (`q_proj`, `k_proj`, `v_proj`, `o_proj`, `gate_proj`, `up_proj`, `down_proj`)

**Why there is zero lag:**
* These are tiny key-value pairs in a JSON payload sent over localhost (`127.0.0.1`).
* Serializing and parsing them takes **less than 0.2 milliseconds**.
* In fact, setting `thinking_level: "low"` makes the system **significantly faster** because it restricts unnecessary reasoning hops and tool iterations.

---

### B. Agentic Tool Step Budget (`max_steps` & Tool Execution Loops)
When Poor Man AI runs an autonomous task, latency depends on **how many tools it calls**:
* **Step 1:** Search web (0.4s)
* **Step 2:** Read documentation URL (0.6s)
* **Step 3:** Workspace file inspection / patch apply (0.1s)
* **Step 4:** Run terminal test/command (0.8s)

**How Thinking Level balances speed vs thoroughness:**
* **Fast Mode (`low`):** Steps capped at 4–6. Skips exploratory loops, gives quick answers, and streams tokens in almost immediately.
* **Standard Mode (`medium`):** Steps set to 8–10. Balanced research, code validation, and execution.
* **Deep Mode (`high`):** Steps set to 16–24. Used for deep multi-agent debate, code refactoring, full test suites, and edge-case verification.

---

### C. Cloud API Models (Grok, Gemini, Claude, OpenAI)
* Whether a cloud model has 8 Billion or 1 Trillion parameters, **your computer does zero heavy lifting**.
* Your local machine only receives streaming tokens over HTTP chunked transfer. 
* Response speed depends on the provider's server load and your internet connection, not your PC specs.

---

### D. Local Offline Models (If Running Ollama / GGUF on Your Hardware)
If you run models locally on your own machine without APIs:
* **1B – 3B Models (e.g., Llama 3.2 1B / 3B in INT4/AWQ):**
  * Requires: ~1.5 GB – 2.5 GB VRAM.
  * Speed: 40–80 tokens/second (blazing fast).
* **7B – 8B Models (e.g., Llama 3.1 8B in INT4/Q4_K_M):**
  * Requires: ~5.5 GB – 6.5 GB VRAM.
  * Speed: 25–45 tokens/second (smooth and responsive).
* **14B – 70B Models:**
  * If the model fits in your GPU VRAM: fast.
  * If the model overflows into system RAM/CPU: **it will become slow/laggy** because system RAM bandwidth is 5x–10x slower than GPU VRAM.

---

### E. Memory Footprint & KV-Cache Estimation Formula
For local weights and runtime context, VRAM is calculated using:

$$\text{VRAM (GB)} \approx \left(\text{Total Parameters} \times \text{Bytes per Param} + \text{KV-Cache Bytes}\right) \times 1.15$$

Where:
* **INT4 / NF4:** 0.5 bytes / param
* **INT8:** 1.0 byte / param
* **FP16 / BF16:** 2.0 bytes / param
* **KV-Cache:** $2 \times \text{layers} \times \text{kv\_heads} \times \text{head\_dim} \times \text{context\_len} \times \text{batch\_size} \times \text{precision\_bytes}$

---

## 5. Best Practices for Keeping Poor Man AI Fast

1. **Keep Fast Mode as Default:** Use `Thinking: Fast` for daily chat and `Thinking: Deep` only when analyzing entire codebases or fixing complex multi-file bugs.
2. **Use Quantization for Local Models:** If running locally, always prefer `INT4`, `AWQ`, or `Q4_K_M` formats to keep memory footprint minimal.
3. **Turn Off Headless JS Rendering Unless Necessary:** Keep `render_js=false` for general web browsing; only activate it when fetching dynamic single-page applications (SPAs).
4. **Cache TTS Voice Queries:** Poor Man AI caches Edge TTS voice manifests for 1 hour to prevent network round-trip overhead on every speech trigger.
5. **Add As Many UI Features As You Want:** Adding tabs, sliders, voice toggles, copy buttons, or screen share docks in React/TypeScript adds **zero compute load** to the AI engine.

# ⚡ Poor Man AI: Parameters, Latency & Performance Guide

This reference explains how adding parameters affects performance in **Poor Man AI**, and why adding configuration, UI, and agent controls will **not** cause lag.

---

## 1. Quick Answer: Will Adding Parameters Make It Slow?

* **Configuration & UI Parameters?** **NO.** (0% lag — takes < 1 ms to process).
* **Cloud / API Models (Gemini, Grok, OpenAI)?** **NO.** (Computed on remote clusters; your PC only streams text).
* **Agentic Tool Steps (`max_steps`)?** **YES, if set too high.** (Each extra tool run adds network/execution time).
* **Local Offline Neural Weights (1B vs 70B on GPU)?** **Only if your VRAM is exceeded.**

---

## 2. Parameter Category Breakdown

```
                    ┌────────────────────────────────────────────────────────┐
                    │                    PARAMETER TYPES                     │
                    └────────────────────────────────────────────────────────┘
                                    │                       │
           ┌────────────────────────┴─────────┐   ┌─────────┴────────────────────────┐
           ▼                                  ▼   ▼                                  ▼
┌───────────────────────┐ ┌─────────────────────┐ ┌───────────────────┐ ┌────────────────────┐
│ Configuration / UI    │ │ Agentic Step Budget │ │ Cloud API Weights │ │ Local GPU Weights  │
│ (Temp, Thinking Level)│ │ (max_steps, loops)  │ │ (Grok, Gemini)    │ │ (Ollama, GGUF)     │
├───────────────────────┤ ├─────────────────────┤ ├───────────────────┤ ├────────────────────┤
│ ⚡ Latency: < 1ms     │ │ ⏳ 1-3s per tool run│ │ 🚀 Constant speed │ │ ⚠️ Depends on VRAM │
│ 🧠 Impact: ZERO LAG   │ │ ⚙️ Controlled via   │ │ 🌐 Remote compute │ │ 💾 INT4 = Snappy   │
│                       │ │    Thinking Level   │ │                   │ │ 🛑 CPU = Sluggish  │
└───────────────────────┘ └─────────────────────┘ └───────────────────┘ └────────────────────┘
```

---

## 3. Deep Dive by Category

### A. Configuration & UI Parameters (Zero Speed Cost)
When you add parameters to TypeScript (`TSX`) or Python (`FastAPI`), such as:
* `thinking_level` (`low`, `medium`, `high`)
* `temperature`, `top_p`, `top_k`, `repetition_penalty`
* Voice choices, speech pitch/rate
* Session titles, workspace paths, themes, screen capture resolution

**Why there is zero lag:**
* These are tiny key-value pairs in a JSON payload sent over localhost (`127.0.0.1`).
* Serializing and parsing them takes **less than 0.2 milliseconds**.
* In fact, setting `thinking_level: "low"` makes the system **faster** because it restricts unnecessary reasoning hops.

---

### B. Agentic Tool Step Budget (`max_steps` — The Only Thing That Adds Time)
When Poor Man AI runs an autonomous task, latency depends on **how many tools it calls**:
* **Step 1:** Search web (0.4s)
* **Step 2:** Read documentation URL (0.6s)
* **Step 3:** Run terminal test/command (0.8s)

**Why Thinking Level controls this:**
* **Fast Mode (`low`):** Steps capped at 5–6. Answers stream in almost immediately.
* **Standard Mode (`medium`):** Steps set to 10. Balanced research and execution.
* **Deep Mode (`high`):** Steps set to 16–18. Used for complex code debugging where thoroughness matters more than raw speed.

---

### C. Cloud API Models (Grok, Gemini, Claude)
* Whether a cloud model has 8 Billion or 1 Trillion parameters, **your computer does zero heavy lifting**.
* Your local machine only receives streaming tokens over HTTP. 
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

## 4. Best Practices for Keeping Poor Man AI Fast

1. **Keep Fast Mode as Default:** Use `Thinking: Fast` for general questions and `Thinking: Deep` only when analyzing entire codebases or fixing complex bugs.
2. **Use Quantization for Local Models:** If running locally, always prefer `INT4`, `AWQ`, or `Q4_K_M` formats to keep memory footprint minimal.
3. **Add As Many UI Features As You Want:** Adding tabs, sliders, voice toggles, copy buttons, or screen share docks in React/TypeScript adds **zero compute load** to the AI engine.

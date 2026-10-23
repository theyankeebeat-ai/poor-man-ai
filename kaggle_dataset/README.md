# 📊 Datasheet for Dataset: Poor Man AI Autonomous Agent Telemetry & Reasoning Traces

Following the standardized **Datasheets for Datasets** framework (*Gebru et al., Communications of the ACM, 2021*), this document provides comprehensive documentation on the motivation, composition, collection process, sanitization, recommended uses, and distribution of the Poor Man AI dataset hosted on Kaggle.

---

## 1. 🎯 Motivation

- **For what purpose was the dataset created?**  
  The dataset was created to provide transparent, empirical telemetry and behavioral traces from **Poor Man AI**—an autonomous multi-agent orchestrator operating under zero-cost / heuristic routing and multi-provider LLM environments. It enables researchers, ML engineers, and Kaggle data scientists to study agent tool selection, autonomous coding actions, knowledge persistence, and continuous self-learning.

- **Who created the dataset?**  
  The Poor Man AI engineering team, capturing production-grade traces from autonomous agent execution sessions, workspace coding operations, and research routines.

- **Who funded the creation of the dataset?**  
  Self-funded open-source initiative dedicated to accessible, resource-efficient autonomous AI systems.

---

## 2. 🧩 Dataset Composition & Schema

The dataset is partitioned into agent telemetry tables plus tables exported from the local `hf/` snapshot (`prajjwal1/bert-tiny` and WikiText-2). Telemetry tables are available in **CSV** and **JSONL**. Hugging Face tables are CSV.

### A. `code_audit_telemetry.csv` (268+ rows)
Audit log of every autonomous workspace operation invoked by the agent during code engineering tasks.
- `id` *(Integer)*: Sequential record identifier.
- `timestamp` *(ISO 8601 UTC)*: Execution timestamp.
- `operation_type` *(String)*: Action executed (`apply_patch`, `run_cmd`, `write_file`, etc.).
- `command` *(String)*: Sanitized CLI command executed in the sandbox.
- `target_path` *(String)*: Relative target file path (sanitized of host absolute user directories).
- `working_directory` *(String)*: Relative sandbox working directory.
- `has_command` *(Binary 0/1)*: Flag indicating if the operation invoked a CLI shell command.
- `has_path` *(Binary 0/1)*: Flag indicating if the operation mutated a file.

### B. `memory_knowledge_facts.csv` (91+ rows)
Persistent factual knowledge nodes stored in memory across autonomous research sessions.
- `id` *(Integer)*: Sequential memory index.
- `timestamp` *(ISO 8601 UTC)*: Acquisition timestamp.
- `category` *(String)*: Deduced domain (`weather`, `sports`, `economics`, `coding`, `general`).
- `fact_length` *(Integer)*: Character count of the retained knowledge item.
- `fact_text` *(String)*: Structured factual knowledge statement.
- `source_url` *(String)*: Primary ground-truth citation URL.
- `has_citation` *(Binary 0/1)*: Grounded citation flag.

### C. `self_learning_rules.csv` (Distilled SOPs)
Distilled feedback heuristics extracted by the agent when receiving user corrections or refined research queries.
- `id` *(Integer)*: Rule identifier.
- `timestamp` *(ISO 8601 UTC)*: Distillation timestamp.
- `query` *(String)*: Originating user prompt or task.
- `kind` *(String)*: Rule genre (`sports`, `economics`, `followup`, `style`).
- `rule` *(String)*: Distilled operational constraint or heuristic rule.
- `sources_count` *(Integer)*: Number of verified reference citations.
- `sources` *(String)*: Semicolon-separated URLs grounding the rule.

### D. `cache_telemetry.csv` (21+ rows)
Key-value response cache performance, payload sizes, and expiration mechanics.
- `id` *(Integer)*: Cache entry ID.
- `cache_key_hash` *(String)*: Deterministic hashed cache key.
- `payload_size_bytes` *(Integer)*: Serialized payload size in bytes.
- `expiration_timestamp` *(Float)*: POSIX timestamp when TTL expires.
- `is_expired` *(Binary 0/1)*: Expiration status at extraction time.

### E. `neuron_routing_topology.csv` (14 rows)
Architectural parameters of the 14-bank heuristic neural router that powers zero-cost agent dispatch.
- `network_id` *(String)*: Bank identifier (`math_bank`, `weather_bank`, `coding_workspace_bank`, etc.).
- `specialist` *(String)*: Role and functional description of the specialist agent.
- `input_dim` *(Integer)*: Locality-sensitive embedding input dimension (64).
- `hidden_dim` *(Integer)*: Hidden layer neuron width (32).
- `output_dim` *(Integer)*: Output activation dimension (1).
- `threshold` *(Float)*: Activation confidence threshold required for autonomous dispatch.
- `priority` *(Integer)*: Heuristic arbitration priority rank (1–10).
- `parameter_count` *(Integer)*: Total trainable parameter footprint per routing network.

### F. `safety_guardrails_benchmark.csv` (12 rows)
Evaluator test suite for adversarial prompt injection (DAN, filter bypass) and PII redaction.
- `id` *(Integer)*: Test case ID.
- `prompt` *(String)*: Input test prompt.
- `type` *(String)*: Category (`adversarial_jailbreak`, `pii_leakage`, `benign_math`, etc.).
- `target_label` *(String)*: Ground-truth safety label (`blocked`, `redacted`, `allowed`).
- `risk_severity` *(String)*: Risk level (`critical`, `high`, `medium`, `none`).

### G. `hf_bert_tiny_model.csv` and `hf_bert_tiny_parameters.csv`
Local snapshot of [prajjwal1/bert-tiny](https://huggingface.co/prajjwal1/bert-tiny) under `hf/prajjwal1-bert-tiny`.
- Model card row: hidden size 128, 2 layers, 2 heads, intermediate size 512, vocab 30,522.
- `parameter_count`: encoder parameters counted from `config.json` (about 4.39 million). The weight file is `pytorch_model.bin` and stays under 25 MB.
- Parameter groups: embeddings, each encoder layer, and the pooler. The raw pickle weights are not copied into the Kaggle tables.
- `hf_tokenizer_vocab.csv`: one row per line of `vocab.txt` (`token_id`, `token`, special-token and `##` flags).

### H. `hf_wikitext_splits.csv` and `hf_wikitext_sample.csv`
Local snapshot of [Salesforce/wikitext](https://huggingface.co/datasets/Salesforce/wikitext) config `wikitext-2-raw-v1` under `hf/wikitext-2-raw-v1`.
- One row per split (`train`, `validation`, `test`) with parquet byte size, row count, non-empty row count, and character count.
- `hf_wikitext_sample.csv` keeps short excerpts. The full parquet files stay in `hf/`.

---

## 3. 🔬 Collection Process

- **Methodology**: Data was programmatically streamed during autonomous agent loops, code editing tasks, and web research sessions.
- **Tools**: Captured via SQLite WAL databases (`memory.sqlite`, `cache.sqlite`) and JSONL loggers (`code-audit.jsonl`, `lessons.jsonl`).
- **Hugging Face snapshot**: `scripts/prepare_kaggle_dataset.py` also reads `hf/prajjwal1-bert-tiny` (`config.json`, `vocab.txt`, `pytorch_model.bin` size) and `hf/wikitext-2-raw-v1` parquet splits.
- **Timeframe**: Traces span multi-day operational usage across September 2026. The Hugging Face files are the public BERT-tiny checkpoint and WikiText-2 raw v1.

---

## 4. 🧼 Preprocessing & Data Sanitization

- **PII Scrubbing**: Regex filters automatically scrub personal emails, credit card patterns, social security numbers, and bearer/API keys.
- **Path Anonymization**: Absolute local paths (e.g. `C:\Users\...` or `/home/...`) are scrubbed and normalized to standardized sandbox paths (`~/workspace/...`).
- **Normalization**: Timestamps are standardized to ISO 8601 UTC strings. Character encodings are validated as UTF-8.

---

## 5. 💡 Intended Uses & Kaggle Tasks

- **Supervised Classification**: Train models to predict the appropriate specialist routing bank (`network_id`) from incoming user queries.
- **Agent Trajectory Modeling**: Analyze sequential tool usage patterns in autonomous software engineering.
- **Safety & Jailbreak Detection**: Benchmark text classifiers on prompt injection detection.
- **Exploratory Data Analysis (EDA)**: Uncover latency, payload sizes, and citation ground-truth distributions.

> **Unsuitable Use Cases**: Do not use to train malicious script generation or bypass production safety filters.

---

## 6. 📦 Distribution & Licensing

- **License**: Creative Commons Attribution 4.0 International (CC-BY-4.0).
- **Format**: Standard CSV (RFC 4180 compliant) and JSONL.
- **Hosting**: Kaggle Datasets & GitHub repository.

---

## 7. 🛠️ Maintenance & Reproducibility

- **Pipeline Script**: The dataset can be re-generated and updated from live agent telemetry at any time by executing:
  ```powershell
  python scripts/prepare_kaggle_dataset.py
  ```
- **Updates**: Incremental releases correspond to agent runtime sessions and new heuristic rule discoveries.

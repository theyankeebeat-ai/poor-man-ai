"""Poor Man AI Architecture & Parameter Engine.

Provides:
- Architecture specifications (Transformer, Mixture-of-Experts, Mamba/SSM, TinyNet routing).
- Hyperparameter configurations and presets (Inference, Fine-Tuning, Quantization).
- Quantization configurations (FP16, INT8, INT4 AWQ/GPTQ, NF4, QLoRA).
- Fine-Tuning configurations (Full, LoRA, QLoRA, DPO, PPO).
- Model parameter and memory calculator.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


class Precision(str, Enum):
    FP32 = "fp32"
    FP16 = "fp16"
    BF16 = "bf16"
    INT8 = "int8"
    INT4 = "int4"
    NF4 = "nf4"


class ModelFamily(str, Enum):
    TRANSFORMER_DECODER = "transformer_decoder"
    MIXTURE_OF_EXPERTS = "moe"
    STATE_SPACE_MAMBA = "mamba_ssm"
    TINY_NEURON_ROUTER = "tiny_neuron_router"


@dataclass
class ArchitectureSpec:
    name: str
    family: ModelFamily
    hidden_dim: int
    num_layers: int
    num_attention_heads: int
    num_kv_heads: int
    vocab_size: int
    max_context_length: int
    intermediate_dim: int
    num_experts: int = 1
    active_experts: int = 1
    norm_type: str = "RMSNorm"
    activation: str = "SwiGLU"
    rope_theta: float = 10000.0
    tie_word_embeddings: bool = False
    sliding_window: int = 0
    qk_norm: bool = False
    use_flash_attn: bool = True
    dropout: float = 0.0
    attention_dropout: float = 0.0

    def estimate_parameter_count(self) -> int:
        embed_params = self.vocab_size * self.hidden_dim
        head_dim = self.hidden_dim // max(1, self.num_attention_heads)
        q_proj = self.hidden_dim * (self.num_attention_heads * head_dim)
        k_proj = self.hidden_dim * (self.num_kv_heads * head_dim)
        v_proj = self.hidden_dim * (self.num_kv_heads * head_dim)
        out_proj = (self.num_attention_heads * head_dim) * self.hidden_dim
        attn_params = q_proj + k_proj + v_proj + out_proj
        
        mlp_params = 3 * (self.hidden_dim * self.intermediate_dim) * self.num_experts
        norm_params = 2 * self.hidden_dim
        
        per_layer = attn_params + mlp_params + norm_params
        total_layer_params = per_layer * self.num_layers
        
        lm_head_params = 0 if self.tie_word_embeddings else (self.vocab_size * self.hidden_dim)
        final_norm = self.hidden_dim
        
        return int(embed_params + total_layer_params + lm_head_params + final_norm)

    def estimate_vram_gb(self, precision: Precision, kv_cache_batch: int = 1) -> float:
        bytes_per_param = {
            Precision.FP32: 4.0,
            Precision.FP16: 2.0,
            Precision.BF16: 2.0,
            Precision.INT8: 1.0,
            Precision.INT4: 0.5,
            Precision.NF4: 0.5,
        }[precision]

        total_params = self.estimate_parameter_count()
        weight_bytes = total_params * bytes_per_param
        
        head_dim = self.hidden_dim // max(1, self.num_attention_heads)
        kv_cache_bytes = (
            2 * self.num_layers * self.num_kv_heads * head_dim * self.max_context_length * kv_cache_batch * (2.0 if precision in (Precision.FP16, Precision.BF16, Precision.FP32) else 1.0)
        )
        
        total_gb = (weight_bytes + kv_cache_bytes) / (1024 ** 3)
        return round(total_gb * 1.15, 2)


@dataclass
class Hyperparameters:
    temperature: float = 0.7
    top_p: float = 0.95
    top_k: int = 40
    min_p: float = 0.05
    repetition_penalty: float = 1.1
    frequency_penalty: float = 0.0
    presence_penalty: float = 0.0
    max_new_tokens: int = 2048
    context_window: int = 8192
    seed: Optional[int] = 42
    reasoning_effort: str = "medium"
    # Agent intelligence knobs (wired into /chat, not studio-only)
    verify_claims: bool = True
    self_critique: bool = False
    require_citations: bool = True
    consensus_search: bool = False
    coverage_threshold: float = 0.55
    max_plan_tools: int = 4
    memory_snippets: int = 6
    use_crew: bool = True
    planner_temperature: float = 0.1
    writer_temperature: float = 0.2


@dataclass
class QuantizationConfig:
    enabled: bool = True
    precision: Precision = Precision.INT4
    quant_method: str = "awq"  # awq, gptq, bitsandbytes, gguf
    group_size: int = 128
    zero_point: bool = True
    damp_percent: float = 0.01
    compute_dtype: Precision = Precision.FP16
    double_quant: bool = True
    act_order: bool = True


@dataclass
class FineTuningConfig:
    method: str = "qlora"  # lora, qlora, full, dpo
    r: int = 16
    lora_alpha: int = 32
    lora_dropout: float = 0.05
    target_modules: List[str] = field(default_factory=lambda: ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"])
    learning_rate: float = 2e-4
    warmup_ratio: float = 0.03
    batch_size: int = 4
    gradient_accumulation_steps: int = 4
    num_train_epochs: int = 3
    weight_decay: float = 0.01
    optimizer: str = "paged_adamw_8bit"
    lr_scheduler_type: str = "cosine"
    max_grad_norm: float = 0.3
    dataset_path: str = "server/data/memory.jsonl"
    eval_steps: int = 50
    save_steps: int = 100


PRESET_ARCHITECTURES: Dict[str, ArchitectureSpec] = {
    "poor_man_1b": ArchitectureSpec(
        name="PoorMan-Mini-1B",
        family=ModelFamily.TRANSFORMER_DECODER,
        hidden_dim=2048,
        num_layers=16,
        num_attention_heads=16,
        num_kv_heads=4,
        vocab_size=32000,
        max_context_length=8192,
        intermediate_dim=5632,
    ),
    "poor_man_3b": ArchitectureSpec(
        name="PoorMan-Standard-3B",
        family=ModelFamily.TRANSFORMER_DECODER,
        hidden_dim=3072,
        num_layers=28,
        num_attention_heads=24,
        num_kv_heads=8,
        vocab_size=32000,
        max_context_length=16384,
        intermediate_dim=8192,
        qk_norm=True,
        use_flash_attn=True,
    ),
    "poor_man_7b": ArchitectureSpec(
        name="PoorMan-Thinker-7B",
        family=ModelFamily.TRANSFORMER_DECODER,
        hidden_dim=4096,
        num_layers=32,
        num_attention_heads=32,
        num_kv_heads=8,
        vocab_size=128256,
        max_context_length=32768,
        intermediate_dim=14336,
        rope_theta=500000.0,
        qk_norm=True,
        use_flash_attn=True,
        sliding_window=8192,
    ),
    "poor_man_moe_8x1b": ArchitectureSpec(
        name="PoorMan-MoE-8x1B",
        family=ModelFamily.MIXTURE_OF_EXPERTS,
        hidden_dim=2048,
        num_layers=24,
        num_attention_heads=16,
        num_kv_heads=4,
        vocab_size=32000,
        max_context_length=32768,
        intermediate_dim=5632,
        num_experts=8,
        active_experts=2,
    ),
    "poor_man_router_10x12": ArchitectureSpec(
        name="PoorMan-NeuralBank-Router",
        family=ModelFamily.TINY_NEURON_ROUTER,
        hidden_dim=32,
        num_layers=3,
        num_attention_heads=1,
        num_kv_heads=1,
        vocab_size=14,
        max_context_length=512,
        intermediate_dim=16,
    )
}

PRESET_HYPERPARAMETERS: Dict[str, Hyperparameters] = {
    "creative_chat": Hyperparameters(
        temperature=0.85,
        top_p=0.92,
        top_k=50,
        repetition_penalty=1.08,
        reasoning_effort="low"
    ),
    "precise_code": Hyperparameters(
        temperature=0.15,
        top_p=0.95,
        top_k=20,
        repetition_penalty=1.05,
        reasoning_effort="high"
    ),
    "deep_research": Hyperparameters(
        temperature=0.35,
        top_p=0.90,
        top_k=40,
        repetition_penalty=1.12,
        reasoning_effort="high",
        verify_claims=True,
        self_critique=True,
        require_citations=True,
        consensus_search=True,
        coverage_threshold=0.70,
        max_plan_tools=6,
        memory_snippets=10,
        writer_temperature=0.25,
    ),
    "fast_heuristic": Hyperparameters(
        temperature=0.0,
        top_p=1.0,
        top_k=1,
        repetition_penalty=1.0,
        reasoning_effort="low",
        verify_claims=False,
        self_critique=False,
        require_citations=False,
        consensus_search=False,
        coverage_threshold=0.35,
        max_plan_tools=2,
        memory_snippets=3,
        use_crew=False,
        writer_temperature=0.0,
    ),
    "smarter_agent": Hyperparameters(
        temperature=0.22,
        top_p=0.90,
        top_k=30,
        min_p=0.04,
        repetition_penalty=1.12,
        reasoning_effort="high",
        verify_claims=True,
        self_critique=True,
        require_citations=True,
        consensus_search=True,
        coverage_threshold=0.72,
        max_plan_tools=6,
        memory_snippets=12,
        use_crew=True,
        planner_temperature=0.05,
        writer_temperature=0.18,
        max_new_tokens=3072,
        context_window=16384,
    ),
}


THINKING_DEFAULTS: Dict[str, Hyperparameters] = {
    "low": PRESET_HYPERPARAMETERS["fast_heuristic"],
    "medium": Hyperparameters(),
    "high": PRESET_HYPERPARAMETERS["smarter_agent"],
}


def resolve_intelligence(thinking_level: str | None = "medium", overrides: Optional[Dict[str, Any]] = None) -> Hyperparameters:
    """Merge thinking-level defaults with optional request/studio overrides."""
    base = THINKING_DEFAULTS.get((thinking_level or "medium").lower(), THINKING_DEFAULTS["medium"])
    data = asdict(base)
    data["reasoning_effort"] = (thinking_level or "medium").lower()
    if overrides:
        for k, v in overrides.items():
            if v is None or k not in data:
                continue
            data[k] = v
    return Hyperparameters(**data)


def intelligence_prompt_extras(hp: Hyperparameters) -> str:
    bits = [
        f"thinking_effort={hp.reasoning_effort}",
        f"coverage_min={hp.coverage_threshold}",
        f"max_plan_tools={hp.max_plan_tools}",
        f"verify_claims={'on' if hp.verify_claims else 'off'}",
        f"self_critique={'on' if hp.self_critique else 'off'}",
        f"citations={'required' if hp.require_citations else 'optional'}",
        f"consensus={'on' if hp.consensus_search else 'off'}",
        f"crew={'on' if hp.use_crew else 'off'}",
    ]
    rules: List[str] = []
    if hp.require_citations:
        rules.append("Cite source URLs for factual claims; do not invent links.")
    if hp.verify_claims:
        rules.append("Before final_answer, sanity-check numbers, tickers, and dates against observations.")
    if hp.self_critique:
        rules.append("After drafting, silently critique: missed edge cases, contradictions, missing citations — then fix.")
    if hp.consensus_search:
        rules.append("Prefer multi-source tools (financial_compare, gap_search, compare_sources) over a single hit.")
    if hp.reasoning_effort == "high":
        rules.append("High effort: verify code/lint, cross-check citations, handle edge cases before stopping.")
    elif hp.reasoning_effort == "low":
        rules.append("Low effort: concise answer, skip exploratory tool hops unless required.")
    return "Intelligence: " + ", ".join(bits) + "." + ((" " + " ".join(rules)) if rules else "")


RECOMMENDED_ARCH_KEY = "poor_man_1b"


def runtime_profile() -> Dict[str, Any]:
    """Active runtime for low-end PCs: 1B INT4 + Fast thinking + local heuristics."""
    hp = PRESET_HYPERPARAMETERS["fast_heuristic"]
    bp = get_architecture_blueprint(RECOMMENDED_ARCH_KEY)
    return {
        "id": "low_end_fast",
        "arch_key": RECOMMENDED_ARCH_KEY,
        "name": bp["spec"]["name"],
        "formatted_params": bp["formatted_params"],
        "precision": "int4",
        "quant_method": "awq",
        "thinking_level": "low",
        "preset": "fast_heuristic",
        "max_steps": 5,
        "int4_gb": bp["memory_estimates"]["int4_gb"],
        "hyperparameters": asdict(hp),
        "reason": (
            "PoorMan-Mini-1B in INT4 AWQ (~0.60 GB). Fastest blueprint that still "
            "fits a low-end PC; Fast thinking skips crew, critique, and extra tool hops."
        ),
    }


def get_architecture_blueprint(arch_key: str) -> Dict[str, Any]:
    spec = PRESET_ARCHITECTURES.get(arch_key, PRESET_ARCHITECTURES["poor_man_1b"])
    raw_params = spec.estimate_parameter_count()
    return {
        "key": arch_key,
        "recommended": arch_key == RECOMMENDED_ARCH_KEY,
        "spec": asdict(spec),
        "total_parameters": raw_params,
        "formatted_params": f"{raw_params / 1e9:.2f}B" if raw_params >= 1e9 else f"{raw_params / 1e6:.1f}M",
        "memory_estimates": {
            "fp16_gb": spec.estimate_vram_gb(Precision.FP16),
            "int8_gb": spec.estimate_vram_gb(Precision.INT8),
            "int4_gb": spec.estimate_vram_gb(Precision.INT4),
        }
    }


def list_all_blueprints() -> List[Dict[str, Any]]:
    return [get_architecture_blueprint(k) for k in PRESET_ARCHITECTURES.keys()]

export type PrecisionType = 'fp32' | 'fp16' | 'bf16' | 'int8' | 'int4' | 'nf4';
export type ModelFamilyType = 'transformer_decoder' | 'moe' | 'mamba_ssm' | 'tiny_neuron_router';

export interface ArchitectureSpec {
  name: string;
  family: ModelFamilyType;
  hidden_dim: number;
  num_layers: number;
  num_attention_heads: number;
  num_kv_heads: number;
  vocab_size: number;
  max_context_length: number;
  intermediate_dim: number;
  num_experts: number;
  active_experts: number;
  norm_type: string;
  activation: string;
  rope_theta: number;
  tie_word_embeddings: boolean;
  sliding_window: number;
  qk_norm: boolean;
  use_flash_attn: boolean;
  dropout: number;
  attention_dropout: number;
}

export interface ArchitectureBlueprint {
  key: string;
  recommended?: boolean;
  spec: ArchitectureSpec;
  total_parameters: number;
  formatted_params: string;
  memory_estimates: {
    fp16_gb: number;
    int8_gb: number;
    int4_gb: number;
  };
}

export interface HyperparametersConfig {
  temperature: number;
  top_p: number;
  top_k: number;
  min_p: number;
  repetition_penalty: number;
  frequency_penalty: number;
  presence_penalty: number;
  max_new_tokens: number;
  context_window: number;
  seed?: number;
  reasoning_effort: 'low' | 'medium' | 'high';
  verify_claims: boolean;
  self_critique: boolean;
  require_citations: boolean;
  consensus_search: boolean;
  coverage_threshold: number;
  max_plan_tools: number;
  memory_snippets: number;
  use_crew: boolean;
  planner_temperature: number;
  writer_temperature: number;
}

export const INTEL_STORAGE_KEY = 'poor_man_ai_intelligence_v2';

/** Low-end PC default: 1B INT4 Fast heuristic — few tool hops, no crew. */
export const DEFAULT_HYPERPARAMS: HyperparametersConfig = {
  temperature: 0.0,
  top_p: 1.0,
  top_k: 1,
  min_p: 0.05,
  repetition_penalty: 1.0,
  frequency_penalty: 0.0,
  presence_penalty: 0.0,
  max_new_tokens: 1024,
  context_window: 4096,
  seed: 42,
  reasoning_effort: 'low',
  verify_claims: false,
  self_critique: false,
  require_citations: false,
  consensus_search: false,
  coverage_threshold: 0.35,
  max_plan_tools: 2,
  memory_snippets: 3,
  use_crew: false,
  planner_temperature: 0.0,
  writer_temperature: 0.0
};

export function intelligencePayload(hp: HyperparametersConfig) {
  return {
    temperature: hp.temperature,
    top_p: hp.top_p,
    top_k: hp.top_k,
    max_new_tokens: hp.max_new_tokens,
    verify_claims: hp.verify_claims,
    self_critique: hp.self_critique,
    require_citations: hp.require_citations,
    consensus_search: hp.consensus_search,
    coverage_threshold: hp.coverage_threshold,
    max_plan_tools: hp.max_plan_tools,
    memory_snippets: hp.memory_snippets,
    use_crew: hp.use_crew,
    planner_temperature: hp.planner_temperature,
    writer_temperature: hp.writer_temperature
  };
}

export interface QuantizationConfig {
  enabled: boolean;
  precision: PrecisionType;
  quant_method: 'awq' | 'gptq' | 'bitsandbytes' | 'gguf';
  group_size: number;
  zero_point: boolean;
  damp_percent: number;
  compute_dtype: PrecisionType;
  double_quant: boolean;
  act_order: boolean;
}

export interface FineTuningConfig {
  method: 'lora' | 'qlora' | 'full' | 'dpo';
  r: number;
  lora_alpha: number;
  lora_dropout: number;
  target_modules: string[];
  learning_rate: number;
  warmup_ratio: number;
  batch_size: number;
  gradient_accumulation_steps: number;
  num_train_epochs: number;
  weight_decay: number;
  optimizer: string;
  lr_scheduler_type: string;
  max_grad_norm: number;
  dataset_path: string;
  eval_steps: number;
  save_steps: number;
}

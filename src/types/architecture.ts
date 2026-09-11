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
}

export interface ArchitectureBlueprint {
  key: string;
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

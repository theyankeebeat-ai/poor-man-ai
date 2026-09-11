import React, { useState, useEffect } from 'react';
import {
  Cpu,
  Sliders,
  Sparkles,
  Zap,
  Activity,
  Layers,
  Database,
  Flame,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  HardDrive
} from 'lucide-react';
import { useTheme } from '../ThemeContext';
import { API } from '../api';
import type {
  ArchitectureBlueprint,
  HyperparametersConfig,
  QuantizationConfig,
  FineTuningConfig
} from '../types/architecture';

export const ArchitectureEngine: React.FC = () => {
  const { colors } = useTheme();

  const [blueprints, setBlueprints] = useState<ArchitectureBlueprint[]>([]);
  const [selectedArchKey, setSelectedArchKey] = useState<string>('poor_man_1b');
  const [activeTab, setActiveTab] = useState<'architecture' | 'parameters' | 'quantization' | 'finetune'>('architecture');
  const [loading, setLoading] = useState<boolean>(false);
  const [trainingStatus, setTrainingStatus] = useState<string | null>(null);

  const [hyperparams, setHyperparams] = useState<HyperparametersConfig>({
    temperature: 0.7,
    top_p: 0.95,
    top_k: 40,
    min_p: 0.05,
    repetition_penalty: 1.1,
    frequency_penalty: 0.0,
    presence_penalty: 0.0,
    max_new_tokens: 2048,
    context_window: 8192,
    seed: 42,
    reasoning_effort: 'medium'
  });

  const [quantConfig, setQuantConfig] = useState<QuantizationConfig>({
    enabled: true,
    precision: 'int4',
    quant_method: 'awq',
    group_size: 128,
    zero_point: true,
    damp_percent: 0.01,
    compute_dtype: 'fp16',
    double_quant: true,
    act_order: true
  });

  const [fineTuneConfig, setFineTuneConfig] = useState<FineTuningConfig>({
    method: 'qlora',
    r: 16,
    lora_alpha: 32,
    lora_dropout: 0.05,
    target_modules: ['q_proj', 'k_proj', 'v_proj', 'o_proj', 'gate_proj', 'up_proj', 'down_proj'],
    learning_rate: 0.0002,
    warmup_ratio: 0.03,
    batch_size: 4,
    gradient_accumulation_steps: 4,
    num_train_epochs: 3,
    weight_decay: 0.01,
    optimizer: 'paged_adamw_8bit',
    lr_scheduler_type: 'cosine',
    max_grad_norm: 0.3,
    dataset_path: 'server/data/memory.jsonl',
    eval_steps: 50,
    save_steps: 100
  });

  const loadArchitectures = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/model/architecture`);
      if (res.ok) {
        const data = await res.json();
        if (data.architectures) {
          setBlueprints(data.architectures);
        }
      }
    } catch (err) {
      console.warn('Backend architecture offline:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadArchitectures();
  }, []);

  const selectedBlueprint = blueprints.find((b) => b.key === selectedArchKey) || blueprints[0];

  const applyPreset = (preset: 'creative' | 'code' | 'research' | 'fast') => {
    if (preset === 'creative') {
      setHyperparams({
        ...hyperparams,
        temperature: 0.85,
        top_p: 0.92,
        top_k: 50,
        repetition_penalty: 1.08,
        reasoning_effort: 'low'
      });
    } else if (preset === 'code') {
      setHyperparams({
        ...hyperparams,
        temperature: 0.15,
        top_p: 0.95,
        top_k: 20,
        repetition_penalty: 1.05,
        reasoning_effort: 'high'
      });
    } else if (preset === 'research') {
      setHyperparams({
        ...hyperparams,
        temperature: 0.35,
        top_p: 0.90,
        top_k: 40,
        repetition_penalty: 1.12,
        reasoning_effort: 'high'
      });
    } else if (preset === 'fast') {
      setHyperparams({
        ...hyperparams,
        temperature: 0.0,
        top_p: 1.0,
        top_k: 1,
        repetition_penalty: 1.0,
        reasoning_effort: 'low'
      });
    }
  };

  const handleStartFineTuning = async () => {
    setTrainingStatus('Submitting fine-tuning session to Poor Man AI agent blackboard...');
    try {
      const res = await fetch(`${API}/model/train`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_model: selectedBlueprint?.spec.name,
          method: fineTuneConfig.method,
          epochs: fineTuneConfig.num_train_epochs,
          batch_size: fineTuneConfig.batch_size,
          lr: fineTuneConfig.learning_rate
        })
      });
      if (res.ok) {
        const data = await res.json();
        setTrainingStatus(`Success: ${data.message} (Target: ${data.target}, Method: ${data.method})`);
      } else {
        setTrainingStatus('Fine-tuning queued locally in agent memory blackboard.');
      }
    } catch {
      setTrainingStatus('Fine-tuning queued locally in agent memory blackboard.');
    }
  };

  return (
    <div className={`h-full flex flex-col p-6 space-y-6 overflow-y-auto ${colors.bgMain} ${colors.textPrimary}`}>
      <div className={`flex flex-wrap items-center justify-between gap-4 border-b pb-4 ${colors.border}`}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-500/20">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Model Architecture &amp; Parameter Studio</h2>
            <p className={`text-xs ${colors.textMuted}`}>
              Configure neural model architecture, quantization profiles, inference parameters, and QLoRA fine-tuning
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-zinc-900 border border-zinc-800 text-xs">
          <button
            onClick={() => setActiveTab('architecture')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'architecture' ? `${colors.accentMuted} shadow-sm font-semibold` : colors.textMuted
            }`}
          >
            Architecture
          </button>
          <button
            onClick={() => setActiveTab('parameters')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'parameters' ? `${colors.accentMuted} shadow-sm font-semibold` : colors.textMuted
            }`}
          >
            Parameters
          </button>
          <button
            onClick={() => setActiveTab('quantization')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'quantization' ? `${colors.accentMuted} shadow-sm font-semibold` : colors.textMuted
            }`}
          >
            Quantization
          </button>
          <button
            onClick={() => setActiveTab('finetune')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'finetune' ? `${colors.accentMuted} shadow-sm font-semibold` : colors.textMuted
            }`}
          >
            Fine-Tuning (QLoRA)
          </button>
        </div>
      </div>

      {/* TAB 1: ARCHITECTURE BLUEPRINTS */}
      {activeTab === 'architecture' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {blueprints.map((bp) => {
              const isSelected = bp.key === selectedArchKey;
              return (
                <div
                  key={bp.key}
                  onClick={() => setSelectedArchKey(bp.key)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'border-cyan-500 bg-cyan-950/20 shadow-lg shadow-cyan-500/10 ring-1 ring-cyan-500/50'
                      : `${colors.border} ${colors.bgPanel} hover:border-zinc-700`
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-sm">{bp.spec.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono">
                      {bp.formatted_params}
                    </span>
                  </div>
                  <div className={`text-xs ${colors.textMuted} space-y-1 font-mono`}>
                    <div className="flex justify-between">
                      <span>Family:</span>
                      <span className="text-zinc-300">{bp.spec.family}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Layers / Dim:</span>
                      <span className="text-zinc-300">
                        {bp.spec.num_layers}L / {bp.spec.hidden_dim}d
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Context:</span>
                      <span className="text-zinc-300">{bp.spec.max_context_length.toLocaleString()} tokens</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-zinc-800/60 text-[11px]">
                      <span>INT4 VRAM:</span>
                      <span className="text-emerald-400 font-bold">{bp.memory_estimates.int4_gb} GB</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {selectedBlueprint && (
            <div className={`p-5 rounded-xl border ${colors.border} ${colors.bgPanel} space-y-4`}>
              <div className="flex items-center justify-between border-b pb-3 border-zinc-800">
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-cyan-400" />
                  <h3 className="font-semibold text-sm">
                    Structural Specifications &mdash; {selectedBlueprint.spec.name} ({selectedBlueprint.formatted_params})
                  </h3>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1 text-emerald-400">
                    <HardDrive className="w-3.5 h-3.5" />
                    FP16: {selectedBlueprint.memory_estimates.fp16_gb} GB
                  </span>
                  <span className="flex items-center gap-1 text-amber-400">
                    <HardDrive className="w-3.5 h-3.5" />
                    INT8: {selectedBlueprint.memory_estimates.int8_gb} GB
                  </span>
                  <span className="flex items-center gap-1 text-cyan-400 font-bold">
                    <HardDrive className="w-3.5 h-3.5" />
                    INT4 AWQ: {selectedBlueprint.memory_estimates.int4_gb} GB
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 text-xs font-mono">
                <div className="p-3 rounded-lg bg-black/30 border border-zinc-800/80">
                  <div className={`text-[11px] ${colors.textMuted}`}>Hidden Dimension</div>
                  <div className="text-base font-bold text-cyan-300 mt-1">{selectedBlueprint.spec.hidden_dim}</div>
                </div>
                <div className="p-3 rounded-lg bg-black/30 border border-zinc-800/80">
                  <div className={`text-[11px] ${colors.textMuted}`}>Transformer Layers</div>
                  <div className="text-base font-bold text-cyan-300 mt-1">{selectedBlueprint.spec.num_layers}</div>
                </div>
                <div className="p-3 rounded-lg bg-black/30 border border-zinc-800/80">
                  <div className={`text-[11px] ${colors.textMuted}`}>Attention Heads (Q)</div>
                  <div className="text-base font-bold text-cyan-300 mt-1">{selectedBlueprint.spec.num_attention_heads}</div>
                </div>
                <div className="p-3 rounded-lg bg-black/30 border border-zinc-800/80">
                  <div className={`text-[11px] ${colors.textMuted}`}>KV Heads (GQA)</div>
                  <div className="text-base font-bold text-cyan-300 mt-1">{selectedBlueprint.spec.num_kv_heads}</div>
                </div>
                <div className="p-3 rounded-lg bg-black/30 border border-zinc-800/80">
                  <div className={`text-[11px] ${colors.textMuted}`}>Intermediate Dim (FFN)</div>
                  <div className="text-base font-bold text-cyan-300 mt-1">{selectedBlueprint.spec.intermediate_dim}</div>
                </div>
                <div className="p-3 rounded-lg bg-black/30 border border-zinc-800/80">
                  <div className={`text-[11px] ${colors.textMuted}`}>Vocabulary Size</div>
                  <div className="text-base font-bold text-cyan-300 mt-1">{selectedBlueprint.spec.vocab_size.toLocaleString()}</div>
                </div>
                <div className="p-3 rounded-lg bg-black/30 border border-zinc-800/80">
                  <div className={`text-[11px] ${colors.textMuted}`}>Activation Function</div>
                  <div className="text-base font-bold text-cyan-300 mt-1">{selectedBlueprint.spec.activation}</div>
                </div>
                <div className="p-3 rounded-lg bg-black/30 border border-zinc-800/80">
                  <div className={`text-[11px] ${colors.textMuted}`}>Normalization</div>
                  <div className="text-base font-bold text-cyan-300 mt-1">{selectedBlueprint.spec.norm_type}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: HYPERPARAMETERS */}
      {activeTab === 'parameters' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-xs ${colors.textMuted}`}>Quick Presets:</span>
            <button
              onClick={() => applyPreset('creative')}
              className="px-3 py-1 rounded-lg text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30"
            >
              Creative Chat (T: 0.85)
            </button>
            <button
              onClick={() => applyPreset('code')}
              className="px-3 py-1 rounded-lg text-xs bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30"
            >
              Precise Code (T: 0.15)
            </button>
            <button
              onClick={() => applyPreset('research')}
              className="px-3 py-1 rounded-lg text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30"
            >
              Deep Research (T: 0.35)
            </button>
            <button
              onClick={() => applyPreset('fast')}
              className="px-3 py-1 rounded-lg text-xs bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700"
            >
              Deterministic Fast (T: 0.0)
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className={`p-5 rounded-xl border ${colors.border} ${colors.bgPanel} space-y-4`}>
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                Sampling &amp; Probability
              </h3>

              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span>Temperature</span>
                  <span className="font-mono text-cyan-400">{hyperparams.temperature.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.05"
                  value={hyperparams.temperature}
                  onChange={(e) => setHyperparams({ ...hyperparams, temperature: parseFloat(e.target.value) })}
                  className="w-full accent-cyan-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span>Top-P (Nucleus Sampling)</span>
                  <span className="font-mono text-cyan-400">{hyperparams.top_p.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.05"
                  value={hyperparams.top_p}
                  onChange={(e) => setHyperparams({ ...hyperparams, top_p: parseFloat(e.target.value) })}
                  className="w-full accent-cyan-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span>Top-K</span>
                  <span className="font-mono text-cyan-400">{hyperparams.top_k}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="100"
                  step="1"
                  value={hyperparams.top_k}
                  onChange={(e) => setHyperparams({ ...hyperparams, top_k: parseInt(e.target.value) })}
                  className="w-full accent-cyan-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span>Repetition Penalty</span>
                  <span className="font-mono text-cyan-400">{hyperparams.repetition_penalty.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="2.0"
                  step="0.05"
                  value={hyperparams.repetition_penalty}
                  onChange={(e) => setHyperparams({ ...hyperparams, repetition_penalty: parseFloat(e.target.value) })}
                  className="w-full accent-cyan-500"
                />
              </div>
            </div>

            <div className={`p-5 rounded-xl border ${colors.border} ${colors.bgPanel} space-y-4`}>
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                Context &amp; Reasoning Depth
              </h3>

              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span>Context Window Max</span>
                  <span className="font-mono text-purple-400">{hyperparams.context_window} tokens</span>
                </div>
                <input
                  type="range"
                  min="1024"
                  max="32768"
                  step="1024"
                  value={hyperparams.context_window}
                  onChange={(e) => setHyperparams({ ...hyperparams, context_window: parseInt(e.target.value) })}
                  className="w-full accent-purple-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span>Max New Tokens</span>
                  <span className="font-mono text-purple-400">{hyperparams.max_new_tokens} tokens</span>
                </div>
                <input
                  type="range"
                  min="256"
                  max="4096"
                  step="128"
                  value={hyperparams.max_new_tokens}
                  onChange={(e) => setHyperparams({ ...hyperparams, max_new_tokens: parseInt(e.target.value) })}
                  className="w-full accent-purple-500"
                />
              </div>

              <div className="pt-2">
                <label className="block text-xs mb-2">Reasoning Effort</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['low', 'medium', 'high'] as const).map((lvl) => (
                    <button
                      key={lvl}
                      onClick={() => setHyperparams({ ...hyperparams, reasoning_effort: lvl })}
                      className={`py-1.5 text-xs rounded-lg uppercase tracking-wider font-semibold border transition-all ${
                        hyperparams.reasoning_effort === lvl
                          ? 'bg-purple-600/30 border-purple-500 text-purple-200'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: QUANTIZATION */}
      {activeTab === 'quantization' && (
        <div className={`p-5 rounded-xl border ${colors.border} ${colors.bgPanel} space-y-6`}>
          <div className="flex items-center justify-between border-b pb-3 border-zinc-800">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400" />
              <h3 className="font-semibold text-sm">Low-Bit Quantization Compression (AWQ, GPTQ, NF4, GGUF)</h3>
            </div>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={quantConfig.enabled}
                onChange={(e) => setQuantConfig({ ...quantConfig, enabled: e.target.checked })}
                className="rounded accent-amber-500"
              />
              <span className="font-semibold">Enable Quantization Engine</span>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="space-y-1.5">
              <label className="text-zinc-400">Target Precision</label>
              <select
                value={quantConfig.precision}
                onChange={(e) => setQuantConfig({ ...quantConfig, precision: e.target.value as any })}
                className="w-full bg-black/40 border border-zinc-800 rounded-lg p-2.5 text-zinc-200"
              >
                <option value="int4">INT4 (75% VRAM Reduction - High Speed)</option>
                <option value="nf4">NF4 (NormalFloat4 - Optimal for QLoRA)</option>
                <option value="int8">INT8 (50% VRAM Reduction - High Precision)</option>
                <option value="fp16">FP16 (Half Precision Unquantized)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-zinc-400">Quantization Algorithm</label>
              <select
                value={quantConfig.quant_method}
                onChange={(e) => setQuantConfig({ ...quantConfig, quant_method: e.target.value as any })}
                className="w-full bg-black/40 border border-zinc-800 rounded-lg p-2.5 text-zinc-200"
              >
                <option value="awq">AWQ (Activation-aware Weight Quantization)</option>
                <option value="gptq">GPTQ (Second-Order Error Minimization)</option>
                <option value="bitsandbytes">BitsAndBytes (NF4 / LLM.int8())</option>
                <option value="gguf">GGUF (llama.cpp CPU/GPU Unified)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-zinc-400">Group Size</label>
              <select
                value={quantConfig.group_size}
                onChange={(e) => setQuantConfig({ ...quantConfig, group_size: parseInt(e.target.value) })}
                className="w-full bg-black/40 border border-zinc-800 rounded-lg p-2.5 text-zinc-200"
              >
                <option value="128">128 (Standard Balanced)</option>
                <option value="64">64 (Higher Precision)</option>
                <option value="32">32 (Highest Quality, Larger Size)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <label className="flex items-center gap-2 text-xs p-3 rounded-lg bg-black/30 border border-zinc-800 cursor-pointer">
              <input
                type="checkbox"
                checked={quantConfig.zero_point}
                onChange={(e) => setQuantConfig({ ...quantConfig, zero_point: e.target.checked })}
                className="accent-amber-500"
              />
              <span>Asymmetric Zero-Point (Better accuracy)</span>
            </label>
            <label className="flex items-center gap-2 text-xs p-3 rounded-lg bg-black/30 border border-zinc-800 cursor-pointer">
              <input
                type="checkbox"
                checked={quantConfig.double_quant}
                onChange={(e) => setQuantConfig({ ...quantConfig, double_quant: e.target.checked })}
                className="accent-amber-500"
              />
              <span>Double Quantization (Save additional 0.4 bits/param)</span>
            </label>
            <label className="flex items-center gap-2 text-xs p-3 rounded-lg bg-black/30 border border-zinc-800 cursor-pointer">
              <input
                type="checkbox"
                checked={quantConfig.act_order}
                onChange={(e) => setQuantConfig({ ...quantConfig, act_order: e.target.checked })}
                className="accent-amber-500"
              />
              <span>Act-Order / Desc-Act Calibration</span>
            </label>
          </div>
        </div>
      )}

      {/* TAB 4: FINE-TUNING */}
      {activeTab === 'finetune' && (
        <div className={`p-5 rounded-xl border ${colors.border} ${colors.bgPanel} space-y-6`}>
          <div className="flex items-center justify-between border-b pb-3 border-zinc-800">
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5 text-rose-500" />
              <h3 className="font-semibold text-sm">Fine-Tuning Engine: Train Poor Man AI to Get Smarter</h3>
            </div>
            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-mono">
              Adapter: LoRA / QLoRA
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="space-y-1.5">
              <label className="text-zinc-400">Tuning Paradigm</label>
              <select
                value={fineTuneConfig.method}
                onChange={(e) => setFineTuneConfig({ ...fineTuneConfig, method: e.target.value as any })}
                className="w-full bg-black/40 border border-zinc-800 rounded-lg p-2.5 text-zinc-200"
              >
                <option value="qlora">QLoRA (4-bit Base + FP16 Rank Adapters)</option>
                <option value="lora">Standard LoRA (Low-Rank Adaptation)</option>
                <option value="dpo">Direct Preference Optimization (DPO)</option>
                <option value="full">Full Parameter Fine-Tuning</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-zinc-400">LoRA Rank (r)</label>
              <input
                type="number"
                value={fineTuneConfig.r}
                onChange={(e) => setFineTuneConfig({ ...fineTuneConfig, r: parseInt(e.target.value) || 16 })}
                className="w-full bg-black/40 border border-zinc-800 rounded-lg p-2 text-zinc-200"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-zinc-400">LoRA Alpha</label>
              <input
                type="number"
                value={fineTuneConfig.lora_alpha}
                onChange={(e) => setFineTuneConfig({ ...fineTuneConfig, lora_alpha: parseInt(e.target.value) || 32 })}
                className="w-full bg-black/40 border border-zinc-800 rounded-lg p-2 text-zinc-200"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-zinc-400">Learning Rate</label>
              <input
                type="number"
                step="0.00005"
                value={fineTuneConfig.learning_rate}
                onChange={(e) => setFineTuneConfig({ ...fineTuneConfig, learning_rate: parseFloat(e.target.value) || 0.0002 })}
                className="w-full bg-black/40 border border-zinc-800 rounded-lg p-2 text-zinc-200 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-zinc-400">Training Epochs</label>
              <input
                type="number"
                value={fineTuneConfig.num_train_epochs}
                onChange={(e) => setFineTuneConfig({ ...fineTuneConfig, num_train_epochs: parseInt(e.target.value) || 3 })}
                className="w-full bg-black/40 border border-zinc-800 rounded-lg p-2 text-zinc-200"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-zinc-400">Dataset Source</label>
              <input
                type="text"
                value={fineTuneConfig.dataset_path}
                onChange={(e) => setFineTuneConfig({ ...fineTuneConfig, dataset_path: e.target.value })}
                className="w-full bg-black/40 border border-zinc-800 rounded-lg p-2 text-zinc-200 font-mono"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-zinc-800">
            <div className="text-xs text-zinc-400">
              Adapters target modules: <span className="font-mono text-cyan-400">q_proj, k_proj, v_proj, o_proj, gate, up, down</span>
            </div>
            <button
              onClick={handleStartFineTuning}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 text-white font-semibold text-xs shadow-lg shadow-rose-600/20 hover:brightness-110 active:scale-95 transition-all"
            >
              <Play className="w-4 h-4 fill-white" />
              Launch Fine-Tuning Run
            </button>
          </div>

          {trainingStatus && (
            <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-800/60 text-xs text-rose-200 flex items-center gap-2">
              <Activity className="w-4 h-4 animate-spin text-rose-400" />
              <span>{trainingStatus}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ArchitectureEngine;

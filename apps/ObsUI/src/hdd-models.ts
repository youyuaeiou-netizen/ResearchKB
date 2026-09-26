export const HDD_PROVIDERS = [
  { id: "codex", label: "Codex CLI", detail: "本机 Codex 的只读执行模式" },
  { id: "ollama", label: "本地 Ollama", detail: "使用本机已安装的大模型" },
  { id: "cli", label: "其他 CLI", detail: "接入 OpenCode、Claude Code 或其他命令行工具" },
] as const;

export type HddProviderId = typeof HDD_PROVIDERS[number]["id"];

// The Codex app-server supplies the live model list; saved settings may contain future ids.
export type HddModelId = string;
export type HddModelOption = { id: string; label: string; reasoningEfforts?: readonly HddReasoningEffort[]; isDefault?: boolean };

export type HddCliProfile = {
  id: string;
  label: string;
  executablePath: string;
  model: string;
  argsTemplate: string;
  preset: "opencode" | "generic";
};

export const DEFAULT_OLLAMA_MODEL = "qwen3:4b";
export const DEFAULT_OLLAMA_CONTEXT_LENGTH = 8_192;
export const HDD_MODEL_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,127}$/;

const QWEN_RUNTIME_LABELS: Record<string, string> = {
  "qwen3:4b": "Qwen 3 4B · 默认",
  "qwen3.5:9b-64k": "Qwen 3.5 9B · 64K（默认）",
  "qwen3.5:9b-128k": "Qwen 3.5 9B · 128K",
  "qwen3.5:9b-200k": "Qwen 3.5 9B · 200K（手动）",
};

export function hddRuntimeModelLabel(model: string): string {
  return QWEN_RUNTIME_LABELS[model] ?? model;
}

export function sortHddRuntimeModels(models: string[]): string[] {
  const preferred = ["qwen3:4b", "qwen3.5:9b-64k", "qwen3.5:9b-128k", "qwen3.5:9b-200k"];
  return [...new Set(models)].sort((left, right) => {
    const leftIndex = preferred.indexOf(left);
    const rightIndex = preferred.indexOf(right);
    if (leftIndex >= 0 || rightIndex >= 0) return (leftIndex < 0 ? preferred.length : leftIndex) - (rightIndex < 0 ? preferred.length : rightIndex);
    return left.localeCompare(right);
  });
}

export function isHddProviderId(value: unknown): value is HddProviderId {
  return typeof value === "string" && HDD_PROVIDERS.some((provider) => provider.id === value);
}

export function isCodexModelId(value: unknown): value is HddModelId {
  return isSafeHddModelName(value) && value === value.trim() && /^gpt-[a-z0-9]/i.test(value);
}

export function isSafeHddModelName(value: unknown): value is string {
  return typeof value === "string" && HDD_MODEL_NAME_PATTERN.test(value.trim());
}

export const HDD_REASONING_EFFORTS = ["off", "low", "medium", "high", "xhigh", "max", "ultra"] as const;

export type HddReasoningEffort = typeof HDD_REASONING_EFFORTS[number];

const CODEX_REASONING_EFFORTS: Record<string, readonly HddReasoningEffort[]> = {
  "gpt-6-astra": ["low", "medium", "high", "xhigh", "max", "ultra"],
  "gpt-6-sol": ["low", "medium", "high", "xhigh", "max", "ultra"],
  "gpt-6-luna": ["low", "medium", "high", "xhigh", "max"],
  "gpt-5.5": ["low", "medium", "high", "xhigh"],
  "gpt-5.6-luna": ["low", "medium", "high", "xhigh", "max"],
  "gpt-5.6-terra": ["low", "medium", "high", "xhigh", "max", "ultra"],
  "gpt-5.6-sol": ["low", "medium", "high", "xhigh", "max", "ultra"],
};

const OLLAMA_REASONING_EFFORTS = ["off", "low", "medium", "high"] as const satisfies readonly HddReasoningEffort[];

export function hddReasoningEfforts(provider: HddProviderId, model: string, availableModels?: readonly HddModelOption[]): readonly HddReasoningEffort[] {
  if (provider === "codex") return availableModels ? availableModels.find((item) => item.id === model)?.reasoningEfforts ?? [] : CODEX_REASONING_EFFORTS[model] ?? [];
  if (provider === "ollama") return /(?:^|[/:])gpt-oss(?:[.:/@+-]|$)/i.test(model) ? ["low", "medium", "high"] : OLLAMA_REASONING_EFFORTS;
  const nestedModel = model.replace(/^(?:ollama|openai|codex)\//i, "");
  if (nestedModel !== model) {
    if (/^gpt-(?:5\.|6-)/i.test(nestedModel)) return hddReasoningEfforts("codex", nestedModel);
    return hddReasoningEfforts("ollama", nestedModel);
  }
  return [];
}

export function normalizeHddReasoningEffort(provider: HddProviderId, model: string, effort: HddReasoningEffort, availableModels?: readonly HddModelOption[]): HddReasoningEffort {
  const supported = hddReasoningEfforts(provider, model, availableModels);
  if (supported.includes(effort)) return effort;
  return supported.includes("medium") ? "medium" : supported[0] ?? effort;
}

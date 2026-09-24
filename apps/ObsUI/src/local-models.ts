export type LocalModel = { name: string; size?: number | null; modifiedAt?: number | null };

export type LocalModelGroup = {
  name: string;
  variants: string[];
  size: number | null;
  modifiedAt: number | null;
};

export type LocalModelBusy = {
  status: "idle" | "busy" | "unknown";
  runningModels: string[];
};

export type LocalModelDownload = {
  status: "idle" | "running" | "completed" | "failed" | "unknown";
  modelName: string | null;
  jobId: string | null;
  output: string | null;
};

export const LOCAL_MODEL_CONTEXT_LENGTHS = [65_536, 131_072, 204_800] as const;
export const LOCAL_MODEL_OUTPUT_LENGTHS = [4_096, 8_192, 16_384] as const;
export const LOCAL_MODEL_THINKING_LEVELS = ["off", "low", "medium", "high"] as const;

export type LocalModelContextLength = typeof LOCAL_MODEL_CONTEXT_LENGTHS[number];
export type LocalModelOutputLength = typeof LOCAL_MODEL_OUTPUT_LENGTHS[number];
export type LocalModelThinking = typeof LOCAL_MODEL_THINKING_LEVELS[number];

export function localModelContextLength(name: string): LocalModelContextLength | null {
  const match = name.trim().match(/-(\d+)k$/i);
  if (!match) return null;
  const contextLength = Number(match[1]) * 1024;
  return LOCAL_MODEL_CONTEXT_LENGTHS.includes(contextLength as LocalModelContextLength)
    ? contextLength as LocalModelContextLength
    : null;
}

export function localModelIdentity(name: string): string {
  const normalized = name.trim();
  const match = normalized.match(/-(\d+)k$/i);
  const contextLength = localModelContextLength(normalized);
  return contextLength === null || match?.index === undefined ? normalized : normalized.slice(0, match.index);
}

export function groupLocalModels(models: readonly LocalModel[]): LocalModelGroup[] {
  const groups = new Map<string, LocalModelGroup>();
  for (const model of models) {
    const name = localModelIdentity(model.name);
    const size = model.size ?? null;
    const modifiedAt = model.modifiedAt ?? null;
    const current = groups.get(name);
    if (!current) {
      groups.set(name, { name, variants: [model.name], size, modifiedAt });
      continue;
    }
    if (!current.variants.includes(model.name)) current.variants.push(model.name);
    if (size !== null && (current.size === null || size > current.size)) current.size = size;
    if (modifiedAt !== null && (current.modifiedAt === null || modifiedAt > current.modifiedAt)) current.modifiedAt = modifiedAt;
  }
  return [...groups.values()];
}

export type LocalModelSettings = {
  contextLength: LocalModelContextLength;
  maxOutputTokens: LocalModelOutputLength;
  temperature: number;
  topP: number;
  topK: number;
  minP: number;
  repeatPenalty: number;
  thinking: LocalModelThinking;
  thinkingByModel: Record<string, LocalModelThinking>;
};

export const DEFAULT_LOCAL_MODEL_SETTINGS: LocalModelSettings = {
  contextLength: 65_536,
  maxOutputTokens: 8_192,
  temperature: 0.2,
  topP: 0.9,
  topK: 40,
  minP: 0.05,
  repeatPenalty: 1.05,
  thinking: "medium",
  thinkingByModel: {},
};

export type LocalModelState = {
  status: "ready" | "unavailable";
  checkedAt: number | null;
  models: LocalModel[];
  provider?: "ollama";
  endpoint?: string;
  modelRoot?: string;
  configured?: boolean;
  selectedModel?: string;
  settings?: LocalModelSettings;
  busy?: LocalModelBusy;
  download?: LocalModelDownload;
};

type RecordLike = Record<string, unknown>;

const isRecord = (value: unknown): value is RecordLike => Boolean(value && typeof value === "object" && !Array.isArray(value));
const asNonEmptyString = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const asNonNegativeNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
const asFiniteNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const asInteger = (value: unknown) => {
  const number = asFiniteNumber(value);
  return number !== null && Number.isInteger(number) ? number : null;
};
const clamp = (value: number, minimum: number, maximum: number, precision = 2) => {
  const factor = 10 ** precision;
  return Math.round(Math.min(maximum, Math.max(minimum, value)) * factor) / factor;
};
const asChoice = <T extends readonly number[]>(value: unknown, choices: T): T[number] | null => {
  const number = asInteger(value);
  return number !== null && choices.includes(number) ? number as T[number] : null;
};

export function normalizeLocalModelSettings(value: unknown): LocalModelSettings {
  const record = isRecord(value) ? value : {};
  const contextLength = asChoice(record.contextLength, LOCAL_MODEL_CONTEXT_LENGTHS) ?? DEFAULT_LOCAL_MODEL_SETTINGS.contextLength;
  const maxOutputTokens = asChoice(record.maxOutputTokens, LOCAL_MODEL_OUTPUT_LENGTHS) ?? DEFAULT_LOCAL_MODEL_SETTINGS.maxOutputTokens;
  const temperature = asFiniteNumber(record.temperature);
  const topP = asFiniteNumber(record.topP);
  const topK = asInteger(record.topK);
  const minP = asFiniteNumber(record.minP);
  const repeatPenalty = asFiniteNumber(record.repeatPenalty);
  const thinking = typeof record.thinking === "string" && LOCAL_MODEL_THINKING_LEVELS.includes(record.thinking as LocalModelThinking)
    ? record.thinking as LocalModelThinking
    : DEFAULT_LOCAL_MODEL_SETTINGS.thinking;
  const thinkingByModel: Record<string, LocalModelThinking> = {};
  if (isRecord(record.thinkingByModel)) {
    for (const [rawName, rawThinking] of Object.entries(record.thinkingByModel)) {
      const name = rawName.trim();
      if (!name || name.length > 128 || typeof rawThinking !== "string" || !LOCAL_MODEL_THINKING_LEVELS.includes(rawThinking as LocalModelThinking)) continue;
      thinkingByModel[localModelIdentity(name)] = rawThinking as LocalModelThinking;
    }
  }
  return {
    contextLength,
    maxOutputTokens,
    temperature: clamp(temperature ?? DEFAULT_LOCAL_MODEL_SETTINGS.temperature, 0, 2),
    topP: clamp(topP ?? DEFAULT_LOCAL_MODEL_SETTINGS.topP, 0, 1),
    topK: Math.round(Math.min(100, Math.max(0, topK ?? DEFAULT_LOCAL_MODEL_SETTINGS.topK))),
    minP: clamp(minP ?? DEFAULT_LOCAL_MODEL_SETTINGS.minP, 0, 1),
    repeatPenalty: clamp(repeatPenalty ?? DEFAULT_LOCAL_MODEL_SETTINGS.repeatPenalty, 0.8, 2),
    thinking,
    thinkingByModel,
  };
}

export function localModelThinkingFor(settings: LocalModelSettings, modelName: string) {
  return settings.thinkingByModel[localModelIdentity(modelName)] ?? settings.thinking;
}

export function withLocalModelThinking(settings: LocalModelSettings, modelName: string, thinking: LocalModelThinking): LocalModelSettings {
  const identity = localModelIdentity(modelName);
  return normalizeLocalModelSettings({
    ...settings,
    thinkingByModel: { ...settings.thinkingByModel, [identity]: thinking },
  });
}

export function parseLocalModelSettings(value: unknown): LocalModelSettings | null {
  if (!isRecord(value)) return null;
  const normalized = normalizeLocalModelSettings(value);
  const record = value;
  if (asChoice(record.contextLength, LOCAL_MODEL_CONTEXT_LENGTHS) === null
    || asChoice(record.maxOutputTokens, LOCAL_MODEL_OUTPUT_LENGTHS) === null
    || asFiniteNumber(record.temperature) === null
    || asFiniteNumber(record.topP) === null
    || asInteger(record.topK) === null
    || asFiniteNumber(record.minP) === null
    || asFiniteNumber(record.repeatPenalty) === null
    || typeof record.thinking !== "string"
    || !LOCAL_MODEL_THINKING_LEVELS.includes(record.thinking as LocalModelThinking)) return null;
  if (record.thinkingByModel !== undefined) {
    if (!isRecord(record.thinkingByModel)) return null;
    for (const [name, thinking] of Object.entries(record.thinkingByModel)) {
      if (!name.trim() || name.trim().length > 128 || typeof thinking !== "string" || !LOCAL_MODEL_THINKING_LEVELS.includes(thinking as LocalModelThinking)) return null;
    }
  }
  return normalized;
}

export function parseLocalModelState(payload: unknown): LocalModelState | null {
  if (!isRecord(payload) || !["ready", "unavailable"].includes(String(payload.status)) || !Array.isArray(payload.models)) return null;
  const status = payload.status as LocalModelState["status"];
  const checkedAt = payload.checkedAt === null ? null : asNonNegativeNumber(payload.checkedAt);
  if (checkedAt === null && payload.checkedAt !== null || status === "ready" && checkedAt === null) return null;
  const models: LocalModel[] = [];
  for (const candidate of payload.models) {
    if (!isRecord(candidate)) return null;
    const name = asNonEmptyString(candidate.name);
    if (!name) return null;
    const size = candidate.size === undefined || candidate.size === null ? null : asNonNegativeNumber(candidate.size);
    const modifiedAt = candidate.modifiedAt === undefined || candidate.modifiedAt === null ? null : asNonNegativeNumber(candidate.modifiedAt);
    if (candidate.size !== undefined && candidate.size !== null && size === null || candidate.modifiedAt !== undefined && candidate.modifiedAt !== null && modifiedAt === null) return null;
    models.push({ name, ...(candidate.size !== undefined ? { size } : {}), ...(candidate.modifiedAt !== undefined ? { modifiedAt } : {}) });
  }
  const result: LocalModelState = { status, checkedAt, models };
  if (payload.provider === "ollama") result.provider = "ollama";
  if (payload.endpoint !== undefined) {
    const endpoint = asNonEmptyString(payload.endpoint);
    if (!endpoint) return null;
    result.endpoint = endpoint;
  }
  if (payload.modelRoot !== undefined) {
    const modelRoot = asNonEmptyString(payload.modelRoot);
    if (!modelRoot) return null;
    result.modelRoot = modelRoot;
  }
  if (payload.configured !== undefined) {
    if (typeof payload.configured !== "boolean") return null;
    result.configured = payload.configured;
  }
  if (payload.selectedModel !== undefined) {
    if (payload.selectedModel !== null && !asNonEmptyString(payload.selectedModel)) return null;
    result.selectedModel = payload.selectedModel === null ? "" : asNonEmptyString(payload.selectedModel)!;
  }
  if (payload.settings !== undefined) {
    const settings = parseLocalModelSettings(payload.settings);
    if (!settings) return null;
    result.settings = settings;
  }
  if (payload.busy !== undefined) {
    if (!isRecord(payload.busy) || !["idle", "busy", "unknown"].includes(String(payload.busy.status)) || !Array.isArray(payload.busy.runningModels)) return null;
    const runningModels = payload.busy.runningModels.map(asNonEmptyString).filter((name): name is string => name !== null);
    if (runningModels.length !== payload.busy.runningModels.length) return null;
    result.busy = { status: payload.busy.status as LocalModelBusy["status"], runningModels };
  }
  if (payload.download !== undefined) {
    if (!isRecord(payload.download) || !["idle", "running", "completed", "failed", "unknown"].includes(String(payload.download.status))) return null;
    const modelName = payload.download.modelName === null ? null : asNonEmptyString(payload.download.modelName);
    const jobId = payload.download.jobId === null ? null : asNonEmptyString(payload.download.jobId);
    const output = payload.download.output === null ? null : asNonEmptyString(payload.download.output);
    if (payload.download.modelName !== null && modelName === null || payload.download.jobId !== null && jobId === null || payload.download.output !== null && output === null) return null;
    result.download = { status: payload.download.status as LocalModelDownload["status"], modelName, jobId, output };
  }
  return result;
}

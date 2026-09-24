import { DEFAULT_OLLAMA_MODEL, HDD_REASONING_EFFORTS, HDD_MODEL_NAME_PATTERN, isCodexModelId, isHddProviderId, normalizeHddReasoningEffort, type HddCliProfile, type HddModelId, type HddProviderId, type HddReasoningEffort } from "./hdd-models";

export type WorkbenchSettings = {
  schemaVersion: 1;
  wallpaperDataUrl: string | null;
  screenshot: {
    enabled: boolean;
    hotkey: string;
  };
  translation: {
    enabled: boolean;
  };
  profile: {
    avatarDataUrl: string | null;
    nickname: string;
    birthday: string;
    school: string;
    researchField: string;
  };
  hdd: {
    provider: HddProviderId;
    model: HddModelId;
    reasoningEffort: HddReasoningEffort;
    customInstructions: string;
    cliProfiles: HddCliProfile[];
    selectedCliProfileId: string;
  };
  petEnabled: boolean;
};

export const DEFAULT_WORKBENCH_SETTINGS: WorkbenchSettings = {
  schemaVersion: 1,
  wallpaperDataUrl: null,
  screenshot: {
    enabled: true,
    hotkey: "Ctrl+Alt+A",
  },
  translation: {
    enabled: true,
  },
  profile: {
    avatarDataUrl: null,
    nickname: "",
    birthday: "",
    school: "",
    researchField: "",
  },
  hdd: {
    provider: "codex",
    model: "gpt-5.6-luna",
    reasoningEffort: "high",
    customInstructions: "",
    cliProfiles: [],
    selectedCliProfileId: "",
  },
  petEnabled: false,
};

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const asString = (value: unknown, maxLength: number) => typeof value === "string" ? value.slice(0, maxLength) : "";
const asDataUrl = (value: unknown) => typeof value === "string" && /^data:image\/(?:png|jpe?g|webp);base64,/i.test(value) ? value : null;
const normalizeScreenshotHotkey = (value: unknown) => {
  if (typeof value !== "string") return DEFAULT_WORKBENCH_SETTINGS.screenshot.hotkey;
  const hotkey = value.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!hotkey || !/^(?:(?:Ctrl|Alt|Shift|Win)\+){1,3}(?:[A-Z]|F(?:[1-9]|1[0-2])|Space|PrintScreen)$/i.test(hotkey)) {
    return DEFAULT_WORKBENCH_SETTINGS.screenshot.hotkey;
  }
  return hotkey
    .split("+")
    .map((part) => part.length <= 5 ? part[0]!.toUpperCase() + part.slice(1).toLowerCase() : part.toUpperCase())
    .join("+");
};

function normalizeHddCliProfiles(value: unknown): HddCliProfile[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate): HddCliProfile[] => {
    if (!isRecord(candidate)) return [];
    const id = asString(candidate.id, 80).trim();
    const label = asString(candidate.label, 120).trim();
    const executablePath = asString(candidate.executablePath, 1_024).trim();
    const model = asString(candidate.model, 128).trim();
    const argsTemplate = asString(candidate.argsTemplate, 512).trim();
    const preset = candidate.preset === "opencode" ? "opencode" : "generic";
    const extension = executablePath.toLocaleLowerCase().match(/\.(exe|cmd|bat|ps1)$/)?.[1];
    const absoluteWindowsPath = /^(?:[A-Za-z]:[\\/]|\\\\)/.test(executablePath);
    if (!/^cli-[0-9a-f-]{36}$/i.test(id) || !label || !absoluteWindowsPath || !extension || (model && !HDD_MODEL_NAME_PATTERN.test(model))) return [];
    return [{ id, label, executablePath, model, argsTemplate, preset }];
  }).slice(0, 8);
}

export function normalizeWorkbenchSettings(value: unknown): WorkbenchSettings {
  if (!isRecord(value)) return structuredClone(DEFAULT_WORKBENCH_SETTINGS);
  const profile = isRecord(value.profile) ? value.profile : {};
  const hdd = isRecord(value.hdd) ? value.hdd : {};
  const screenshot = isRecord(value.screenshot) ? value.screenshot : {};
  const translation = isRecord(value.translation) ? value.translation : {};
  const provider = isHddProviderId(hdd.provider) ? hdd.provider : DEFAULT_WORKBENCH_SETTINGS.hdd.provider;
  const model = provider === "codex"
    ? isCodexModelId(hdd.model) ? hdd.model.trim() : DEFAULT_WORKBENCH_SETTINGS.hdd.model
    : provider === "ollama"
      ? typeof hdd.model === "string" && HDD_MODEL_NAME_PATTERN.test(hdd.model.trim()) ? hdd.model.trim() : DEFAULT_OLLAMA_MODEL
      : typeof hdd.model === "string" && (!hdd.model.trim() || HDD_MODEL_NAME_PATTERN.test(hdd.model.trim())) ? hdd.model.trim() : "";
  const requestedReasoningEffort = HDD_REASONING_EFFORTS.includes(hdd.reasoningEffort as HddReasoningEffort)
    ? hdd.reasoningEffort as HddReasoningEffort
    : DEFAULT_WORKBENCH_SETTINGS.hdd.reasoningEffort;
  const reasoningEffort = normalizeHddReasoningEffort(provider, model, requestedReasoningEffort);
  const cliProfiles = normalizeHddCliProfiles(hdd.cliProfiles);
  const requestedCliProfileId = asString(hdd.selectedCliProfileId, 80);
  const selectedCliProfileId = cliProfiles.some((profile) => profile.id === requestedCliProfileId) ? requestedCliProfileId : cliProfiles[0]?.id ?? "";
  return {
    schemaVersion: 1,
    wallpaperDataUrl: asDataUrl(value.wallpaperDataUrl),
    screenshot: {
      enabled: screenshot.enabled !== false,
      hotkey: normalizeScreenshotHotkey(screenshot.hotkey),
    },
    translation: {
      enabled: translation.enabled !== false,
    },
    profile: {
      avatarDataUrl: asDataUrl(profile.avatarDataUrl),
      nickname: asString(profile.nickname, 80),
      birthday: /^\d{4}-\d{2}-\d{2}$/.test(asString(profile.birthday, 10)) ? String(profile.birthday) : "",
      school: asString(profile.school, 160),
      researchField: asString(profile.researchField, 160),
    },
    hdd: {
      provider,
      model,
      reasoningEffort,
      customInstructions: asString(hdd.customInstructions, 12_000),
      cliProfiles,
      selectedCliProfileId,
    },
    petEnabled: value.petEnabled === true,
  };
}

export type StartupApplicationId = "zotero" | "flclash" | "ollama";
export type WorkbenchStartupSettings = {
  windowsStartup: boolean;
  applications: Record<StartupApplicationId, boolean>;
  customApplications: CustomStartupApplication[];
};
export type StartupApplicationStatus = {
  id: StartupApplicationId;
  label: string;
  installed: boolean;
  configured: boolean;
};
export type CustomStartupApplication = {
  id: string;
  label: string;
  path: string;
  enabled: boolean;
  installed?: boolean;
};
export type WorkbenchStartupState = WorkbenchStartupSettings & {
  applicationsStatus: StartupApplicationStatus[];
  message?: string;
};

export const DEFAULT_STARTUP_SETTINGS: WorkbenchStartupSettings = {
  windowsStartup: false,
  applications: { zotero: false, flclash: false, ollama: false },
  customApplications: [],
};

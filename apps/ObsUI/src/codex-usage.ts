export type CodexUsageWindow = {
  usedPercent: number;
  remainingPercent: number;
  windowMinutes: number;
  resetsAt: number;
};

export type CodexUsage = {
  windows: CodexUsageWindow[];
  sampledAt: number;
};

export function sortCodexUsageWindows(windows: readonly CodexUsageWindow[]): CodexUsageWindow[] {
  return [...windows].sort((left, right) => left.windowMinutes - right.windowMinutes);
}

export function codexUsageWindowLabel(windowMinutes: number): string {
  if (windowMinutes === 300) return "5 小时";
  if (windowMinutes === 10_080) return "1 周";
  if (windowMinutes % 1_440 === 0) return `${windowMinutes / 1_440} 天`;
  if (windowMinutes % 60 === 0) return `${windowMinutes / 60} 小时`;
  return `${windowMinutes} 分钟`;
}

const asNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;

const asEpochMilliseconds = (value: unknown) => {
  const numeric = asNumber(value);
  if (numeric === null || numeric <= 0) return null;
  return numeric < 10_000_000_000 ? Math.round(numeric * 1000) : Math.round(numeric);
};

export function parseCodexUsage(payload: unknown): CodexUsage | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const sampledAt = asEpochMilliseconds(record.sampledAt);
  if (sampledAt === null) return null;

  const rawWindows = Array.isArray(record.windows) ? record.windows : [record];
  const windows = rawWindows.map((value) => {
    if (!value || typeof value !== "object") return null;
    const window = value as Record<string, unknown>;
    const usedPercent = asNumber(window.usedPercent);
    const windowMinutes = asNumber(window.windowMinutes);
    const resetsAt = asEpochMilliseconds(window.resetsAt);
    if (usedPercent === null || windowMinutes === null || resetsAt === null || windowMinutes <= 0) return null;

    const normalizedUsedPercent = Math.round(Math.min(100, Math.max(0, usedPercent)));
    return {
      usedPercent: normalizedUsedPercent,
      remainingPercent: 100 - normalizedUsedPercent,
      windowMinutes: Math.round(windowMinutes),
      resetsAt,
    } satisfies CodexUsageWindow;
  }).filter((window): window is CodexUsageWindow => window !== null);

  if (!windows.length) return null;
  return { windows, sampledAt };
}

export type CodexUsage = {
  usedPercent: number;
  remainingPercent: number;
  windowMinutes: number;
  resetsAt: number;
  sampledAt: number;
};

const asNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;

const asEpochMilliseconds = (value: unknown) => {
  const numeric = asNumber(value);
  if (numeric === null || numeric <= 0) return null;
  return numeric < 10_000_000_000 ? Math.round(numeric * 1000) : Math.round(numeric);
};

export function parseCodexUsage(payload: unknown): CodexUsage | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const usedPercent = asNumber(record.usedPercent);
  const windowMinutes = asNumber(record.windowMinutes);
  const resetsAt = asEpochMilliseconds(record.resetsAt);
  const sampledAt = asEpochMilliseconds(record.sampledAt);
  if (usedPercent === null || windowMinutes === null || resetsAt === null || sampledAt === null || windowMinutes <= 0) return null;

  const normalizedUsedPercent = Math.round(Math.min(100, Math.max(0, usedPercent)));
  return {
    usedPercent: normalizedUsedPercent,
    remainingPercent: 100 - normalizedUsedPercent,
    windowMinutes: Math.round(windowMinutes),
    resetsAt,
    sampledAt,
  };
}

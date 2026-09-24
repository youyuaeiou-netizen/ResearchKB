export type CodexAutomationStatus = "active" | "paused" | "unknown";

export type CodexAutomation = {
  id: string;
  name: string;
  status: CodexAutomationStatus;
  schedule: string | null;
  updatedAt: number;
};

export type CodexAutomationsState = {
  status: "ready" | "unavailable";
  checkedAt: number | null;
  data: CodexAutomation[];
};

function stripTomlComment(line: string) {
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === "\\" && quoted) {
      escaped = !escaped;
      continue;
    }
    if (character === '"' && !escaped) quoted = !quoted;
    if (character === "#" && !quoted) return line.slice(0, index);
    escaped = false;
  }
  return line;
}

function parseTomlString(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      return typeof parsed === "string" && parsed.trim() ? parsed.trim() : null;
    } catch {
      return null;
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    const parsed = trimmed.slice(1, -1).trim();
    return parsed || null;
  }
  if (/^[\[\{]/.test(trimmed)) return null;
  return trimmed;
}

function normalizeStatus(value: string | null): CodexAutomationStatus {
  switch (value?.toLowerCase()) {
    case "active":
    case "enabled":
      return "active";
    case "paused":
    case "disabled":
      return "paused";
    default:
      return "unknown";
  }
}

export function parseAutomationMetadata(content: string, fallbackName: string, id: string, updatedAt: number): CodexAutomation | null {
  if (typeof content !== "string" || !content.trim() || !fallbackName.trim() || !id.trim() || !Number.isFinite(updatedAt) || updatedAt <= 0) return null;
  const values = new Map<string, string>();
  for (const rawLine of content.split(/\r?\n/)) {
    const line = stripTomlComment(rawLine).trim();
    if (!line || line.startsWith("[") || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*=\s*(.+)$/);
    if (!match) continue;
    const key = match[1].toLowerCase();
    if (!["name", "title", "status", "rrule", "schedule", "cron"].includes(key)) continue;
    const value = parseTomlString(match[2]);
    if (value !== null) values.set(key, value);
  }
  const name = values.get("name") ?? values.get("title") ?? fallbackName.trim();
  const schedule = values.get("rrule") ?? values.get("schedule") ?? values.get("cron") ?? null;
  return {
    id: id.trim(),
    name,
    status: normalizeStatus(values.get("status") ?? null),
    schedule,
    updatedAt: Math.round(updatedAt),
  };
}

type RecordLike = Record<string, unknown>;

function asRecord(value: unknown): RecordLike | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordLike : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseAutomation(value: unknown): CodexAutomation | null {
  const record = asRecord(value);
  const id = typeof record?.id === "string" && record.id.trim() ? record.id.trim() : null;
  const name = typeof record?.name === "string" && record.name.trim() ? record.name.trim() : null;
  const status = record?.status;
  const schedule = record?.schedule;
  const updatedAt = asFiniteNumber(record?.updatedAt);
  if (!id || !name || (status !== "active" && status !== "paused" && status !== "unknown") ||
    (schedule !== null && schedule !== undefined && (typeof schedule !== "string" || !schedule.trim())) || updatedAt === null || updatedAt <= 0) return null;
  return { id, name, status, schedule: typeof schedule === "string" ? schedule : null, updatedAt: Math.round(updatedAt) };
}

export function parseCodexAutomationsState(payload: unknown): CodexAutomationsState | null {
  const record = asRecord(payload);
  if (!record || (record.status !== "ready" && record.status !== "unavailable")) return null;
  if (record.status === "unavailable") {
    return record.checkedAt === null && Array.isArray(record.data) && record.data.length === 0 ? { status: "unavailable", checkedAt: null, data: [] } : null;
  }
  const checkedAt = asFiniteNumber(record.checkedAt);
  if (checkedAt === null || checkedAt <= 0 || !Array.isArray(record.data)) return null;
  const data = record.data.map(parseAutomation);
  if (data.some((item) => item === null)) return null;
  return { status: "ready", checkedAt: Math.round(checkedAt), data: (data as CodexAutomation[]).sort((left, right) => right.updatedAt - left.updatedAt) };
}

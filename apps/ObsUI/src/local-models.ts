export type LocalModel = { name: string };

export type LocalModelState = {
  status: "ready" | "unavailable";
  checkedAt: number | null;
  models: LocalModel[];
};

type RecordLike = Record<string, unknown>;

const isRecord = (value: unknown): value is RecordLike => Boolean(value && typeof value === "object" && !Array.isArray(value));
const asNonEmptyString = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const asNonNegativeNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;

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
    models.push({ name });
  }
  return { status, checkedAt, models };
}

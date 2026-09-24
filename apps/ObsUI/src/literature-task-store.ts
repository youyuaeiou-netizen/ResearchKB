import type { LiteratureTask } from "./literature";

type TaskSnapshot = { tasks: LiteratureTask[]; error: string };

let snapshot: TaskSnapshot = { tasks: [], error: "" };
const listeners = new Set<() => void>();
let refreshPromise: Promise<void> | null = null;

function retainRecentDeepTasks(tasks: LiteratureTask[]) {
  const latestReport = tasks
    .filter((task) => task.kind === "deep-analysis" && task.status === "completed" && task.reportCount > 0 && Boolean(task.reportPath))
    .reduce<LiteratureTask | null>((latest, task) => !latest || (task.finishedAt ?? task.createdAt) > (latest.finishedAt ?? latest.createdAt) ? task : latest, null);
  const retainedIds = new Set(tasks.filter((task) => task.kind === "deep-analysis" && (task.status === "queued" || task.status === "running")).map((task) => task.id));
  if (latestReport) retainedIds.add(latestReport.id);
  return tasks.filter((task) => task.kind !== "deep-analysis" || retainedIds.has(task.id));
}

function publish(next: TaskSnapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

async function readTasks() {
  const response = await fetch("/api/literature/tasks", { cache: "no-store" });
  const payload = await response.json().catch(() => ({})) as { tasks?: LiteratureTask[]; message?: string };
  if (!response.ok) throw new Error(payload.message || `后台任务接口暂不可用（HTTP ${response.status}）。`);
  publish({ tasks: retainRecentDeepTasks(Array.isArray(payload.tasks) ? payload.tasks : []), error: "" });
}

export function refreshLiteratureTasks() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = readTasks().catch((error) => {
    publish({ ...snapshot, error: error instanceof Error ? error.message : "后台任务暂不可用。" });
  }).finally(() => { refreshPromise = null; });
  return refreshPromise;
}

export function subscribeLiteratureTasks(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLiteratureTaskSnapshot() {
  return snapshot;
}

export async function enqueueLiteratureAnalysis(itemIds: readonly string[], cloudConsent = false) {
  const response = await fetch("/api/literature/tasks/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemIds, ...(cloudConsent ? { cloudConsent: true } : {}) }),
  });
  const payload = await response.json().catch(() => ({})) as LiteratureTask & { message?: string };
  if (!response.ok) throw new Error(payload.message || `无法创建后台分析任务（HTTP ${response.status}）。`);
  await refreshLiteratureTasks();
  return payload;
}

export async function cancelLiteratureTask(id: string) {
  const response = await fetch(`/api/literature/tasks/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const payload = await response.json().catch(() => ({})) as LiteratureTask & { message?: string };
  if (!response.ok) throw new Error(payload.message || `无法取消后台任务（HTTP ${response.status}）。`);
  await refreshLiteratureTasks();
  return payload;
}

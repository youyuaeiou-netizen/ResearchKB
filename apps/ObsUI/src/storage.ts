import type { AppState, BackupEnvelope, Project, Resource, RecycledItem, Task } from "./types";
import { localDateKey } from "./target-v1/task-model";

export const DB_NAME = "obsui-local-state";
export const STORE_NAME = "app-state";
export const STATE_KEY = "current";

const now = () => new Date().toISOString();
const currentMonthKey = () => localDateKey(new Date()).slice(0, 7);

function monthKeyFromTimestamp(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? currentMonthKey() : localDateKey(parsed).slice(0, 7);
}

export function createId(prefix: string): string {
  const uuid = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${uuid}`;
}

export function createInitialState(): AppState {
  const createdAt = now();
  const projectId = "project-demo-research";
  const courseId = "project-demo-course";
  return {
    schemaVersion: 1,
    updatedAt: createdAt,
    targetLastOpenedMonth: currentMonthKey(),
    projects: [
      {
        id: projectId,
        title: "研究课题规划（示例）",
        kind: "research",
        status: "active",
        tags: ["研究"],
        description: "示例项目：用于体验项目、任务和资料之间的连接。",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: courseId,
        title: "本学期课程计划（示例）",
        kind: "course",
        status: "active",
        tags: ["课程"],
        description: "示例项目可以在设置中清空后替换为自己的内容。",
        createdAt,
        updatedAt: createdAt,
      },
    ],
    tasks: [
      {
        id: "task-demo-1",
        title: "整理本周最重要的三个问题",
        projectId,
        dueDate: localDateKey(new Date()),
        status: "active",
        priority: 5,
        folderPath: "",
        createdAt,
        updatedAt: createdAt,
        completedAt: null,
      },
      {
        id: "task-demo-2",
        title: "补充课程阅读笔记",
        projectId: courseId,
        dueDate: localDateKey(new Date(Date.now() + 86400000 * 2)),
        status: "active",
        priority: 3,
        folderPath: "",
        createdAt,
        updatedAt: createdAt,
        completedAt: null,
      },
    ],
    resources: [
      {
        id: "resource-demo-1",
        title: "把一个问题拆成可验证的假设",
        location: "https://example.com/obsui-demo",
        kind: "link",
        projectId,
        tags: ["方法"],
        createdAt,
      },
    ],
    recycleBin: [],
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开本地数据"));
  });
}

export async function loadAppState(): Promise<AppState> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(STATE_KEY);
    request.onsuccess = () => {
      if (request.result === undefined) return resolve(createInitialState());
      const normalized = normalizeAppState(request.result);
      if (normalized) resolve(normalized);
      else reject(new Error("本地数据结构无法识别"));
    };
    request.onerror = () => reject(request.error ?? new Error("无法读取本地数据"));
    transaction.oncomplete = () => database.close();
  });
}

export async function saveAppState(state: AppState): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(state, STATE_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("无法保存本地数据"));
  });
  database.close();
}

export function createBackup(state: AppState): BackupEnvelope {
  return { app: "obsui", format: "obsui-backup-v1", exportedAt: now(), state };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function validateProject(value: unknown): value is Project {
  return isObject(value) && isString(value.id) && isString(value.title) &&
    ["course", "research", "personal"].includes(String(value.kind)) &&
    ["active", "paused", "completed"].includes(String(value.status)) &&
    Array.isArray(value.tags) && value.tags.every(isString) && isString(value.description) &&
    isString(value.createdAt) && isString(value.updatedAt);
}

function normalizePriority(value: unknown): Task["priority"] | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5) return value as Task["priority"];
  if (value === "high") return 5;
  if (value === "medium") return 3;
  if (value === "low") return 1;
  return null;
}

function normalizeTask(value: unknown): Task | null {
  if (!isObject(value) || !isString(value.id) || !isString(value.title) ||
    value.projectId !== null && !isString(value.projectId) ||
    value.dueDate !== null && !isString(value.dueDate) ||
    !isString(value.createdAt) || !isString(value.updatedAt)) return null;
  const priority = normalizePriority(value.priority);
  const status = value.status === "completed" || value.status === "done" ? "completed" :
    value.status === "active" || value.status === "todo" || value.status === "doing" ? "active" : null;
  if (!priority || !status) return null;
  const completedAt = status === "completed"
    ? isString(value.completedAt) ? value.completedAt : value.updatedAt
    : null;
  return {
    id: value.id,
    title: value.title,
    projectId: value.projectId,
    dueDate: isString(value.dueDate) ? value.dueDate : "",
    status,
    priority,
    folderPath: isString(value.folderPath) ? value.folderPath : "",
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    completedAt,
  };
}

function validateResource(value: unknown): value is Resource {
  return isObject(value) && isString(value.id) && isString(value.title) && isString(value.location) &&
    ["link", "file", "note"].includes(String(value.kind)) &&
    (value.projectId === null || isString(value.projectId)) &&
    Array.isArray(value.tags) && value.tags.every(isString) && isString(value.createdAt);
}

function normalizeRecycle(value: unknown): RecycledItem | null {
  if (!isObject(value) || !isString(value.id) || !isString(value.deletedAt)) return null;
  if (value.entityType === "project" && validateProject(value.payload)) return { id: value.id, entityType: "project", deletedAt: value.deletedAt, payload: value.payload };
  if (value.entityType === "resource" && validateResource(value.payload)) return { id: value.id, entityType: "resource", deletedAt: value.deletedAt, payload: value.payload };
  if (value.entityType === "task") {
    const task = normalizeTask(value.payload);
    if (task) return { id: value.id, entityType: "task", deletedAt: value.deletedAt, payload: task };
  }
  return null;
}

export function normalizeAppState(value: unknown): AppState | null {
  if (!isObject(value) || value.schemaVersion !== 1 || !isString(value.updatedAt) ||
    !Array.isArray(value.projects) || !value.projects.every(validateProject) ||
    !Array.isArray(value.tasks) || !Array.isArray(value.resources) || !value.resources.every(validateResource) ||
    !Array.isArray(value.recycleBin)) return null;
  const tasks = value.tasks.map(normalizeTask);
  const recycleBin = value.recycleBin.map(normalizeRecycle);
  if (tasks.some((task) => task === null) || recycleBin.some((item) => item === null)) return null;
  return {
    schemaVersion: 1,
    updatedAt: value.updatedAt,
    targetLastOpenedMonth: isString(value.targetLastOpenedMonth) && /^\d{4}-\d{2}$/.test(value.targetLastOpenedMonth)
      ? value.targetLastOpenedMonth
      : monthKeyFromTimestamp(value.updatedAt),
    projects: value.projects,
    tasks: tasks as Task[],
    resources: value.resources,
    recycleBin: recycleBin as RecycledItem[],
  };
}

export function parseBackup(value: unknown): AppState {
  if (!isObject(value) || value.app !== "obsui" || value.format !== "obsui-backup-v1" || !isObject(value.state)) {
    throw new Error("不是有效的 ObsUI v1 备份文件。");
  }
  const state = normalizeAppState(value.state);
  if (!state) {
    throw new Error("备份结构或字段不完整，现有数据未改变。");
  }
  return state;
}

export function touch(state: AppState): AppState {
  return { ...state, updatedAt: now() };
}

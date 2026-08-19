import type { AppState, BackupEnvelope, Project, Resource, RecycledItem, Task } from "./types";

export const DB_NAME = "obsui-local-state";
export const STORE_NAME = "app-state";
export const STATE_KEY = "current";

const now = () => new Date().toISOString();

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
        dueDate: new Date().toISOString().slice(0, 10),
        status: "doing",
        priority: "high",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "task-demo-2",
        title: "补充课程阅读笔记",
        projectId: courseId,
        dueDate: new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10),
        status: "todo",
        priority: "medium",
        createdAt,
        updatedAt: createdAt,
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
    request.onsuccess = () => resolve((request.result as AppState | undefined) ?? createInitialState());
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

function validateTask(value: unknown): value is Task {
  return isObject(value) && isString(value.id) && isString(value.title) &&
    (value.projectId === null || isString(value.projectId)) &&
    (value.dueDate === null || isString(value.dueDate)) &&
    ["todo", "doing", "done"].includes(String(value.status)) &&
    ["low", "medium", "high"].includes(String(value.priority)) &&
    isString(value.createdAt) && isString(value.updatedAt);
}

function validateResource(value: unknown): value is Resource {
  return isObject(value) && isString(value.id) && isString(value.title) && isString(value.location) &&
    ["link", "file", "note"].includes(String(value.kind)) &&
    (value.projectId === null || isString(value.projectId)) &&
    Array.isArray(value.tags) && value.tags.every(isString) && isString(value.createdAt);
}

function validateRecycle(value: unknown): value is RecycledItem {
  if (!isObject(value) || !isString(value.id) || !isString(value.deletedAt)) return false;
  if (!["project", "task", "resource"].includes(String(value.entityType))) return false;
  return value.entityType === "project" ? validateProject(value.payload) :
    value.entityType === "task" ? validateTask(value.payload) : validateResource(value.payload);
}

export function parseBackup(value: unknown): AppState {
  if (!isObject(value) || value.app !== "obsui" || value.format !== "obsui-backup-v1" || !isObject(value.state)) {
    throw new Error("不是有效的 ObsUI v1 备份文件。");
  }
  const state = value.state;
  if (state.schemaVersion !== 1 || !isString(state.updatedAt) ||
    !Array.isArray(state.projects) || !state.projects.every(validateProject) ||
    !Array.isArray(state.tasks) || !state.tasks.every(validateTask) ||
    !Array.isArray(state.resources) || !state.resources.every(validateResource) ||
    !Array.isArray(state.recycleBin) || !state.recycleBin.every(validateRecycle)) {
    throw new Error("备份结构或字段不完整，现有数据未改变。");
  }
  return {
    schemaVersion: 1,
    updatedAt: state.updatedAt,
    projects: state.projects,
    tasks: state.tasks,
    resources: state.resources,
    recycleBin: state.recycleBin,
  };
}

export function touch(state: AppState): AppState {
  return { ...state, updatedAt: now() };
}

import type { RepositoryEntry, RepositoryRelation } from "./repositories";

export type ProjectKind = "course" | "research" | "personal";
export type ProjectStatus = "active" | "paused" | "completed";
export type TaskStatus = "active" | "completed";
export type Priority = 1 | 2 | 3 | 4 | 5;
export type ResourceKind = "link" | "file" | "note";

export type Project = {
  id: string;
  title: string;
  kind: ProjectKind;
  status: ProjectStatus;
  tags: string[];
  description: string;
  createdAt: string;
  updatedAt: string;
};

export type Task = {
  id: string;
  title: string;
  projectId: string | null;
  dueDate: string;
  /** Local wall-clock deadline. Older records may omit it and default to 23:59. */
  dueTime?: string;
  status: TaskStatus;
  priority: Priority;
  folderPath: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type Resource = {
  id: string;
  title: string;
  location: string;
  kind: ResourceKind;
  projectId: string | null;
  tags: string[];
  createdAt: string;
};

export type RecycledItem = {
  id: string;
  entityType: "project" | "task" | "resource";
  deletedAt: string;
  payload: Project | Task | Resource;
};

export type AppState = {
  schemaVersion: 1;
  updatedAt: string;
  targetLastOpenedMonth: string;
  projects: Project[];
  tasks: Task[];
  resources: Resource[];
  repositories?: RepositoryEntry[];
  repositoryRelations?: RepositoryRelation[];
  recycleBin: RecycledItem[];
};

export type BackupEnvelope = {
  app: "obsui";
  format: "obsui-backup-v1";
  exportedAt: string;
  state: AppState;
};

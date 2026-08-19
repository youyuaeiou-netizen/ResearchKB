export type ProjectKind = "course" | "research" | "personal";
export type ProjectStatus = "active" | "paused" | "completed";
export type TaskStatus = "todo" | "doing" | "done";
export type Priority = "low" | "medium" | "high";
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
  dueDate: string | null;
  status: TaskStatus;
  priority: Priority;
  createdAt: string;
  updatedAt: string;
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
  projects: Project[];
  tasks: Task[];
  resources: Resource[];
  recycleBin: RecycledItem[];
};

export type BackupEnvelope = {
  app: "obsui";
  format: "obsui-backup-v1";
  exportedAt: string;
  state: AppState;
};

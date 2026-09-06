import type { Priority, Task } from "../types";

export type TargetTaskDraft = {
  id?: string;
  title: string;
  dueDate: string;
  priority: Priority;
  folderPath: string;
};

export type TargetMutationResult = { ok: true } | { ok: false; message: string };

export type TargetCalendarCell = {
  date: string;
  day: number;
  inMonth: boolean;
};

const pad = (value: number) => String(value).padStart(2, "0");

export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function localMonthKey(date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function isValidDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
}

export function isCompletedTask(task: Pick<Task, "status">): boolean {
  return task.status === "completed";
}

export function sortTargetTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((left, right) => {
    const completionOrder = Number(isCompletedTask(left)) - Number(isCompletedTask(right));
    if (completionOrder) return completionOrder;
    const leftDate = isValidDateKey(left.dueDate) ? left.dueDate : "9999-12-31";
    const rightDate = isValidDateKey(right.dueDate) ? right.dueDate : "9999-12-31";
    const dueOrder = leftDate.localeCompare(rightDate);
    if (dueOrder) return dueOrder;
    const priorityOrder = right.priority - left.priority;
    if (priorityOrder) return priorityOrder;
    return left.createdAt.localeCompare(right.createdAt);
  });
}

export function findTaskForDate(tasks: Task[], dueDate: string, ignoredId?: string): Task | undefined {
  return tasks.find((task) => task.dueDate === dueDate && task.id !== ignoredId);
}

export function clearCompletedOnMonthChange(tasks: Task[], previousMonth: string, currentMonth: string): Task[] {
  if (previousMonth === currentMonth) return tasks;
  return tasks.filter((task) => !isCompletedTask(task));
}

export function markTargetTaskCompleted(tasks: Task[], id: string, completedAt: string): Task[] {
  return tasks.map((task) => task.id === id && !isCompletedTask(task)
    ? { ...task, status: "completed", completedAt, updatedAt: completedAt }
    : task);
}

export function cancelTargetTask(tasks: Task[], id: string): Task[] {
  return tasks.filter((task) => task.id !== id);
}

export function buildTargetCalendar(year: number, monthIndex: number): TargetCalendarCell[] {
  const first = new Date(year, monthIndex, 1);
  const start = new Date(year, monthIndex, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    return {
      date: localDateKey(date),
      day: date.getDate(),
      inMonth: date.getFullYear() === year && date.getMonth() === monthIndex,
    };
  });
}

export function deadlineForDate(dueDate: string): Date | null {
  if (!isValidDateKey(dueDate)) return null;
  const [year, month, day] = dueDate.split("-").map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999);
}

function compactDuration(milliseconds: number): string {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60_000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor(totalMinutes % 1440 / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}天 ${hours}小时`;
  if (hours > 0) return `${hours}小时 ${minutes}分`;
  return `${minutes}分`;
}

export function remainingTimeLabel(task: Pick<Task, "dueDate" | "status">, now = new Date()): string {
  if (task.status === "completed") return "已完成";
  const deadline = deadlineForDate(task.dueDate);
  if (!deadline) return "截止日期无效";
  const difference = deadline.getTime() - now.getTime();
  if (difference < 0) return `已逾期 ${compactDuration(Math.abs(difference))}`;
  const prefix = task.dueDate === localDateKey(now) ? "今日截止 · " : "剩余 ";
  return `${prefix}${compactDuration(difference)}`;
}

export function deadlineProgress(task: Pick<Task, "createdAt" | "dueDate" | "status">, now = new Date()): number {
  if (task.status === "completed") return 100;
  const deadline = deadlineForDate(task.dueDate);
  const createdAt = new Date(task.createdAt);
  if (!deadline || Number.isNaN(createdAt.getTime())) return 0;
  const duration = deadline.getTime() - createdAt.getTime();
  if (duration <= 0) return now.getTime() >= deadline.getTime() ? 100 : 0;
  return Math.round(Math.min(100, Math.max(0, (now.getTime() - createdAt.getTime()) / duration * 100)));
}

export function formatDueDate(dueDate: string): string {
  const deadline = deadlineForDate(dueDate);
  if (!deadline) return "日期未设置";
  return deadline.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
}

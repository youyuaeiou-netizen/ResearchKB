import type { Task } from "./types";
import { isCompletedTask } from "./target-v1/task-model";

export function sortDashboardTasks(tasks: readonly Task[]): Task[] {
  return tasks
    .filter((task) => !isCompletedTask(task))
    .map((task, index) => ({ task, index }))
    .sort((left, right) => right.task.priority - left.task.priority ||
      left.task.dueDate.localeCompare(right.task.dueDate) ||
      left.task.createdAt.localeCompare(right.task.createdAt) ||
      left.index - right.index)
    .map(({ task }) => task);
}

export function selectDashboardTasks(tasks: readonly Task[]): Task[] {
  return sortDashboardTasks(tasks).slice(0, 2);
}

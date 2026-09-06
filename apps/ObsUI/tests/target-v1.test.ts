import type { Task } from "../src/types";
import {
  buildTargetCalendar,
  cancelTargetTask,
  clearCompletedOnMonthChange,
  deadlineProgress,
  findTaskForDate,
  localDateKey,
  markTargetTaskCompleted,
  remainingTimeLabel,
  sortTargetTasks,
} from "../src/target-v1/task-model";

function task(overrides: Partial<Task> & Pick<Task, "id" | "dueDate">): Task {
  return {
    title: overrides.id,
    projectId: null,
    status: "active",
    priority: 3,
    folderPath: "F:\\Projects\\Example",
    createdAt: "2026-08-01T08:00:00.000Z",
    updatedAt: "2026-08-01T08:00:00.000Z",
    completedAt: null,
    ...overrides,
  };
}

describe("Target Functional V1 rules", () => {
  it("sorts active tasks by date, priority and creation time, then puts completed tasks last", () => {
    const tasks = [
      task({ id: "completed", dueDate: "2026-08-01", status: "completed", completedAt: "2026-08-02T00:00:00.000Z" }),
      task({ id: "later", dueDate: "2026-08-12", priority: 5 }),
      task({ id: "same-low", dueDate: "2026-08-10", priority: 2 }),
      task({ id: "same-high-new", dueDate: "2026-08-10", priority: 5, createdAt: "2026-08-02T08:00:00.000Z" }),
      task({ id: "same-high-old", dueDate: "2026-08-10", priority: 5, createdAt: "2026-08-01T08:00:00.000Z" }),
    ];
    expect(sortTargetTasks(tasks).map((item) => item.id)).toEqual(["same-high-old", "same-high-new", "same-low", "later", "completed"]);
  });

  it("detects duplicate dates while allowing the current task during editing", () => {
    const tasks = [task({ id: "one", dueDate: "2026-08-27" })];
    expect(findTaskForDate(tasks, "2026-08-27")?.id).toBe("one");
    expect(findTaskForDate(tasks, "2026-08-27", "one")).toBeUndefined();
  });

  it("removes only completed tasks when a new month is entered", () => {
    const active = task({ id: "active", dueDate: "2026-09-02" });
    const completed = task({ id: "completed", dueDate: "2026-08-22", status: "completed", completedAt: "2026-08-23T00:00:00.000Z" });
    expect(clearCompletedOnMonthChange([active, completed], "2026-08", "2026-08")).toHaveLength(2);
    expect(clearCompletedOnMonthChange([active, completed], "2026-08", "2026-09")).toEqual([active]);
  });

  it("completes or cancels only the task record and preserves its folder path", () => {
    const first = task({ id: "first", dueDate: "2026-08-27", folderPath: "F:\\Projects\\First" });
    const second = task({ id: "second", dueDate: "2026-08-28", folderPath: "F:\\Projects\\Second" });
    const timestamp = "2026-08-27T12:00:00.000Z";
    const completed = markTargetTaskCompleted([first, second], "first", timestamp);
    expect(completed[0]).toMatchObject({ status: "completed", completedAt: timestamp, folderPath: "F:\\Projects\\First" });
    expect(completed[1]).toEqual(second);
    expect(cancelTargetTask(completed, "first")).toEqual([second]);
  });

  it("builds a Sunday-first six-week calendar", () => {
    const cells = buildTargetCalendar(2026, 7);
    expect(cells).toHaveLength(42);
    expect(cells[0]).toMatchObject({ date: "2026-07-26", inMonth: false });
    expect(cells.find((cell) => cell.date === "2026-08-01")).toMatchObject({ day: 1, inMonth: true });
    expect(cells.at(-1)).toMatchObject({ date: "2026-09-05", inMonth: false });
  });

  it("labels today, overdue and completed states without changing task data", () => {
    const now = new Date(2026, 7, 27, 12, 0, 0);
    const today = task({ id: "today", dueDate: localDateKey(now) });
    const overdue = task({ id: "overdue", dueDate: "2026-08-26" });
    const completed = task({ id: "completed", dueDate: "2026-08-20", status: "completed", completedAt: "2026-08-20T00:00:00.000Z" });
    expect(remainingTimeLabel(today, now)).toContain("今日截止");
    expect(remainingTimeLabel(overdue, now)).toContain("已逾期");
    expect(remainingTimeLabel(completed, now)).toBe("已完成");
    expect(deadlineProgress(completed, now)).toBe(100);
  });
});

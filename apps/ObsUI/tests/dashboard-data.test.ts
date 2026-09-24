import { describe, expect, it } from "vitest";
import { selectDashboardTasks, sortDashboardTasks } from "../src/dashboard-data";
import type { Task } from "../src/types";

function task(id: string, priority: Task["priority"], dueDate: string, createdAt: string, status: Task["status"] = "active"): Task {
  return { id, title: id, projectId: null, dueDate, status, priority, folderPath: "", createdAt, updatedAt: createdAt, completedAt: status === "completed" ? createdAt : null };
}

describe("dashboard task selection", () => {
  it("sorts unfinished tasks by priority, due date, then creation time", () => {
    const tasks = [
      task("low", 2, "2026-09-01", "2026-01-01T00:00:00.000Z"),
      task("high-late", 5, "2026-09-10", "2026-01-01T00:00:00.000Z"),
      task("high-early", 5, "2026-09-02", "2026-01-02T00:00:00.000Z"),
      task("done", 5, "2026-09-01", "2026-01-01T00:00:00.000Z", "completed"),
    ];
    expect(sortDashboardTasks(tasks).map((item) => item.id)).toEqual(["high-early", "high-late", "low"]);
    expect(selectDashboardTasks(tasks).map((item) => item.id)).toEqual(["high-early", "high-late"]);
  });
});

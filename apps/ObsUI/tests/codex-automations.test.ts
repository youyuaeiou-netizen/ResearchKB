import { describe, expect, it } from "vitest";
import { parseAutomationMetadata, parseCodexAutomationsState } from "../src/codex-automations";

describe("Codex automation helpers", () => {
  it("extracts safe metadata without returning the prompt", () => {
    const automation = parseAutomationMetadata(`
      name = " 每周整理 " # display name
      status = "ACTIVE"
      rrule = "FREQ=WEEKLY;BYDAY=MO"
      prompt = "不要把这段内容返回给页面"
    `, "weekly-job", "weekly-job", 1788763200000);
    expect(automation).toEqual({ id: "weekly-job", name: "每周整理", status: "active", schedule: "FREQ=WEEKLY;BYDAY=MO", updatedAt: 1788763200000 });
    expect(automation).not.toHaveProperty("prompt");
  });

  it("normalizes paused status and falls back to the directory name", () => {
    expect(parseAutomationMetadata("status = 'PAUSED'\ncron = '0 9 * * 1'", "course-review", "course-review", 1788763200000)).toEqual({
      id: "course-review", name: "course-review", status: "paused", schedule: "0 9 * * 1", updatedAt: 1788763200000,
    });
    expect(parseAutomationMetadata("name = []", "invalid", "invalid", 1788763200000)).toEqual({
      id: "invalid", name: "invalid", status: "unknown", schedule: null, updatedAt: 1788763200000,
    });
    expect(parseAutomationMetadata("name = \"valid\"", "", "id", 1788763200000)).toBeNull();
  });

  it("validates and orders the read-only API state by update time", () => {
    expect(parseCodexAutomationsState({
      status: "ready",
      checkedAt: 1788763200000,
      data: [
        { id: "old", name: "旧任务", status: "paused", schedule: null, updatedAt: 10 },
        { id: "new", name: "新任务", status: "active", schedule: "FREQ=DAILY", updatedAt: 20 },
      ],
    })?.data.map((item) => item.id)).toEqual(["new", "old"]);
    expect(parseCodexAutomationsState({ status: "ready", checkedAt: 1, data: [{ id: "x", name: "x", status: "active", schedule: "", updatedAt: 2 }] })).toBeNull();
    expect(parseCodexAutomationsState({ status: "unavailable", checkedAt: null, data: [] })).toEqual({ status: "unavailable", checkedAt: null, data: [] });
  });
});

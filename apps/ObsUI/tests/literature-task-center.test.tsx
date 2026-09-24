import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { LiteratureTaskCenter } from "../src/LiteratureTaskCenter";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => vi.unstubAllGlobals());

it("shows actual page progress beside the top task entry", async () => {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ tasks: [{
    id: "one", kind: "deep-analysis", title: "深读论文并生成报告", executor: "ollama", status: "running",
    itemIds: ["local-1"], total: 1, completed: 0, failed: 0, currentItemId: "local-1",
    totalPages: 12, completedPages: 3, phase: "reading", reportCount: 0, reportSkipped: 0,
    error: null, output: "已读取第 3/12 页", createdAt: 1, startedAt: 1, finishedAt: null,
  }] }) }));
  vi.stubGlobal("fetch", fetchMock);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    await act(async () => { root.render(<LiteratureTaskCenter />); await Promise.resolve(); });
    expect(host.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("3");
    expect(host.textContent).toContain("3/12 页");
    const trigger = host.querySelector<HTMLButtonElement>(".obsui-task-center-trigger");
    await act(async () => trigger!.click());
    expect(host.textContent).toContain("3 / 12 页");
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});

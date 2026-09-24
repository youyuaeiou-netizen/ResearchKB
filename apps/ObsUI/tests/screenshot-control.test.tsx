import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScreenshotControl } from "../src/ScreenshotControl";
import { DEFAULT_WORKBENCH_SETTINGS } from "../src/workbench-settings";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounts: { host: HTMLDivElement; root: ReturnType<typeof createRoot> }[] = [];

afterEach(() => {
  for (const { host, root } of mounts.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
  vi.unstubAllGlobals();
});

describe("ScreenshotControl", () => {
  it("recreates the per-process command directory before atomic writes", async () => {
    const source = await readFile(join(process.cwd(), "src", "screenshot-server.ts"), "utf8");
    expect(source).toContain("await mkdir(dirname(path), { recursive: true });");
    expect(source).toContain('join(resolve(projectRoot), ".obsui-runtime", "screenshot", String(process.pid))');
    const viteConfig = await readFile(join(process.cwd(), "vite.config.ts"), "utf8");
    expect(viteConfig).toContain('ignored: [join(process.cwd(), ".obsui-runtime", "**")]');
  });

  it("lets a completed capture be discarded from the camera menu", async () => {
    let hasCapture = true;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/cancel")) hasCapture = false;
      return {
        ok: true,
        json: async () => ({
          available: true,
          running: true,
          enabled: true,
          hotkey: "Ctrl+Alt+Z",
          hotkeyStatus: "registered",
          phase: hasCapture ? "ready" : "idle",
          mode: hasCapture ? "region" : null,
          hasCapture,
          saved: false,
          lastError: null,
        }),
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    mounts.push({ host, root });
    await act(async () => root.render(<ScreenshotControl settings={DEFAULT_WORKBENCH_SETTINGS.screenshot} />));
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label^="截图（"]')?.click());

    const menuItems = () => [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    expect(menuItems().map((button) => button.textContent)).toContain("保存 PNG");
    const cancel = menuItems().find((button) => button.textContent === "取消截图");
    expect(cancel).toBeDefined();
    await act(async () => cancel?.click());

    expect(fetchMock).toHaveBeenCalledWith("/api/screenshot/cancel", expect.objectContaining({ method: "POST" }));
    expect(menuItems().some((button) => button.textContent === "取消截图")).toBe(false);
    expect(menuItems().some((button) => button.textContent === "保存 PNG")).toBe(false);
  });
});

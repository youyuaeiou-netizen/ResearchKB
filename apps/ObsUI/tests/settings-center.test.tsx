import { createRoot, type Root } from "react-dom/client";
import { act, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsCenter } from "../src/SettingsCenter";
import { DEFAULT_WORKBENCH_SETTINGS } from "../src/workbench-settings";

vi.mock("../src/version-info", () => ({ OBSUI_VERSION: "0.1.0", OBSUI_BUILD_HISTORY: [] }));

const mounts: { host: HTMLDivElement; root: Root }[] = [];
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount(node: ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounts.push({ host, root });
  act(() => root.render(node));
  return host;
}

afterEach(() => {
  for (const { host, root } of mounts.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
  vi.unstubAllGlobals();
});

describe("SettingsCenter", () => {
  it("uses the live Codex catalog in global H.D.D settings", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const payload = String(input).includes("/api/hdd/providers")
        ? { providers: [{ id: "codex", label: "Codex CLI", detail: "本机 Codex", available: true, version: "0.155", models: [
          { id: "gpt-6-sol", label: "GPT-6-Sol", reasoningEfforts: ["low", "medium", "high", "ultra"], isDefault: true },
          { id: "gpt-5.6-luna", label: "GPT-5.6-Luna", reasoningEfforts: ["low", "medium", "high", "max"], isDefault: false },
        ] }] }
        : { windowsStartup: false, applications: { zotero: false, flclash: false, ollama: false }, customApplications: [], applicationsStatus: [] };
      return { ok: true, json: async () => payload } as Response;
    }));
    const onSettingsChange = vi.fn();
    const host = mount(<SettingsCenter initialSection="hdd" settings={structuredClone(DEFAULT_WORKBENCH_SETTINGS)} onSettingsChange={onSettingsChange} onClose={vi.fn()} onExport={vi.fn()} onImport={vi.fn()} onReset={vi.fn()} updatedAt="2026-09-23T00:00:00.000Z" />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const modelSelect = [...host.querySelectorAll<HTMLSelectElement>(".settings-two-columns select")][1];
    expect([...modelSelect.options].map((option) => option.textContent)).toEqual(["GPT-6-Sol", "GPT-5.6-Luna"]);
    act(() => { modelSelect.value = "gpt-6-sol"; modelSelect.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ hdd: expect.objectContaining({ model: "gpt-6-sol" }) }));
  });

  it("exposes a truthful plugin section for future extensions", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const payload = url.includes("/api/hdd/providers")
        ? { providers: [] }
        : { windowsStartup: false, applications: { zotero: false, flclash: false, ollama: false }, customApplications: [], applicationsStatus: [] };
      return { ok: true, json: async () => payload } as Response;
    }));

    const host = mount(<SettingsCenter
      initialSection="plugins"
      settings={structuredClone(DEFAULT_WORKBENCH_SETTINGS)}
      onSettingsChange={vi.fn()}
      onClose={vi.fn()}
      onExport={vi.fn()}
      onImport={vi.fn()}
      onReset={vi.fn()}
      updatedAt="2026-09-15T00:00:00.000Z"
    />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect([...host.querySelectorAll(".settings-center-nav button")].map((button) => button.textContent)).toContain("插件");
    expect(host.querySelector("h2")?.textContent).toBe("插件");
    expect(host.textContent).toContain("插件中心已预留");
    expect(host.textContent).toContain("系统截图");
    expect(host.textContent).toContain("选区翻译");
    expect(host.textContent).toContain("来源、权限和数据范围");
    expect(host.querySelector<HTMLButtonElement>('button[title="插件管理尚未接入"]')?.disabled).toBe(true);
  });
});

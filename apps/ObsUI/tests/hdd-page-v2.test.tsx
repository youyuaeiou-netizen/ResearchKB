import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HddPageV2 } from "../src/tab-modal-v2/HddPageV2";
import { TabModalV2 } from "../src/tab-modal-v2/TabModalV2";
import type { V2BusinessContext } from "../src/tab-modal-v2/model";

const mounts: { host: HTMLDivElement; root: Root }[] = [];
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounts.push({ host, root });
  act(() => root.render(node));
  return host;
}

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}

afterEach(() => {
  for (const { host, root } of mounts.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
  vi.restoreAllMocks();
});

describe("H.D.D V2 页面", () => {
  it("replaces the placeholder with a two-pane read-only conversation workbench", async () => {
    const conversation = {
      id: "hdd-v2-test",
      title: "研究笔记",
      createdAt: "2026-09-02T08:00:00.000Z",
      updatedAt: "2026-09-02T08:00:00.000Z",
      messages: [{ id: "assistant-1", role: "assistant", content: "已找到相关记录。\n来源: notes/intro.md", createdAt: "2026-09-02T08:00:00.000Z" }],
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/status")) return jsonResponse({ available: true, version: "1.0.0", message: "本机 Codex CLI 可用。" });
      if (url.endsWith("/conversations")) return jsonResponse({ conversations: [{ id: conversation.id, title: conversation.title, createdAt: conversation.createdAt, updatedAt: conversation.updatedAt }] });
      return jsonResponse(conversation);
    });
    const context = { actions: { openSettings: vi.fn() } } as unknown as V2BusinessContext;

    const host = mount(<TabModalV2 activeTab="hdd" activeView="hdd" context={context} onTabChange={() => undefined} onClose={() => undefined} />);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });

    expect(host.querySelector(".tab-modal-v2__hdd-workbench")).not.toBeNull();
    expect(host.querySelector(".tab-modal-v2__hdd-context-panel")).toBeNull();
    expect(host.querySelector(".tab-modal-v2__hdd-inline-sources")).not.toBeNull();
    expect(host.querySelector('[aria-label*="页面结构占位"]')).toBeNull();
    expect(host.textContent).toContain("研究笔记");
    expect(host.textContent).toContain("intro.md");
    expect(host.textContent).toContain("来源预览");
    expect(host.querySelector('button[aria-label="H.D.D 设置"]')).not.toBeNull();
    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="H.D.D 设置"]')?.click());
    expect(host.querySelector('[role="dialog"][aria-label="H.D.D 设置菜单"]')).not.toBeNull();
    expect(host.querySelector('.tab-modal-v2__hdd-library-settings')).toBeNull();
    expect(host.querySelector('button[aria-label="H.D.D 设置"]')?.getAttribute("aria-expanded")).toBe("true");
    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="关闭设置菜单"]')?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(host.querySelector('[role="dialog"][aria-label="H.D.D 设置菜单"]')).toBeNull();
    expect(host.querySelector(".tab-modal-v2__hdd-workbench")).not.toBeNull();
    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="H.D.D 设置"]')?.click());
    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="打开项目库设置"]')?.click());
    expect(host.querySelector('.tab-modal-v2__hdd-settings-popover')).toBeNull();
    expect(host.querySelector('[aria-label="项目库设置"].tab-modal-v2__hdd-library-settings')).not.toBeNull();
    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="取消选择想法项目库"]')?.click());
    expect(host.textContent).toContain("5 / 6");
    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="选择想法项目库"]')?.click());
    expect(host.textContent).toContain("6 / 6");
    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="返回对话"]')?.click());
    expect(host.querySelector(".tab-modal-v2__hdd-library-settings")).toBeNull();
    expect(host.querySelector('button[aria-label="搜索"]')).not.toBeNull();
    expect(host.textContent).not.toContain("在线");
    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="搜索"]')?.click());
    const searchDialog = host.querySelector('[role="dialog"][aria-label="搜索聊天"]');
    expect(searchDialog).not.toBeNull();
    expect(searchDialog?.getAttribute("aria-modal")).toBe("true");
    expect(host.querySelector(".tab-modal-v2__hdd-search-overlay")).not.toBeNull();
    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="关闭搜索"]')?.click());
    expect(host.querySelector('[role="dialog"][aria-label="搜索聊天"]')).toBeNull();
    expect(host.querySelector<HTMLSelectElement>('select[aria-label="模型"]')?.value).toBe("gpt-5.6-luna");
    expect([...host.querySelectorAll<HTMLSelectElement>('select[aria-label="模型"] option')].map((option) => option.textContent)).toEqual(["5.5", "5.6 Luna", "5.6 Terra", "5.6 Sol"]);
    expect([...host.querySelectorAll<HTMLSelectElement>('select[aria-label="模型强度"] option')].map((option) => option.textContent)).toEqual(["low", "medium", "high", "xhigh", "max"]);
    expect(host.querySelector<HTMLSelectElement>('select[aria-label="模型强度"]')?.value).toBe("high");
  });

  it("does not reserve a central new-session header while no conversation is active", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/status")) return jsonResponse({ available: true, version: "1.0.0", message: "本机 Codex CLI 可用。" });
      return jsonResponse({ conversations: [] });
    });
    const context = { actions: { openSettings: vi.fn() } } as unknown as V2BusinessContext;
    const host = mount(<HddPageV2 nav="chat" context={context} />);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });

    expect(host.querySelector('.tab-modal-v2__hdd-conversation.is-empty')).not.toBeNull();
    expect(host.querySelector('.tab-modal-v2__hdd-conversation-header')).toBeNull();
    expect(host.querySelector('h2')).toBeNull();
    expect(host.textContent).not.toContain("新会话");
  });

  it("deletes a conversation from the list after confirmation", async () => {
    const conversation = {
      id: "hdd-v2-delete",
      title: "研究笔记",
      createdAt: "2026-09-02T08:00:00.000Z",
      updatedAt: "2026-09-02T08:00:00.000Z",
      messages: [],
    };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "DELETE") return jsonResponse({ deleted: true });
      if (url.endsWith("/status")) return jsonResponse({ available: true, version: "1.0.0", message: "本机 Codex CLI 可用。" });
      if (url.endsWith("/conversations")) return jsonResponse({ conversations: [{ id: conversation.id, title: conversation.title, createdAt: conversation.createdAt, updatedAt: conversation.updatedAt }] });
      return jsonResponse(conversation);
    });
    const context = { actions: { openSettings: vi.fn() } } as unknown as V2BusinessContext;
    const host = mount(<HddPageV2 nav="chat" context={context} />);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });

    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="删除会话：研究笔记"]')?.click());
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain("删除这个会话？");
    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[aria-label="确认删除"]')?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(fetchSpy).toHaveBeenCalledWith("/api/hdd/conversations/hdd-v2-delete", expect.objectContaining({ method: "DELETE" }));
    expect(host.querySelector('button[aria-label="删除会话：研究笔记"]')).toBeNull();
    expect(host.querySelector(".tab-modal-v2__hdd-conversation.is-empty")).not.toBeNull();
  });

  it("keeps the settings route available through the existing V2 view mapping", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/status")) return jsonResponse({ available: false, version: null, message: "Codex CLI 未找到。" });
      return jsonResponse({ conversations: [] });
    });
    const openSettings = vi.fn();
    const context = { actions: { openSettings } } as unknown as V2BusinessContext;
    const host = mount(<HddPageV2 nav="settings" context={context} />);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });

    expect(host.textContent).toContain("H.D.D 本机桥接");
    expect(host.textContent).toContain("Codex CLI 未找到");
    act(() => host.querySelector<HTMLButtonElement>(".tab-modal-v2__hdd-status-card button")?.click());
    expect(openSettings).toHaveBeenCalledTimes(1);
  });
});

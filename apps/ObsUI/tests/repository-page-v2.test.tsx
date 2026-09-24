import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../src/storage";
import { RepositoryPageV2 } from "../src/tab-modal-v2/RepositoryPageV2";
import type { V2BusinessContext } from "../src/tab-modal-v2/model";
import type { RepositoryEntry } from "../src/repositories";

const mounts: { host: HTMLDivElement; root: Root }[] = [];
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount(context: V2BusinessContext) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounts.push({ host, root });
  act(() => root.render(<RepositoryPageV2 context={context} />));
  return host;
}

function response(payload: unknown, ok = true) {
  return { ok, json: async () => payload } as Response;
}

function makeRepository(kind: RepositoryEntry["kind"], name: string, id = `${kind}-1`): RepositoryEntry {
  return { id, kind, name, localPath: `C:/Workspace/${name}`, remoteUrl: "", note: "", createdAt: "2026-09-16", updatedAt: "2026-09-16" };
}

function createContext(repositories: RepositoryEntry[] = [], overrides: Partial<V2BusinessContext["actions"]> = {}) {
  const state = createInitialState();
  state.repositories = repositories;
  const actions = {
    addRepository: vi.fn(),
    removeRepository: vi.fn(),
    ...overrides,
  };
  return { ready: true, storageError: null, state, actions } as unknown as V2BusinessContext;
}

afterEach(() => {
  for (const { host, root } of mounts.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("V2 仓库页面", () => {
  it("支持分类和搜索", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("test status unavailable")));
    const host = mount(createContext([makeRepository("git", "ResearchKB"), makeRepository("obsidian", "Notes", "obsidian-1"), makeRepository("material", "素材", "material-1")]));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(host.querySelectorAll("[data-repository-id]")).toHaveLength(3);
    act(() => host.querySelector<HTMLButtonElement>('[data-repository-filter="git"]')?.click());
    expect(host.querySelectorAll("[data-repository-id]")).toHaveLength(1);
    expect(host.textContent).toContain("ResearchKB");
    const search = host.querySelector<HTMLInputElement>('input[aria-label="搜索仓库"]')!;
    act(() => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      nativeSetter?.call(search, "Notes");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => host.querySelector<HTMLButtonElement>('[data-repository-filter="all"]')?.click());
    expect(host.querySelectorAll("[data-repository-id]")).toHaveLength(1);
    expect(host.textContent).toContain("Notes");
  });

  it("通过接口添加当前工作区", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ path: "C:/WorkSpace/ResearchKB", name: "ResearchKB" }));
    vi.stubGlobal("fetch", fetchMock);
    const context = createContext();
    const host = mount(context);
    await act(async () => { host.querySelector<HTMLButtonElement>('button')?.click(); await Promise.resolve(); });
    const button = Array.from(host.querySelectorAll("button")).find((candidate) => candidate.textContent?.includes("添加当前工作区"));
    await act(async () => { button?.click(); await Promise.resolve(); });
    expect(context.actions.addRepository).toHaveBeenCalledWith(expect.objectContaining({ kind: "git", name: "ResearchKB", localPath: "C:/WorkSpace/ResearchKB" }));
    expect(host.textContent).toContain("已登记当前工作区");
  });

  it("显示 Git 状态、刷新错误、打开目录并只移除登记", async () => {
    const repository = makeRepository("git", "ResearchKB");
    const snapshot = { rootPath: repository.localPath, branch: "main", detached: false, state: "modified", staged: 2, unstaged: 3, untracked: 1, conflicted: 0, originUrl: "https://example.com/repo.git", latestCommit: { shortHash: "abc1234", committedAt: "2026-09-16T08:00:00.000Z", subject: "最近提交" }, checkedAt: "2026-09-16T08:00:00.000Z" };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ status: "ready", snapshot }))
      .mockResolvedValueOnce(response({ status: "unavailable", message: "Git 状态读取超时。" }, false))
      .mockResolvedValueOnce(response({ message: "已打开关联文件夹。" }));
    vi.stubGlobal("fetch", fetchMock);
    const context = createContext([repository]);
    const host = mount(context);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(host.textContent).toContain("main");
    expect(host.textContent).toContain("暂存");
    expect(host.textContent).toContain("abc1234");
    const refresh = host.querySelector<HTMLButtonElement>('button[aria-label="刷新仓库状态"]')!;
    await act(async () => { refresh.click(); await Promise.resolve(); await Promise.resolve(); });
    expect(host.textContent).toContain("Git 状态读取超时");
    const open = host.querySelector<HTMLButtonElement>('button[aria-label="打开ResearchKB的本地目录"]')!;
    await act(async () => { open.click(); await Promise.resolve(); });
    expect(fetchMock).toHaveBeenCalledWith("/api/folders/open", expect.objectContaining({ method: "POST", body: JSON.stringify({ folderPath: repository.localPath }) }));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const remove = host.querySelector<HTMLButtonElement>('button[aria-label="移除ResearchKB登记"]')!;
    act(() => remove.click());
    expect(confirm).toHaveBeenCalled();
    expect(context.actions.removeRepository).toHaveBeenCalledWith(repository.id);
  });
});

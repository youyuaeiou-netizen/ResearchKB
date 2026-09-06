import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalPage } from "../src/tab-modal-v2/V2Pages";
import { TargetV1 } from "../src/target-v1/TargetV1";
import type { ProxyLaunchResult, V2BusinessContext } from "../src/tab-modal-v2/model";
import { createInitialState } from "../src/storage";

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

afterEach(() => {
  for (const { host, root } of mounts.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
});

function createLocalContext(options: { state?: V2BusinessContext["state"]; onLaunchClashVerge?: () => void | Promise<ProxyLaunchResult> } = {}): V2BusinessContext {
  return {
    ready: true,
    storageError: null,
    state: options.state ?? createInitialState(),
    systemMetrics: { status: "ready", data: { cpu: 31, gpu: 12, memory: 57, disk: 4, sampledAt: 1787230819075 } },
    codexUsage: { status: "ready", data: { usedPercent: 25, remainingPercent: 75, windowMinutes: 10080, resetsAt: 1788876000000, sampledAt: 1787230819075 } },
    networkMetrics: {
      status: "ready",
      data: {
        adapter: { name: "Wi-Fi", localIpv4: "192.168.1.10", linkSpeed: "1 Gbps" },
        downloadBytesPerSecond: 2048,
        uploadBytesPerSecond: 1024,
        latency: { target: "1.1.1.1:443", milliseconds: 18, sampledAt: 1787230819075 },
        flClash: { running: false, launchConfigured: false },
        sampledAt: 1787230819075,
      },
    },
    networkEgress: { loading: false, data: { status: "idle", checkedAt: null, data: null } },
    localModels: { loading: false, data: { status: "ready", checkedAt: 1787230819075, models: [{ name: "qwen3:4b" }] } },
    automation: { running: false, seconds: 0 },
    actions: {
      addProject: () => undefined,
      addResource: () => undefined,
      addTask: () => undefined,
      toggleTask: () => undefined,
      saveTargetTask: () => ({ ok: true }),
      completeTargetTask: () => undefined,
      cancelTargetTask: () => undefined,
      cleanupTargetTasks: () => undefined,
      toggleAutomation: () => undefined,
      resetAutomation: () => undefined,
      refreshEgress: () => undefined,
      exportData: () => undefined,
      importData: () => undefined,
      resetDemo: () => undefined,
      launchFlClash: () => undefined,
      launchClashVerge: options.onLaunchClashVerge ?? (() => undefined),
      openSettings: () => undefined,
    },
  };
}

describe("LocalPage", () => {
  it("renders the quota strip and four ordered overview cards", () => {
    const host = mount(<LocalPage nav="overview" context={createLocalContext()} />);

    expect(host.textContent).toContain("Codex 使用限额");
    expect(host.textContent).toContain("75%");
    expect(host.querySelectorAll(".tab-modal-v2__overview-card")).toHaveLength(4);
    expect(host.querySelector('[data-overview-card="system"]')).not.toBeNull();
    expect(host.querySelector('[data-overview-card="network"]')).not.toBeNull();
    expect(host.querySelector('[data-overview-card="local-model"]')).not.toBeNull();
    expect(host.querySelector('[data-overview-card="automation"]')).not.toBeNull();
    expect(host.querySelector(".tab-modal-v2__detail-grid")).toBeNull();
    expect(host.textContent).toContain("CPU");
    expect(host.textContent).toContain("硬盘");
    expect(host.textContent).toContain("下载");
    expect(host.textContent).toContain("上传");
    expect(host.textContent).toContain("192.168.1.10");
    expect(host.textContent).toContain("本地模型");
    expect(host.textContent).toContain("qwen3:4b");
    expect(host.textContent).toContain("VRAM");
    expect(host.textContent).toContain("RAM");
    expect(host.textContent).toContain("Codex 自动化");
    expect(host.textContent).toContain("运行周期");
    expect(host.textContent).toContain("上次运行");
    expect(host.textContent).toContain("下次运行");
    expect(host.textContent).toContain("未接入");
    expect(host.textContent).not.toContain("尚未接入 Codex 自动化列表");
    expect(host.querySelectorAll(".tab-modal-v2__overview-card small")).toHaveLength(0);
    expect(host.querySelectorAll(".tab-modal-v2__overview-card .tab-modal-v2__card-code")).toHaveLength(0);
    expect(host.querySelectorAll(".tab-modal-v2__overview-card .tab-modal-v2__overview-status")).toHaveLength(0);
  });

  it("opens the proxy menu and lets the Clash Verge action run", async () => {
    let clashVergeLaunches = 0;
    const host = mount(<LocalPage nav="overview" context={createLocalContext({ onLaunchClashVerge: () => { clashVergeLaunches += 1; } })} />);
    const openProxy = host.querySelector<HTMLButtonElement>('button[aria-controls="obsui-proxy-actions"]');

    expect(openProxy).not.toBeNull();
    act(() => openProxy?.click());

    const menu = host.querySelector("#obsui-proxy-actions");
    expect(menu?.textContent).toContain("打开 FlClash");
    expect(menu?.textContent).toContain("打开 Clash Verge");
    const buttons = menu?.querySelectorAll("button");
    expect(buttons?.[1]?.disabled).toBe(false);
    await act(async () => {
      buttons?.[1]?.click();
      await Promise.resolve();
    });
    expect(clashVergeLaunches).toBe(1);
  });

  it("shows proxy launch progress and the returned result inside the card", async () => {
    let finishLaunch: ((result: ProxyLaunchResult) => void) | undefined;
    const host = mount(<LocalPage nav="overview" context={createLocalContext({
      onLaunchClashVerge: () => new Promise<ProxyLaunchResult>((resolve) => { finishLaunch = resolve; }),
    })} />);
    const openProxy = host.querySelector<HTMLButtonElement>('button[aria-controls="obsui-proxy-actions"]');

    act(() => openProxy?.click());
    const buttons = host.querySelectorAll<HTMLButtonElement>("#obsui-proxy-actions button");
    act(() => buttons[1]?.click());
    expect(host.textContent).toContain("正在打开 Clash Verge…");

    await act(async () => {
      finishLaunch?.({ ok: true, message: "Clash Verge 已启动。" });
      await Promise.resolve();
    });
    expect(host.textContent).toContain("Clash Verge 已启动。");
  });

  it("clears proxy launch feedback after three seconds", async () => {
    vi.useFakeTimers();
    try {
      let finishLaunch: ((result: ProxyLaunchResult) => void) | undefined;
      const host = mount(<LocalPage nav="overview" context={createLocalContext({
        onLaunchClashVerge: () => new Promise<ProxyLaunchResult>((resolve) => { finishLaunch = resolve; }),
      })} />);
      act(() => host.querySelector<HTMLButtonElement>('button[aria-controls="obsui-proxy-actions"]')?.click());
      act(() => host.querySelectorAll<HTMLButtonElement>("#obsui-proxy-actions button")[1]?.click());
      await act(async () => {
        finishLaunch?.({ ok: true, message: "Clash Verge 已启动。" });
        await Promise.resolve();
      });

      expect(host.textContent).toContain("Clash Verge 已启动。");
      act(() => vi.advanceTimersByTime(2_999));
      expect(host.textContent).toContain("Clash Verge 已启动。");
      act(() => vi.advanceTimersByTime(1));
      expect(host.textContent).not.toContain("Clash Verge 已启动。");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("TargetV1", () => {
  it("treats the associated folder as optional and hides the empty-folder action", () => {
    const state = createInitialState();
    state.tasks = [{
      id: "no-folder-task",
      title: "买电脑",
      projectId: null,
      dueDate: "2026-09-06",
      status: "active",
      priority: 3,
      folderPath: "",
      createdAt: "2026-09-01T08:00:00.000Z",
      updatedAt: "2026-09-01T08:00:00.000Z",
      completedAt: null,
    }];
    const host = mount(<TargetV1 context={createLocalContext({ state })} />);

    expect(host.textContent).toContain("买电脑");
    expect(host.querySelector(".target-v1__primary .target-v1__go")).toBeNull();

    const emptyState = createInitialState();
    const dialogHost = mount(<TargetV1 context={createLocalContext({ state: emptyState })} />);
    act(() => dialogHost.querySelectorAll<HTMLButtonElement>(".target-v1__section-button")[1]?.click());
    expect(dialogHost.querySelector(".target-v1__calendar-grid")).not.toBeNull();
    act(() => dialogHost.querySelector<HTMLButtonElement>(".target-v1__calendar-grid button")?.click());

    const folderInput = dialogHost.querySelector<HTMLInputElement>('input[aria-label="关联文件夹（可选）"]');
    expect(folderInput).not.toBeNull();
    expect(folderInput?.required).toBe(false);
    expect(dialogHost.textContent).toContain("关联文件夹（可选）");
  });
});

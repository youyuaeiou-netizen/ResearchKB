import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalPage } from "../src/tab-modal-v2/V2Pages";
import { TargetV1 } from "../src/target-v1/TargetV1";
import type { ProxyLaunchResult, V2BusinessContext } from "../src/tab-modal-v2/model";
import { localDateKey, type TargetTaskDraft } from "../src/target-v1/task-model";
import { createInitialState } from "../src/storage";
import { DEFAULT_LOCAL_MODEL_SETTINGS } from "../src/local-models";

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

function rerender(host: HTMLDivElement, node: React.ReactNode) {
  const mounted = mounts.find((entry) => entry.host === host);
  if (!mounted) throw new Error("Expected mounted local page.");
  act(() => mounted.root.render(node));
}

function unmount(host: HTMLDivElement) {
  const index = mounts.findIndex((entry) => entry.host === host);
  if (index < 0) throw new Error("Expected mounted local page.");
  const [mounted] = mounts.splice(index, 1);
  act(() => mounted.root.unmount());
  mounted.host.remove();
}

afterEach(() => {
  for (const { host, root } of mounts.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

function createLocalContext(options: { state?: V2BusinessContext["state"]; onLaunchClashVerge?: () => void | Promise<ProxyLaunchResult> } = {}): V2BusinessContext {
  return {
    ready: true,
    storageError: null,
    state: options.state ?? createInitialState(),
    systemMetrics: { status: "ready", data: {
      cpu: 31, gpu: 12, memory: 57, disk: 4, temperatures: { cpu: 54, gpu: 40, memory: null, disk: null },
      sensors: [
        { id: "windows:cpu-clock", label: "CPU 频率", category: "cpu", kind: "clock", value: 4718, unit: "MHz", source: "windows", sourceLabel: "Windows", role: "cpu-clock" },
        { id: "windows:cpu-load", label: "CPU 占用", category: "cpu", kind: "load", value: 31, unit: "%", source: "windows", sourceLabel: "Windows", role: "cpu-load" },
        { id: "windows:memory-load", label: "内存占用", category: "memory", kind: "load", value: 57, unit: "%", source: "windows", sourceLabel: "Windows", role: "memory-load" },
        { id: "windows:disk-load", label: "硬盘活动", category: "storage", kind: "load", value: 4, unit: "%", source: "windows", sourceLabel: "Windows", role: "disk-load" },
        { id: "nvidia:0:core-clock", label: "GPU 0 核心频率", category: "gpu", kind: "clock", value: 2490, unit: "MHz", source: "nvidia-smi", sourceLabel: "NVIDIA SMI", role: "gpu-core-clock" },
        { id: "nvidia:0:power", label: "GPU 0 功耗", category: "gpu", kind: "power", value: 39, unit: "W", source: "nvidia-smi", sourceLabel: "NVIDIA SMI", role: "gpu-power" },
        { id: "nvidia:0:temperature", label: "GPU 温度", category: "gpu", kind: "temperature", value: 40, unit: "°C", source: "nvidia-smi", sourceLabel: "NVIDIA SMI", role: "gpu-temperature" },
        { id: "windows:cpu-temperature", label: "CPU 温度", category: "cpu", kind: "temperature", value: 54, unit: "°C", source: "windows", sourceLabel: "Windows ACPI", role: "cpu-temperature" },
      ],
      sources: { hardwareMonitor: null, hwinfo: false, nvidia: true }, sampledAt: 1787230819075,
    } },
    codexUsage: { status: "ready", data: { windows: [
      { usedPercent: 25, remainingPercent: 75, windowMinutes: 300, resetsAt: 1788876000000 },
      { usedPercent: 40, remainingPercent: 60, windowMinutes: 10080, resetsAt: 1788876000000 },
    ], sampledAt: 1787230819075 } },
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
    localModels: { loading: false, data: { status: "ready", checkedAt: 1787230819075, models: [{ name: "qwen3:4b" }] }, refresh: () => undefined },
    literatureStartup: {
      status: "ready",
      zoteroEnabled: true,
      runtime: null,
      items: null,
    },
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
  it("renders the quota strip and five ordered overview cards", () => {
    const host = mount(<LocalPage nav="overview" context={createLocalContext()} />);

    expect(host.textContent).toContain("Codex 使用限额");
    expect(host.textContent).toContain("75%");
    expect(host.textContent).toContain("5 小时");
    expect(host.textContent).toContain("1 周");
    expect(host.querySelectorAll(".tab-modal-v2__overview-card")).toHaveLength(5);
    expect(host.querySelector(".tab-modal-v2__rail-heading")).toBeNull();
    expect(host.querySelector(".tab-modal-v2__rail-controls")).toBeNull();
    expect(host.querySelector('[data-overview-card="device-profile"]')).not.toBeNull();
    expect(host.querySelector('[data-overview-card="system"]')).not.toBeNull();
    expect(host.querySelector('[data-overview-card="network"]')).not.toBeNull();
    expect(host.querySelector('[data-overview-card="local-model"]')).not.toBeNull();
    expect(host.querySelector('[data-overview-card="automation"]')).not.toBeNull();
    expect(host.querySelector(".tab-modal-v2__detail-grid")).toBeNull();
    expect(host.textContent).toContain("CPU");
    expect(host.textContent).toContain("硬盘");
    expect(host.textContent).toContain("GPU 温度");
    expect(host.textContent).toContain("40 °C");
    expect(host.textContent).not.toContain("内存温度");
    expect(host.textContent).not.toContain("主板温度");
    expect(host.textContent).not.toContain("存储温度");
    const temperatureList = host.querySelector('[aria-label="硬件温度"]');
    expect(temperatureList?.textContent).not.toContain("暂不可用");
    expect(temperatureList?.querySelectorAll(".tab-modal-v2__temperature-row")).toHaveLength(2);
    expect(host.textContent).toContain("下载");
    expect(host.textContent).toContain("上传");
    expect(host.textContent).toContain("192.168.1.10");
    expect(host.textContent).toContain("本地模型");
    expect(host.textContent).toContain("qwen3:4b");
    expect(host.textContent).not.toContain("VRAM");
    expect(host.textContent).not.toContain("RAM");
    expect(host.querySelectorAll('[data-overview-card="local-model"] .tab-modal-v2__overview-model-row-icon')).toHaveLength(1);
    expect(host.textContent).toContain("在线");
    expect(host.textContent).toContain("Codex 自动化");
    expect(host.textContent).toContain("运行周期");
    expect(host.textContent).toContain("上次运行");
    expect(host.textContent).toContain("下次运行");
    expect(host.textContent).toContain("未接入");
    expect(host.textContent).not.toContain("尚未接入 Codex 自动化列表");
    expect(host.querySelectorAll(".tab-modal-v2__overview-card small")).toHaveLength(0);
    expect(host.querySelectorAll(".tab-modal-v2__overview-card .tab-modal-v2__card-code")).toHaveLength(0);
    expect(host.querySelectorAll(".tab-modal-v2__overview-card .tab-modal-v2__overview-status")).toHaveLength(1);
    expect(host.textContent).not.toContain("刷新出口 IP");
  });

  it("renders the local model context and thinking controls", () => {
    const host = mount(<LocalPage nav="models" context={createLocalContext()} />);

    expect(host.textContent).toContain("本地模型参数");
    expect(host.textContent).toContain("64K · 默认");
    expect(host.textContent).toContain("128K · 长上下文");
    expect(host.textContent).toContain("200K · 超长上下文");
    expect(host.textContent).not.toContain("32K · 低延迟");
    expect(host.textContent).toContain("高强度");
    expect(host.querySelector<HTMLSelectElement>('select[aria-label="上下文长度"]')?.value).toBe("65536");
    expect(host.querySelector<HTMLSelectElement>('select[aria-label="思考强度"]')?.value).toBe("medium");
  });

  it("renders context profiles as one local model row", () => {
    const context = createLocalContext();
    context.localModels.data.models = [
      { name: "qwen3.5:9b-200k" },
      { name: "qwen3.5:9b-128k" },
      { name: "qwen3.5:9b-64k" },
    ];

    const host = mount(<LocalPage nav="overview" context={context} />);
    const rows = host.querySelectorAll('[data-overview-card="local-model"] .tab-modal-v2__overview-model-row:not(.tab-modal-v2__overview-model-row--head)');

    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain("qwen3.5:9b");
    expect(rows[0]?.textContent).not.toContain("-64k");
    expect(rows[0]?.textContent).not.toContain("-128k");
    expect(rows[0]?.textContent).not.toContain("-200k");
  });

  it("renders service and per-model controls for every installed model family", () => {
    const context = createLocalContext();
    context.localModels.data.models = [
      { name: "qwen3.5:9b-64k" },
      { name: "qwen3.5:9b-128k" },
      { name: "llama3.1:8b" },
    ];
    context.localModels.data.selectedModel = "qwen3.5:9b-64k";
    context.localModels.data.busy = { status: "busy", runningModels: ["llama3.1:8b"] };

    const host = mount(<LocalPage nav="overview" context={context} />);
    expect(host.querySelector('[data-local-model-control="stop-service"]')).not.toBeNull();
    act(() => host.querySelector<HTMLButtonElement>('button[aria-controls="obsui-local-model-settings"]')?.click());

    const picker = host.querySelector("#obsui-local-model-settings");
    expect(picker?.querySelector('[data-local-model-control="start-service"]')).not.toBeNull();
    expect(picker?.querySelector('[data-local-model-control="stop-service"]')).not.toBeNull();
    expect(picker?.querySelectorAll('button[data-local-model-action="start"]')).toHaveLength(2);
    expect(picker?.querySelectorAll('button[data-local-model-action="stop"]')).toHaveLength(2);
    expect(picker?.querySelector<HTMLButtonElement>('button[data-local-model-action="start"][data-local-model-name="qwen3.5:9b-64k"]')?.disabled).toBe(false);
    expect(picker?.querySelector<HTMLButtonElement>('button[data-local-model-action="stop"][data-local-model-name="qwen3.5:9b-64k"]')?.disabled).toBe(true);
    expect(picker?.querySelector<HTMLButtonElement>('button[data-local-model-action="stop"][data-local-model-name="llama3.1:8b"]')?.disabled).toBe(false);
  });

  it("refreshes an earlier GPU-only temperature choice when LibreHardwareMonitor becomes available", () => {
    window.localStorage.setItem("obsui.system-sensor-card.v3", JSON.stringify({ summary: ["windows:cpu-clock"], temperatures: ["nvidia:0:temperature"], temperatureDefaultsVersion: 3 }));
    const context = createLocalContext();
    const data = context.systemMetrics.data!;
    context.systemMetrics.data = {
      ...data,
      sensors: [
        ...data.sensors,
        { id: "hardware-monitor:web:/lpc/it8613e/0/temperature/1", label: "主板温度", category: "motherboard", kind: "temperature", value: 42, unit: "°C", source: "hardware-monitor", sourceLabel: "LibreHardwareMonitor", role: "motherboard-temperature" },
        { id: "hardware-monitor:web:/memory/dimm/1/temperature/0", label: "内存温度", category: "memory", kind: "temperature", value: 37.5, unit: "°C", source: "hardware-monitor", sourceLabel: "LibreHardwareMonitor", role: "memory-temperature" },
        { id: "hardware-monitor:web:/nvme/0/temperature/0", label: "硬盘温度", category: "storage", kind: "temperature", value: 45, unit: "°C", source: "hardware-monitor", sourceLabel: "LibreHardwareMonitor", role: "storage-temperature" },
      ],
      sources: { hardwareMonitor: "LibreHardwareMonitor", hwinfo: false, nvidia: true },
    };

    const host = mount(<LocalPage nav="overview" context={context} />);
    const temperatureList = host.querySelector('[aria-label="硬件温度"]');
    expect(temperatureList?.textContent).toContain("主板温度");
    expect(temperatureList?.textContent).toContain("内存温度");
    expect(temperatureList?.textContent).toContain("硬盘温度");
    expect(window.localStorage.getItem("obsui.system-sensor-card.v3")).toBeNull();
    expect(JSON.parse(window.localStorage.getItem("obsui.system-sensor-card.v5") ?? "{}")).toMatchObject({ summaryDefaultsVersion: 4, temperatureDefaultsVersion: 6 });
    expect(JSON.parse(window.localStorage.getItem("obsui.system-sensor-card.recommended.v1") ?? "{}")).toMatchObject({ summaryDefaultsVersion: 4, temperatureDefaultsVersion: 6 });
  });

  it("uses the current saved selections as the initial recommendation", () => {
    const currentSelection = {
      summary: ["windows:cpu-clock", "windows:memory-load"],
      temperatures: ["windows:cpu-temperature", "nvidia:0:temperature"],
      summaryDefaultsVersion: 4,
      temperatureDefaultsVersion: 6,
    };
    window.localStorage.setItem("obsui.system-sensor-card.v5", JSON.stringify(currentSelection));

    mount(<LocalPage nav="overview" context={createLocalContext()} />);

    expect(JSON.parse(window.localStorage.getItem("obsui.system-sensor-card.recommended.v1") ?? "{}")).toEqual(currentSelection);
  });

  it("recovers trusted HWiNFO sensors after an offline fallback was persisted", () => {
    const context = createLocalContext();
    const metrics = context.systemMetrics.data!;
    metrics.sources.hwinfo = true;
    metrics.sensors.push(
      { id: "hardware-monitor:web:/ram/load/0", label: "内存占用", category: "memory", kind: "load", value: 57, unit: "%", source: "hardware-monitor", sourceLabel: "LibreHardwareMonitor", role: "memory-load" },
      { id: "hardware-monitor:web:/vram/load/1", label: "显存占用", category: "gpu", kind: "load", value: 41, unit: "%", source: "hardware-monitor", sourceLabel: "LibreHardwareMonitor", role: "gpu-memory-load" },
      { id: "hardware-monitor:web:/amdcpu/0/load/0", label: "CPU总占用", category: "cpu", kind: "load", value: 31, unit: "%", source: "hardware-monitor", sourceLabel: "LibreHardwareMonitor", role: "cpu-load" },
      { id: "hardware-monitor:web:/amdcpu/0/power/0", label: "CPU封装功耗", category: "cpu", kind: "power", value: 65, unit: "W", source: "hardware-monitor", sourceLabel: "LibreHardwareMonitor", role: "cpu-power" },
      { id: "hardware-monitor:web:/gpu-nvidia/0/power/0", label: "GPU热功耗", category: "gpu", kind: "power", value: 37, unit: "W", source: "hardware-monitor", sourceLabel: "LibreHardwareMonitor", role: "gpu-power" },
      { id: "hardware-monitor:web:/gpu-nvidia/0/load/0", label: "GPU占用", category: "gpu", kind: "load", value: 0, unit: "%", source: "hardware-monitor", sourceLabel: "LibreHardwareMonitor", role: "gpu-load" },
      { id: "hardware-monitor:web:/nvme/0/level/20", label: "磁盘剩余寿命", category: "storage", kind: "load", value: 100, unit: "%", source: "hardware-monitor", sourceLabel: "LibreHardwareMonitor", role: "storage-health" },
      { id: "hwinfo:4:33554432", label: "CPU VDDCR_VDD 电压 (SVI3 TFN)", category: "cpu", kind: "voltage", value: 1.25, unit: "V", source: "hwinfo", sourceLabel: "HWiNFO", role: "cpu-voltage" },
      { id: "hwinfo:1:117440529", label: "CPU 总使用率", category: "cpu", kind: "load", value: 31, unit: "%", source: "hwinfo", sourceLabel: "HWiNFO", role: "cpu-load" },
      { id: "hwinfo:4:83886080", label: "CPU 封装功率", category: "cpu", kind: "power", value: 65, unit: "W", source: "hwinfo", sourceLabel: "HWiNFO", role: "cpu-power" },
      { id: "hwinfo:11:83886081", label: "GPU 核心功率 (VDDCR_GFX)", category: "gpu", kind: "power", value: 37, unit: "W", source: "hwinfo", sourceLabel: "HWiNFO", role: "gpu-power" },
      { id: "hwinfo:11:117440512", label: "GPU 使用率", category: "gpu", kind: "load", value: 0, unit: "%", source: "hwinfo", sourceLabel: "HWiNFO", role: "gpu-load" },
      { id: "hwinfo:9:117440512", label: "磁盘剩余寿命", category: "storage", kind: "load", value: 100, unit: "%", source: "hwinfo", sourceLabel: "HWiNFO", role: "storage-health" },
    );
    window.localStorage.setItem("obsui.system-sensor-card.v5", JSON.stringify({
      summary: ["windows:disk-load", "hardware-monitor:web:/ram/load/0", "hardware-monitor:web:/vram/load/1", "hardware-monitor:web:/amdcpu/0/load/0", "hardware-monitor:web:/amdcpu/0/power/0", "hardware-monitor:web:/gpu-nvidia/0/power/0", "hardware-monitor:web:/gpu-nvidia/0/load/0", "hardware-monitor:web:/nvme/0/level/20"],
      temperatures: ["windows:cpu-temperature", "nvidia:0:temperature"],
      summaryDefaultsVersion: 4,
      temperatureDefaultsVersion: 6,
    }));

    mount(<LocalPage nav="overview" context={context} />);

    expect(JSON.parse(window.localStorage.getItem("obsui.system-sensor-card.recommended.v1") ?? "{}")).toMatchObject({
      summary: ["windows:disk-load", "hardware-monitor:web:/ram/load/0", "hardware-monitor:web:/vram/load/1", "hwinfo:4:33554432", "hwinfo:1:117440529", "hwinfo:4:83886080", "hwinfo:11:83886081", "hwinfo:11:117440512", "hwinfo:9:117440512"],
      sensorRecoveryVersion: 1,
    });
  });

  it("replaces the legacy anonymous board voltage with an unavailable CPU voltage", () => {
    window.localStorage.setItem("obsui.system-sensor-card.v5", JSON.stringify({
      summary: ["hardware-monitor:web:/lpc/it8613e/0/voltage/0"],
      temperatures: ["windows:cpu-temperature"],
      summaryDefaultsVersion: 4,
      temperatureDefaultsVersion: 6,
    }));

    const host = mount(<LocalPage nav="overview" context={createLocalContext()} />);

    expect(host.querySelector('[aria-label="已选系统读数"]')?.textContent).toContain("CPU 核心电压");
    expect(host.querySelector('[aria-label="已选系统读数"]')?.textContent).toContain("暂不可用");
    expect(JSON.parse(window.localStorage.getItem("obsui.system-sensor-card.v5") ?? "{}").summary).toContain("unavailable:cpu-voltage");
  });

  it("repairs stale sensor selections instead of rendering anonymous unavailable rows", () => {
    window.localStorage.setItem("obsui.system-sensor-card.v5", JSON.stringify({
      summary: ["stale:sensor", "windows:memory-load"],
      temperatures: ["stale:temperature"],
      summaryDefaultsVersion: 3,
      temperatureDefaultsVersion: 6,
    }));

    const host = mount(<LocalPage nav="overview" context={createLocalContext()} />);

    expect(host.querySelector('[aria-label="已选系统读数"]')?.textContent).not.toContain("已选传感器");
    expect(host.querySelector('[aria-label="已选系统读数"]')?.textContent).not.toContain("暂不可用");
  });

  it("keeps the egress page automatic and does not render a refresh action", () => {
    const host = mount(<LocalPage nav="egress" context={createLocalContext()} />);

    expect(host.textContent).toContain("自动更新");
    expect(host.textContent).not.toContain("刷新出口 IP");
  });

  it("opens the proxy settings popover and lets the Clash Verge action run", async () => {
    let clashVergeLaunches = 0;
    const host = mount(<LocalPage nav="overview" context={createLocalContext({ onLaunchClashVerge: () => { clashVergeLaunches += 1; } })} />);
    const openProxy = host.querySelector<HTMLButtonElement>('button[aria-controls="obsui-proxy-settings"]');

    expect(openProxy).not.toBeNull();
    act(() => openProxy?.click());

    const menu = host.querySelector("#obsui-proxy-settings");
    expect(menu?.textContent).toContain("代理设置");
    expect(menu?.textContent).toContain("打开 FlClash");
    expect(menu?.textContent).toContain("打开 Clash Verge");
    const clashVerge = menu?.querySelector<HTMLButtonElement>('button[data-proxy-client="clash-verge"]');
    expect(clashVerge?.disabled).toBe(false);
    await act(async () => {
      clashVerge?.click();
      await Promise.resolve();
    });
    expect(clashVergeLaunches).toBe(1);
  });

  it("opens model settings and saves thinking strength for the selected model family", async () => {
    const context = createLocalContext();
    context.localModels.data.models = [
      { name: "qwen3.5:9b-64k" },
      { name: "qwen3.5:9b-128k" },
      { name: "llama3.1:8b" },
    ];
    context.localModels.data.selectedModel = "qwen3.5:9b-64k";
    context.localModels.data.settings = DEFAULT_LOCAL_MODEL_SETTINGS;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { settings: typeof DEFAULT_LOCAL_MODEL_SETTINGS };
      return { ok: true, status: 200, json: async () => ({ ...context.localModels.data, settings: body.settings }) } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const host = mount(<LocalPage nav="overview" context={context} />);
    const openModels = host.querySelector<HTMLButtonElement>('button[aria-controls="obsui-local-model-settings"]');
    expect(openModels).not.toBeNull();
    act(() => openModels?.click());

    const picker = host.querySelector("#obsui-local-model-settings");
    expect(picker?.textContent).toContain("本地模型设置");
    expect(picker?.querySelectorAll("button[data-local-model]")).toHaveLength(2);
    const qwen = picker?.querySelector<HTMLButtonElement>('button[data-local-model="qwen3.5:9b"]');
    act(() => qwen?.click());

    const thinking = host.querySelector<HTMLSelectElement>('select[aria-label="qwen3.5:9b 思考强度"]');
    expect(thinking?.value).toBe("medium");
    act(() => {
      if (!thinking) return;
      thinking.value = "low";
      thinking.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>("#obsui-local-model-settings button")].find((button) => button.textContent === "保存思考强度")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/local-models/settings", expect.objectContaining({ method: "PUT" }));
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body)).settings.thinkingByModel).toEqual({ "qwen3.5:9b": "low" });
    expect(host.textContent).toContain("qwen3.5:9b 已设为低强度");
  });

  it("lets users select card sensors and inspect all discovered readings", () => {
    const host = mount(<LocalPage nav="overview" context={createLocalContext()} />);
    const pickerButton = host.querySelector<HTMLButtonElement>('button[aria-controls="obsui-sensor-picker"]');

    act(() => pickerButton?.click());
    const picker = host.querySelector("#obsui-sensor-picker");
    expect(picker?.textContent).toContain("选择传感器");
    expect(picker?.textContent).toContain("CPU 频率");
    expect(picker?.textContent).toContain("温度监控");

    const powerChoice = Array.from(picker?.querySelectorAll("label") ?? []).find((label) => label.textContent?.includes("GPU 0 功耗"));
    act(() => powerChoice?.querySelector<HTMLInputElement>("input")?.click());
    expect(picker?.textContent).not.toContain("暂不可用");
    expect(picker?.textContent).toContain("CPU 占用");
    expect(JSON.parse(window.localStorage.getItem("obsui.system-sensor-card.v5") ?? "{}").summary).not.toContain("nvidia:0:power");

    act(() => Array.from(picker?.querySelectorAll<HTMLButtonElement>("button") ?? []).find((button) => button.textContent === "设为推荐")?.click());
    expect(picker?.textContent).toContain("已保存推荐设置");
    expect(JSON.parse(window.localStorage.getItem("obsui.system-sensor-card.recommended.v1") ?? "{}").summary).not.toContain("nvidia:0:power");

    act(() => picker?.querySelector<HTMLButtonElement>('button[aria-label="关闭选择传感器"]')?.click());
    const detailButton = host.querySelector<HTMLButtonElement>('button[aria-controls="obsui-sensor-details"]');
    act(() => detailButton?.click());
    const details = host.querySelector("#obsui-sensor-details");
    expect(details?.textContent).toContain("传感器详情");
    expect(details?.textContent).toContain("NVIDIA：已连接");
    expect(details?.textContent).toContain("NVIDIA SMI");
  });

  it("hides low-level spare and wear details while keeping disk life available", () => {
    const context = createLocalContext();
    const data = context.systemMetrics.data!;
    data.sensors.push(
      { id: "hardware-monitor:web:/nvme/0/level/100", label: "磁盘可用备用", category: "storage", kind: "load", value: 100, unit: "%", source: "hardware-monitor", sourceLabel: "LibreHardwareMonitor", role: null },
      { id: "hardware-monitor:web:/nvme/0/level/101", label: "磁盘备用阈值", category: "storage", kind: "load", value: 10, unit: "%", source: "hardware-monitor", sourceLabel: "LibreHardwareMonitor", role: null },
      { id: "hardware-monitor:web:/nvme/0/level/102", label: "磁盘已用寿命", category: "storage", kind: "load", value: 0, unit: "%", source: "hardware-monitor", sourceLabel: "LibreHardwareMonitor", role: null },
      { id: "hardware-monitor:web:/nvme/0/level/20", label: "磁盘剩余寿命", category: "storage", kind: "load", value: 100, unit: "%", source: "hardware-monitor", sourceLabel: "LibreHardwareMonitor", role: "storage-health" },
    );

    const host = mount(<LocalPage nav="overview" context={context} />);
    act(() => host.querySelector<HTMLButtonElement>('button[aria-controls="obsui-sensor-picker"]')?.click());
    const picker = host.querySelector("#obsui-sensor-picker");
    expect(picker?.textContent).toContain("磁盘剩余寿命");
    expect(picker?.textContent).not.toContain("磁盘可用备用");
    expect(picker?.textContent).not.toContain("磁盘备用阈值");
    expect(picker?.textContent).not.toContain("磁盘已用寿命");

    act(() => host.querySelector<HTMLButtonElement>('#obsui-sensor-picker button[aria-label="关闭选择传感器"]')?.click());
    act(() => host.querySelector<HTMLButtonElement>('button[aria-controls="obsui-sensor-details"]')?.click());
    expect(host.querySelector("#obsui-sensor-details")?.textContent).not.toContain("磁盘可用备用");
    expect(host.querySelector("#obsui-sensor-details")?.textContent).not.toContain("磁盘备用阈值");
    expect(host.querySelector("#obsui-sensor-details")?.textContent).not.toContain("磁盘已用寿命");
  });

  it("keeps CPU choices focused on aggregate readings and allows more than eight summary choices", () => {
    const context = createLocalContext();
    const data = context.systemMetrics.data!;
    data.sensors.push(
      { id: "hwinfo:cpu-core0-clock", label: "Core 0 频率", category: "cpu", kind: "clock", value: 4200, unit: "MHz", source: "hwinfo", sourceLabel: "HWiNFO", role: null },
      { id: "hwinfo:cpu-core0-vid", label: "Core 0 VID", category: "cpu", kind: "voltage", value: 1.1, unit: "V", source: "hwinfo", sourceLabel: "HWiNFO", role: null },
      { id: "hwinfo:cpu-average-effective", label: "平均有效频率", category: "cpu", kind: "clock", value: 3900, unit: "MHz", source: "hwinfo", sourceLabel: "HWiNFO", role: null },
      ...Array.from({ length: 11 }, (_, index) => ({ id: `test:summary-${index}`, label: `测试读数 ${index + 1}`, category: "system" as const, kind: "load" as const, value: index + 1, unit: "%" as const, source: "windows" as const, sourceLabel: "Windows", role: null })),
    );

    const host = mount(<LocalPage nav="overview" context={context} />);
    act(() => host.querySelector<HTMLButtonElement>('button[aria-controls="obsui-sensor-picker"]')?.click());
    const picker = host.querySelector("#obsui-sensor-picker");
    expect(picker?.textContent).toContain("CPU 占用");
    expect(picker?.textContent).toContain("平均有效频率");
    expect(picker?.textContent).not.toContain("Core 0 频率");
    expect(picker?.textContent).not.toContain("Core 0 VID");

    const findChoice = (name: string) => Array.from(host.querySelectorAll<HTMLLabelElement>("#obsui-sensor-picker label")).find((label) => label.querySelector("b")?.textContent === name);
    for (let index = 0; index < 10; index += 1) {
      const choice = findChoice(`测试读数 ${index + 1}`);
      act(() => choice?.querySelector<HTMLInputElement>("input")?.click());
    }
    expect(host.querySelector("#obsui-sensor-picker")?.textContent).toContain("已选摘要 16/16");
    const lastChoice = findChoice("测试读数 11");
    act(() => lastChoice?.querySelector<HTMLInputElement>("input")?.click());
    expect(host.querySelector("#obsui-sensor-picker")?.textContent).toContain("已选摘要 16/16");
  });

  it("curates duplicate and low-level readings across the sensor picker", () => {
    const context = createLocalContext();
    const data = context.systemMetrics.data!;
    data.sensors.push(
      { id: "hwinfo:cpu-effective", label: "平均有效频率", category: "cpu", kind: "clock", value: 3900, unit: "MHz", source: "hwinfo", sourceLabel: "HWiNFO", role: null },
      { id: "lhm:cpu-bus", label: "CPU总线频率", category: "cpu", kind: "clock", value: 100, unit: "MHz", source: "hardware-monitor", sourceLabel: "LibreHardwareMonitor", role: null },
      { id: "lhm:cpu-total-frequency", label: "CPU总频率", category: "cpu", kind: "clock", value: 4700, unit: "MHz", source: "hardware-monitor", sourceLabel: "LibreHardwareMonitor", role: null },
      { id: "hwinfo:cpu-peak", label: "最大CPU/线程使用率", category: "cpu", kind: "load", value: 24, unit: "%", source: "hwinfo", sourceLabel: "HWiNFO", role: null },
      { id: "lhm:cpu-core-peak", label: "CPU核心最高占用", category: "cpu", kind: "load", value: 36, unit: "%", source: "hardware-monitor", sourceLabel: "LibreHardwareMonitor", role: null },
      { id: "hwinfo:cpu-vcore", label: "CPU VDDCR_VDD 电压 (SVI3 TFN)", category: "cpu", kind: "voltage", value: 1.28, unit: "V", source: "hwinfo", sourceLabel: "HWiNFO", role: "cpu-voltage" },
      { id: "hwinfo:cpu-package-power", label: "CPU 封装功率", category: "cpu", kind: "power", value: 72, unit: "W", source: "hwinfo", sourceLabel: "HWiNFO", role: "cpu-power" },
      { id: "hwinfo:memory-clock", label: "内存频率", category: "system", kind: "clock", value: 2994, unit: "MHz", source: "hwinfo", sourceLabel: "HWiNFO", role: null },
      { id: "hwinfo:memory-power", label: "总功率", category: "memory", kind: "power", value: 1, unit: "W", source: "hwinfo", sourceLabel: "HWiNFO", role: null },
      { id: "hwinfo:memory-voltage", label: "VDD (SWA) 电压", category: "memory", kind: "voltage", value: 1.35, unit: "V", source: "hwinfo", sourceLabel: "HWiNFO", role: null },
      { id: "hwinfo:board-3vsb", label: "3VSB", category: "motherboard", kind: "voltage", value: 3.3, unit: "V", source: "hwinfo", sourceLabel: "HWiNFO", role: null },
      { id: "lhm:board-3v-standby", label: "+3V Standby", category: "motherboard", kind: "voltage", value: 3.3, unit: "V", source: "hardware-monitor", sourceLabel: "LibreHardwareMonitor", role: null },
      { id: "hwinfo:board-vcore", label: "Vcore", category: "motherboard", kind: "voltage", value: 1.25, unit: "V", source: "hwinfo", sourceLabel: "HWiNFO", role: null },
      { id: "lhm:board-anonymous", label: "主板电压 #1", category: "motherboard", kind: "voltage", value: 1.5, unit: "V", source: "hardware-monitor", sourceLabel: "LibreHardwareMonitor", role: null },
      { id: "hwinfo:storage-read", label: "读取活动率", category: "storage", kind: "load", value: 0.1, unit: "%", source: "hwinfo", sourceLabel: "HWiNFO", role: null },
      { id: "lhm:storage-total", label: "Total Activity", category: "storage", kind: "load", value: 0.4, unit: "%", source: "hardware-monitor", sourceLabel: "LibreHardwareMonitor", role: null },
      { id: "hwinfo:gpu-core-voltage", label: "GPU 核心电压", category: "gpu", kind: "voltage", value: 0.94, unit: "V", source: "hwinfo", sourceLabel: "HWiNFO", role: null },
      { id: "lhm:gpu-core-voltage", label: "GPU Core Voltage", category: "gpu", kind: "voltage", value: 0.94, unit: "V", source: "hardware-monitor", sourceLabel: "LibreHardwareMonitor", role: null },
      { id: "hwinfo:gpu-12v", label: "GPU 12VHPWR 电压", category: "gpu", kind: "voltage", value: 12.2, unit: "V", source: "hwinfo", sourceLabel: "HWiNFO", role: null },
    );
    window.localStorage.setItem("obsui.system-sensor-card.v5", JSON.stringify({
      summary: ["lhm:cpu-bus", "lhm:gpu-core-voltage", "windows:cpu-load"],
      temperatures: ["windows:cpu-temperature"],
      summaryDefaultsVersion: 4,
      temperatureDefaultsVersion: 6,
    }));

    const host = mount(<LocalPage nav="overview" context={context} />);
    act(() => host.querySelector<HTMLButtonElement>('button[aria-controls="obsui-sensor-picker"]')?.click());
    const picker = host.querySelector("#obsui-sensor-picker");
    const text = picker?.textContent ?? "";
    const memoryGroup = Array.from(picker?.querySelectorAll<HTMLElement>(".tab-modal-v2__sensor-group") ?? []).find((group) => group.querySelector("h3")?.textContent === "内存");
    expect(memoryGroup?.textContent).toContain("内存频率");
    expect(Array.from(picker?.querySelectorAll<HTMLElement>(".tab-modal-v2__sensor-group") ?? []).find((group) => group.querySelector("h3")?.textContent === "系统")).toBeUndefined();
    expect(text).toContain("平均有效频率");
    expect(text).toContain("CPU VDDCR_VDD 电压 (SVI3 TFN)");
    expect(text).toContain("最大CPU/线程使用率");
    expect(text).not.toContain("CPU总线频率");
    expect(text).not.toContain("CPU总频率");
    expect(text).not.toContain("CPU核心最高占用");
    expect(text).toContain("内存频率");
    expect(text).not.toContain("VDD (SWA) 电压");
    expect(text).not.toContain("+3V Standby");
    expect(text).not.toContain("主板电压 #1");
    expect(text).not.toContain("读取活动率");
    expect(text).not.toContain("Total Activity");
    expect(text).toContain("GPU 核心电压");
    expect(text).not.toContain("GPU Core Voltage");
    expect(text).not.toContain("GPU 12VHPWR 电压");
    const savedSummary = JSON.parse(window.localStorage.getItem("obsui.system-sensor-card.v5") ?? "{}").summary as string[];
    expect(savedSummary).not.toContain("lhm:cpu-bus");
    expect(savedSummary).not.toContain("lhm:gpu-core-voltage");
  });

  it("keeps a selected sensor visible when it is temporarily unavailable and restores it on recovery", () => {
    const context = createLocalContext();
    const host = mount(<LocalPage nav="overview" context={context} />);
    const data = context.systemMetrics.data!;
    const unavailableContext = {
      ...context,
      systemMetrics: { ...context.systemMetrics, data: { ...data, sensors: data.sensors.filter((sensor) => sensor.id !== "nvidia:0:power") } },
    };

    rerender(host, <LocalPage nav="overview" context={unavailableContext} />);
    expect(host.querySelector('[aria-label="已选系统读数"]')?.textContent).toContain("GPU 0 功耗暂不可用");

    rerender(host, <LocalPage nav="overview" context={context} />);
    expect(host.querySelector('[aria-label="已选系统读数"]')?.textContent).toContain("GPU 0 功耗39.0 W");
  });

  it("preserves an offline recommendation and its labels across a page reload", () => {
    const context = createLocalContext();
    const firstHost = mount(<LocalPage nav="overview" context={context} />);
    const savedRecommendation = JSON.parse(window.localStorage.getItem("obsui.system-sensor-card.recommended.v1") ?? "{}");
    expect(savedRecommendation.summary).toContain("nvidia:0:power");
    expect(window.localStorage.getItem("obsui.system-sensor-card.catalog.v1")).toContain("nvidia:0:power");
    unmount(firstHost);

    const data = context.systemMetrics.data!;
    const unavailableContext = {
      ...context,
      systemMetrics: { ...context.systemMetrics, data: { ...data, sensors: data.sensors.filter((sensor) => sensor.id !== "nvidia:0:power") } },
    };
    const secondHost = mount(<LocalPage nav="overview" context={unavailableContext} />);

    expect(secondHost.querySelector('[aria-label="已选系统读数"]')?.textContent).toContain("GPU 0 功耗暂不可用");
    expect(JSON.parse(window.localStorage.getItem("obsui.system-sensor-card.recommended.v1") ?? "{}").summary).toContain("nvidia:0:power");
    expect(window.localStorage.getItem("obsui.system-sensor-card.catalog.v1")).toContain("nvidia:0:power");
  });

  it("shows proxy launch progress and the returned result inside the card", async () => {
    let finishLaunch: ((result: ProxyLaunchResult) => void) | undefined;
    const host = mount(<LocalPage nav="overview" context={createLocalContext({
      onLaunchClashVerge: () => new Promise<ProxyLaunchResult>((resolve) => { finishLaunch = resolve; }),
    })} />);
    const openProxy = host.querySelector<HTMLButtonElement>('button[aria-controls="obsui-proxy-settings"]');

    act(() => openProxy?.click());
    const clashVerge = host.querySelector<HTMLButtonElement>('#obsui-proxy-settings button[data-proxy-client="clash-verge"]');
    act(() => clashVerge?.click());
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
      act(() => host.querySelector<HTMLButtonElement>('button[aria-controls="obsui-proxy-settings"]')?.click());
      act(() => host.querySelector<HTMLButtonElement>('#obsui-proxy-settings button[data-proxy-client="clash-verge"]')?.click());
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
    expect(host.querySelector(".target-v1__primary-strip")).not.toBeNull();
    expect(host.querySelector(".target-v1__primary-meta")).toBeNull();
    expect(host.querySelector(".target-v1__primary-body")).toBeNull();
    expect(host.querySelector(".target-v1__primary .target-v1__go")).toBeNull();

    const emptyState = createInitialState();
    const dialogHost = mount(<TargetV1 context={createLocalContext({ state: emptyState })} />);
    act(() => dialogHost.querySelectorAll<HTMLButtonElement>(".target-v1__section-button")[1]?.click());
    expect(dialogHost.querySelector(".target-v1__calendar-grid")).not.toBeNull();
    act(() => dialogHost.querySelector<HTMLButtonElement>(".target-v1__calendar-grid button")?.click());
    expect(dialogHost.querySelector('input[aria-label="关联文件夹（可选）"]')).toBeNull();
    act(() => dialogHost.querySelector<HTMLButtonElement>(".target-v1__calendar-add")?.click());

    const folderInput = dialogHost.querySelector<HTMLInputElement>('input[aria-label="关联文件夹（可选）"]');
    expect(folderInput).not.toBeNull();
    expect(folderInput?.required).toBe(false);
    const timeInput = dialogHost.querySelector<HTMLInputElement>('input[aria-label="具体时间"]');
    expect(timeInput).not.toBeNull();
    expect(timeInput?.type).toBe("time");
    expect(timeInput?.required).toBe(true);
    expect(timeInput?.value).toBe("23:59");
    expect(dialogHost.textContent).toContain("关联文件夹（可选）");
  });

  it("passes the selected concrete time when saving a target", () => {
    const state = createInitialState();
    state.tasks = [];
    let savedDraft: TargetTaskDraft | null = null;
    const context = createLocalContext({ state });
    context.actions.saveTargetTask = (draft) => {
      savedDraft = draft;
      return { ok: true };
    };
    const host = mount(<TargetV1 context={context} />);

    act(() => host.querySelectorAll<HTMLButtonElement>(".target-v1__section-button")[1]?.click());
    act(() => host.querySelector<HTMLButtonElement>(".target-v1__calendar-grid button")?.click());
    expect(host.querySelector('input[placeholder="输入清晰、可执行的目标"]')).toBeNull();
    act(() => host.querySelector<HTMLButtonElement>(".target-v1__calendar-add")?.click());
    const titleInput = host.querySelector<HTMLInputElement>('input[placeholder="输入清晰、可执行的目标"]');
    const timeInput = host.querySelector<HTMLInputElement>('input[aria-label="具体时间"]');
    expect(titleInput).not.toBeNull();
    expect(timeInput).not.toBeNull();
    act(() => {
      const setNativeValue = (input: HTMLInputElement, value: string) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      };
      setNativeValue(titleInput!, "按时完成目标");
      setNativeValue(timeInput!, "08:30");
    });
    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="3 星"]')?.click());
    act(() => host.querySelector<HTMLButtonElement>(".target-v1__confirm")?.click());

    expect(savedDraft).not.toBeNull();
    expect(savedDraft!.title).toBe("按时完成目标");
    expect(savedDraft!.dueTime).toBe("08:30");
  });

  it("strikes through completed tasks in the monthly grid and date detail", () => {
    const state = createInitialState();
    const dueDate = localDateKey(new Date());
    state.tasks = [{
      ...state.tasks[0],
      id: "completed-calendar-target",
      title: "已经完成的月历任务",
      dueDate,
      status: "completed",
      completedAt: "2026-09-22T08:00:00.000Z",
    }];
    const host = mount(<TargetV1 context={createLocalContext({ state })} />);

    act(() => host.querySelectorAll<HTMLButtonElement>(".target-v1__section-button")[1]?.click());
    expect(host.querySelector(".target-v1__calendar-cell.is-completed")).toBeNull();
    expect(host.querySelector(".target-v1__calendar-task-preview.is-completed")?.textContent).toBe("已经完成的月历任务");
    act(() => host.querySelector<HTMLButtonElement>(`button[aria-label^="${dueDate}"]`)?.click());
    expect(host.querySelector(".target-v1__calendar-event.is-completed .target-v1__calendar-event-copy strong")?.textContent).toBe("已经完成的月历任务");
    act(() => host.querySelector<HTMLButtonElement>(".target-v1__calendar-add")?.click());
    expect(host.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("创建任务");
    expect(host.querySelector<HTMLInputElement>('input[placeholder="输入清晰、可执行的目标"]')?.value).toBe("");
  });

  it("offers a safe way to reopen a completed target", () => {
    const state = createInitialState();
    state.tasks = [{
      ...state.tasks[0],
      id: "completed-target",
      title: "已经完成的目标",
      status: "completed",
      completedAt: "2026-09-19T08:00:00.000Z",
    }];
    let toggledId = "";
    const context = createLocalContext({ state });
    context.actions.toggleTask = (id) => { toggledId = id; };
    const host = mount(<TargetV1 context={context} />);

    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="已经完成的目标的操作菜单"]')?.click());
    const reopen = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find((button) => button.textContent === "标记未完成");
    expect(reopen).not.toBeNull();
    expect(reopen?.disabled).toBe(false);
    act(() => reopen?.click());
    expect(toggledId).toBe("completed-target");
  });
});

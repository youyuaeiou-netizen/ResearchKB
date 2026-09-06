import type { CodexUsage } from "../codex-usage";
import type { LocalModelState } from "../local-models";
import type { NetworkEgressState, NetworkMetrics } from "../network-metrics";
import type { SystemMetrics } from "../system-metrics";
import type { AppState, Project, Resource, Task } from "../types";
import type { TargetMutationResult, TargetTaskDraft } from "../target-v1/task-model";

export type V2TabKey = "target" | "local" | "storage" | "literature" | "hdd";
export type V2ViewKey = "overview" | "library" | "planner" | "automation" | "monitor" | "settings" | "repository" | "hdd";
export type V2MetricState<T> = { status: "loading" | "ready" | "unavailable"; data: T | null };
export type V2EgressState = { loading: boolean; data: NetworkEgressState };
export type V2LocalModelsState = { loading: boolean; data: LocalModelState };
export type ProxyLaunchResult = { ok: boolean; message: string };

export type V2NavItem = { id: string; label: string; detail?: string };
export type V2TabConfig = {
  key: V2TabKey;
  label: string;
  kicker: string;
  summary: string;
  nav: V2NavItem[];
};

export type V2BusinessContext = {
  ready: boolean;
  storageError: string | null;
  state: AppState;
  systemMetrics: V2MetricState<SystemMetrics>;
  codexUsage: V2MetricState<CodexUsage>;
  networkMetrics: V2MetricState<NetworkMetrics>;
  networkEgress: V2EgressState;
  localModels: V2LocalModelsState;
  automation: { running: boolean; seconds: number };
  actions: {
    addProject: (project: Omit<Project, "id" | "createdAt" | "updatedAt">) => void;
    addResource: (resource: Omit<Resource, "id" | "createdAt">) => void;
    addTask: (task: Omit<Task, "id" | "createdAt" | "updatedAt">) => void;
    toggleTask: (id: string) => void;
    saveTargetTask: (task: TargetTaskDraft) => TargetMutationResult;
    completeTargetTask: (id: string) => void;
    cancelTargetTask: (id: string) => void;
    cleanupTargetTasks: (month: string) => void;
    toggleAutomation: () => void;
    resetAutomation: () => void;
    refreshEgress: () => void;
    exportData: () => void;
    importData: () => void;
    resetDemo: () => void;
    launchFlClash: () => void | Promise<ProxyLaunchResult>;
    launchClashVerge: () => void | Promise<ProxyLaunchResult>;
    openSettings: () => void;
  };
};

export const V2_TABS: V2TabConfig[] = [
  {
    key: "target",
    label: "目标",
    kicker: "MISSION CONTROL",
    summary: "把今天的下一步放到眼前，保持任务和计时器在同一条工作线上。",
    nav: [
      { id: "overview", label: "目标总览", detail: "状态与进度" },
      { id: "tasks", label: "待办队列", detail: "任务与截止日" },
      { id: "automation", label: "自动化计时", detail: "本机计时器" },
    ],
  },
  {
    key: "local",
    label: "本机",
    kicker: "LOCAL SYSTEM",
    summary: "只读取当前 Windows 主机状态，指标和网络信息不会离开本机。",
    nav: [
      { id: "overview", label: "系统总览", detail: "实时摘要" },
      { id: "performance", label: "性能指标", detail: "CPU / GPU / 内存" },
      { id: "network", label: "网络连接", detail: "适配器与 FlClash" },
      { id: "egress", label: "出口 IP", detail: "自动更新" },
    ],
  },
  {
    key: "storage",
    label: "仓库",
    kicker: "PROJECT STORAGE",
    summary: "查看项目索引、任务关联和资料入口，不触碰 Vault 原始文件。",
    nav: [
      { id: "overview", label: "仓库总览", detail: "项目与资料" },
      { id: "projects", label: "项目索引", detail: "课程 / 科研 / 个人" },
      { id: "resources", label: "关联资料", detail: "本地入口" },
    ],
  },
  {
    key: "literature",
    label: "文献",
    kicker: "LITERATURE DOCK",
    summary: "集中保存可回到的网页、本机路径和备注入口，内容仍由你掌控。",
    nav: [
      { id: "overview", label: "文献总览", detail: "最近入口" },
      { id: "save", label: "保存入口", detail: "网页或本机路径" },
    ],
  },
  {
    key: "hdd",
    label: "H.D.D",
    kicker: "LOCAL CODEX",
    summary: "通过本机 H.D.D 桥接访问只读知识镜像，回答与来源在当前设备内完成。",
    nav: [
      { id: "chat", label: "本机对话", detail: "开始一个问题" },
      { id: "sources", label: "来源", detail: "最近回答引用" },
      { id: "settings", label: "H.D.D 设置", detail: "接口状态" },
    ],
  },
];

export const V2_TAB_ORDER: V2TabKey[] = V2_TABS.map((tab) => tab.key);

export function getV2Tab(tab: V2TabKey) {
  return V2_TABS.find((candidate) => candidate.key === tab) ?? V2_TABS[1];
}

export function v2TabFromView(view: V2ViewKey | string): V2TabKey {
  if (view === "planner" || view === "automation") return "target";
  if (view === "monitor") return "local";
  if (view === "repository") return "storage";
  if (view === "library") return "literature";
  return "hdd";
}

export function v2ViewForTab(tab: V2TabKey): V2ViewKey {
  if (tab === "target") return "planner";
  if (tab === "local") return "monitor";
  if (tab === "storage") return "repository";
  if (tab === "literature") return "library";
  return "hdd";
}

export function defaultV2NavForView(tab: V2TabKey, view: V2ViewKey | string): string {
  if (tab === "target" && view === "automation") return "automation";
  if (tab === "hdd" && view === "settings") return "settings";
  return getV2Tab(tab).nav[0]?.id ?? "overview";
}

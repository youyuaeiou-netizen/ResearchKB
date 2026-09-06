import { Children, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent as ReactWheelEvent } from "react";
import type { IconType } from "react-icons";
import {
  IoCheckboxOutline,
  IoCloudyNightOutline,
  IoCubeOutline,
  IoBookOutline,
  IoGlobeOutline,
  IoHardwareChipOutline,
  IoLayersOutline,
  IoPowerOutline,
  IoPulseOutline,
  IoServerOutline,
  IoSettingsOutline,
  IoTimerOutline,
} from "react-icons/io5";
import iconUrl from "../assets/obsui.ico";
import defaultWallpaperUrl from "../assets/wallpapers/peloyce-default.png";
import referenceUiUrl from "../assets/reference-ui.png";
import referenceBrandUrl from "../assets/reference/brand.png";
import referenceNav1Url from "../assets/reference/nav-1.png";
import referenceNav2Url from "../assets/reference/nav-2.png";
import referenceNav3Url from "../assets/reference/nav-3.png";
import referenceNav4Url from "../assets/reference/nav-4.png";
import deviceShellTargetUrl from "../assets/reference/device-shell-hidpi/shell-target-3x.png?url";
import deviceShellLocalUrl from "../assets/reference/device-shell-hidpi/shell-local-3x.png?url";
import deviceShellRepositoryUrl from "../assets/reference/device-shell-hidpi/shell-repository-3x.png?url";
import deviceShellLiteratureUrl from "../assets/reference/device-shell-hidpi/shell-literature-3x.png?url";
import deviceShellHddUrl from "../assets/reference/device-shell-hidpi/shell-hdd-3x.png?url";
import {
  createBackup,
  createId,
  createInitialState,
  loadAppState,
  parseBackup,
  saveAppState,
  touch,
} from "./storage";
import { calendarMonthTitle, dateKey, getCalendarMonthDays, shiftCalendarMonth } from "./calendar";
import { parseCodexUsage, type CodexUsage } from "./codex-usage";
import { parseLocalModelState, type LocalModelState } from "./local-models";
import { parseNetworkEgressState, parseNetworkMetrics, type NetworkEgressState, type NetworkMetrics } from "./network-metrics";
import { parseSystemMetrics, type SystemMetrics } from "./system-metrics";
import type { AppState, Priority, Project, ProjectKind, Resource, ResourceKind, Task, TaskStatus } from "./types";
import { Badge, Button, Card, Input, NumberDisplay, Panel, Progress, ScrollArea } from "./ui";
import { HddChatPanel } from "./HddChatPanel";
import { TabModalV2 } from "./tab-modal-v2/TabModalV2";
import { v2TabFromView, v2ViewForTab, type ProxyLaunchResult, type V2BusinessContext } from "./tab-modal-v2/model";
import { cancelTargetTask as removeTargetTask, clearCompletedOnMonthChange, findTaskForDate, isCompletedTask, isValidDateKey, localDateKey, markTargetTaskCompleted, type TargetMutationResult, type TargetTaskDraft } from "./target-v1/task-model";

type DashboardView = "overview" | "library" | "planner" | "automation" | "monitor" | "settings" | "repository" | "hdd";
type View = DashboardView | "calendar" | "projects" | "tasks" | "resources" | "recycle";

const today = () => localDateKey(new Date());
const dateLabel = (date: string | null) => date ? new Date(`${date}T12:00:00`).toLocaleDateString("zh-CN", { month: "short", day: "numeric" }) : "未设定";
const networkEgressRefreshIntervalMs = 60_000;
const localModelRefreshIntervalMs = 30_000;
const kindLabel: Record<ProjectKind, string> = { course: "课程", research: "科研", personal: "个人" };
const statusLabel: Record<TaskStatus, string> = { active: "进行中", completed: "已完成" };
const priorityLabel: Record<Priority, string> = { 1: "1 星", 2: "2 星", 3: "3 星", 4: "4 星", 5: "5 星" };
const resourceLabel: Record<ResourceKind, string> = { link: "链接", file: "本机路径", note: "备注" };
const viewTitle: Record<Exclude<DashboardView, "overview">, string> = { library: "文献资料", planner: "目标任务", automation: "自动化计时", monitor: "本机状态", settings: "本地数据", repository: "项目仓库", hdd: "H.D.D 对话" };
const primaryNavigation: { key: DashboardView; label: string; Icon: IconType }[] = [
  { key: "library", label: "知识资源", Icon: IoBookOutline }, { key: "planner", label: "计划任务", Icon: IoCheckboxOutline },
  { key: "automation", label: "自动化计时", Icon: IoTimerOutline }, { key: "monitor", label: "状态监控", Icon: IoHardwareChipOutline },
];

const deviceTabs: { key: DashboardView; label: string; shellUrl: string }[] = [
  { key: "planner", label: "目标", shellUrl: deviceShellTargetUrl },
  { key: "monitor", label: "本机", shellUrl: deviceShellLocalUrl },
  { key: "repository", label: "仓库", shellUrl: deviceShellRepositoryUrl },
  { key: "library", label: "文献", shellUrl: deviceShellLiteratureUrl },
  { key: "hdd", label: "H.D.D", shellUrl: deviceShellHddUrl },
];

type SystemMetricsState = { status: "loading" | "ready" | "unavailable"; data: SystemMetrics | null };
type CodexUsageState = { status: "loading" | "ready" | "unavailable"; data: CodexUsage | null };
type NetworkMetricsState = { status: "loading" | "ready" | "unavailable"; data: NetworkMetrics | null };
type NetworkEgressViewState = { loading: boolean; data: NetworkEgressState };
type LocalModelsViewState = { loading: boolean; data: LocalModelState };

function useCardRailDrag() {
  const railRef = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ id: number; startX: number; startScrollLeft: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [dragging, setDragging] = useState(false);

  const finish = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = pointer.current;
    if (!current || current.id !== event.pointerId) return;
    if (current.moved) suppressClick.current = true;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    pointer.current = null;
    setDragging(false);
  };

  return {
    railRef,
    dragging,
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement;
      if (target.closest("input, select, textarea")) return;
      pointer.current = { id: event.pointerId, startX: event.clientX, startScrollLeft: event.currentTarget.scrollLeft, moved: false };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
      const current = pointer.current;
      if (!current || current.id !== event.pointerId) return;
      const distance = event.clientX - current.startX;
      if (Math.abs(distance) > 4) current.moved = true;
      if (!current.moved) return;
      event.currentTarget.scrollLeft = current.startScrollLeft - distance;
      setDragging(true);
      event.preventDefault();
    },
    onPointerUp: finish,
    onPointerCancel: finish,
    onClickCapture: (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!suppressClick.current) return;
      suppressClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
    onWheel: (event: ReactWheelEvent<HTMLDivElement>) => {
      if (!event.deltaY || event.currentTarget.scrollWidth <= event.currentTarget.clientWidth) return;
      event.currentTarget.scrollLeft += event.deltaY;
      event.preventDefault();
    },
  };
}

function useSystemMetrics(enabled = true): SystemMetricsState {
  const [metrics, setMetrics] = useState<SystemMetricsState>(() => ({ status: enabled ? "loading" : "unavailable", data: null }));

  useEffect(() => {
    if (!enabled) {
      setMetrics({ status: "unavailable", data: null });
      return;
    }
    let disposed = false;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const response = await fetch("/api/system-metrics", { cache: "no-store" });
        const metrics = response.ok ? parseSystemMetrics(await response.json()) : null;
        if (!metrics) throw new Error("System metrics are unavailable.");
        if (!disposed) setMetrics({ status: "ready", data: metrics });
      } catch {
        if (!disposed) setMetrics((current) => ({ status: "unavailable", data: current.data }));
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [enabled]);

  return metrics;
}

function useCodexUsage(enabled = true): CodexUsageState {
  const [usage, setUsage] = useState<CodexUsageState>(() => ({ status: enabled ? "loading" : "unavailable", data: null }));

  useEffect(() => {
    if (!enabled) {
      setUsage({ status: "unavailable", data: null });
      return;
    }
    let disposed = false;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const response = await fetch("/api/codex-usage", { cache: "no-store" });
        const usage = response.ok ? parseCodexUsage(await response.json()) : null;
        if (!usage) throw new Error("Codex usage is unavailable.");
        if (!disposed) setUsage({ status: "ready", data: usage });
      } catch {
        if (!disposed) setUsage((current) => ({ status: "unavailable", data: current.data }));
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [enabled]);

  return usage;
}

function useNetworkMetrics(enabled = true): NetworkMetricsState {
  const [metrics, setMetrics] = useState<NetworkMetricsState>(() => ({ status: enabled ? "loading" : "unavailable", data: null }));

  useEffect(() => {
    if (!enabled) {
      setMetrics({ status: "unavailable", data: null });
      return;
    }
    let disposed = false;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const response = await fetch("/api/network-metrics", { cache: "no-store" });
        const metrics = response.ok ? parseNetworkMetrics(await response.json()) : null;
        if (!metrics) throw new Error("Network metrics are unavailable.");
        if (!disposed) setMetrics({ status: "ready", data: metrics });
      } catch {
        if (!disposed) setMetrics((current) => ({ status: "unavailable", data: current.data }));
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [enabled]);

  return metrics;
}

function useNetworkEgress(enabled = true): NetworkEgressViewState & { refresh: () => void } {
  const [state, setState] = useState<NetworkEgressViewState>({ loading: false, data: { status: "idle", checkedAt: null, data: null } });
  const pendingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!enabled || pendingRef.current) return;
    pendingRef.current = true;
    setState((current) => ({ ...current, loading: true }));
    try {
      const response = await fetch("/api/network-egress/refresh", {
        method: "POST",
        cache: "no-store",
      });
      const next = parseNetworkEgressState(await response.json());
      if (!next) throw new Error("Network egress data is unavailable.");
      setState({ loading: false, data: next });
    } catch {
      setState({ loading: false, data: { status: "unavailable", checkedAt: null, data: null } });
    } finally {
      pendingRef.current = false;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setState({ loading: false, data: { status: "idle", checkedAt: null, data: null } });
      return;
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), networkEgressRefreshIntervalMs);
    return () => window.clearInterval(timer);
  }, [enabled, refresh]);
  return { ...state, refresh: () => { void refresh(); } };
}

function useLocalModels(enabled = true): LocalModelsViewState {
  const [state, setState] = useState<LocalModelsViewState>(() => ({
    loading: enabled,
    data: { status: "unavailable", checkedAt: null, models: [] },
  }));

  useEffect(() => {
    if (!enabled) {
      setState({ loading: false, data: { status: "unavailable", checkedAt: null, models: [] } });
      return;
    }
    let disposed = false;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      if (!disposed) setState((current) => ({ ...current, loading: true }));
      try {
        const response = await fetch("/api/local-models", { cache: "no-store" });
        const next = parseLocalModelState(await response.json());
        if (!next) throw new Error("Local models are unavailable.");
        if (!disposed) setState({ loading: false, data: next });
      } catch {
        if (!disposed) setState({ loading: false, data: { status: "unavailable", checkedAt: null, models: [] } });
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), localModelRefreshIntervalMs);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [enabled]);

  return state;
}

function App() {
  const tabModalV2Enabled = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("ui") === "tab-v2";
  const [view, setView] = useState<DashboardView>(() => tabModalV2Enabled ? "planner" : "overview");
  const [state, setState] = useState<AppState>(() => createInitialState());
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [storageError, setStorageError] = useState<string | null>(null);
  const [automationRunning, setAutomationRunning] = useState(false);
  const [automationSeconds, setAutomationSeconds] = useState(4 * 60 * 60 + 12 * 60 + 36);
  const importRef = useRef<HTMLInputElement>(null);
  const systemMetrics = useSystemMetrics();
  const codexUsage = useCodexUsage();
  const networkMetrics = useNetworkMetrics();
  const networkEgress = useNetworkEgress();
  const localModels = useLocalModels();
  const cardRail = useCardRailDrag();
  const modalRef = useRef<HTMLElement>(null);
  const closeDeviceRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const dashboardRef = useRef<HTMLElement>(null);
  const modalOpenerRef = useRef<HTMLElement | null>(null);
  const wasModalOpenRef = useRef(false);
  const modalOpen = view !== "overview";

  const openWorkspace = (next: DashboardView) => {
    if (!modalOpen) {
      const activeElement = document.activeElement;
      modalOpenerRef.current = activeElement instanceof HTMLElement ? activeElement : null;
    }
    setView(next);
  };
  const closeWorkspace = () => setView("overview");

  useEffect(() => {
    loadAppState().then((loaded) => { setState(loaded); setStorageError(null); setReady(true); }).catch(() => {
      const message = "本地数据读取失败，当前显示的是临时示例数据。重启前请先导出备份。";
      setNotice(message);
      setStorageError(message);
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      saveAppState(state).then(() => setStorageError(null)).catch(() => {
        const message = "本地数据保存失败，请检查浏览器存储权限。当前修改可能无法在重启后保留。";
        setNotice(message);
        setStorageError(message);
      });
    }, 160);
    return () => window.clearTimeout(timer);
  }, [ready, state]);

  useEffect(() => {
    if (tabModalV2Enabled || !automationRunning) return;
    const timer = window.setInterval(() => setAutomationSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [automationRunning, tabModalV2Enabled]);

  useEffect(() => {
    cardRail.railRef.current?.scrollTo({ left: 0 });
  }, [view]);

  useEffect(() => {
    const wasOpen = wasModalOpenRef.current;
    wasModalOpenRef.current = modalOpen;
    if (modalOpen && !wasOpen) {
      window.requestAnimationFrame(() => closeDeviceRef.current?.focus());
      return;
    }
    if (!modalOpen && wasOpen) {
      const opener = modalOpenerRef.current;
      modalOpenerRef.current = null;
      if (opener?.isConnected) window.requestAnimationFrame(() => opener.focus());
    }
  }, [modalOpen]);

  useEffect(() => {
    [sidebarRef.current, dashboardRef.current].forEach((element) => {
      if (!element) return;
      if (modalOpen) element.setAttribute("inert", "");
      else element.removeAttribute("inert");
    });
  }, [modalOpen]);

  useEffect(() => {
    if (!modalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeWorkspace();
        return;
      }
      if (event.key !== "Tab") return;
      const modal = modalRef.current;
      if (!modal) return;
      const focusable = Array.from(modal.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')).filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
      const nextIndex = event.shiftKey ? currentIndex - 1 : currentIndex + 1;
      if (event.shiftKey && (currentIndex <= 0 || currentIndex === -1)) {
        event.preventDefault();
        focusable.at(-1)?.focus();
      } else if (!event.shiftKey && (currentIndex === -1 || nextIndex >= focusable.length)) {
        event.preventDefault();
        focusable[0].focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalOpen]);

  const commit = (next: AppState) => setState(touch(next));
  const activeProjects = state.projects.filter((project) => project.status === "active");
  const openTasks = state.tasks.filter((task) => !isCompletedTask(task));
  const dueSoon = openTasks.filter((task) => task.dueDate && task.dueDate <= new Date(Date.now() + 86400000 * 7).toISOString().slice(0, 10));
  const toggleTask = (id: string) => {
    const timestamp = new Date().toISOString();
    commit({ ...state, tasks: state.tasks.map((task) => task.id === id ? {
      ...task,
      status: isCompletedTask(task) ? "active" : "completed",
      completedAt: isCompletedTask(task) ? null : timestamp,
      updatedAt: timestamp,
    } : task) });
  };

  const addProject = (project: Omit<Project, "id" | "createdAt" | "updatedAt">) => commit({ ...state, projects: [{ ...project, id: createId("project"), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, ...state.projects] });
  const addTask = (task: Omit<Task, "id" | "createdAt" | "updatedAt">) => commit({ ...state, tasks: [{ ...task, id: createId("task"), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, ...state.tasks] });
  const addResource = (resource: Omit<Resource, "id" | "createdAt">) => commit({ ...state, resources: [{ ...resource, id: createId("resource"), createdAt: new Date().toISOString() }, ...state.resources] });

  const saveTargetTask = (draft: TargetTaskDraft): TargetMutationResult => {
    const title = draft.title.trim();
    const folderPath = draft.folderPath.trim();
    if (!isValidDateKey(draft.dueDate)) return { ok: false, message: "请选择有效日期。" };
    if (!title) return { ok: false, message: "请输入目标名称。" };
    if (findTaskForDate(state.tasks, draft.dueDate, draft.id)) return { ok: false, message: "该日期已经有任务，一个日期只能保存一个任务。" };
    const timestamp = new Date().toISOString();
    const existing = draft.id ? state.tasks.find((task) => task.id === draft.id) : undefined;
    if (draft.id && !existing) return { ok: false, message: "原任务已经不存在，请重新选择日期。" };
    const nextTask: Task = existing ? {
      ...existing,
      title,
      dueDate: draft.dueDate,
      priority: draft.priority,
      folderPath,
      updatedAt: timestamp,
    } : {
      id: createId("task"),
      title,
      projectId: null,
      dueDate: draft.dueDate,
      status: "active",
      priority: draft.priority,
      folderPath,
      createdAt: timestamp,
      updatedAt: timestamp,
      completedAt: null,
    };
    commit({ ...state, tasks: existing ? state.tasks.map((task) => task.id === existing.id ? nextTask : task) : [nextTask, ...state.tasks] });
    return { ok: true };
  };

  const completeTargetTask = (id: string) => {
    const timestamp = new Date().toISOString();
    commit({ ...state, tasks: markTargetTaskCompleted(state.tasks, id, timestamp) });
  };

  const cancelTargetTask = (id: string) => commit({ ...state, tasks: removeTargetTask(state.tasks, id) });

  const cleanupTargetTasks = (month: string) => {
    if (!/^\d{4}-\d{2}$/.test(month) || state.targetLastOpenedMonth === month) return;
    commit({
      ...state,
      targetLastOpenedMonth: month,
      tasks: clearCompletedOnMonthChange(state.tasks, state.targetLastOpenedMonth, month),
    });
  };

  const recycle = (entityType: "project" | "task" | "resource", id: string) => {
    const collections = { project: state.projects, task: state.tasks, resource: state.resources } as const;
    const item = collections[entityType].find((candidate) => candidate.id === id);
    if (!item || !window.confirm("移入回收站？正式删除前仍可恢复。")) return;
    const next = entityType === "project" ? { ...state, projects: state.projects.filter((candidate) => candidate.id !== id), tasks: state.tasks.map((task) => task.projectId === id ? { ...task, projectId: null } : task) } :
      entityType === "task" ? { ...state, tasks: state.tasks.filter((candidate) => candidate.id !== id) } :
        { ...state, resources: state.resources.filter((candidate) => candidate.id !== id) };
    commit({ ...next, recycleBin: [{ id: createId("recycle"), entityType, deletedAt: new Date().toISOString(), payload: item }, ...state.recycleBin] });
  };

  const restore = (recycleId: string) => {
    const item = state.recycleBin.find((candidate) => candidate.id === recycleId);
    if (!item) return;
    const next = item.entityType === "project" ? { ...state, projects: [item.payload as Project, ...state.projects] } : item.entityType === "task" ? { ...state, tasks: [item.payload as Task, ...state.tasks] } : { ...state, resources: [item.payload as import("./types").Resource, ...state.resources] };
    commit({ ...next, recycleBin: state.recycleBin.filter((candidate) => candidate.id !== recycleId) });
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify(createBackup(state), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = `obsui-backup-${today()}.json`; link.click(); URL.revokeObjectURL(url);
    setNotice("备份已导出；文件只包含 ObsUI 自己的数据。");
  };

  const importData = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { const imported = parseBackup(JSON.parse(String(reader.result))); if (!window.confirm("导入后会替换当前 ObsUI 数据，是否继续？")) return; setState(imported); setNotice("备份已导入。"); }
      catch (error) { setNotice(error instanceof Error ? error.message : "备份文件无法读取，现有数据未改变。"); }
    };
    reader.onerror = () => setNotice("备份文件读取失败，现有数据未改变。"); reader.readAsText(file);
  };

  const resetDemo = () => { if (window.confirm("清空当前 ObsUI 数据并恢复示例数据？请先导出备份。")) { setState(createInitialState()); setNotice("已恢复示例数据。"); } };
  const requestProxyLaunch = async (endpoint: string, label: string): Promise<ProxyLaunchResult> => {
    const fallback = `无法启动或恢复 ${label}。请检查本机 .env.local 配置。`;
    try {
      const response = await fetch(endpoint, { method: "POST" });
      const payload = await response.json() as { message?: unknown };
      const message = typeof payload.message === "string" ? payload.message : fallback;
      if (!tabModalV2Enabled && !response.ok) setNotice(message);
      return { ok: response.ok, message };
    } catch {
      if (!tabModalV2Enabled) setNotice(fallback);
      return { ok: false, message: fallback };
    }
  };
  const launchFlClash = () => requestProxyLaunch("/api/flclash/launch", "FlClash");
  const launchClashVerge = () => requestProxyLaunch("/api/clash-verge/launch", "Clash Verge");

  const v2Context: V2BusinessContext = {
    ready,
    storageError,
    state,
    systemMetrics,
    codexUsage,
    networkMetrics,
    networkEgress,
    localModels,
    automation: { running: automationRunning, seconds: automationSeconds },
    actions: {
      addProject,
      addResource,
      addTask,
      toggleTask,
      saveTargetTask,
      completeTargetTask,
      cancelTargetTask,
      cleanupTargetTasks,
      toggleAutomation: () => setAutomationRunning((running) => !running),
      resetAutomation: () => setAutomationSeconds(4 * 60 * 60 + 12 * 60 + 36),
      refreshEgress: networkEgress.refresh,
      exportData,
      importData: () => importRef.current?.click(),
      resetDemo,
      launchFlClash,
      launchClashVerge,
      openSettings: () => openWorkspace("settings"),
    },
  };

  const renderWorkspace = () => {
    if (view === "overview") return null;
    if (view === "library") return <LibraryPanel state={state} onAdd={addResource} />;
    if (view === "planner") return <PlannerPanel state={state} onAdd={addTask} onToggle={toggleTask} />;
    if (view === "automation") return <AutomationPanel running={automationRunning} seconds={automationSeconds} onToggle={() => setAutomationRunning((running) => !running)} onReset={() => setAutomationSeconds(4 * 60 * 60 + 12 * 60 + 36)} />;
    if (view === "monitor") return <MonitorPanel metrics={systemMetrics} network={networkMetrics} egress={networkEgress} />;
    if (view === "repository") return <RepositoryPanel state={state} />;
    if (view === "hdd") return <HddChatPanel onOpenSettings={() => openWorkspace("settings")} />;
    return <Settings onExport={exportData} onImport={() => importRef.current?.click()} onReset={resetDemo} updatedAt={state.updatedAt} network={networkMetrics} egress={networkEgress} />;
  };
  const selectedDeviceTab: DashboardView = view === "automation" ? "planner" : view === "settings" ? "hdd" : view;
  const selectedTab = deviceTabs.find((tab) => tab.key === selectedDeviceTab) ?? deviceTabs[0];
  return <div className="app-shell" style={{ "--wallpaper": `url(${defaultWallpaperUrl})`, "--reference-ui": `url(${referenceUiUrl})`, "--reference-brand": `url(${referenceBrandUrl})`, "--reference-nav-1": `url(${referenceNav1Url})`, "--reference-nav-2": `url(${referenceNav2Url})`, "--reference-nav-3": `url(${referenceNav3Url})`, "--reference-nav-4": `url(${referenceNav4Url})` } as CSSProperties}>
    <div className="wallpaper-layer" aria-hidden="true" />
    <aside ref={sidebarRef} className="sidebar" aria-label="ObsUI 主导航" aria-hidden={modalOpen || undefined}>
      <button className="brand" onClick={closeWorkspace} aria-label="返回 ObsUI 总览"><img src={iconUrl} alt="" /><span>Obs<span>UI</span></span></button>
      <nav className="primary-navigation">{primaryNavigation.map(({ key, label, Icon }) => <button key={key} className={view === key ? "active" : ""} onClick={() => openWorkspace(key)} title={label} aria-label={label}><Icon aria-hidden="true" /><span>{label}</span></button>)}</nav>
      <div className="sidebar-footer"><span>LOCAL WORKBENCH</span><small>数据仅保存在本机</small></div>
    </aside>
    <main ref={dashboardRef} className="dashboard" aria-label="ObsUI 工作台" aria-hidden={modalOpen || undefined}>
      <div className="dashboard-top-actions"><button onClick={() => openWorkspace("settings")} title="工作台设置" aria-label="工作台设置"><IoSettingsOutline /></button><button onClick={closeWorkspace} title="返回总览" aria-label="返回总览"><IoPowerOutline /></button></div>
      <section className="dashboard-aside" aria-label="工作台状态">
        <article className={`mission-card ${view === "planner" ? "selected" : ""}`} onClick={() => openWorkspace("planner")}><div className="date-weather"><small>{today().replaceAll("-", ".")}</small><IoCloudyNightOutline /><b>本地</b><strong>{openTasks.length} 项</strong></div><div className="mission-copy"><h2>计划任务</h2>{openTasks.slice(0, 2).map((task) => <button className="mission-task" onClick={(event) => { event.stopPropagation(); toggleTask(task.id); }} key={task.id}><IoCheckboxOutline /> {task.title}</button>)}{!openTasks.length && <p>今天没有待处理任务</p>}<button className="automation-status" onClick={(event) => { event.stopPropagation(); openWorkspace("automation"); }}><IoCubeOutline /><span>自动化计时</span><b>{formatDuration(automationSeconds)}</b></button></div></article>
        <div className="insight-row"><article className={`system-card ${view === "monitor" ? "selected" : ""}`} onClick={() => openWorkspace("monitor")} title="每 2 秒读取一次本机 Windows 性能计数器"><span className="micro-label">{systemMetrics.status === "ready" ? "LIVE" : systemMetrics.status === "loading" ? "WAIT" : "OFFLINE"}</span><div><MetricLine label="CPU" value={systemMetrics.data?.cpu ?? null} Icon={IoHardwareChipOutline} /><MetricLine label="GPU" value={systemMetrics.data?.gpu ?? null} Icon={IoCubeOutline} /><MetricLine label="MEM" value={systemMetrics.data?.memory ?? null} Icon={IoLayersOutline} /><MetricLine label="DISK" value={systemMetrics.data?.disk ?? null} Icon={IoServerOutline} /></div></article><button className={`vault-card ${view === "library" ? "selected" : ""}`} onClick={() => openWorkspace("library")}><span className="micro-label">INFO</span><IoCubeOutline /><b>ResearchKB</b><small>本地资料入口</small></button></div>
        <div className="insight-row"><NetworkCard metrics={networkMetrics} egress={networkEgress} onLaunch={launchFlClash} /><CodexQuotaCard usage={codexUsage} /></div>
        <button className="space-card" onClick={() => openWorkspace("library")}><span>前往空间</span><b>KNOWLEDGE SPACE</b></button>
      </section>
      {notice && !tabModalV2Enabled && <button className="notice" onClick={() => setNotice("")} title="关闭提示">{notice}<span>×</span></button>}
      <input ref={importRef} type="file" accept="application/json" hidden onChange={importData} />
    </main>
    {modalOpen && tabModalV2Enabled && <TabModalV2
      activeTab={v2TabFromView(view)}
      activeView={view}
      context={v2Context}
      onTabChange={(tab) => openWorkspace(v2ViewForTab(tab))}
      onClose={closeWorkspace}
      dialogRef={modalRef}
      closeRef={closeDeviceRef}
    />}
    {modalOpen && !tabModalV2Enabled && <div className="device-modal">
      <section ref={modalRef} className="device-workspace" role="dialog" aria-modal="true" aria-label={`${selectedTab.label}功能面板`}>
      <img className="device-shell-image" src={selectedTab.shellUrl} alt="" aria-hidden="true" />
      <div className="device-tabs" role="tablist" aria-label="设备功能切换">
        {deviceTabs.map((tab) => <button key={tab.key} type="button" className={`device-tab ${tab.key === selectedTab.key ? "selected" : ""}`} role="tab" aria-selected={tab.key === selectedTab.key} aria-label={`打开${tab.label}`} onClick={() => openWorkspace(tab.key)}>{tab.label}</button>)}
      </div>
      <button ref={closeDeviceRef} type="button" className="device-close" onClick={closeWorkspace} aria-label="关闭功能面板">关闭</button>
      <div className="device-readout" aria-hidden="true"><div><span>{selectedTab.label}</span><small>OBSUI LOCAL WORKBENCH</small></div><b>{view === "automation" ? "计时器" : viewTitle[view as Exclude<DashboardView, "overview">]}</b></div>
      <div className={`device-panel-content${cardRail.dragging ? " dragging" : ""}`} ref={cardRail.railRef} onPointerDown={cardRail.onPointerDown} onPointerMove={cardRail.onPointerMove} onPointerUp={cardRail.onPointerUp} onPointerCancel={cardRail.onPointerCancel} onClickCapture={cardRail.onClickCapture} onWheel={cardRail.onWheel} tabIndex={0} aria-label={`${selectedTab.label}内容`}>
        {renderWorkspace()}
      </div>
      </section>
    </div>}
  </div>;
}

function formatDuration(totalSeconds: number) { const hours = Math.floor(totalSeconds / 3600); const minutes = Math.floor((totalSeconds % 3600) / 60); const seconds = totalSeconds % 60; return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":"); }
function MetricLine({ label, value, Icon }: { label: string; value: number | null; Icon: IconType }) { const percentage = value ?? 0; return <div className="metric-line"><span className="metric-icon"><Icon aria-hidden="true" /></span><span className="metric-label">{label}</span><b>{value === null ? "—" : `${value}%`}</b><div><i style={{ width: `${percentage}%` }} /></div></div>; }
function quotaWindowLabel(windowMinutes: number | undefined) { return windowMinutes === 10_080 ? "本周额度" : "Codex 额度"; }
function resetLabel(resetsAt: number | undefined) { return resetsAt ? new Date(resetsAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"; }
function CodexQuotaCard({ usage }: { usage: CodexUsageState }) { const data = usage.data; const status = usage.status === "ready" ? "LIVE" : usage.status === "loading" ? "WAIT" : "OFFLINE"; return <article className="codex-quota-card" title="每 60 秒读取本机 Codex 会话中的额度记录；不读取或保存令牌。"><span className="micro-label">{status}</span><div className="quota-card-title"><IoPulseOutline /><b>Codex 额度</b><strong>{data ? `${data.remainingPercent}%` : "—"}</strong></div><div className="meter"><i style={{ width: `${data?.remainingPercent ?? 0}%` }} /></div><p><span className="quota-remaining">剩余 {data ? `${data.remainingPercent}%` : "—"}</span><span>已使用 {data ? `${data.usedPercent}%` : "—"}</span></p><small><IoTimerOutline aria-hidden="true" />{quotaWindowLabel(data?.windowMinutes)} · 重置于 {resetLabel(data?.resetsAt)}</small></article>; }
function formatNetworkRate(value: number | null | undefined) { if (value === null || value === undefined) return "—"; const units = ["B/s", "KB/s", "MB/s", "GB/s"]; let amount = value; let unit = 0; while (amount >= 1024 && unit < units.length - 1) { amount /= 1024; unit += 1; } return `${amount >= 100 || unit === 0 ? Math.round(amount) : amount.toFixed(1)} ${units[unit]}`; }
function countryFlag(countryCode: string | null | undefined) {
  const code = countryCode?.trim().toUpperCase();
  return code && /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map((letter) => 127397 + letter.charCodeAt(0))) : null;
}
function NetworkCard({ metrics, egress, onLaunch }: { metrics: NetworkMetricsState; egress: NetworkEgressViewState; onLaunch: () => void }) {
  const flClashState = metrics.data?.flClash.running ? "FlClash 运行中" : metrics.data?.flClash.launchConfigured ? "FlClash 未运行" : "FlClash 未配置";
  const egressData = egress.data.status === "ready" ? egress.data.data : null;
  const primaryValue = egressData?.ip ?? (egress.loading ? "查询中…" : egress.data.status === "unconfigured" ? "未配置" : egress.data.status === "unavailable" ? "暂不可用" : "尚未刷新");
  const detail = egressData
    ? [egressData.country, egressData.asn].filter(Boolean).join(" · ") || "代理出口已更新"
    : egress.data.status === "unconfigured" ? "状态监控 → 完成配置"
      : "状态监控 → 自动更新出口 IP";
  const flag = countryFlag(egressData?.countryCode);

  return <button type="button" className="connection-card network-card" onClick={onLaunch} title="点击恢复或启动独立 FlClash 窗口。代理出口 IP 自动更新。">
    <div className="network-card-heading"><span className="network-card-flag">{flag ?? <IoGlobeOutline aria-hidden="true" />}</span><b>网络检测</b><span className="network-card-flclash">{flClashState}</span></div>
    <div className="network-card-value"><span>代理出口 IP</span><strong>{primaryValue}</strong></div>
    <small>{detail}</small>
  </button>;
}

function RailCard({ children, label, placeholder = false, slot }: { children?: ReactNode; label?: string; placeholder?: boolean; slot: 1 | 2 | 3 | 4 }) {
  return <Card className={`rail-card slot-${slot}${placeholder ? " rail-card-placeholder" : ""}`} aria-hidden={placeholder || undefined}>
    {!placeholder && <><ScrollArea className="rail-card-data">{children}</ScrollArea><div className="rail-card-name">{label}</div></>}
  </Card>;
}

function RailPage({ className = "", labels = [], children }: { className?: string; labels?: string[]; children: ReactNode }) {
  const cards = Children.toArray(children);
  // Every device-panel page keeps a second card group so the supplied sliding
  // interaction is available even when that view currently has fewer than five items.
  const groupCount = Math.max(2, Math.ceil(cards.length / 4));
  return <section className={`page ${className}`}>{Array.from({ length: groupCount }, (_, groupIndex) => <section className={`rail-group${groupIndex ? " rail-group-continuation" : ""}`} key={`group-${groupIndex}`}>{Array.from({ length: 4 }, (_, slotIndex) => {
    const cardIndex = groupIndex * 4 + slotIndex;
    return <RailCard key={`card-${cardIndex}`} slot={(slotIndex + 1) as 1 | 2 | 3 | 4} label={labels[cardIndex]} placeholder={cards[cardIndex] === undefined}>{cards[cardIndex]}</RailCard>;
  })}</section>)}</section>;
}

function LibraryPanel({ state, onAdd }: { state: AppState; onAdd: (resource: Omit<Resource, "id" | "createdAt">) => void }) {
  const [title, setTitle] = useState(""); const [location, setLocation] = useState("");
  const submit = (event: FormEvent) => { event.preventDefault(); if (!title.trim() || !location.trim()) return; onAdd({ title: title.trim(), location: location.trim(), kind: "link", projectId: null, tags: [] }); setTitle(""); setLocation(""); };
  return <RailPage className="reference-page" labels={["知识资源", "保存入口", ...(state.resources.length ? state.resources.map((resource) => resource.title) : ["暂无资料"])]}><div className="reference-intro"><span className="eyebrow">RESEARCHKB</span><h2>本地知识入口</h2><p>将常用资料入口集中到工作台；不会读取或写入 Vault 文件。</p></div><form className="reference-form" onSubmit={submit}><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="资料名称" /><Input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="网页链接或本机路径" /><Button variant="primary" type="submit">保存入口</Button></form>{state.resources.map((resource) => <article className="reference-entry" key={resource.id}><IoBookOutline /><div><b>{resource.title}</b><small>{resource.location}</small></div></article>)}{!state.resources.length && <Empty title="还没有资料入口" detail="在上方添加网页或本机路径。" />}</RailPage>;
}

function PlannerPanel({ state, onAdd, onToggle }: { state: AppState; onAdd: (task: Omit<Task, "id" | "createdAt" | "updatedAt">) => void; onToggle: (id: string) => void }) {
  const [title, setTitle] = useState(""); const [dueDate, setDueDate] = useState(today());
  const submit = (event: FormEvent) => { event.preventDefault(); if (!title.trim()) return; onAdd({ title: title.trim(), projectId: null, dueDate: dueDate || today(), status: "active", priority: 3, folderPath: "", completedAt: null }); setTitle(""); };
  return <RailPage className="planner-page" labels={["任务说明", "添加任务", ...(state.tasks.length ? state.tasks.map((task) => task.title) : ["暂无任务"])]}><div className="reference-intro"><span className="eyebrow">PLAN TASKS</span><h2>计划任务</h2><p>点击任务即可标记完成；数据只保存在当前浏览器。</p></div><form className="reference-form" onSubmit={submit}><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：整理文献" /><Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /><Button variant="primary" type="submit">加入计划</Button></form>{state.tasks.map((task) => <Button key={task.id} variant="secondary" className={`planner-entry ${task.status === "completed" ? "done" : ""}`} onClick={() => onToggle(task.id)}><IoCheckboxOutline /><span>{task.title}</span><small>{dateLabel(task.dueDate)}</small></Button>)}{!state.tasks.length && <Empty title="计划任务为空" detail="添加一项明确的下一步。" />}</RailPage>;
}

function AutomationPanel({ running, seconds, onToggle, onReset }: { running: boolean; seconds: number; onToggle: () => void; onReset: () => void }) { return <RailPage className="automation-page" labels={["自动化说明", "计时器"]}><div className="reference-intro"><span className="eyebrow">AUTOMATION TIMER</span><h2>自动化计时</h2><p>这是本地计时器，不会启动或连接 Codex。</p></div><Panel className="timer-panel"><IoTimerOutline /><strong>{formatDuration(seconds)}</strong><span>{running ? "计时中" : "已暂停"}</span><div><Button variant="primary" onClick={onToggle}>{running ? "暂停" : "开始"}</Button><Button variant="secondary" onClick={onReset}>重置</Button></div></Panel></RailPage>; }

function RepositoryPanel({ state }: { state: AppState }) {
  return <RailPage className="repository-page" labels={["项目仓库", ...(state.projects.length ? state.projects.map((project) => project.title) : ["暂无项目"])]}><div className="reference-intro"><span className="eyebrow">PROJECT REPOSITORY</span><h2>项目仓库</h2><p>课程、科研与个人项目的本地索引。</p></div>{state.projects.map((project) => {
    const openTaskCount = state.tasks.filter((task) => task.projectId === project.id && task.status !== "completed").length;
    const resourceCount = state.resources.filter((resource) => resource.projectId === project.id).length;
    return <Card className="project-card" key={project.id}><Badge tone={project.kind === "research" ? "yellow" : project.kind === "course" ? "orange" : "steel"}>{kindLabel[project.kind]}</Badge><h2>{project.title}</h2><p>{project.description || "还没有项目说明。"}</p><div className="card-meta"><span>{openTaskCount} 个待办</span><span>{resourceCount} 个资料</span></div></Card>;
  })}{!state.projects.length && <Empty title="项目仓库为空" detail="请先在原有数据中创建项目。" />}</RailPage>;
}

function MonitorPanel({ metrics, network, egress }: { metrics: SystemMetricsState; network: NetworkMetricsState; egress: NetworkEgressViewState & { refresh: () => void } }) {
  const data = metrics.data;
  const display = (value: number | null | undefined) => value === null || value === undefined ? "—" : `${value}%`;
  const status = metrics.status === "ready" ? "本地实时监测已连接" : metrics.status === "loading" ? "正在连接本地性能计数器" : "本地性能计数器暂不可用";
  const detail = metrics.status === "ready" ? "每 2 秒读取 CPU、所有 GPU 引擎峰值、内存占用和物理磁盘活动时间；数据不会离开本机。" : "请通过 pnpm dev 或 pnpm preview 在本机运行 ObsUI；页面不会显示模拟系统数据。";
  const networkData = network.data;
  const networkStatus = network.status === "ready" ? "本机网络实时监测已连接" : network.status === "loading" ? "正在读取本机网络适配器" : "本机网络指标暂不可用";
  const egressData = egress.data.data;
  const egressStatus = egress.data.status === "ready" ? "最近结果" : egress.data.status === "idle" ? "等待自动查询" : egress.data.status === "unconfigured" ? "未配置本机代理或 IPinfo token" : "代理或 IP 查询服务暂不可用";
  return <RailPage className="monitor-page" labels={["系统概览", "CPU", "GPU", "内存", "磁盘", "监控说明", "网络", "出口 IP"]}><div className="reference-intro"><span className="eyebrow">LOCAL SYSTEM MONITOR</span><h2>状态监控</h2><p>系统指标只在本机读取；出口 IP 通过本机 FlClash 代理自动更新。</p></div><Metric label="CPU" value={display(data?.cpu)} hint="全部逻辑处理器" tone="blue" /><Metric label="GPU" value={display(data?.gpu)} hint="最繁忙 GPU 引擎" tone="gold" /><Metric label="内存" value={display(data?.memory)} hint="已用物理内存" tone="violet" /><Metric label="磁盘" value={display(data?.disk)} hint="物理磁盘活动时间" tone="green" /><Panel className="monitor-note"><IoHardwareChipOutline /><div><b>{status}</b><span>{detail}</span></div></Panel><Panel className="network-monitor"><header><div><span className="eyebrow">NETWORK</span><h2>{networkStatus}</h2></div><Badge tone={network.status === "ready" ? "yellow" : "steel"} className="network-live-state">{network.status === "ready" ? "LIVE" : network.status === "loading" ? "WAIT" : "OFFLINE"}</Badge></header><div className="network-monitor-grid"><Metric label="公网 TCP" value={networkData?.latency.milliseconds === null || networkData?.latency.milliseconds === undefined ? "—" : `${networkData.latency.milliseconds} ms`} hint={`${networkData?.latency.target ?? "1.1.1.1:443"} · 非代理节点延迟`} tone="gold" /><Metric label="下载" value={formatNetworkRate(networkData?.downloadBytesPerSecond)} hint={networkData?.adapter.name ?? "默认路由适配器"} tone="blue" /><Metric label="上传" value={formatNetworkRate(networkData?.uploadBytesPerSecond)} hint={networkData?.adapter.linkSpeed ?? "链路速率不可用"} tone="violet" /><Metric label="局域网 IP" value={networkData?.adapter.localIpv4 ?? "—"} hint={networkData?.flClash.running ? "FlClash 正在运行" : networkData?.flClash.launchConfigured ? "FlClash 可启动" : "FlClash 未配置"} tone="green" /></div></Panel><Panel className="egress-panel"><header><div><span className="eyebrow">PROXY EGRESS</span><h2>出口 IP</h2><p>{egressStatus}</p></div><Button variant="primary" onClick={egress.refresh} disabled={egress.loading || egress.data.status === "unconfigured"}>{egress.loading ? "查询中…" : "刷新出口 IP"}</Button></header>{egressData ? <dl><div><dt>IP</dt><dd>{egressData.ip}</dd></div><div><dt>国家 / 地区</dt><dd>{egressData.countryCode ? `${egressData.country ?? "—"} · ${egressData.countryCode}` : egressData.country ?? "—"}</dd></div><div><dt>ASN</dt><dd>{[egressData.asn, egressData.asName].filter(Boolean).join(" · ") || "—"}</dd></div><div><dt>查询时间</dt><dd>{egress.data.checkedAt ? new Date(egress.data.checkedAt).toLocaleString("zh-CN") : "—"}</dd></div></dl> : <small>缺少配置时不会回退为直连请求。</small>}</Panel></RailPage>;
}

function Overview({ state, dueSoon, openTasks, onView, onToggle }: { state: AppState; dueSoon: Task[]; openTasks: Task[]; onView: (view: View) => void; onToggle: (id: string) => void }) {
  const active = state.projects.filter((project) => project.status === "active");
  return <section className="page"><div className="metric-grid"><Metric label="进行中项目" value={active.length} hint="课程 / 科研 / 个人" tone="blue" /><Metric label="待处理任务" value={openTasks.length} hint="完成后自动归档到今日记录" tone="gold" /><Metric label="近期截止" value={dueSoon.length} hint="未来 7 天" tone="violet" /><Metric label="资料条目" value={state.resources.length} hint="本地状态，不进入 Git" tone="green" /></div><div className="split-grid"><section className="panel focus-panel"><PanelTitle title="今日焦点" action="查看全部" onClick={() => onView("tasks")} /><div className="task-stack">{openTasks.slice(0, 5).map((task) => <TaskRow key={task.id} task={task} project={state.projects.find((project) => project.id === task.projectId)} onToggle={() => onToggle(task.id)} />)}{!openTasks.length && <Empty title="今天没有未完成任务" detail="去任务页创建一个小而明确的下一步。" />}</div></section><section className="panel"><PanelTitle title="项目雷达" action="管理项目" onClick={() => onView("projects")} /><div className="project-stack">{active.slice(0, 4).map((project) => <div className="project-line" key={project.id}><span className={`project-dot ${project.kind}`} /><div><b>{project.title}</b><small>{kindLabel[project.kind]} · {state.tasks.filter((task) => task.projectId === project.id && task.status !== "completed").length} 个待处理</small></div><strong>{Math.min(99, Math.max(12, state.tasks.filter((task) => task.projectId === project.id && task.status === "completed").length * 20 + 12))}%</strong></div>)}{!active.length && <Empty title="还没有进行中的项目" detail="创建一个课程、科研或个人项目。" />}</div></section></div><section className="panel recent-panel"><PanelTitle title="最近资料" action="打开资料库" onClick={() => onView("resources")} /><div className="resource-grid">{state.resources.slice(0, 3).map((resource) => <div className="resource-card" key={resource.id}><span>{resource.kind === "link" ? "↗" : resource.kind === "file" ? "⌂" : "▤"}</span><div><b>{resource.title}</b><small>{resourceLabel[resource.kind]} · {resource.location}</small></div></div>)}{!state.resources.length && <Empty title="还没有资料" detail="将链接、本机路径或短笔记放在这里。" />}</div></section></section>;
}

function Calendar({ state, onToggle, onView }: { state: AppState; onToggle: (id: string) => void; onView: (view: View) => void }) {
  const [month, setMonth] = useState(() => new Date());
  const cells = useMemo(() => getCalendarMonthDays(month), [month]);
  const tasksByDate = useMemo(() => {
    const grouped = new Map<string, Task[]>();
    state.tasks.filter((task): task is Task & { dueDate: string } => Boolean(task.dueDate)).forEach((task) => {
      const tasks = grouped.get(task.dueDate) ?? [];
      tasks.push(task);
      grouped.set(task.dueDate, tasks);
    });
    return grouped;
  }, [state.tasks]);
  const monthTaskCount = cells.filter((cell) => cell.inMonth).reduce((count, cell) => count + (tasksByDate.get(cell.date)?.length ?? 0), 0);
  const todayKey = dateKey(new Date());

  return <section className="page calendar-page">
    <div className="page-intro">
      <div><span className="eyebrow">MONTHLY PLANNER</span><p>按截止日期查看任务；点击任务即可切换完成状态。</p></div>
      <div className="calendar-actions"><button className="secondary" onClick={() => setMonth((current) => shiftCalendarMonth(current, -1))} aria-label="上个月">‹</button><button className="secondary" onClick={() => setMonth(new Date())}>回到今天</button><button className="secondary" onClick={() => setMonth((current) => shiftCalendarMonth(current, 1))} aria-label="下个月">›</button></div>
    </div>
    <section className="panel calendar-panel">
      <header className="calendar-heading"><div><h2>{calendarMonthTitle(month)}</h2><span>{monthTaskCount} 个截止任务 · 数据保存在本地</span></div><button className="panel-link" onClick={() => onView("tasks")}>管理任务 →</button></header>
      <div className="calendar-weekdays">{["一", "二", "三", "四", "五", "六", "日"].map((label) => <span key={label}>{label}</span>)}</div>
      <div className="calendar-grid">{cells.map((cell) => {
        const tasks = tasksByDate.get(cell.date) ?? [];
        return <div className={`calendar-cell ${cell.inMonth ? "" : "outside"} ${cell.date === todayKey ? "today" : ""}`} key={cell.date}>
          <div className="calendar-day-number"><b>{cell.day}</b>{cell.date === todayKey && <i>今</i>}</div>
          <div className="calendar-tasks">{tasks.slice(0, 3).map((task) => <button className={`calendar-task ${task.status === "completed" ? "done" : ""}`} key={task.id} onClick={() => onToggle(task.id)} title="点击切换完成状态"><span className={`calendar-task-dot priority-${task.priority}`} />{task.title}</button>)}{tasks.length > 3 && <small className="calendar-more">+{tasks.length - 3} 个任务</small>}</div>
        </div>;
      })}</div>
    </section>
  </section>;
}

function Metric({ label, value, hint, tone }: { label: string; value: number | string; hint: string; tone: string }) {
  const percent = typeof value === "number" ? value : /^\d+(?:\.\d+)?%$/.test(value) ? Number.parseFloat(value) : null;
  return <NumberDisplay className={`metric ${tone}`} label={label} value={value} hint={hint}>{percent !== null && <Progress value={percent} label={`${label} 当前值`} />}</NumberDisplay>;
}
function PanelTitle({ title, action, onClick }: { title: string; action: string; onClick: () => void }) { return <header className="panel-title"><h2>{title}</h2><button onClick={onClick}>{action} →</button></header>; }
function Empty({ title, detail }: { title: string; detail: string }) { return <div className="empty"><b>{title}</b><span>{detail}</span></div>; }
function TaskRow({ task, project, onToggle, onRecycle }: { task: Task; project?: Project; onToggle: () => void; onRecycle?: () => void }) { return <div className={`task-row ${task.status}`}><button className="check" onClick={onToggle} aria-label={task.status === "completed" ? "标记未完成" : "标记完成"}>{task.status === "completed" ? "✓" : ""}</button><div className="task-copy"><b>{task.title}</b><small>{project?.title || "未归属项目"} · 截止 {dateLabel(task.dueDate)}</small></div><span className={`priority priority-${task.priority}`}>{priorityLabel[task.priority]}</span>{onRecycle && <button className="icon-button" onClick={onRecycle} aria-label="移入回收站">×</button>}</div>; }

function Projects({ state, onAdd, onRecycle }: { state: AppState; onAdd: (project: Omit<Project, "id" | "createdAt" | "updatedAt">) => void; onRecycle: (id: string) => void }) { const [title, setTitle] = useState(""); const [kind, setKind] = useState<ProjectKind>("research"); const [description, setDescription] = useState(""); const submit = (event: FormEvent) => { event.preventDefault(); if (!title.trim()) return; onAdd({ title: title.trim(), kind, status: "active", tags: [], description: description.trim(), }); setTitle(""); setDescription(""); }; return <section className="page"><div className="page-intro"><div><span className="eyebrow">PROJECT REGISTRY</span><p>把课程、科研与个人目标放进可推进的工作空间。</p></div><form className="inline-form" onSubmit={submit}><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="新项目名称" /><select value={kind} onChange={(event) => setKind(event.target.value as ProjectKind)}><option value="research">科研</option><option value="course">课程</option><option value="personal">个人</option></select><button className="primary" type="submit">+ 创建项目</button></form></div><div className="project-grid">{state.projects.map((project) => <article className="project-card" key={project.id}><div className="card-top"><span className={`type-chip ${project.kind}`}>{kindLabel[project.kind]}</span><button className="icon-button" onClick={() => onRecycle(project.id)} aria-label="项目移入回收站">×</button></div><h2>{project.title}</h2><p>{project.description || "还没有项目说明。"}</p><div className="card-meta"><span>{state.tasks.filter((task) => task.projectId === project.id && task.status !== "completed").length} 个未完成任务</span><span>{state.resources.filter((resource) => resource.projectId === project.id).length} 个资料</span></div><div className="progress"><i style={{ width: `${Math.min(100, Math.max(8, state.tasks.filter((task) => task.projectId === project.id && task.status === "completed").length * 20 + 8))}%` }} /></div></article>)}{!state.projects.length && <Empty title="还没有项目" detail="从上方创建第一个项目。" />}</div></section>; }

function Tasks({ state, onAdd, onRecycle, onToggle }: { state: AppState; onAdd: (task: Omit<Task, "id" | "createdAt" | "updatedAt">) => void; onRecycle: (id: string) => void; onToggle: (id: string, status: TaskStatus) => void }) { const [title, setTitle] = useState(""); const [projectId, setProjectId] = useState(""); const [dueDate, setDueDate] = useState(today()); const [priority, setPriority] = useState<Priority>(3); const submit = (event: FormEvent) => { event.preventDefault(); if (!title.trim() || !dueDate) return; onAdd({ title: title.trim(), projectId: projectId || null, dueDate, status: "active", priority, folderPath: "", completedAt: null }); setTitle(""); }; return <section className="page"><form className="create-panel" onSubmit={submit}><div><span className="eyebrow">NEXT ACTION</span><h2>创建一个明确的下一步</h2></div><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：读完论文方法部分并写下三个问题" /><select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">不归属项目</option>{state.projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /><select value={priority} onChange={(event) => setPriority(Number(event.target.value) as Priority)}>{[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} 星优先级</option>)}</select><button className="primary" type="submit">加入队列</button></form><div className="task-list">{state.tasks.map((task) => <TaskRow key={task.id} task={task} project={state.projects.find((project) => project.id === task.projectId)} onToggle={() => onToggle(task.id, task.status === "completed" ? "active" : "completed")} onRecycle={() => onRecycle(task.id)} />)}{!state.tasks.length && <Empty title="任务队列为空" detail="创建一个可在今天完成的下一步。" />}</div></section>; }

function Resources({ state, onAdd, onRecycle }: { state: AppState; onAdd: (resource: Omit<Resource, "id" | "createdAt">) => void; onRecycle: (id: string) => void }) { const [title, setTitle] = useState(""); const [location, setLocation] = useState(""); const [kind, setKind] = useState<ResourceKind>("link"); const [projectId, setProjectId] = useState(""); const submit = (event: FormEvent) => { event.preventDefault(); if (!title.trim() || !location.trim()) return; onAdd({ title: title.trim(), location: location.trim(), kind, projectId: projectId || null, tags: [] }); setTitle(""); setLocation(""); }; return <section className="page"><form className="create-panel resource-form" onSubmit={submit}><div><span className="eyebrow">RESOURCE DOCK</span><h2>保存一个可回到的资料入口</h2></div><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="资料标题" /><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="https:// 或本机路径" /><select value={kind} onChange={(event) => setKind(event.target.value as ResourceKind)}><option value="link">链接</option><option value="file">本机路径</option><option value="note">备注</option></select><select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">不归属项目</option>{state.projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select><button className="primary" type="submit">保存资料</button></form><div className="resource-list">{state.resources.map((resource) => <article className="resource-row" key={resource.id}><span className="resource-symbol">{resource.kind === "link" ? "↗" : resource.kind === "file" ? "⌂" : "▤"}</span><div><b>{resource.title}</b><small>{resourceLabel[resource.kind]} · {resource.location}</small></div><span>{state.projects.find((project) => project.id === resource.projectId)?.title || "未归属"}</span><button className="icon-button" onClick={() => onRecycle(resource.id)} aria-label="资料移入回收站">×</button></article>)}{!state.resources.length && <Empty title="资料库为空" detail="先保存链接、本机路径或备注。" />}</div></section>; }

function Recycle({ state, onRestore, onEmpty }: { state: AppState; onRestore: (id: string) => void; onEmpty: () => void }) { return <section className="page"><div className="page-intro"><div><span className="eyebrow">RECOVERY ZONE</span><p>移入回收站的项目、任务和资料仍可恢复。</p></div>{state.recycleBin.length > 0 && <button className="danger-button" onClick={onEmpty}>清空回收站</button>}</div><div className="recycle-list">{state.recycleBin.map((item) => <article key={item.id}><div><b>{item.payload.title}</b><small>{item.entityType} · 删除于 {new Date(item.deletedAt).toLocaleString("zh-CN")}</small></div><button className="secondary" onClick={() => onRestore(item.id)}>恢复</button></article>)}{!state.recycleBin.length && <Empty title="回收站为空" detail="这里不会自动清理任何内容。" />}</div></section>; }

function Settings({ onExport, onImport, onReset, updatedAt, network, egress }: { onExport: () => void; onImport: () => void; onReset: () => void; updatedAt: string; network: NetworkMetricsState; egress: NetworkEgressViewState }) { const launchState = network.data?.flClash.launchConfigured ? "已配置" : "未配置"; const egressState = egress.data.status === "unconfigured" ? "未配置" : "已配置"; return <RailPage className="settings-page" labels={["本地数据", "网络配置", "路线图"]}><article className="settings-card"><span className="eyebrow">LOCAL DATA</span><h2>数据只属于这个工作台</h2><p>项目、任务和资料保存在本机浏览器数据库中。网络卡只读取本机状态；出口 IP 通过本机代理自动查询。</p><div className="settings-actions"><button className="primary" onClick={onExport}>导出 JSON 备份</button><button className="secondary" onClick={onImport}>导入 JSON 备份</button><button className="danger-button" onClick={onReset}>恢复示例数据</button></div><small>最近保存：{new Date(updatedAt).toLocaleString("zh-CN")}</small></article><article className="settings-card network-settings-card"><span className="eyebrow">NETWORK CONFIGURATION</span><h2>本机网络配置</h2><div><b>FlClash 启动</b><span>{launchState}</span></div><div><b>出口 IP 查询</b><span>{egressState}</span></div><p>在被 Git 忽略的 <code>.env.local</code> 配置 FlClash 路径、loopback 代理地址和 IPinfo token；此处不会显示或保存其值。</p></article><article className="settings-card roadmap-card"><span className="eyebrow">ROADMAP</span><h2>下一阶段</h2><div><b>v0.2</b><span>项目详情与画布</span></div><div><b>v0.3</b><span>ResearchKB / Obsidian 只读适配</span></div><div><b>v0.4</b><span>可选 Codex 项目协作</span></div><div><b>v1.0</b><span>Tauri Windows App</span></div></article></RailPage>; }

export default App;

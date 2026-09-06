import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  createBackup,
  createId,
  createInitialState,
  loadAppState,
  parseBackup,
  saveAppState,
  touch,
} from "./storage";
import { parseCodexUsage, type CodexUsage } from "./codex-usage";
import { parseLocalModelState, type LocalModelState } from "./local-models";
import { parseNetworkEgressState, parseNetworkMetrics, type NetworkEgressState, type NetworkMetrics } from "./network-metrics";
import { parseSystemMetrics, type SystemMetrics } from "./system-metrics";
import type { AppState, Project, Resource, Task } from "./types";
import { TabModalV2 } from "./tab-modal-v2/TabModalV2";
import { v2TabFromView, v2ViewForTab, type ProxyLaunchResult, type V2BusinessContext, type V2ViewKey } from "./tab-modal-v2/model";
import { cancelTargetTask as removeTargetTask, clearCompletedOnMonthChange, findTaskForDate, isCompletedTask, isValidDateKey, localDateKey, markTargetTaskCompleted, type TargetMutationResult, type TargetTaskDraft } from "./target-v1/task-model";

type AppView = Exclude<V2ViewKey, "overview">;

const today = () => localDateKey(new Date());
const networkEgressRefreshIntervalMs = 60_000;
const localModelRefreshIntervalMs = 30_000;

type SystemMetricsState = { status: "loading" | "ready" | "unavailable"; data: SystemMetrics | null };
type CodexUsageState = { status: "loading" | "ready" | "unavailable"; data: CodexUsage | null };
type NetworkMetricsState = { status: "loading" | "ready" | "unavailable"; data: NetworkMetrics | null };
type NetworkEgressViewState = { loading: boolean; data: NetworkEgressState };
type LocalModelsViewState = { loading: boolean; data: LocalModelState };

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
        const next = response.ok ? parseSystemMetrics(await response.json()) : null;
        if (!next) throw new Error("System metrics are unavailable.");
        if (!disposed) setMetrics({ status: "ready", data: next });
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
        const next = response.ok ? parseCodexUsage(await response.json()) : null;
        if (!next) throw new Error("Codex usage is unavailable.");
        if (!disposed) setUsage({ status: "ready", data: next });
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
        const next = response.ok ? parseNetworkMetrics(await response.json()) : null;
        if (!next) throw new Error("Network metrics are unavailable.");
        if (!disposed) setMetrics({ status: "ready", data: next });
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
  const [view, setView] = useState<AppView>("planner");
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
  const modalRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const openWorkspace = (next: V2ViewKey) => setView(next === "overview" ? "planner" : next);
  const closeWorkspace = () => setView("planner");

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
    if (!automationRunning) return;
    const timer = window.setInterval(() => setAutomationSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [automationRunning]);

  useEffect(() => {
    const focusCloseButton = () => closeRef.current?.focus();
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(focusCloseButton);
    else focusCloseButton();
  }, []);

  useEffect(() => {
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
  }, []);

  const commit = (next: AppState) => setState(touch(next));
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
      return { ok: response.ok, message };
    } catch {
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

  return <div className="obsui-v2-app">
    {notice && <div className="tab-modal-v2__notice" role="status" aria-live="polite"><span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="关闭提示">×</button></div>}
    <input ref={importRef} type="file" accept="application/json" hidden onChange={importData} />
    <TabModalV2
      activeTab={v2TabFromView(view)}
      activeView={view}
      context={v2Context}
      onTabChange={(tab) => openWorkspace(v2ViewForTab(tab))}
      onClose={closeWorkspace}
      dialogRef={modalRef}
      closeRef={closeRef}
    />
  </div>;
}

export default App;

import { useEffect, useRef, useState } from "react";
import { IoCameraOutline, IoCloseOutline, IoDesktopOutline, IoImageOutline, IoSquareOutline } from "react-icons/io5";
import type { WorkbenchSettings } from "./workbench-settings";

type ScreenshotStatus = {
  available: boolean;
  running: boolean;
  enabled: boolean;
  hotkey: string;
  hotkeyStatus: "registered" | "conflict" | "disabled" | "unavailable" | "starting";
  phase: "idle" | "capturing" | "ready" | "error";
  mode: "screen" | "window" | "region" | null;
  hasCapture: boolean;
  saved: boolean;
  lastError: string | null;
};

const initialStatus: ScreenshotStatus = {
  available: false,
  running: false,
  enabled: true,
  hotkey: "Ctrl+Alt+A",
  hotkeyStatus: "starting",
  phase: "idle",
  mode: null,
  hasCapture: false,
  saved: false,
  lastError: null,
};

async function postScreenshot(path: string, body: unknown = {}) {
  const response = await fetch(`/api/screenshot/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({})) as ScreenshotStatus & { message?: string };
  if (!response.ok) throw new Error(payload.message || "截图辅助进程暂不可用。");
  return payload;
}

export function ScreenshotControl({ settings, active = true }: { settings: WorkbenchSettings["screenshot"]; active?: boolean }) {
  const [status, setStatus] = useState<ScreenshotStatus>(initialStatus);
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    if (!active || !menuOpen) return () => { disposed = true; };
    const refresh = () => {
      fetch("/api/screenshot/status", { cache: "no-store" })
        .then((response) => response.json())
        .then((payload: ScreenshotStatus) => { if (!disposed && payload && typeof payload === "object") setStatus(payload); })
        .catch(() => undefined);
    };
    refresh();
    const timer = window.setInterval(refresh, 700);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [active, menuOpen]);

  useEffect(() => {
    let disposed = false;
    if (!active) return () => { disposed = true; };
    postScreenshot("config", settings)
      .then((payload) => { if (!disposed) { setStatus(payload); setError(""); } })
      .catch((reason) => { if (!disposed) setError(reason instanceof Error ? reason.message : "截图设置同步失败。"); });
    return () => { disposed = true; };
  }, [active, menuOpen, settings]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(event.target as Node)) setMenuOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const start = async (mode: "screen" | "window" | "region") => {
    setError("");
    try { setStatus(await postScreenshot("start", { mode })); setMenuOpen(false); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "截图启动失败。"); }
  };

  const command = async (name: "cancel" | "save") => {
    setError("");
    try { setStatus(await postScreenshot(name)); if (name === "save") setMenuOpen(false); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "截图操作失败。"); }
  };

  const statusText = (error || status.lastError || status.hotkeyStatus === "conflict")
    ? error || status.lastError || "快捷键冲突"
    : status.phase === "capturing"
      ? "截图中…"
      : status.hasCapture
        ? status.saved ? "截图已保存" : "已复制到剪贴板"
        : "截图";
  const toggleMenu = () => {
    if (!active) return;
    setMenuOpen((open) => !open);
  };
  return <div ref={rootRef} className={`screenshot-control${menuOpen ? " is-open" : ""}`}>
    <button type="button" className="dashboard-action-button" title={`${settings.enabled ? statusText : "系统截图已停用"} · ${settings.hotkey}`} aria-label={`截图（${settings.hotkey}）`} aria-haspopup="menu" aria-expanded={menuOpen} onClick={toggleMenu} disabled={!active || !settings.enabled || status.hotkeyStatus === "unavailable"}>
      <IoCameraOutline aria-hidden="true" />
    </button>
    {menuOpen && <div className="screenshot-menu" role="menu" aria-label="截图模式">
      <header><div><b>系统截图</b><small>{settings.hotkey} · {status.hotkeyStatus === "registered" ? "已注册" : status.hotkeyStatus === "conflict" ? "快捷键冲突" : status.hotkeyStatus === "disabled" ? "已停用" : "等待辅助进程"}</small></div><button type="button" aria-label="关闭截图菜单" onClick={() => setMenuOpen(false)}><IoCloseOutline /></button></header>
      <button type="button" role="menuitem" onClick={() => void start("screen")} disabled={status.phase === "capturing"}><IoDesktopOutline />全屏截图</button>
      <button type="button" role="menuitem" onClick={() => void start("window")} disabled={status.phase === "capturing"}><IoSquareOutline />当前窗口</button>
      <button type="button" role="menuitem" onClick={() => void start("region")} disabled={status.phase === "capturing"}><IoImageOutline />框选区域</button>
      {status.hasCapture && status.phase === "ready" && <button type="button" role="menuitem" onClick={() => void command("save")}><IoImageOutline />保存 PNG</button>}
      {(status.phase === "capturing" || (status.hasCapture && status.phase === "ready")) && <button type="button" role="menuitem" onClick={() => void command("cancel")}><IoCloseOutline />取消截图</button>}
      {statusText !== "截图" && <p className={status.hotkeyStatus === "conflict" || error ? "is-error" : ""} role="status">{statusText}</p>}
    </div>}
  </div>;
}

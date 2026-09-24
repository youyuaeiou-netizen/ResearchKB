import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, join, resolve } from "node:path";
import type { Plugin, PreviewServer, ViteDevServer } from "vite";

const defaultHotkey = "Ctrl+Alt+A";
const maxBodyBytes = 8 * 1024;
const screenshotModes = new Set(["screen", "window", "region"]);

type ScreenshotMode = "screen" | "window" | "region";
type ScreenshotStatus = {
  available: boolean;
  running: boolean;
  enabled: boolean;
  hotkey: string;
  hotkeyStatus: "registered" | "conflict" | "disabled" | "unavailable" | "starting";
  phase: "idle" | "capturing" | "ready" | "error";
  mode: ScreenshotMode | null;
  hasCapture: boolean;
  saved: boolean;
  lastError: string | null;
  updatedAt: number;
};

type ScreenshotState = {
  runtimeDirectory: string;
  commandPath: string;
  statusPath: string;
  helperPath: string;
  helper: ChildProcess | null;
  helperAttached: boolean;
  helperStart: Promise<ScreenshotStatus> | null;
  status: ScreenshotStatus;
};

function defaultStatus(available: boolean): ScreenshotStatus {
  return {
    available,
    running: false,
    enabled: true,
    hotkey: defaultHotkey,
    hotkeyStatus: available ? "starting" : "unavailable",
    phase: "idle",
    mode: null,
    hasCapture: false,
    saved: false,
    lastError: available ? null : "系统截图仅支持 Windows。",
    updatedAt: Date.now(),
  };
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  if (response.headersSent) return;
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

function sameOrigin(request: IncomingMessage) {
  const origin = request.headers.origin;
  const host = request.headers.host;
  return typeof origin === "string" && typeof host === "string" && origin === `http://${host}`;
}

function quotePowerShellLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

async function readJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodyBytes) throw new Error("截图设置请求过大。");
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text ? JSON.parse(text) as unknown : {};
}

async function writeJsonAtomically(path: string, value: unknown) {
  // Windows Temp cleanup can remove an idle per-process directory while the
  // PowerShell/C# helper is still alive. Recreate it before every command or
  // status write so a stale helper never turns the next screenshot into ENOENT.
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value)}\n`, "utf8");
  await rename(temporaryPath, path);
}

async function readStatus(state: ScreenshotState) {
  try {
    const payload = JSON.parse(await readFile(state.statusPath, "utf8")) as Partial<ScreenshotStatus>;
    state.status = { ...state.status, ...payload, updatedAt: typeof payload.updatedAt === "number" ? payload.updatedAt : state.status.updatedAt };
  } catch {
    // The helper may be between two atomic status writes.
  }
  return state.status;
}

async function ensureHelper(state: ScreenshotState) {
  if (process.platform !== "win32") return state.status;
  if (state.helper && !state.helper.killed && state.helper.exitCode === null && state.helper.signalCode === null) return readStatus(state);
  if (state.helperStart) return state.helperStart;
  const startup = startHelper(state);
  const tracked = startup.finally(() => {
    if (state.helperStart === tracked) state.helperStart = null;
  });
  state.helperStart = tracked;
  return tracked;
}

async function startHelper(state: ScreenshotState) {
  if (process.platform !== "win32") return state.status;
  if (state.helper && !state.helper.killed && state.helper.exitCode === null && state.helper.signalCode === null) return readStatus(state);
  if (state.helperAttached) {
    const attachedStatus = await readStatus(state);
    if (attachedStatus.running) return attachedStatus;
    state.helperAttached = false;
  }
  await mkdir(state.runtimeDirectory, { recursive: true });
  const existingStatus = await readStatus(state);
  if (existingStatus.running && existingStatus.updatedAt >= Date.now() - 5_000 && existingStatus.hotkeyStatus !== "unavailable") {
    // Vite can recreate this plugin during a config hot reload while the
    // helper itself remains alive. Reuse its command/status files instead of
    // starting a second global-hotkey owner.
    state.helperAttached = true;
    return existingStatus;
  }
  const powershell = process.env.OBSUI_WINDOWS_POWERSHELL_PATH?.trim()
    || join(process.env.WINDIR?.trim() || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  if (!(await access(powershell).then(() => true).catch(() => false))) {
    state.status = { ...state.status, running: false, hotkeyStatus: "unavailable", lastError: "未找到 Windows PowerShell，系统截图不可用。", updatedAt: Date.now() };
    return state.status;
  }
  state.status = { ...state.status, running: true, hotkeyStatus: "starting", lastError: null, updatedAt: Date.now() };
  await writeJsonAtomically(state.statusPath, state.status).catch(() => undefined);
  // Windows PowerShell is used as a C# compiler/host for the WinForms helper.
  // It is launched with -Command, so this does not change or bypass the
  // machine's script execution policy.
  const launcher = `Add-Type -Path ${quotePowerShellLiteral(state.helperPath)} -ReferencedAssemblies @('System.Windows.Forms','System.Drawing','System.Web.Extensions'); [ObsUiScreenshotProgram]::Run(${quotePowerShellLiteral(state.runtimeDirectory)})`;
  state.helper = spawn(powershell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-STA", "-Command", launcher], {
    windowsHide: true,
    stdio: ["ignore", "ignore", "pipe"],
  });
  let helperError = "";
  state.helper.stderr?.on("data", (chunk: Buffer | string) => {
    helperError = `${helperError}${chunk.toString()}`.slice(-600);
  });
  state.helper.once("error", (error) => {
    state.status = { ...state.status, running: false, hotkeyStatus: "unavailable", phase: "error", lastError: error.message.slice(0, 300), updatedAt: Date.now() };
    void writeJsonAtomically(state.statusPath, state.status).catch(() => undefined);
    state.helper = null;
    state.helperAttached = false;
  });
  state.helper.once("exit", () => {
    const detail = helperError.trim().replace(/\s+/g, " ").slice(0, 300);
    state.status = { ...state.status, running: false, hotkeyStatus: "unavailable", phase: detail ? "error" : state.status.phase, lastError: detail || state.status.lastError, updatedAt: Date.now() };
    void writeJsonAtomically(state.statusPath, state.status).catch(() => undefined);
    state.helper = null;
    state.helperAttached = false;
  });
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 80));
  return readStatus(state);
}

async function writeCommand(state: ScreenshotState, command: Record<string, unknown>) {
  await ensureHelper(state);
  if ((!state.helper && !state.helperAttached) || state.status.hotkeyStatus === "unavailable") throw new Error(state.status.lastError || "截图辅助进程不可用。");
  await writeJsonAtomically(state.commandPath, { ...command, requestId: randomUUID(), sentAt: Date.now() });
  return readStatus(state);
}

function routePath(request: IncomingMessage) {
  const raw = (request.url ?? "").split("?")[0];
  return raw.startsWith("/api/screenshot") ? raw.slice("/api/screenshot".length) || "/" : raw;
}

function stopHelper(state: ScreenshotState) {
  if (state.helper && !state.helper.killed) state.helper.kill();
  else if (state.helperAttached) void writeJsonAtomically(state.commandPath, { kind: "stop", requestId: randomUUID(), sentAt: Date.now() }).catch(() => undefined);
  state.status = { ...state.status, running: false, hotkeyStatus: "unavailable", updatedAt: Date.now() };
  void writeJsonAtomically(state.statusPath, state.status).catch(() => undefined);
  state.helper = null;
  state.helperAttached = false;
  state.helperStart = null;
}

export function createScreenshotPlugin(projectRoot = process.cwd()): Plugin {
  // Keep command/status files private to one Vite instance. This prevents a
  // development preview or a second desktop launch from stealing commands
  // or making both helpers report the same hotkey conflict.
  const runtimeDirectory = join(resolve(projectRoot), ".obsui-runtime", "screenshot", String(process.pid));
  const state: ScreenshotState = {
    runtimeDirectory,
    commandPath: join(runtimeDirectory, "screenshot-command.json"),
    statusPath: join(runtimeDirectory, "screenshot-status.json"),
    helperPath: resolve(projectRoot, "scripts", "obsui-screenshot-helper.cs"),
    helper: null,
    helperAttached: false,
    helperStart: null,
    status: defaultStatus(process.platform === "win32"),
  };
  const register = (server: ViteDevServer | PreviewServer) => {
    server.httpServer?.once("close", () => stopHelper(state));
    server.middlewares.use("/api/screenshot", (request, response, next) => {
      const path = routePath(request);
      const method = request.method ?? "GET";
       // Status polling must stay side-effect free. Starting the C# helper
       // requires a PowerShell host; only an explicit screenshot interaction
       // should pay that cost.
       if (path === "/status" && method === "GET") return void readStatus(state).then((payload) => sendJson(response, 200, payload)).catch((error) => sendJson(response, 503, { ...state.status, lastError: error instanceof Error ? error.message : "截图状态不可用。" }));
      if (!["/start", "/cancel", "/save", "/config"].includes(path)) return next();
      if (method !== "POST") return next();
      if (!sameOrigin(request)) return sendJson(response, 403, { message: "本机来源校验失败。" });
      return void (async () => {
        try {
          const body = await readJsonBody(request);
          if (path === "/start") {
            const mode = typeof (body as { mode?: unknown })?.mode === "string" ? (body as { mode: string }).mode : "";
            if (!screenshotModes.has(mode)) throw new Error("截图模式无效。");
            return sendJson(response, 202, await writeCommand(state, { kind: "start", mode: mode as ScreenshotMode }));
          }
          if (path === "/config") {
            const record = body && typeof body === "object" ? body as { enabled?: unknown; hotkey?: unknown } : {};
            const hotkey = typeof record.hotkey === "string" ? record.hotkey.trim().slice(0, 80) : defaultHotkey;
            if (hotkey.length < 3 || !/^(?:(?:Ctrl|Alt|Shift|Win)\+){1,3}(?:[A-Z]|F(?:[1-9]|1[0-2])|Space|PrintScreen)$/i.test(hotkey)) throw new Error("截图快捷键格式无效。");
            return sendJson(response, 200, await writeCommand(state, { kind: "config", enabled: record.enabled !== false, hotkey }));
          }
          return sendJson(response, 200, await writeCommand(state, { kind: path.slice(1) }));
        } catch (error) {
          sendJson(response, 400, { message: error instanceof Error ? error.message : "截图操作失败。" });
        }
      })();
    });
  };
  return { name: "obsui-screenshot", configureServer: register, configurePreviewServer: register };
}

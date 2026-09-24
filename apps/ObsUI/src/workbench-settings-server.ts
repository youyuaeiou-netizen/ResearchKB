import { randomUUID } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import type { Plugin } from "vite";
import { LITERATURE_DATABASE_ROOT } from "./literature";
import { DEFAULT_STARTUP_SETTINGS, type CustomStartupApplication, type StartupApplicationId, type StartupApplicationStatus, type WorkbenchStartupSettings } from "./workbench-settings";

const execFileAsync = promisify(execFile);
const startupSettingsPath = join(LITERATURE_DATABASE_ROOT, "workbench-startup-settings.json");
const startupShortcutName = "ObsUI-Autostart.lnk";
const applicationLabels: Record<StartupApplicationId, string> = { zotero: "Zotero", flclash: "FlClash", ollama: "Ollama" };
let companionLaunchPromise: Promise<CompanionLaunchReport> | null = null;

type CompanionLaunchReport = {
  attempted: string[];
  started: string[];
  alreadyRunning: string[];
  ready: string[];
  notReady: string[];
  skipped: string[];
  failed: string[];
};

type Options = {
  environment: Record<string, string>;
  powerShell: string;
  projectRoot: string;
};

type RouteHandler = (request: IncomingMessage, response: ServerResponse, next: () => void) => void;

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

function normalizeStartupSettings(value: unknown): WorkbenchStartupSettings {
  if (!isRecord(value) || !isRecord(value.applications)) return structuredClone(DEFAULT_STARTUP_SETTINGS);
  const customApplications = Array.isArray(value.customApplications) ? value.customApplications.flatMap((candidate): CustomStartupApplication[] => {
    if (!isRecord(candidate) || typeof candidate.id !== "string" || !/^custom-[0-9a-f-]{36}$/i.test(candidate.id) || typeof candidate.label !== "string" || typeof candidate.path !== "string") return [];
    const path = candidate.path.trim();
    if (!path.toLocaleLowerCase().endsWith(".exe") || path.length > 1_024) return [];
    return [{ id: candidate.id, label: candidate.label.trim().slice(0, 120) || basename(path, ".exe"), path, enabled: candidate.enabled === true }];
  }).slice(0, 16) : [];
  return {
    windowsStartup: value.windowsStartup === true,
    applications: {
      zotero: value.applications.zotero === true,
      flclash: value.applications.flclash === true,
      ollama: value.applications.ollama === true,
    },
    customApplications,
  };
}

async function readSettings() {
  try { return normalizeStartupSettings(JSON.parse(await readFile(startupSettingsPath, "utf8"))); }
  catch { return structuredClone(DEFAULT_STARTUP_SETTINGS); }
}

async function writeSettings(settings: WorkbenchStartupSettings) {
  await mkdir(dirname(startupSettingsPath), { recursive: true });
  const temporaryPath = `${startupSettingsPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(settings, null, 2), "utf8");
  await rename(temporaryPath, startupSettingsPath);
}

function sendJson(response: ServerResponse, status: number, payload: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

function sameOrigin(request: IncomingMessage) {
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

async function readJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 32 * 1024) throw new Error("设置请求过大。");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

async function firstExisting(candidates: Array<string | null | undefined>) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    try { await access(candidate); return candidate; } catch { /* continue */ }
  }
  return null;
}

async function resolveApplications(environment: Record<string, string>) {
  const localAppData = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  return {
    zotero: await firstExisting([
      environment.OBSUI_ZOTERO_PATH,
      join(programFiles, "Zotero", "zotero.exe"),
      join(localAppData, "Programs", "Zotero", "zotero.exe"),
    ]),
    flclash: await firstExisting([
      environment.OBSUI_FLCLASH_PATH,
      "C:\\FlClash\\FlClash.exe",
      join(localAppData, "Programs", "FlClash", "FlClash.exe"),
    ]),
    ollama: await firstExisting([
      environment.OBSUI_OLLAMA_PATH,
      join(localAppData, "Programs", "Ollama", "ollama.exe"),
    ]),
  } satisfies Record<StartupApplicationId, string | null>;
}

async function isProcessRunning(executablePath: string) {
  try {
    const image = basename(executablePath);
    const { stdout } = await execFileAsync("tasklist.exe", ["/FI", `IMAGENAME eq ${image}`, "/FO", "CSV", "/NH"], { windowsHide: true, timeout: 3_000, maxBuffer: 32 * 1024 });
    return stdout.toLocaleLowerCase().includes(`"${image.toLocaleLowerCase()}"`);
  } catch { return false; }
}

async function launchApplication(id: StartupApplicationId, path: string): Promise<"started" | "already-running"> {
  if (await isProcessRunning(path)) return "already-running";
  const args = id === "ollama" ? ["serve"] : [];
  // Ollama starts llama-server as a child. A detached Windows process group can
  // receive its own Windows Terminal host during logon, even when the parent is
  // requested hidden. Keep it attached to this hidden Vite process instead.
  const child = spawn(path, args, { detached: id !== "ollama", windowsHide: true, stdio: "ignore", cwd: dirname(path) });
  await once(child, "spawn");
  child.unref();
  return "started";
}

async function isZoteroReady() {
  try {
    const response = await fetch("http://127.0.0.1:23119/api/", { signal: AbortSignal.timeout(800) });
    return response.ok && Boolean(response.headers.get("Zotero-Server-ID"));
  } catch { return false; }
}

async function waitForZoteroReady(timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  do {
    if (await isZoteroReady()) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  } while (Date.now() < deadline);
  return false;
}

async function syncStartupShortcut(enabled: boolean, options: Options) {
  if (process.platform !== "win32") throw new Error("开机自启动目前仅支持 Windows。");
  const scriptPath = resolve(options.projectRoot, "scripts", "start-obsui.ps1");
  const hiddenLauncherPath = resolve(options.projectRoot, "scripts", "start-obsui-hidden.vbs");
  const windowsScriptHost = join(process.env.WINDIR || "C:\\Windows", "System32", "wscript.exe");
  await Promise.all([access(scriptPath), access(hiddenLauncherPath), access(windowsScriptHost)]);
  const script = `
$startupDirectory = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupDirectory $env:OBSUI_SHORTCUT_NAME
$startScript = $env:OBSUI_START_SCRIPT
$hiddenLauncher = $env:OBSUI_HIDDEN_LAUNCHER
if ($env:OBSUI_STARTUP_ENABLED -eq '1') {
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $env:OBSUI_WSCRIPT
  $shortcut.Arguments = '"' + $env:OBSUI_HIDDEN_LAUNCHER + '" "' + $env:OBSUI_POWERSHELL + '"'
  $shortcut.WorkingDirectory = $env:OBSUI_PROJECT_ROOT
  $shortcut.Description = 'ObsUI managed startup shortcut'
  $shortcut.WindowStyle = 7
  $shortcut.Save()
  exit 0
}
if (Test-Path -LiteralPath $shortcutPath -PathType Leaf) {
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  if ($shortcut.Description -eq 'ObsUI managed startup shortcut' -and ($shortcut.Arguments -like ('*' + $startScript + '*') -or $shortcut.Arguments -like ('*' + $hiddenLauncher + '*'))) {
    Remove-Item -LiteralPath $shortcutPath -Force
  }
}
`;
  await execFileAsync(options.powerShell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script], {
    windowsHide: true,
    timeout: 8_000,
    maxBuffer: 16 * 1024,
    env: {
      ...process.env,
      OBSUI_SHORTCUT_NAME: startupShortcutName,
      OBSUI_START_SCRIPT: scriptPath,
      OBSUI_HIDDEN_LAUNCHER: hiddenLauncherPath,
      OBSUI_PROJECT_ROOT: options.projectRoot,
      OBSUI_POWERSHELL: options.powerShell,
      OBSUI_WSCRIPT: windowsScriptHost,
      OBSUI_STARTUP_ENABLED: enabled ? "1" : "0",
    },
  });
}

async function applicationStatus(paths: Record<StartupApplicationId, string | null>): Promise<StartupApplicationStatus[]> {
  return (Object.keys(applicationLabels) as StartupApplicationId[]).map((id) => ({
    id,
    label: applicationLabels[id],
    installed: Boolean(paths[id]),
    configured: Boolean(paths[id]),
  }));
}

async function customApplicationStatus(applications: CustomStartupApplication[]) {
  return Promise.all(applications.map(async (application) => ({
    ...application,
    installed: Boolean(await firstExisting([application.path])),
  })));
}

async function statePayload(options: Options, providedSettings?: WorkbenchStartupSettings) {
  const settings = providedSettings ?? await readSettings();
  const paths = await resolveApplications(options.environment);
  return { ...settings, customApplications: await customApplicationStatus(settings.customApplications), applicationsStatus: await applicationStatus(paths) };
}

async function launchConfiguredApplications(options: Options): Promise<CompanionLaunchReport> {
  const settings = await readSettings();
  const paths = await resolveApplications(options.environment);
  const report: CompanionLaunchReport = { attempted: [], started: [], alreadyRunning: [], ready: [], notReady: [], skipped: [], failed: [] };
  await Promise.all((Object.keys(settings.applications) as StartupApplicationId[]).map(async (id) => {
    if (!settings.applications[id]) { report.skipped.push(id); return; }
    const path = paths[id];
    if (!path) { report.failed.push(`${id}:未找到可执行文件`); return; }
    report.attempted.push(id);
    try {
      const result = await launchApplication(id, path);
      (result === "started" ? report.started : report.alreadyRunning).push(id);
    } catch (error) { report.failed.push(`${id}:${error instanceof Error ? error.message : "启动失败"}`); }
  }));
  await Promise.all(settings.customApplications.map(async (application) => {
    if (!application.enabled) { report.skipped.push(application.id); return; }
    if (!(await firstExisting([application.path]))) { report.failed.push(`${application.id}:未找到可执行文件`); return; }
    report.attempted.push(application.id);
    try {
      const result = await launchApplication("zotero", application.path);
      (result === "started" ? report.started : report.alreadyRunning).push(application.id);
    } catch (error) { report.failed.push(`${application.id}:${error instanceof Error ? error.message : "启动失败"}`); }
  }));
  if (settings.applications.zotero && paths.zotero && !report.failed.some((failure) => failure.startsWith("zotero:"))) {
    (await waitForZoteroReady() ? report.ready : report.notReady).push("zotero");
  }
  return report;
}

function requestCompanionLaunch(options: Options) {
  if (!companionLaunchPromise) companionLaunchPromise = launchConfiguredApplications(options).finally(() => { companionLaunchPromise = null; });
  return companionLaunchPromise;
}

async function selectCustomApplication() {
  if (process.platform !== "win32") throw new Error("自定义应用选择目前仅支持 Windows。");
  const script = `
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
$owner = $null
$dialog = $null
$selected = $null
try {
  $owner = New-Object System.Windows.Forms.Form
  $owner.Text = 'ObsUI 应用选择'
  $owner.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
  $owner.Size = New-Object System.Drawing.Size(1, 1)
  $owner.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
  $owner.ShowInTaskbar = $false
  $owner.TopMost = $true
  $owner.Opacity = 0.01
  $owner.Show()
  $owner.Activate()
  $owner.BringToFront()
  [System.Windows.Forms.Application]::DoEvents()
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = '选择随 ObsUI 启动的应用'
$dialog.Filter = 'Windows 应用 (*.exe)|*.exe'
$dialog.CheckFileExists = $true
$dialog.Multiselect = $false
  if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { $selected = $dialog.FileName }
} finally {
  if ($null -ne $dialog) { $dialog.Dispose() }
  if ($null -ne $owner) { $owner.Close(); $owner.Dispose() }
}
if (-not $selected) { '{"cancelled":true}'; exit 0 }
[pscustomobject]@{
  cancelled = $false
  pathUtf8Base64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($selected))
} | ConvertTo-Json -Compress
`;
  // WinForms file dialogs require Windows PowerShell's STA behavior on this machine.
  const { stdout } = await execFileAsync("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-STA", "-Command", script], { windowsHide: true, timeout: 120_000, maxBuffer: 32 * 1024 });
  const payload = JSON.parse(stdout.trim()) as { cancelled?: unknown; pathUtf8Base64?: unknown };
  if (payload.cancelled === true) return null;
  if (typeof payload.pathUtf8Base64 !== "string") throw new Error("没有取得应用路径。");
  const path = Buffer.from(payload.pathUtf8Base64, "base64").toString("utf8");
  if (!path.toLocaleLowerCase().endsWith(".exe") || !(await firstExisting([path]))) throw new Error("请选择有效的 Windows 应用。");
  return { id: `custom-${randomUUID()}`, label: basename(path, ".exe").slice(0, 120), path, enabled: false } satisfies CustomStartupApplication;
}

export function createWorkbenchSettingsPlugin(options: Options): Plugin {
  const register = (server: { middlewares: { use: (path: string, handler: RouteHandler) => void } }) => {
    server.middlewares.use("/api/workbench-startup/select-application", (request, response, next) => {
      if (request.method !== "POST") return next();
      if (!sameOrigin(request)) return sendJson(response, 403, { message: "本机来源校验失败。" });
      return void (async () => {
        try {
          const application = await selectCustomApplication();
          if (!application) return sendJson(response, 200, { cancelled: true });
          const settings = await readSettings();
          const next = { ...settings, customApplications: [...settings.customApplications.filter((item) => item.path.toLocaleLowerCase() !== application.path.toLocaleLowerCase()), application] };
          await writeSettings(next);
          sendJson(response, 200, { ...(await statePayload(options, next)), message: `${application.label} 已添加。` });
        } catch (error) { sendJson(response, 400, { message: error instanceof Error ? error.message : "无法添加应用。" }); }
      })();
    });
    server.middlewares.use("/api/workbench-startup", (request, response, next) => {
      if (request.method === "GET") return void statePayload(options).then((payload) => sendJson(response, 200, payload)).catch(() => sendJson(response, 503, { ...DEFAULT_STARTUP_SETTINGS, applicationsStatus: [], message: "启动设置暂不可用。" }));
      if (request.method !== "PUT") return next();
      if (!sameOrigin(request)) return sendJson(response, 403, { message: "本机来源校验失败。" });
      return void (async () => {
        try {
          const settings = normalizeStartupSettings(await readJsonBody(request));
          await syncStartupShortcut(settings.windowsStartup, options);
          await writeSettings(settings);
          sendJson(response, 200, { ...(await statePayload(options, settings)), message: "启动设置已保存，将在下次启动 ObsUI 时生效。" });
        } catch (error) {
          sendJson(response, 400, { message: error instanceof Error ? error.message : "无法保存启动设置。" });
        }
      })();
    });
    server.middlewares.use("/api/workbench-startup/launch", (request, response, next) => {
      if (request.method !== "POST") return next();
      if (!sameOrigin(request)) return sendJson(response, 403, { message: "本机来源校验失败。" });
      return void requestCompanionLaunch(options).then(async (launch) => sendJson(response, 200, { ...(await statePayload(options)), launch, message: "已检查随 ObsUI 启动的应用。" })).catch((error) => sendJson(response, 500, { message: error instanceof Error ? error.message : "无法启动伴随应用。" }));
    });
    // Trigger once when the Vite process is created; the page/launcher endpoint
    // below repeats this idempotently when an existing server is reused.
    void requestCompanionLaunch(options).catch(() => undefined);
  };
  return { name: "obsui-workbench-settings", configureServer: register, configurePreviewServer: register };
}

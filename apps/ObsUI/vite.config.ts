import { execFile, spawn } from "node:child_process";
import { access, open, readdir, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { homedir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import { ProxyAgent, fetch as fetchWithProxy } from "undici";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { parseLocalModelState, type LocalModelState } from "./src/local-models";
import { calculateTrafficRates, parseLoopbackProxyUrl, type NetworkCounterSample } from "./src/network-metrics";
import { createHddBridgePlugin } from "./src/hdd-bridge";

const execFileAsync = promisify(execFile);
const powerShell = "C:\\Program Files\\PowerShell\\7\\pwsh.exe";
const maxCodexSessionFiles = 12;
const maxCodexSessionTailBytes = 2 * 1024 * 1024;
const publicLatencyTarget = "1.1.1.1:443";
const publicLatencyIntervalMs = 5_000;
const ipInfoEndpoint = "https://api.ipinfo.io/lite/me";
const ollamaModelsEndpoint = "http://127.0.0.1:11434/api/tags";

const metricsScript = `
$cpu = Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor | Where-Object Name -eq '_Total' | Select-Object -First 1
$memory = Get-CimInstance Win32_OperatingSystem
$disk = Get-CimInstance Win32_PerfFormattedData_PerfDisk_PhysicalDisk | Where-Object Name -eq '_Total' | Select-Object -First 1
$engines = Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -ErrorAction SilentlyContinue
$gpuPeak = 0
if ($engines) {
  $gpuPeak = ($engines | Measure-Object -Property UtilizationPercentage -Maximum).Maximum
}
function LimitPercent([double]$value) {
  return [Math]::Round([Math]::Min(100, [Math]::Max(0, $value)))
}
$memoryUsed = 100 * (1 - ($memory.FreePhysicalMemory / $memory.TotalVisibleMemorySize))
[pscustomobject]@{
  cpu = LimitPercent $cpu.PercentProcessorTime
  gpu = LimitPercent $gpuPeak
  memory = LimitPercent $memoryUsed
  disk = LimitPercent $disk.PercentDiskTime
  sampledAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
} | ConvertTo-Json -Compress
`;

const networkMetricsScript = `
$route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction Stop |
  Where-Object State -eq 'Alive' |
  ForEach-Object {
    $candidate = $_
    $candidateAdapter = Get-NetAdapter -InterfaceIndex $candidate.InterfaceIndex -ErrorAction SilentlyContinue
    if ($candidateAdapter -and $candidateAdapter.Status -eq 'Up') {
      [pscustomobject]@{ route = $candidate; adapter = $candidateAdapter }
    }
  } |
  Sort-Object { $_.route.RouteMetric + $_.route.InterfaceMetric } |
  Select-Object -First 1
if (-not $route) { throw 'No active IPv4 default route on an up adapter.' }
$adapter = $route.adapter
$route = $route.route
$statistics = Get-NetAdapterStatistics -Name $adapter.Name -ErrorAction Stop
$localIpv4 = Get-NetIPAddress -InterfaceIndex $route.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -and $_.IPAddress -notlike '169.254.*' } |
  Select-Object -First 1 -ExpandProperty IPAddress
$flClashRunning = @(
  Get-Process -Name 'FlClash' -ErrorAction SilentlyContinue
).Count -gt 0
[pscustomobject]@{
  adapterId = [int]$route.InterfaceIndex
  adapterName = [string]$adapter.Name
  localIpv4 = if ($localIpv4) { [string]$localIpv4 } else { $null }
  linkSpeed = if ($adapter.LinkSpeed) { [string]$adapter.LinkSpeed } else { $null }
  receivedBytes = [double]$statistics.ReceivedBytes
  sentBytes = [double]$statistics.SentBytes
  flClashRunning = $flClashRunning
  sampledAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
} | ConvertTo-Json -Compress
`;

const latencyScript = `
$client = [System.Net.Sockets.TcpClient]::new()
try {
  $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
  $connection = $client.ConnectAsync('1.1.1.1', 443)
  if (-not $connection.Wait(4000)) { throw 'TCP connection timed out.' }
  $stopwatch.Stop()
  [pscustomobject]@{
    milliseconds = [Math]::Round($stopwatch.Elapsed.TotalMilliseconds)
    sampledAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  } | ConvertTo-Json -Compress
}
finally {
  $client.Dispose()
}
`;

const proxyLaunchScript = `
$running = @(Get-Process -Name $env:OBSUI_PROXY_PROCESS_NAME -ErrorAction SilentlyContinue)
$windowProcess = $running | Where-Object MainWindowHandle -ne 0 | Select-Object -First 1
if ($windowProcess) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ObsUiWindow {
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
'@ -ErrorAction Stop
  [ObsUiWindow]::ShowWindowAsync($windowProcess.MainWindowHandle, 9) | Out-Null
  [ObsUiWindow]::SetForegroundWindow($windowProcess.MainWindowHandle) | Out-Null
  [pscustomobject]@{ status = 'focused' } | ConvertTo-Json -Compress
}
elseif ($running.Count -gt 0) {
  [pscustomobject]@{ status = 'running' } | ConvertTo-Json -Compress
}
elseif (-not [string]::IsNullOrWhiteSpace($env:OBSUI_PROXY_PATH)) {
  Start-Process -FilePath $env:OBSUI_PROXY_PATH -ErrorAction Stop
  [pscustomobject]@{ status = 'started' } | ConvertTo-Json -Compress
}
else {
  [pscustomobject]@{ status = 'unconfigured' } | ConvertTo-Json -Compress
}
`;

type RecordLike = Record<string, unknown>;
type NetworkConfig = {
  flClashPath: string | null;
  clashVergePath: string | null;
  proxyUrl: string | null;
  ipInfoToken: string | null;
};
type LatencySample = { milliseconds: number | null; sampledAt: number | null };
type ProxyLaunchKind = "flclash" | "clash-verge";
type ProxyLaunchStatus = "focused" | "running" | "started" | "unconfigured";
type EgressCache = {
  status: "idle" | "ready" | "unconfigured" | "unavailable";
  checkedAt: number | null;
  data: { ip: string; country: string | null; countryCode: string | null; asn: string | null; asName: string | null } | null;
};
const proxyLaunchDefinitions: Record<ProxyLaunchKind, { label: string; processName: string; executableName: string }> = {
  flclash: { label: "FlClash", processName: "FlClash", executableName: "flclash.exe" },
  "clash-verge": { label: "Clash Verge", processName: "clash-verge", executableName: "clash-verge.exe" },
};
const proxyLaunchMessages: Record<ProxyLaunchKind, Record<ProxyLaunchStatus, string>> = {
  flclash: {
    focused: "FlClash 已恢复到前台。",
    running: "FlClash 正在启动，尚未检测到可恢复的窗口。",
    started: "FlClash 已启动。",
    unconfigured: "未配置 FlClash.exe 路径。",
  },
  "clash-verge": {
    focused: "Clash Verge 已恢复到前台。",
    running: "Clash Verge 正在启动，尚未检测到可恢复的窗口。",
    started: "Clash Verge 已启动。",
    unconfigured: "未配置 clash-verge.exe 路径。",
  },
};

function asRecord(value: unknown): RecordLike | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordLike : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNullableString(value: unknown): string | null {
  return value === null ? null : asNonEmptyString(value);
}

function asEpochMilliseconds(value: unknown): number | null {
  const numeric = asFiniteNumber(value);
  if (numeric !== null && numeric > 0) return numeric < 10_000_000_000 ? Math.round(numeric * 1000) : Math.round(numeric);
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function resolveExecutablePath(environment: Record<string, string>, environmentKey: string, executableName: string) {
  const requestedPath = asNonEmptyString(environment[environmentKey]);
  return requestedPath && basename(requestedPath).toLowerCase() === executableName ? requestedPath : null;
}

function resolveNetworkConfig(environment: Record<string, string>): NetworkConfig {
  return {
    flClashPath: resolveExecutablePath(environment, "OBSUI_FLCLASH_PATH", proxyLaunchDefinitions.flclash.executableName),
    clashVergePath: resolveExecutablePath(environment, "OBSUI_CLASH_VERGE_PATH", proxyLaunchDefinitions["clash-verge"].executableName),
    proxyUrl: parseLoopbackProxyUrl(environment.OBSUI_FLCLASH_PROXY_URL),
    ipInfoToken: asNonEmptyString(environment.OBSUI_IPINFO_TOKEN),
  };
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

function hasSameOrigin(request: IncomingMessage) {
  const origin = request.headers.origin;
  const host = request.headers.host;
  return typeof origin === "string" && typeof host === "string" && origin === `http://${host}`;
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 8 * 1024) throw new Error("Request body is too large.");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function sendSystemMetrics(response: ServerResponse) {
  try {
    const { stdout } = await execFileAsync(powerShell, ["-NoLogo", "-NoProfile", "-Command", metricsScript], {
      windowsHide: true,
      timeout: 8000,
      maxBuffer: 64 * 1024,
    });
    sendJson(response, 200, JSON.parse(stdout.trim()));
  } catch {
    sendJson(response, 503, { message: "Windows performance counters are unavailable." });
  }
}

function usageFromRateLimits(rateLimits: RecordLike, sampledAt: number) {
  const candidates = ["primary", "secondary"]
    .map((name) => asRecord(rateLimits[name]))
    .map((window) => {
      if (!window) return null;
      const usedPercent = asFiniteNumber(window.used_percent);
      const windowMinutes = asFiniteNumber(window.window_minutes);
      const resetsAt = asEpochMilliseconds(window.resets_at);
      if (usedPercent === null || windowMinutes === null || resetsAt === null || windowMinutes <= 0) return null;
      return { usedPercent: Math.round(Math.min(100, Math.max(0, usedPercent))), windowMinutes: Math.round(windowMinutes), resetsAt };
    })
    .filter((window): window is { usedPercent: number; windowMinutes: number; resetsAt: number } => window !== null)
    .sort((left, right) => right.windowMinutes - left.windowMinutes);
  const usage = candidates[0];
  return usage ? { ...usage, sampledAt } : null;
}

async function listCodexSessionFiles(directory: string): Promise<{ path: string; modifiedAt: number }[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const children = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listCodexSessionFiles(path);
    if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      try {
        const handle = await open(path, "r");
        try {
          const metadata = await handle.stat();
          return [{ path, modifiedAt: metadata.mtimeMs }];
        } finally {
          await handle.close();
        }
      } catch {
        return [];
      }
    }
    return [];
  }));
  return children.flat();
}

async function usageFromSessionFile(path: string, modifiedAt: number) {
  const handle = await open(path, "r");
  try {
    const { size } = await handle.stat();
    const length = Math.min(size, maxCodexSessionTailBytes);
    const offset = Math.max(0, size - length);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, offset);
    const lines = buffer.toString("utf8").split(/\r?\n/);
    if (offset > 0) lines.shift();
    for (const line of lines.reverse()) {
      if (!line) continue;
      try {
        const event = asRecord(JSON.parse(line));
        if (!event) continue;
        const payload = asRecord(event.payload);
        const rateLimits = asRecord(event.rate_limits) ?? asRecord(payload?.rate_limits);
        if (!rateLimits) continue;
        const sampledAt = asEpochMilliseconds(event.timestamp) ?? modifiedAt;
        const usage = usageFromRateLimits(rateLimits, sampledAt);
        if (usage) return usage;
      } catch {
        // Ignore incomplete JSON lines while Codex appends to its local session file.
      }
    }
  } finally {
    await handle.close();
  }
  return null;
}

async function readCodexUsage() {
  const sessionRoot = join(homedir(), ".codex", "sessions");
  const files = await listCodexSessionFiles(sessionRoot);
  for (const file of files.sort((left, right) => right.modifiedAt - left.modifiedAt).slice(0, maxCodexSessionFiles)) {
    try {
      const usage = await usageFromSessionFile(file.path, file.modifiedAt);
      if (usage) return usage;
    } catch {
      // A session can be locked or removed while Codex is running. Try the next recent file.
    }
  }
  throw new Error("No recent Codex usage record is available.");
}

async function sendCodexUsage(response: ServerResponse) {
  try {
    sendJson(response, 200, await readCodexUsage());
  } catch {
    sendJson(response, 503, { message: "Local Codex usage data is unavailable." });
  }
}

function parseNetworkCounter(payload: unknown): {
  counter: NetworkCounterSample;
  adapter: { name: string; localIpv4: string | null; linkSpeed: string | null };
  flClashRunning: boolean;
} | null {
  const record = asRecord(payload);
  if (!record) return null;
  const adapterId = asFiniteNumber(record.adapterId);
  const name = asNonEmptyString(record.adapterName);
  const localIpv4 = asNullableString(record.localIpv4);
  const linkSpeed = asNullableString(record.linkSpeed);
  const receivedBytes = asFiniteNumber(record.receivedBytes);
  const sentBytes = asFiniteNumber(record.sentBytes);
  const sampledAt = asFiniteNumber(record.sampledAt);
  if (adapterId === null || adapterId < 0 || !name || localIpv4 === null && record.localIpv4 !== null || linkSpeed === null && record.linkSpeed !== null ||
    receivedBytes === null || receivedBytes < 0 || sentBytes === null || sentBytes < 0 || sampledAt === null || sampledAt <= 0 || typeof record.flClashRunning !== "boolean") return null;
  return {
    counter: { adapterId: Math.round(adapterId), receivedBytes, sentBytes, sampledAt: Math.round(sampledAt) },
    adapter: { name, localIpv4, linkSpeed },
    flClashRunning: record.flClashRunning,
  };
}

async function isExecutableConfigured(path: string | null, executableName: string) {
  if (!path || basename(path).toLowerCase() !== executableName) return false;
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function runLatencyProbe(): Promise<LatencySample> {
  try {
    const { stdout } = await execFileAsync(powerShell, ["-NoLogo", "-NoProfile", "-Command", latencyScript], {
      windowsHide: true,
      timeout: 6000,
      maxBuffer: 16 * 1024,
    });
    const response = asRecord(JSON.parse(stdout.trim()));
    const milliseconds = response ? asFiniteNumber(response.milliseconds) : null;
    const sampledAt = response ? asFiniteNumber(response.sampledAt) : null;
    if (milliseconds === null || milliseconds < 0 || sampledAt === null || sampledAt <= 0) throw new Error("Invalid latency response.");
    return { milliseconds: Math.round(milliseconds), sampledAt: Math.round(sampledAt) };
  } catch {
    return { milliseconds: null, sampledAt: Date.now() };
  }
}

function isEgressConfigured(config: NetworkConfig) {
  return Boolean(config.proxyUrl && config.ipInfoToken);
}

function readIpInfoEgress(payload: unknown): EgressCache["data"] {
  const record = asRecord(payload);
  if (!record) return null;
  const ip = asNonEmptyString(record.ip);
  const country = asNullableString(record.country);
  const countryCode = asNullableString(record.country_code);
  const asn = asNullableString(record.asn);
  const asName = asNullableString(record.as_name);
  if (!ip || country === null && record.country !== null || countryCode === null && record.country_code !== null ||
    asn === null && record.asn !== null || asName === null && record.as_name !== null) return null;
  return { ip, country, countryCode, asn, asName };
}

async function refreshEgressCache(config: NetworkConfig): Promise<EgressCache> {
  if (!isEgressConfigured(config)) return { status: "unconfigured", checkedAt: null, data: null };
  const proxy = new ProxyAgent(config.proxyUrl!);
  try {
    const response = await fetchWithProxy(ipInfoEndpoint, {
      dispatcher: proxy,
      headers: { authorization: `Bearer ${config.ipInfoToken}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error("IPinfo response is unavailable.");
    const data = readIpInfoEgress(await response.json());
    if (!data) throw new Error("IPinfo response is malformed.");
    return { status: "ready", checkedAt: Date.now(), data };
  } catch {
    return { status: "unavailable", checkedAt: null, data: null };
  } finally {
    await proxy.close().catch(() => undefined);
  }
}

async function readLocalModels(): Promise<LocalModelState> {
  try {
    const response = await fetch(ollamaModelsEndpoint, { cache: "no-store", signal: AbortSignal.timeout(2_500) });
    if (!response.ok) throw new Error("Ollama model list is unavailable.");
    const payload = asRecord(await response.json());
    if (!Array.isArray(payload?.models)) throw new Error("Ollama model list is malformed.");
    const models = payload.models.map((candidate) => {
      const model = asRecord(candidate);
      const name = asNonEmptyString(model?.name);
      return name ? { name } : null;
    }).filter((model): model is { name: string } => model !== null);
    const state = parseLocalModelState({ status: "ready", checkedAt: Date.now(), models });
    if (!state) throw new Error("Local model state is malformed.");
    return state;
  } catch {
    return { status: "unavailable", checkedAt: null, models: [] };
  }
}

function localMetricsPlugin(config: NetworkConfig): Plugin {
  let previousCounter: NetworkCounterSample | null = null;
  let latency: LatencySample = { milliseconds: null, sampledAt: null };
  let latencyRequestedAt = 0;
  let latencyPending = false;
  let egressCache: EgressCache = isEgressConfigured(config) ? { status: "idle", checkedAt: null, data: null } : { status: "unconfigured", checkedAt: null, data: null };

  const refreshLatency = async () => {
    if (latencyPending || Date.now() - latencyRequestedAt < publicLatencyIntervalMs) return;
    latencyPending = true;
    latencyRequestedAt = Date.now();
    try {
      latency = await runLatencyProbe();
    } finally {
      latencyPending = false;
    }
  };

  const sendNetworkMetrics = async (response: ServerResponse) => {
    try {
      const { stdout } = await execFileAsync(powerShell, ["-NoLogo", "-NoProfile", "-Command", networkMetricsScript], {
        windowsHide: true,
        timeout: 8000,
        maxBuffer: 64 * 1024,
      });
      const snapshot = parseNetworkCounter(JSON.parse(stdout.trim()));
      if (!snapshot) throw new Error("Network metric response is malformed.");
      const traffic = calculateTrafficRates(previousCounter, snapshot.counter);
      previousCounter = snapshot.counter;
      void refreshLatency();
      sendJson(response, 200, {
        adapter: snapshot.adapter,
        downloadBytesPerSecond: traffic?.downloadBytesPerSecond ?? null,
        uploadBytesPerSecond: traffic?.uploadBytesPerSecond ?? null,
        latency: { target: publicLatencyTarget, milliseconds: latency.milliseconds, sampledAt: latency.sampledAt },
         flClash: { running: snapshot.flClashRunning, launchConfigured: await isExecutableConfigured(config.flClashPath, proxyLaunchDefinitions.flclash.executableName) },
        sampledAt: snapshot.counter.sampledAt,
      });
    } catch {
      sendJson(response, 503, { message: "Local network metrics are unavailable." });
    }
  };

  const sendProxyLaunch = async (response: ServerResponse, kind: ProxyLaunchKind, path: string | null) => {
    const definition = proxyLaunchDefinitions[kind];
    try {
      const launchConfigured = await isExecutableConfigured(path, definition.executableName);
      const { stdout } = await execFileAsync(powerShell, ["-NoLogo", "-NoProfile", "-Command", proxyLaunchScript], {
        windowsHide: true,
        timeout: 8000,
        maxBuffer: 16 * 1024,
        env: {
          ...process.env,
          OBSUI_PROXY_PATH: launchConfigured ? path ?? "" : "",
          OBSUI_PROXY_PROCESS_NAME: definition.processName,
        },
      });
      const result = asRecord(JSON.parse(stdout.trim()));
      const status = result ? asNonEmptyString(result.status) : null;
      if (!status || !["focused", "running", "started", "unconfigured"].includes(status)) throw new Error("Invalid FlClash launch response.");
      const typedStatus = status as ProxyLaunchStatus;
      sendJson(response, typedStatus === "unconfigured" ? 503 : 200, { status: typedStatus, message: proxyLaunchMessages[kind][typedStatus] });
    } catch {
      sendJson(response, 503, { status: "unavailable", message: `无法启动或恢复 ${definition.label}。` });
    }
  };

  const sendEgress = (response: ServerResponse) => sendJson(response, 200, egressCache);

  const sendLocalModels = async (response: ServerResponse) => {
    const state = await readLocalModels();
    sendJson(response, state.status === "ready" ? 200 : 503, state);
  };

  const openFolder = async (request: IncomingMessage, response: ServerResponse) => {
    try {
      const payload = asRecord(await readJsonBody(request));
      const folderPath = asNonEmptyString(payload?.folderPath);
      if (process.platform !== "win32" || !folderPath || !isAbsolute(folderPath)) {
        return sendJson(response, 400, { message: "关联文件夹路径无效。" });
      }
      const metadata = await stat(folderPath);
      if (!metadata.isDirectory()) return sendJson(response, 404, { message: "关联文件夹不存在。" });
      const explorer = spawn("explorer.exe", [folderPath], {
        detached: true,
        windowsHide: true,
        stdio: "ignore",
      });
      explorer.unref();
      sendJson(response, 200, { message: "已打开关联文件夹。" });
    } catch (error) {
      const code = asRecord(error)?.code;
      if (code === "ENOENT" || code === "ENOTDIR") return sendJson(response, 404, { message: "关联文件夹不存在。" });
      sendJson(response, 503, { message: "无法打开关联文件夹。" });
    }
  };

  const refreshEgress = async (response: ServerResponse) => {
    egressCache = await refreshEgressCache(config);
    sendJson(response, egressCache.status === "ready" ? 200 : 503, egressCache);
  };

  const registerRoutes = (server: { middlewares: { use: (path: string, handler: (request: IncomingMessage, response: ServerResponse, next: () => void) => void) => void } }) => {
    server.middlewares.use("/api/system-metrics", (request, response, next) => {
      if (request.method !== "GET") return next();
      void sendSystemMetrics(response);
    });
    server.middlewares.use("/api/codex-usage", (request, response, next) => {
      if (request.method !== "GET") return next();
      void sendCodexUsage(response);
    });
    server.middlewares.use("/api/network-metrics", (request, response, next) => {
      if (request.method !== "GET") return next();
      void sendNetworkMetrics(response);
    });
    server.middlewares.use("/api/network-egress/refresh", (request, response, next) => {
      if (request.method !== "POST") return next();
      if (!hasSameOrigin(request)) return sendJson(response, 403, { status: "unavailable", checkedAt: null, data: null });
      void refreshEgress(response);
    });
    server.middlewares.use("/api/network-egress", (request, response, next) => {
      if (request.method !== "GET") return next();
      sendEgress(response);
    });
    server.middlewares.use("/api/local-models", (request, response, next) => {
      if (request.method !== "GET") return next();
      void sendLocalModels(response);
    });
    server.middlewares.use("/api/flclash/launch", (request, response, next) => {
      if (request.method !== "POST") return next();
      if (!hasSameOrigin(request)) return sendJson(response, 403, { status: "unavailable", message: "本机来源校验失败。" });
      void sendProxyLaunch(response, "flclash", config.flClashPath);
    });
    server.middlewares.use("/api/clash-verge/launch", (request, response, next) => {
      if (request.method !== "POST") return next();
      if (!hasSameOrigin(request)) return sendJson(response, 403, { status: "unavailable", message: "本机来源校验失败。" });
      void sendProxyLaunch(response, "clash-verge", config.clashVergePath);
    });
    server.middlewares.use("/api/folders/open", (request, response, next) => {
      if (request.method !== "POST") return next();
      if (!hasSameOrigin(request)) return sendJson(response, 403, { message: "本机来源校验失败。" });
      void openFolder(request, response);
    });
  };

  return {
    name: "obsui-local-metrics",
    configureServer: registerRoutes,
    configurePreviewServer: registerRoutes,
  };
}

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), "OBSUI_");
  const workspaceRoot = resolve(process.cwd(), "../..");
  return {
    plugins: [react(), localMetricsPlugin(resolveNetworkConfig(environment)), createHddBridgePlugin(workspaceRoot)],
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
    },
  };
});

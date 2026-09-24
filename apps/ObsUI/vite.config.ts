import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { execFile, execFileSync, spawn } from "node:child_process";
import { access, lstat, mkdir, open, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { isIP } from "node:net";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import { ProxyAgent, fetch as fetchWithProxy } from "undici";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { DEFAULT_LOCAL_MODEL_SETTINGS, normalizeLocalModelSettings, parseLocalModelSettings, parseLocalModelState, type LocalModelSettings, type LocalModelState } from "./src/local-models";
import { calculateTrafficRates, decodeUtf8Base64, parseLoopbackProxyUrl, type NetworkCounterSample } from "./src/network-metrics";
import { createHddBridgePlugin, invalidateOllamaProbe } from "./src/hdd-bridge";
import { parseAutomationMetadata, type CodexAutomationsState } from "./src/codex-automations";
import { parseOpenMeteoWeather, type WeatherApiState } from "./src/weather";
import { parseWeatherCoordinates, type WeatherCoordinates } from "./src/weather-location";
import { createLiteraturePlugin } from "./src/literature-server";
import { LITERATURE_DATABASE_ROOT } from "./src/literature";
import { createWorkbenchSettingsPlugin } from "./src/workbench-settings-server";
import { createScreenshotPlugin } from "./src/screenshot-server";
import { createRepositoryPlugin } from "./src/repository-server";
import packageJson from "./package.json";

const execFileAsync = promisify(execFile);
const systemWindowsPowerShell = join(process.env.SystemRoot?.trim() || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
const configuredPowerShell = process.env.OBSUI_POWERSHELL_PATH?.trim() || "";
const configuredPowerShellIsAlias = /(?:^|[\\/])appdata[\\/]local[\\/]microsoft[\\/]windowsapps[\\/]pwsh\.exe$/i.test(configuredPowerShell)
  || /(?:^|[\\/])windowsapps[\\/]microsoft\.powershell_[^\\/]+[\\/]pwsh\.exe$/i.test(configuredPowerShell)
  || configuredPowerShell.toLocaleLowerCase() === "pwsh.exe";
const bundledPowerShell7 = join(homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "native", "powershell", "pwsh.exe");
const installedPowerShell7 = [
  join(process.env.LOCALAPPDATA?.trim() || "", "Programs", "PowerShell", "7", "pwsh.exe"),
  join(process.env.ProgramFiles?.trim() || "", "PowerShell", "7", "pwsh.exe"),
  bundledPowerShell7,
].find((candidate) => candidate && existsSync(candidate)) || null;
// A WindowsApps app-execution alias can flash a console even when the child
// process requests a hidden window. Resolve it to a real executable before any
// plugin module captures the value.
const powerShell = process.platform === "win32"
  ? configuredPowerShell && !configuredPowerShellIsAlias ? configuredPowerShell : installedPowerShell7 || systemWindowsPowerShell
  : configuredPowerShell || "pwsh.exe";
// Windows PowerShell is kept as the hidden host for short-lived local telemetry
// commands. The packaged PowerShell 7 host can flash a console during a cold
// login even when -WindowStyle Hidden is present; provider and HWiNFO flows
// continue to use the configured PowerShell 7 executable above.
const telemetryPowerShell = process.platform === "win32"
  ? process.env.OBSUI_WINDOWS_POWERSHELL_PATH?.trim() && !/(?:^|[\\/])appdata[\\/]local[\\/]microsoft[\\/]windowsapps[\\/]powershell\.exe$/i.test(process.env.OBSUI_WINDOWS_POWERSHELL_PATH.trim())
    && !/(?:^|[\\/])windowsapps[\\/]microsoft\.powershell_[^\\/]+[\\/](?:pwsh|powershell)\.exe$/i.test(process.env.OBSUI_WINDOWS_POWERSHELL_PATH.trim())
    ? process.env.OBSUI_WINDOWS_POWERSHELL_PATH.trim()
    : systemWindowsPowerShell
  : powerShell;
function powerShellCommandArgs(script: string, apartment: "MTA" | "STA" = "MTA") {
  return [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    ...(process.platform === "win32" ? ["-WindowStyle", "Hidden"] : []),
    ...(apartment === "STA" ? ["-STA"] : []),
    "-Command",
    script,
  ];
}
function powerShellFileArgs(scriptPath: string, ...args: string[]) {
  return [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    ...(process.platform === "win32" ? ["-WindowStyle", "Hidden"] : []),
    "-File",
    scriptPath,
    ...args,
  ];
}
const maxCodexSessionFiles = 64;
const maxCodexSessionTailBytes = 2 * 1024 * 1024;
const configuredCodexCliExecutable = process.env.OBSUI_CODEX_PATH?.trim() || null;
const codexInstallRoot = join(homedir(), "AppData", "Local", "OpenAI", "Codex", "bin");
const hwinfoRuntimeDirectory = process.env.OBSUI_HWINFO_RUNTIME_DIRECTORY?.trim() || join(process.cwd(), ".obsui-runtime", "hwinfo");
const hwinfoOwnerFile = process.env.OBSUI_HWINFO_OWNER_FILE?.trim() || join(hwinfoRuntimeDirectory, "hwinfo-owner.json");
const hwinfoStopRequestFile = process.env.OBSUI_HWINFO_STOP_REQUEST_FILE?.trim() || join(hwinfoRuntimeDirectory, "hwinfo-stop.request.json");
const hwinfoTaskStatusFile = process.env.OBSUI_HWINFO_TASK_STATUS_FILE?.trim() || join(hwinfoRuntimeDirectory, "hwinfo-task-status.json");
const hwinfoTaskCapabilityFile = process.env.OBSUI_HWINFO_TASK_CAPABILITY_FILE?.trim() || join(process.env.ProgramData?.trim() || "C:\\ProgramData", "ObsUI", "HWiNFO", "task-capabilities.json");
const hwinfoTaskName = "ObsUI HWiNFO";
const isViteServeProcess = process.argv.some((argument) => /[\\/]vite(?:\.js)?$/i.test(argument))
  && !process.argv.some((argument) => argument.toLocaleLowerCase() === "build");
const publicLatencyTarget = "1.1.1.1:443";
const publicLatencyIntervalMs = 5_000;
const systemSensorIntervalMs = 3_000;
const deviceProfileIntervalMs = 30_000;
const ipInfoEndpoint = "https://api.ipinfo.io/lite/me";
const ipifyEndpoint = "https://api.ipify.org?format=json";
const weatherLocationEndpoint = "https://ipapi.co/json/";
const ollamaModelsEndpoint = "http://127.0.0.1:11434/api/tags";
const ollamaExecutable = process.env.OBSUI_OLLAMA_PATH?.trim() || "ollama.exe";
const ollamaEndpoint = "http://127.0.0.1:11434";
const ollamaVersionEndpoint = `${ollamaEndpoint}/api/version`;
const ollamaModelRoot = "C:\\AIModels";
const ollamaSelectedModel = "qwen3.5:9b-64k";
const localModelSettingsPath = join(LITERATURE_DATABASE_ROOT, "local-model-settings.json");
const weatherEndpoint = "https://api.open-meteo.com/v1/forecast";
const weatherCacheTtlMs = 15 * 60_000;
const weatherLocationCacheTtlMs = 6 * 60 * 60_000;
const codexHome = process.env.CODEX_HOME?.trim() && isAbsolute(process.env.CODEX_HOME.trim()) ? process.env.CODEX_HOME.trim() : join(homedir(), ".codex");
const codexAutomationsRoot = join(codexHome, "automations");
const maxCodexAutomations = 20;

const metricsScript = `
$cpu = Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor | Where-Object Name -eq '_Total' | Select-Object -First 1
$processors = @(Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue)
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
$cpuClockValues = @($processors | ForEach-Object { $_.CurrentClockSpeed } | Where-Object { $null -ne $_ })
[pscustomobject]@{
  cpu = LimitPercent $cpu.PercentProcessorTime
  gpu = LimitPercent $gpuPeak
  memory = LimitPercent $memoryUsed
  disk = LimitPercent $disk.PercentDiskTime
  cpuClock = if ($cpuClockValues.Count -gt 0) { [Math]::Round(($cpuClockValues | Measure-Object -Maximum).Maximum) } else { $null }
  sampledAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
} | ConvertTo-Json -Compress
`;

const deviceProfileScript = `
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
function Read-Text([object]$value, [int]$maximum = 240) {
  if ($null -eq $value) { return $null }
  $text = ([string]$value).Trim()
  if ([string]::IsNullOrWhiteSpace($text) -or $text.Length -gt $maximum) { return $null }
  return $text
}
function Read-Bytes([object]$value) {
  try {
    $number = [int64]$value
    if ($number -ge 0 -and $number -le 1125899906842624) { return $number }
  }
  catch { }
  return $null
}
function Read-Integer([object]$value, [int]$minimum = 0, [int]$maximum = 100000) {
  try {
    $number = [int]$value
    if ($number -ge $minimum -and $number -le $maximum) { return $number }
  }
  catch { }
  return $null
}
function Get-MemoryType([object]$code) {
  try {
    switch ([int]$code) {
      24 { return 'DDR3' }
      26 { return 'DDR4' }
      34 { return 'DDR5' }
      35 { return 'LPDDR5' }
      default { return $null }
    }
  }
  catch { return $null }
}
function Get-GpuVendor([string]$name) {
  if ($name -match '(?i)nvidia|geforce|quadro') { return 'NVIDIA' }
  if ($name -match '(?i)amd|radeon') { return 'AMD' }
  if ($name -match '(?i)intel|arc') { return 'Intel' }
  return $null
}

$os = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue | Select-Object -First 1
$computer = Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue | Select-Object -First 1
$processor = Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue | Select-Object -First 1
$baseboard = Get-CimInstance Win32_BaseBoard -ErrorAction SilentlyContinue | Select-Object -First 1
$physicalMemory = @(Get-CimInstance Win32_PhysicalMemory -ErrorAction SilentlyContinue)
$videoControllers = @(Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue)
$diskDrives = @(Get-CimInstance Win32_DiskDrive -ErrorAction SilentlyContinue)
$desktopMonitors = @(Get-CimInstance Win32_DesktopMonitor -ErrorAction SilentlyContinue)

$memoryModules = @($physicalMemory | ForEach-Object {
  [pscustomobject]@{
    capacityBytes = Read-Bytes $_.Capacity
    speedMHz = Read-Integer $_.Speed 0 20000
    manufacturer = Read-Text $_.Manufacturer 120
    partNumber = Read-Text $_.PartNumber 160
    locator = Read-Text $_.DeviceLocator 80
    memoryType = Get-MemoryType $_.SMBIOSMemoryType
  }
})
$memorySpeeds = @($memoryModules | ForEach-Object { $_.speedMHz } | Where-Object { $null -ne $_ })
$memorySpeed = if ($memorySpeeds.Count -gt 0) { [int](($memorySpeeds | Measure-Object -Maximum).Maximum) } else { $null }

$gpus = @()
$nvidiaCommand = Get-Command nvidia-smi.exe -ErrorAction SilentlyContinue
if ($nvidiaCommand) {
  $nvidiaRows = @(& $nvidiaCommand.Source --query-gpu=name,memory.total,driver_version --format=csv,noheader,nounits 2>$null)
  foreach ($line in $nvidiaRows) {
    if ([string]::IsNullOrWhiteSpace([string]$line)) { continue }
    $parts = ([string]$line) -split ',', 3
    $name = if ($parts.Count -gt 0) { Read-Text $parts[0] } else { $null }
    if (-not $name) { continue }
    $memoryBytes = $null
    if ($parts.Count -gt 1) {
      try {
        $memoryMegabytes = [double]$parts[1].Trim()
        if ($memoryMegabytes -ge 0 -and $memoryMegabytes -le 1048576) { $memoryBytes = [int64]($memoryMegabytes * 1MB) }
      }
      catch { }
    }
    $driverVersion = if ($parts.Count -gt 2) { Read-Text $parts[2] 80 } else { $null }
    $gpus += [pscustomobject]@{ name = $name; vendor = 'NVIDIA'; memoryBytes = $memoryBytes; memoryType = $null; driverVersion = $driverVersion }
  }
}
foreach ($controller in $videoControllers) {
  $name = Read-Text $controller.Name
  if (-not $name -or @($gpus | Where-Object { $_.name -eq $name }).Count -gt 0) { continue }
  $adapterRam = Read-Bytes $controller.AdapterRAM
  if ($adapterRam -gt 68719476736) { $adapterRam = $null }
  $gpus += [pscustomobject]@{
    name = $name
    vendor = Get-GpuVendor $name
    memoryBytes = $adapterRam
    memoryType = $null
    driverVersion = Read-Text $controller.DriverVersion 80
  }
}

$storage = @($diskDrives | ForEach-Object {
  $model = Read-Text $_.Model
  if (-not $model) { return }
  $type = Read-Text $_.MediaType 80
  if ($type -match '(?i)solid|ssd|nvme' -or $model -match '(?i)nvme|ssd|sn\\d+') { $type = 'SSD' }
  elseif ($type -match '(?i)hard disk|fixed') { $type = 'HDD' }
  [pscustomobject]@{
    model = $model
    sizeBytes = Read-Bytes $_.Size
    type = $type
    interfaceType = Read-Text $_.InterfaceType 80
  }
})

$displays = @($desktopMonitors | ForEach-Object {
  $name = Read-Text $_.Name 160
  $width = Read-Integer $_.ScreenWidth 1 32000
  $height = Read-Integer $_.ScreenHeight 1 32000
  if (-not $name -or ($null -eq $width -and $null -eq $height)) { return }
  [pscustomobject]@{ name = $name; width = $width; height = $height; refreshRateHz = $null; sizeInches = $null }
})
if ($displays.Count -eq 0) {
  $displayController = $videoControllers | Where-Object { $_.CurrentHorizontalResolution -and $_.CurrentVerticalResolution } | Select-Object -First 1
  if ($displayController) {
    $displays += [pscustomobject]@{
      name = '当前显示输出'
      width = Read-Integer $displayController.CurrentHorizontalResolution 1 32000
      height = Read-Integer $displayController.CurrentVerticalResolution 1 32000
      refreshRateHz = Read-Integer $displayController.CurrentRefreshRate 1 1000
      sizeInches = $null
    }
  }
}

[ordered]@{
  sampledAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  os = [ordered]@{
    name = Read-Text $os.Caption 160
    version = Read-Text $os.Version 100
    architecture = Read-Text $os.OSArchitecture 40
  }
  cpu = [ordered]@{
    name = Read-Text $processor.Name
    cores = Read-Integer $processor.NumberOfCores 1 512
    threads = Read-Integer $processor.NumberOfLogicalProcessors 1 1024
    clockMHz = Read-Integer $(if ($processor.CurrentClockSpeed) { $processor.CurrentClockSpeed } else { $processor.MaxClockSpeed }) 1 20000
    process = $null
  }
  gpus = @($gpus)
  motherboard = [ordered]@{
    manufacturer = Read-Text $baseboard.Manufacturer 120
    model = Read-Text $baseboard.Product
    chipset = $null
  }
  memory = [ordered]@{
    totalBytes = Read-Bytes $computer.TotalPhysicalMemory
    speedMHz = $memorySpeed
    channels = $null
    modules = @($memoryModules)
  }
  storage = @($storage)
  displays = @($displays)
} | ConvertTo-Json -Depth 8 -Compress
`;

const sensorScript = `
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$payload = [ordered]@{ hardwareMonitor = $null; hwinfo = $false; nvidia = $false; sensors = @() }
function Get-ObsUiCategory([string]$identifier, [string]$name) {
  $value = ($identifier + ' ' + $name).ToLowerInvariant()
  if ($value -match '/vram/') { return 'gpu' }
  if ($value -match '/gpu-|gpu|nvidia|geforce|radeon') { return 'gpu' }
  if ($value -match '/(intel|amd)?cpu|/cpu/|cpu|ryzen|core.*temperature|tctl|tdie|ccd') { return 'cpu' }
  if ($value -match '/ram/|dimm|dram|memory|内存') { return 'memory' }
  if ($value -match '/storage/|/hdd/|/ssd/|/nvme/|drive|disk|磁盘|硬盘|存储|remaining\s+(?:life|health)|(?:life|health)\s+remaining') { return 'storage' }
  if ($value -match '/lpc/|mainboard|motherboard|board|nuvoton|ite |super io|chipset') { return 'motherboard' }
  return 'system'
}
function Get-ObsUiRole([string]$category, [string]$kind, [string]$name) {
  $value = $name.ToLowerInvariant()
  if ($category -eq 'cpu' -and $kind -eq 'clock' -and $value -notmatch 'core\\s*#?\\s*\\d|core\\s*\\d|核心\\s*#?\\s*\\d|t\\d+' -and $value -match 'cores?.*average|core average|core max|cpu\\s*(?:clock|frequency|频率)|平均有效频率|有效频率|average\\s+effective') { return 'cpu-clock' }
  if ($category -eq 'cpu' -and $kind -eq 'voltage' -and $value -match 'vcore|vddcr[_ -]?vdd|cpu.*voltage|voltage.*cpu|cpu.*电压|电压.*cpu|core.*svi.*tfn') { return 'cpu-voltage' }
  if ($category -eq 'cpu' -and $kind -eq 'load' -and $value -notmatch 'core\\s*#?\\s*\\d|core\\s*\\d|核心\\s*#?\\s*\\d|t\\d+' -and $value -match 'total|cpu\\s*(?:load|usage|utilization|占用|使用率)|(?:总|全部).*(?:占用|使用率)') { return 'cpu-load' }
  if ($category -eq 'cpu' -and $kind -eq 'power' -and $value -notmatch 'core\\s*#?\\s*\\d|core\\s*\\d|核心\\s*#?\\s*\\d|smu' -and $value -match 'package|cpu\\s*(?:power|功耗)|封装|(?:功耗|power).*cpu') { return 'cpu-power' }
  if ($category -eq 'cpu' -and $kind -eq 'temperature' -and $value -notmatch 'core\\s*#?\\s*\\d|core\\s*\\d|核心\\s*#?\\s*\\d' -and $value -match 'package|tctl|tdie|core average|core max|cpu|平均') { return 'cpu-temperature' }
  if ($category -eq 'gpu' -and $kind -eq 'clock') { if ($value -match 'memory') { return 'gpu-memory-clock' }; return 'gpu-core-clock' }
  if ($category -eq 'gpu' -and $kind -eq 'power') { return 'gpu-power' }
  if ($category -eq 'gpu' -and $kind -eq 'load') { if ($value -match 'memory|vram') { return 'gpu-memory-load' }; return 'gpu-load' }
  if ($category -eq 'gpu' -and $kind -eq 'temperature') { return 'gpu-temperature' }
  if ($category -eq 'memory' -and $kind -eq 'clock') { return 'memory-clock' }
  if ($category -eq 'memory' -and $kind -eq 'load') { return 'memory-load' }
  if ($category -eq 'memory' -and $kind -eq 'temperature') { return 'memory-temperature' }
  if ($category -eq 'motherboard' -and $kind -eq 'temperature') { return 'motherboard-temperature' }
  if ($category -eq 'storage' -and $kind -eq 'load' -and $value -match '^life$|remaining\s+(?:life|health)|(?:life|health)\s+remaining|(?:disk|drive|ssd|nvme|storage).*(?:health|life)|(?:health|life).*(?:disk|drive|ssd|nvme|storage)|(?:磁盘|硬盘|存储).*(?:寿命|健康)|(?:寿命|健康).*(?:磁盘|硬盘|存储)') { return 'storage-health' }
  if ($category -eq 'storage' -and $kind -eq 'temperature') { return 'storage-temperature' }
  return $null
}
function Add-ObsUiSensor([string]$id, [string]$label, [string]$category, [string]$kind, $value, [string]$unit, [string]$source, [string]$sourceLabel, [string]$role) {
  try {
    $number = [double]$value
    if ([double]::IsNaN($number) -or [double]::IsInfinity($number) -or $number -lt 0) { return }
    $precision = if ($kind -eq 'voltage') { 2 } else { 1 }
    $payload.sensors += [pscustomobject]@{ id = $id; label = $label; category = $category; kind = $kind; value = [Math]::Round($number, $precision); unit = $unit; source = $source; sourceLabel = $sourceLabel; role = if ([string]::IsNullOrWhiteSpace($role)) { $null } else { $role } }
  }
  catch { }
}

function Get-ObsUiHWiNFOKind([int]$type) {
  switch ($type) {
    1 { return 'temperature' }
    2 { return 'voltage' }
    5 { return 'power' }
    6 { return 'clock' }
    7 { return 'load' }
    default { return $null }
  }
}
function Convert-ObsUiHWiNFOValue($value, [string]$kind, [string]$unit) {
  try {
    $number = [double]$value
    $normalizedUnit = $unit.Trim().ToLowerInvariant()
    if ($kind -eq 'temperature') {
      if ($normalizedUnit -match 'f') { return (($number - 32) * 5 / 9) }
      if ($normalizedUnit -notmatch 'c') { return $null }
    }
    elseif ($kind -eq 'clock' -and $normalizedUnit -match 'ghz') { return ($number * 1000) }
    elseif ($kind -eq 'load' -and $normalizedUnit -notmatch '%') { return $null }
    elseif ($kind -eq 'voltage' -and $normalizedUnit -notmatch 'v') { return $null }
    elseif ($kind -eq 'power' -and $normalizedUnit -notmatch 'w') { return $null }
    return $number
  }
  catch { return $null }
}
function Get-ObsUiLibreHardwareMonitorKind([string]$identifier, [string]$type) {
  switch ($type.ToLowerInvariant()) {
    'temperature' { return 'temperature' }
    'clock' { return 'clock' }
    'voltage' { return 'voltage' }
    'power' { return 'power' }
    'load' { return 'load' }
    # LibreHardwareMonitor exposes NVMe SMART percentages (including Life)
    # as Level sensors. Reuse the percentage kind in the ObsUI contract.
    'level' { return 'load' }
  }
  $value = $identifier.ToLowerInvariant()
  if ($value -match '/temperature/') { return 'temperature' }
  if ($value -match '/clock/') { return 'clock' }
  if ($value -match '/voltage/') { return 'voltage' }
  if ($value -match '/power/') { return 'power' }
  if ($value -match '/load/') { return 'load' }
  if ($value -match '/level/') { return 'load' }
  return $null
}
function Get-ObsUiLibreHardwareMonitorNodes($node) {
  if ($null -eq $node) { return }
  $identifier = [string]$node.SensorId
  if ([string]::IsNullOrWhiteSpace($identifier)) { $identifier = [string]$node.id }
  if ($identifier -match '^/' -and $null -ne (Get-ObsUiLibreHardwareMonitorKind $identifier ([string]$node.Type))) { $node }
  foreach ($child in @($node.Children)) { Get-ObsUiLibreHardwareMonitorNodes $child }
}
function Convert-ObsUiLibreHardwareMonitorValue($value) {
  $text = [string]$value
  if ($text -notmatch '^\\s*(-?\\d+(?:[\\.,]\\d+)?)') { return $null }
  $number = 0.0
  $styles = [System.Globalization.NumberStyles]::Float
  if ([double]::TryParse($matches[1].Replace(',', '.'), $styles, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$number)) { return $number }
  return $null
}
function Get-ObsUiNumberSuffix([string]$label, [string]$prefix) {
  if (-not $label.StartsWith($prefix)) { return $null }
  $number = 0
  if ([int]::TryParse($label.Substring($prefix.Length), [ref]$number)) { return $number }
  return $null
}
function Get-ObsUiLibreHardwareMonitorLabel([string]$identifier, [string]$category, [string]$kind, [string]$label) {
  if ($category -eq 'cpu') {
    if ($kind -eq 'temperature' -and $label -eq 'Core (Tctl/Tdie)') { return 'CPU温度' }
    $ccd = if ($label.EndsWith(' (Tdie)')) { Get-ObsUiNumberSuffix $label.Substring(0, $label.Length - 7) 'CCD' } else { $null }
    if ($kind -eq 'temperature' -and $null -ne $ccd) { return "CPU CCD$ccd 温度" }
    if ($kind -eq 'voltage' -and $label -eq 'Core (SVI2 TFN)') { return 'CPU 核心电压' }
    if ($kind -eq 'voltage' -and $label.StartsWith('Core #') -and $label.EndsWith(' VID')) { return "CPU 单核 VID ($label)" }
    if ($kind -eq 'power' -and $label -eq 'Package') { return 'CPU封装功耗' }
    if ($kind -eq 'clock' -and $label -eq 'Bus Speed') { return 'CPU总线频率' }
    if ($kind -eq 'clock' -and $label -eq 'Cores (Average)') { return 'CPU频率' }
    if ($kind -eq 'clock' -and $label -eq 'Cores (Average Effective)') { return 'CPU有效频率' }
    if ($kind -eq 'load' -and $label -eq 'CPU Total') { return 'CPU总占用' }
    if ($kind -eq 'load' -and $label -eq 'CPU Core Max') { return 'CPU 核心最高占用' }
  }
  if ($category -eq 'gpu') {
    if ($kind -eq 'load' -and $identifier -match '/vram/') { return '显存占用' }
    if ($label -eq 'GPU Core') {
      switch ($kind) { 'temperature' { return '显卡温度' }; 'clock' { return 'GPU频率' }; 'voltage' { return 'GPU电压' }; 'power' { return 'GPU热功耗' }; 'load' { return 'GPU占用' } }
    }
    if ($label -eq 'GPU Memory') {
      if ($kind -eq 'clock') { return '显存频率' }
      if ($kind -eq 'load') { return '显存占用' }
    }
    if ($kind -eq 'temperature' -and $label -eq 'GPU Hot Spot') { return '显卡热点温度' }
    if ($kind -eq 'temperature' -and $label -eq 'GPU Memory Junction') { return '显存结温' }
    if ($kind -eq 'temperature' -and $label -eq 'GPU VR SoC') { return '显卡 SoC 温度' }
    if ($kind -eq 'power' -and $label -eq 'GPU Package') { return 'GPU热功耗' }
  }
  $temperatureNumber = Get-ObsUiNumberSuffix $label 'Temperature #'
  if ($category -eq 'motherboard' -and $kind -eq 'temperature' -and $null -ne $temperatureNumber) { return '主板温度' }
  $voltageNumber = Get-ObsUiNumberSuffix $label 'Voltage #'
  if ($category -eq 'motherboard' -and $kind -eq 'voltage' -and $null -ne $voltageNumber) { return "主板电压 #$voltageNumber" }
  if ($category -eq 'memory') {
    $dimmNumber = Get-ObsUiNumberSuffix $label 'DIMM #'
    if ($kind -eq 'temperature' -and $null -ne $dimmNumber) { return '内存条温度' }
    if ($kind -eq 'load' -and $label -eq 'Memory') { return $(if ($identifier -match '/vram/') { '显存占用' } else { '内存占用' }) }
  }
  if ($category -eq 'storage' -and $kind -eq 'temperature') {
    if ($label -eq 'Composite Temperature') { return '硬盘温度' }
    if ($null -ne $temperatureNumber) { return '硬盘温度' }
    if ($label -eq 'Warning Temperature') { return '硬盘温度警告阈值' }
    if ($label -eq 'Critical Temperature') { return '硬盘温度临界阈值' }
  }
  if ($category -eq 'storage' -and $kind -eq 'load') {
    if ($label -match '^life$|remaining\s+(?:life|health)|(?:life|health)\s+remaining|(?:disk|drive|ssd|nvme|storage).*(?:health|life)|(?:health|life).*(?:disk|drive|ssd|nvme|storage)|(?:磁盘|硬盘|存储).*(?:寿命|健康)|(?:寿命|健康).*(?:磁盘|硬盘|存储)') { return '磁盘剩余寿命' }
    if ($label -eq 'Available Spare') { return '磁盘可用备用' }
    if ($label -eq 'Available Spare Threshold') { return '磁盘备用阈值' }
    if ($label -eq 'Percentage Used') { return '磁盘已用寿命' }
  }
  return $label
}
function Start-ObsUiLibreHardwareMonitor {
  if (@(Get-Process -Name 'LibreHardwareMonitor' -ErrorAction SilentlyContinue).Count -gt 0) { return }
  # LibreHardwareMonitor requires elevation. Its hidden, triggerless scheduled
  # task is registered during setup, so routine sensor polling never launches
  # the EXE directly and never produces a UAC prompt.
  try {
    $task = Get-ScheduledTask -TaskName 'ObsUI LibreHardwareMonitor' -ErrorAction Stop
    if ($task.State -ne 'Running') { Start-ScheduledTask -TaskName 'ObsUI LibreHardwareMonitor' -ErrorAction Stop }
  }
  catch { }
}
function Get-ObsUiLibreHardwareMonitorWebRoot {
  try { return Invoke-RestMethod -Uri 'http://127.0.0.1:8085/data.json' -TimeoutSec 1 -ErrorAction Stop } catch { }
  Start-ObsUiLibreHardwareMonitor
  foreach ($attempt in 1..4) {
    Start-Sleep -Milliseconds 500
    try { return Invoke-RestMethod -Uri 'http://127.0.0.1:8085/data.json' -TimeoutSec 1 -ErrorAction Stop } catch { }
  }
  return $null
}

$hwinfoProcess = @(Get-Process -Name 'HWiNFO64', 'HWiNFO32', 'HWiNFO' -ErrorAction SilentlyContinue)
if ($hwinfoProcess.Count -gt 0) {
  try {
    Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public sealed class ObsUiHwInfoReading
{
    public uint Type { get; set; }
    public uint SensorIndex { get; set; }
    public uint ReadingId { get; set; }
    public string Sensor { get; set; }
    public string Label { get; set; }
    public string Unit { get; set; }
    public double Value { get; set; }
}

public static class ObsUiHwInfoSharedMemory
{
    private const uint FileMapRead = 0x0004;
    private const uint Synchronize = 0x00100000;
    private const uint MutexModifyState = 0x0001;
    private const uint WaitObject0 = 0x00000000;
    private const uint WaitAbandoned = 0x00000080;
    private const int HeaderSize = 48;
    private const int MinimumSensorElementSize = 264;
    private const int MinimumReadingElementSize = 316;
    private const int MaximumElements = 16384;
    private const int MaximumElementSize = 4096;
    private const int MaximumOffset = 32 * 1024 * 1024;
    private static readonly Encoding SharedMemoryEncoding = Encoding.GetEncoding(0);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr OpenFileMapping(uint desiredAccess, bool inheritHandle, string name);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr MapViewOfFile(IntPtr mapping, uint desiredAccess, uint offsetHigh, uint offsetLow, UIntPtr bytesToMap);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool UnmapViewOfFile(IntPtr address);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr OpenMutex(uint desiredAccess, bool inheritHandle, string name);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool ReleaseMutex(IntPtr handle);

    private static IntPtr Offset(IntPtr address, long offset)
    {
        if (offset < 0 || offset > int.MaxValue) throw new ArgumentOutOfRangeException("offset");
        return IntPtr.Add(address, (int)offset);
    }

    private static uint ReadUInt32(IntPtr address, long offset)
    {
        return unchecked((uint)Marshal.ReadInt32(Offset(address, offset)));
    }

    private static double ReadDouble(IntPtr address, long offset)
    {
        return BitConverter.Int64BitsToDouble(Marshal.ReadInt64(Offset(address, offset)));
    }

    private static string ReadString(IntPtr address, long offset, int length)
    {
        var bytes = new byte[length];
        Marshal.Copy(Offset(address, offset), bytes, 0, bytes.Length);
        var end = Array.IndexOf(bytes, (byte)0);
        return SharedMemoryEncoding.GetString(bytes, 0, end < 0 ? bytes.Length : end).Trim();
    }

    private static bool IsValidSection(uint offset, uint elementSize, uint count, int minimumElementSize)
    {
        if (offset < HeaderSize || offset > MaximumOffset || elementSize < minimumElementSize || elementSize > MaximumElementSize || count > MaximumElements) return false;
        var end = (long)offset + (long)elementSize * count;
        return end <= MaximumOffset;
    }

    public static ObsUiHwInfoReading[] Read()
    {
        IntPtr mapping = IntPtr.Zero;
        IntPtr view = IntPtr.Zero;
        IntPtr mutex = IntPtr.Zero;
        var locked = false;
        try
        {
            mapping = OpenFileMapping(FileMapRead, false, "Global\\\\HWiNFO_SENS_SM2");
            if (mapping == IntPtr.Zero) return Array.Empty<ObsUiHwInfoReading>();
            mutex = OpenMutex(Synchronize | MutexModifyState, false, "Global\\\\HWiNFO_SM2_MUTEX");
            if (mutex == IntPtr.Zero) return Array.Empty<ObsUiHwInfoReading>();
            var wait = WaitForSingleObject(mutex, 250);
            if (wait != WaitObject0 && wait != WaitAbandoned) return Array.Empty<ObsUiHwInfoReading>();
            locked = true;
            view = MapViewOfFile(mapping, FileMapRead, 0, 0, UIntPtr.Zero);
            if (view == IntPtr.Zero || Marshal.ReadByte(view, 0) != (byte)'H' || Marshal.ReadByte(view, 1) != (byte)'W' || Marshal.ReadByte(view, 2) != (byte)'i' || Marshal.ReadByte(view, 3) != (byte)'S') return Array.Empty<ObsUiHwInfoReading>();

            var version = ReadUInt32(view, 4);
            var sensorOffset = ReadUInt32(view, 20);
            var sensorSize = ReadUInt32(view, 24);
            var sensorCount = ReadUInt32(view, 28);
            var readingOffset = ReadUInt32(view, 32);
            var readingSize = ReadUInt32(view, 36);
            var readingCount = ReadUInt32(view, 40);
            if (version == 0 || !IsValidSection(sensorOffset, sensorSize, sensorCount, MinimumSensorElementSize) || !IsValidSection(readingOffset, readingSize, readingCount, MinimumReadingElementSize)) return Array.Empty<ObsUiHwInfoReading>();

            var sensorNames = new string[sensorCount];
            for (var index = 0; index < sensorCount; index++)
            {
                var baseOffset = (long)sensorOffset + (long)sensorSize * index;
                var userName = ReadString(view, baseOffset + 136, 128);
                sensorNames[index] = userName.Length > 0 ? userName : ReadString(view, baseOffset + 8, 128);
            }

            var readings = new List<ObsUiHwInfoReading>();
            for (var index = 0; index < readingCount; index++)
            {
                var baseOffset = (long)readingOffset + (long)readingSize * index;
                var type = ReadUInt32(view, baseOffset);
                var sensorIndex = ReadUInt32(view, baseOffset + 4);
                if (sensorIndex >= sensorNames.Length) continue;
                var value = ReadDouble(view, baseOffset + 284);
                if (double.IsNaN(value) || double.IsInfinity(value)) continue;
                var userLabel = ReadString(view, baseOffset + 140, 128);
                var label = userLabel.Length > 0 ? userLabel : ReadString(view, baseOffset + 12, 128);
                if (label.Length == 0) continue;
                readings.Add(new ObsUiHwInfoReading {
                    Type = type,
                    SensorIndex = sensorIndex,
                    ReadingId = ReadUInt32(view, baseOffset + 8),
                    Sensor = sensorNames[sensorIndex] ?? String.Empty,
                    Label = label,
                    Unit = ReadString(view, baseOffset + 268, 16),
                    Value = value,
                });
            }
            return readings.ToArray();
        }
        catch { return Array.Empty<ObsUiHwInfoReading>(); }
        finally
        {
            if (view != IntPtr.Zero) UnmapViewOfFile(view);
            if (locked) ReleaseMutex(mutex);
            if (mutex != IntPtr.Zero) CloseHandle(mutex);
            if (mapping != IntPtr.Zero) CloseHandle(mapping);
        }
    }
}
'@ -ErrorAction Stop
    $hwinfoRows = @([ObsUiHwInfoSharedMemory]::Read())
    if ($hwinfoRows.Count -gt 0) { $payload.hwinfo = $true }
    foreach ($row in $hwinfoRows) {
      $kind = Get-ObsUiHWiNFOKind $row.Type
      if ($null -eq $kind) { continue }
      $value = Convert-ObsUiHWiNFOValue $row.Value $kind $row.Unit
      if ($null -eq $value) { continue }
      $category = Get-ObsUiCategory $row.Sensor $row.Label
      $role = Get-ObsUiRole $category $kind ($row.Sensor + ' ' + $row.Label)
      $unit = switch ($kind) { 'clock' { 'MHz' }; 'voltage' { 'V' }; 'power' { 'W' }; 'load' { '%' }; 'temperature' { '°C' } }
      if ($null -eq $unit) { continue }
      Add-ObsUiSensor ('hwinfo:' + $row.SensorIndex + ':' + $row.ReadingId) $row.Label $category $kind $value $unit 'hwinfo' 'HWiNFO' $role
    }
  }
  catch { }
}

try {
  $webRoot = Get-ObsUiLibreHardwareMonitorWebRoot
  if ($null -eq $webRoot) { throw 'LibreHardwareMonitor web server is unavailable.' }
  $webRows = @(Get-ObsUiLibreHardwareMonitorNodes $webRoot | Select-Object -First 512)
  if ($webRows.Count -gt 0) {
    $payload.hardwareMonitor = 'LibreHardwareMonitor'
    $webSensorIds = @{}
    foreach ($row in $webRows) {
      $identifier = [string]$row.SensorId
      if ([string]::IsNullOrWhiteSpace($identifier)) { $identifier = [string]$row.id }
      $kind = Get-ObsUiLibreHardwareMonitorKind $identifier ([string]$row.Type)
      if ($null -eq $kind) { continue }
      $value = Convert-ObsUiLibreHardwareMonitorValue $row.Value
      if ($null -eq $value) { continue }
      $rawLabel = [string]$row.Text
      if ([string]::IsNullOrWhiteSpace($rawLabel)) { $rawLabel = $identifier }
      $category = Get-ObsUiCategory $identifier $rawLabel
      $role = Get-ObsUiRole $category $kind $rawLabel
      # One entry is emitted for each network adapter. The dashboard already has a dedicated network card, so these duplicate adapter counters are not selectable here.
      if ($category -eq 'system' -and ($identifier -match '^/nic/' -or $rawLabel -eq 'Network Utilization')) { continue }
      # On this board the ITE temperature/0 channel follows CPU heat. Temperature/1 is the board sensor used by GamePP.
      if ($identifier -eq '/lpc/it8613e/0/temperature/0') { continue }
      if ($identifier -eq '/lpc/it8613e/0/temperature/1') { $role = 'motherboard-temperature' }
      $label = Get-ObsUiLibreHardwareMonitorLabel $identifier $category $kind $rawLabel
      $unit = switch ($kind) { 'clock' { 'MHz' }; 'voltage' { 'V' }; 'power' { 'W' }; 'load' { '%' }; 'temperature' { '°C' } }
      if ($null -eq $unit) { continue }
      $sensorId = 'hardware-monitor:web:' + $identifier
      if ($webSensorIds.ContainsKey($sensorId)) {
        $duplicateBase = $sensorId + ':label:' + [uri]::EscapeDataString($rawLabel.ToLowerInvariant())
        $sensorId = $duplicateBase
        $duplicate = 2
        while ($webSensorIds.ContainsKey($sensorId)) { $sensorId = $duplicateBase + ':' + $duplicate; $duplicate += 1 }
      }
      $webSensorIds[$sensorId] = $true
      Add-ObsUiSensor $sensorId $label $category $kind $value $unit 'hardware-monitor' 'LibreHardwareMonitor' $role
    }
  }
}
catch { }

foreach ($namespace in @('root/LibreHardwareMonitor', 'root/OpenHardwareMonitor')) {
  try {
    $rows = @(Get-CimInstance -Namespace $namespace -ClassName Sensor -ErrorAction Stop | Where-Object { $_.SensorType -in @('Clock', 'Voltage', 'Power', 'Load', 'Temperature') -and $null -ne $_.Value })
    if ($rows.Count -eq 0) { continue }
    $monitorName = if ($namespace -match 'Libre') { 'LibreHardwareMonitor' } else { 'OpenHardwareMonitor' }
    $payload.hardwareMonitor = $monitorName
    foreach ($row in $rows) {
      $kind = ([string]$row.SensorType).ToLowerInvariant()
      $unit = switch ($kind) { 'clock' { 'MHz' }; 'voltage' { 'V' }; 'power' { 'W' }; 'load' { '%' }; 'temperature' { '°C' }; default { $null } }
      if ($null -eq $unit) { continue }
      $identifier = [string]$row.Identifier
      $name = [string]$row.Name
      $category = Get-ObsUiCategory $identifier $name
      $role = Get-ObsUiRole $category $kind $name
      Add-ObsUiSensor ("hardware-monitor:" + $namespace + ':' + $identifier) $name $category $kind $row.Value $unit 'hardware-monitor' $monitorName $role
    }
    break
  }
  catch { }
}

$nvidiaSmi = (Get-Command nvidia-smi.exe -ErrorAction SilentlyContinue | Select-Object -First 1).Source
if (-not $nvidiaSmi) {
  $nvidiaSmiCandidate = Join-Path $env:SystemRoot 'System32\\nvidia-smi.exe'
  if (Test-Path -LiteralPath $nvidiaSmiCandidate) { $nvidiaSmi = $nvidiaSmiCandidate }
}
if ($nvidiaSmi) {
  try {
    $lines = @(& $nvidiaSmi '--query-gpu=index,clocks.sm,clocks.mem,power.draw,temperature.gpu,utilization.gpu' '--format=csv,noheader,nounits' 2>$null)
    foreach ($line in $lines) {
      $values = @([string]$line -split ',' | ForEach-Object { $_.Trim() })
      if ($values.Count -lt 6) { continue }
      $index = $values[0]
      Add-ObsUiSensor ("nvidia:" + $index + ':core-clock') ("GPU " + $index + ' 核心频率') 'gpu' 'clock' $values[1] 'MHz' 'nvidia-smi' 'NVIDIA SMI' 'gpu-core-clock'
      Add-ObsUiSensor ("nvidia:" + $index + ':memory-clock') ("GPU " + $index + ' 显存频率') 'gpu' 'clock' $values[2] 'MHz' 'nvidia-smi' 'NVIDIA SMI' 'gpu-memory-clock'
      Add-ObsUiSensor ("nvidia:" + $index + ':power') ("GPU " + $index + ' 功耗') 'gpu' 'power' $values[3] 'W' 'nvidia-smi' 'NVIDIA SMI' 'gpu-power'
      Add-ObsUiSensor ("nvidia:" + $index + ':temperature') ("GPU " + $index + ' 温度') 'gpu' 'temperature' $values[4] '°C' 'nvidia-smi' 'NVIDIA SMI' 'gpu-temperature'
      Add-ObsUiSensor ("nvidia:" + $index + ':load') ("GPU " + $index + ' 占用') 'gpu' 'load' $values[5] '%' 'nvidia-smi' 'NVIDIA SMI' 'gpu-load'
      $payload.nvidia = $true
    }
  }
  catch { }
}

if (-not ($payload.sensors | Where-Object role -in @('storage-temperature', 'storage-health'))) {
  try {
    $reliabilityCounters = @(Get-PhysicalDisk -ErrorAction Stop | ForEach-Object {
      try { $_ | Get-StorageReliabilityCounter -ErrorAction Stop } catch { $null }
    } | Where-Object { $null -ne $_ })
    if (-not ($payload.sensors | Where-Object role -eq 'storage-temperature')) {
      $temperatures = @($reliabilityCounters | ForEach-Object { $_.Temperature } | Where-Object { $null -ne $_ })
      if ($temperatures.Count -gt 0) { Add-ObsUiSensor 'windows:storage-temperature' '存储温度' 'storage' 'temperature' (($temperatures | Measure-Object -Maximum).Maximum) '°C' 'windows' 'Windows 存储' 'storage-temperature' }
    }
    if (-not ($payload.sensors | Where-Object role -eq 'storage-health')) {
      # Windows exposes Wear as the percentage already consumed. Only emit a
      # remaining-life value when the counter is present and bounded; never
      # turn a generic Healthy status into a made-up 100% reading.
      $wearValues = @($reliabilityCounters | ForEach-Object {
        $wear = $_.Wear
        if ($null -ne $wear) {
          try {
            $number = [double]$wear
            if (-not [double]::IsNaN($number) -and -not [double]::IsInfinity($number) -and $number -ge 0 -and $number -le 100) { $number }
          }
          catch { }
        }
      })
      if ($wearValues.Count -gt 0) {
        $remainingLife = 100 - (($wearValues | Measure-Object -Maximum).Maximum)
        Add-ObsUiSensor 'windows:storage-health' '磁盘剩余寿命' 'storage' 'load' $remainingLife '%' 'windows' 'Windows 存储' 'storage-health'
      }
    }
  }
  catch { }
}
if (-not ($payload.sensors | Where-Object role -eq 'cpu-temperature')) {
  try {
    $temperatures = @(Get-CimInstance -Namespace 'root/wmi' -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction Stop | ForEach-Object { $_.CurrentTemperature / 10 - 273.15 })
    if ($temperatures.Count -gt 0) { Add-ObsUiSensor 'windows:acpi-cpu-temperature' 'CPU 温度' 'cpu' 'temperature' (($temperatures | Measure-Object -Maximum).Maximum) '°C' 'windows' 'Windows ACPI' 'cpu-temperature' }
  }
  catch { }
}

[pscustomobject]$payload | ConvertTo-Json -Compress -Depth 4
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
  # Keep localized adapter names ASCII-only across PowerShell 5.1/7 and Node's stdout decoder.
  adapterNameUtf8Base64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([string]$adapter.Name))
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
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class ObsUiProxyWindow {
  private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int maxCount);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(IntPtr hWnd, StringBuilder className, int maxCount);
  [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr hWnd);

  public static IntPtr FindMainWindow(int processId) {
    var candidate = IntPtr.Zero;
    EnumWindows((hWnd, _) => {
      uint ownerProcessId;
      GetWindowThreadProcessId(hWnd, out ownerProcessId);
      if (ownerProcessId != (uint)processId || !IsWindow(hWnd)) return true;

      var className = new StringBuilder(256);
      GetClassName(hWnd, className, className.Capacity);
      var title = new StringBuilder(512);
      GetWindowText(hWnd, title, title.Capacity);
      if (className.ToString() == "FLUTTER_RUNNER_WIN32_WINDOW") {
        candidate = hWnd;
        return false;
      }
      if (candidate == IntPtr.Zero && title.Length > 0) candidate = hWnd;
      return true;
    }, IntPtr.Zero);
    return candidate;
  }

  public static bool Restore(IntPtr hWnd) {
    if (hWnd == IntPtr.Zero || !IsWindow(hWnd)) return false;
    ShowWindow(hWnd, 9);
    ShowWindow(hWnd, 5);
    SetForegroundWindow(hWnd);
    return IsWindowVisible(hWnd);
  }
}
'@ -ErrorAction Stop
$windowHandle = [IntPtr]::Zero
foreach ($process in $running) {
  $candidate = [ObsUiProxyWindow]::FindMainWindow($process.Id)
  if ($candidate -eq [IntPtr]::Zero -and [int64]$process.MainWindowHandle -ne 0) { $candidate = $process.MainWindowHandle }
  if ($candidate -ne [IntPtr]::Zero -and [ObsUiProxyWindow]::Restore($candidate)) {
    $windowHandle = $candidate
    break
  }
}
if ($windowHandle -ne [IntPtr]::Zero) {
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
type CodexUsageWindowRecord = { usedPercent: number; windowMinutes: number; resetsAt: number };
type CodexUsageRecord = { windows: CodexUsageWindowRecord[]; sampledAt: number };
type LatencySample = { milliseconds: number | null; sampledAt: number | null };
type NetworkMetricsPayload = {
  adapter: { name: string; localIpv4: string | null; linkSpeed: string | null };
  downloadBytesPerSecond: number | null;
  uploadBytesPerSecond: number | null;
  latency: { target: string; milliseconds: number | null; sampledAt: number | null };
  flClash: { running: boolean; launchConfigured: boolean };
  sampledAt: number;
};
type SystemSensorCategory = "cpu" | "gpu" | "memory" | "motherboard" | "storage" | "system";
type SystemSensorKind = "clock" | "voltage" | "power" | "load" | "temperature";
type SystemSensorSource = "windows" | "hardware-monitor" | "hwinfo" | "nvidia-smi";
type SystemSensorSnapshot = { id: string; label: string; category: SystemSensorCategory; kind: SystemSensorKind; value: number; unit: "MHz" | "V" | "W" | "%" | "°C"; source: SystemSensorSource; sourceLabel: string; role: string | null };
type SystemSensorSources = { hardwareMonitor: "LibreHardwareMonitor" | "OpenHardwareMonitor" | null; hwinfo: boolean; nvidia: boolean };
type DetailedSensorSnapshot = { sensors: SystemSensorSnapshot[]; sources: SystemSensorSources };
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

async function writeLocalModelSettings(settings: LocalModelSettings) {
  await mkdir(LITERATURE_DATABASE_ROOT, { recursive: true });
  const temporaryPath = `${localModelSettingsPath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  await rename(temporaryPath, localModelSettingsPath);
}

async function readLocalModelSettings(): Promise<LocalModelSettings> {
  try {
    const payload = JSON.parse(await readFile(localModelSettingsPath, "utf8"));
    const settings = parseLocalModelSettings(payload);
    if (!settings) throw new Error("本地模型设置格式无效。");
    return settings;
  } catch {
    const settings = normalizeLocalModelSettings(DEFAULT_LOCAL_MODEL_SETTINGS);
    await writeLocalModelSettings(settings).catch(() => undefined);
    return settings;
  }
}

function readHWiNFOPageToken(value: unknown) {
  const pageToken = asNonEmptyString(asRecord(value)?.pageToken);
  return pageToken && pageToken.length <= 128 && /^[a-zA-Z0-9-]+$/.test(pageToken) ? pageToken : null;
}

type HWiNFOStartResult = { status: "started" | "already-running" | "unavailable" };

type HWiNFOProcessSnapshot = { pid: number; processName: string };
type HWiNFOTaskStatus = { status: string; processId: number; hwinfoPid: number; isAdministrator: boolean; supportsStopAll: boolean };

const hwinfoProcessNames = new Set(["hwinfo64.exe", "hwinfo32.exe", "hwinfo.exe"]);

async function readHWiNFOProcesses(): Promise<HWiNFOProcessSnapshot[]> {
  if (process.platform !== "win32") return [];
  try {
    const { stdout } = await execFileAsync("tasklist.exe", ["/FO", "CSV", "/NH"], {
      windowsHide: true,
      timeout: 3_000,
      maxBuffer: 64 * 1024,
    });
    return stdout.split(/\r?\n/g).flatMap((line) => {
      const match = line.trim().match(/^"([^"]+)","(\d+)"/);
      if (!match || !hwinfoProcessNames.has(match[1].toLocaleLowerCase())) return [];
      const pid = Number(match[2]);
      return Number.isInteger(pid) && pid > 0 ? [{ pid, processName: match[1] }] : [];
    });
  } catch {
    return [];
  }
}

async function writeHWiNFOOwner(processSnapshot: HWiNFOProcessSnapshot, startedAt = new Date().toISOString()) {
  try {
    await mkdir(dirname(hwinfoOwnerFile), { recursive: true });
    const temporaryPath = `${hwinfoOwnerFile}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify({
      pid: processSnapshot.pid,
      processName: processSnapshot.processName.replace(/\.exe$/i, ""),
      startedAt,
      ownerProcessId: process.pid,
    })}\n`, "utf8");
    await rename(temporaryPath, hwinfoOwnerFile);
  } catch {
    // HWiNFO remains usable when ownership bookkeeping is unavailable; the
    // all-process close path still makes a best-effort cleanup by PID.
  }
}

async function readHWiNFOTaskStatus(): Promise<HWiNFOTaskStatus | null> {
  try {
    const raw = await readFile(hwinfoTaskStatusFile, "utf8");
    const record = asRecord(JSON.parse(raw.replace(/^\uFEFF/, "")));
    const status = asNonEmptyString(record?.status);
    const processId = asFiniteNumber(record?.processId);
    const hwinfoPid = asFiniteNumber(record?.hwinfoPid);
    const isAdministrator = record?.isAdministrator === true;
    if (!status || processId === null || !Number.isInteger(processId) || processId <= 0 || hwinfoPid === null || !Number.isInteger(hwinfoPid) || hwinfoPid <= 0 || !isAdministrator) return null;
    return { status, processId, hwinfoPid, isAdministrator, supportsStopAll: record?.supportsStopAll === true };
  } catch {
    return null;
  }
}

async function readHWiNFOTaskCapability() {
  try {
    const record = asRecord(JSON.parse(await readFile(hwinfoTaskCapabilityFile, "utf8").then((value) => value.replace(/^\uFEFF/, ""))));
    return record?.supportsStopAll === true;
  } catch {
    return false;
  }
}

async function readHWiNFOProcessParentId(pid: number): Promise<number | null> {
  if (process.platform !== "win32") return null;
  try {
    const { stdout } = await execFileAsync("wmic.exe", ["process", "where", `ProcessId=${pid}`, "get", "ParentProcessId", "/value"], {
      windowsHide: true,
      timeout: 3_000,
      maxBuffer: 16 * 1024,
    });
    const match = stdout.match(/ParentProcessId\s*=\s*(\d+)/i);
    const parentProcessId = match ? Number(match[1]) : NaN;
    return Number.isInteger(parentProcessId) && parentProcessId > 0 ? parentProcessId : null;
  } catch {
    return null;
  }
}

async function adoptManagedHWiNFO(processSnapshot: HWiNFOProcessSnapshot): Promise<HWiNFOOwnerRecord | null> {
  const taskStatus = await readHWiNFOTaskStatus();
  if (!taskStatus || taskStatus.status !== "running" || taskStatus.hwinfoPid !== processSnapshot.pid) return null;
  const parentProcessId = await readHWiNFOProcessParentId(processSnapshot.pid);
  if (parentProcessId !== taskStatus.processId) return null;
  const creationTime = await readHWiNFOProcessCreationTime(processSnapshot.pid);
  if (creationTime === null) return null;
  await writeHWiNFOOwner(processSnapshot, new Date(creationTime).toISOString());
  return readHWiNFOOwner();
}

type HWiNFOOwnerRecord = { pid: number; processName: string; startedAt: string; ownerProcessId?: number };

async function readHWiNFOOwner(): Promise<HWiNFOOwnerRecord | null> {
  try {
    const raw = await readFile(hwinfoOwnerFile, "utf8");
    const record = asRecord(JSON.parse(raw.replace(/^\uFEFF/, "")));
    const pid = asFiniteNumber(record?.pid);
    const processName = asNonEmptyString(record?.processName);
    const startedAt = asNonEmptyString(record?.startedAt);
    if (pid === null || !Number.isInteger(pid) || pid <= 0 || !processName || !startedAt || Number.isNaN(Date.parse(startedAt))) return null;
    const ownerProcessId = asFiniteNumber(record?.ownerProcessId);
    return { pid, processName, startedAt, ...(ownerProcessId !== null && Number.isInteger(ownerProcessId) && ownerProcessId > 0 ? { ownerProcessId } : {}) };
  } catch {
    return null;
  }
}

async function readHWiNFOProcessCreationTime(pid: number): Promise<number | null> {
  if (process.platform !== "win32") return null;
  try {
    const { stdout } = await execFileAsync("wmic.exe", ["process", "where", `ProcessId=${pid}`, "get", "Name,CreationDate,ProcessId", "/format:csv"], {
      windowsHide: true,
      timeout: 3_000,
      maxBuffer: 16 * 1024,
    });
    const creation = stdout.split(/\r?\n/g)
      .map((line) => line.trim())
      .map((line) => line.split(",").map((part) => part.trim()))
      .find((parts) => parts.some((part) => /^\d{14}\.\d{6}[+-]\d{3}$/.test(part)))
      ?.find((part) => /^\d{14}\.\d{6}[+-]\d{3}$/.test(part));
    const match = creation?.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\.\d{6}([+-])(\d{3})$/);
    if (!match) return null;
    const [, year, month, day, hour, minute, second, sign, offset] = match;
    const local = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    const offsetMinutes = Number(offset) * (sign === "+" ? 1 : -1);
    return local - offsetMinutes * 60_000;
  } catch {
    return null;
  }
}

async function removeHWiNFOOwner() {
  await unlink(hwinfoOwnerFile).catch(() => undefined);
}

async function requestHWiNFOStop(pid: number) {
  try {
    await mkdir(dirname(hwinfoStopRequestFile), { recursive: true });
    const temporaryPath = `${hwinfoStopRequestFile}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify({ pid, requestedAt: new Date().toISOString() })}\n`, "utf8");
    await rename(temporaryPath, hwinfoStopRequestFile);
    return true;
  } catch {
    return false;
  }
}

async function requestAllHWiNFOStop() {
  try {
    await mkdir(dirname(hwinfoStopRequestFile), { recursive: true });
    const temporaryPath = `${hwinfoStopRequestFile}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify({ all: true, requestedAt: new Date().toISOString() })}\n`, "utf8");
    await rename(temporaryPath, hwinfoStopRequestFile);
    return true;
  } catch {
    return false;
  }
}

function requestAllHWiNFOStopSync() {
  try {
    mkdirSync(dirname(hwinfoStopRequestFile), { recursive: true });
    writeFileSync(hwinfoStopRequestFile, `${JSON.stringify({ all: true, requestedAt: new Date().toISOString() })}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
}

function runHWiNFOTaskSync() {
  if (process.platform !== "win32") return false;
  try {
    execFileSync("schtasks.exe", ["/Run", "/TN", hwinfoTaskName], {
      windowsHide: true,
      timeout: 10_000,
      maxBuffer: 16 * 1024,
    });
    return true;
  } catch {
    return false;
  }
}

function taskSupportsStopAllSync() {
  try {
    const record = JSON.parse(readFileSync(hwinfoTaskStatusFile, "utf8").replace(/^\uFEFF/, "")) as RecordLike;
    if (record.supportsStopAll === true) return true;
  } catch { }
  try {
    const record = JSON.parse(readFileSync(hwinfoTaskCapabilityFile, "utf8").replace(/^\uFEFF/, "")) as RecordLike;
    return record.supportsStopAll === true;
  } catch {
    return false;
  }
}

// If Vite is terminated before the HTTP server can emit its `close` event,
// leave the elevated task host a request to close every HWiNFO process.
process.once("exit", () => {
  if (!isViteServeProcess) return;
  // Never wake an old task installation from a build/CLI process: its legacy
  // host would interpret the all-process request as a normal launch request.
  if (taskSupportsStopAllSync() && requestAllHWiNFOStopSync()) runHWiNFOTaskSync();
});

async function runHWiNFOTask() {
  try {
    await execFileAsync("schtasks.exe", ["/Run", "/TN", hwinfoTaskName], {
      windowsHide: true,
      timeout: 10_000,
      maxBuffer: 16 * 1024,
    });
    return true;
  } catch {
    return false;
  }
}

async function startOwnedHWiNFO(): Promise<HWiNFOStartResult> {
  if (process.platform !== "win32") return { status: "unavailable" };
  try {
    // HWiNFO requests elevation on this machine. Ask the pre-installed task
    // to launch it so the browser lifecycle can still own and later release
    // the resulting process without starting a visible PowerShell host.
    const existing = await readHWiNFOProcesses();
    if (existing.length > 0) {
      // A reused Vite process can find HWiNFO left by the previous ObsUI
      // session. Re-adopt the task-owned process for accurate start tracking;
      // the close path intentionally stops every HWiNFO instance.
      for (const processSnapshot of existing) {
        if (await adoptManagedHWiNFO(processSnapshot)) break;
      }
      return { status: "already-running" };
    }
    await unlink(hwinfoStopRequestFile).catch(() => undefined);
    const beforeIds = new Set((await readHWiNFOProcesses()).map((item) => item.pid));
    const launchRequested = await runHWiNFOTask();
    if (!launchRequested) return { status: "unavailable" };
    const deadline = Date.now() + 15_000;
    do {
      await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 400));
      const next = await readHWiNFOProcesses();
      const started = next.find((item) => !beforeIds.has(item.pid));
      if (started) {
        await writeHWiNFOOwner(started);
        return { status: "started" };
      }
    } while (Date.now() < deadline);
    return { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

type HWiNFOCloseResult = { status: "closed" | "already-closed" | "not-owned" | "unavailable" };

async function closeOwnedHWiNFO(): Promise<HWiNFOCloseResult> {
  if (process.platform !== "win32") return { status: "unavailable" };
  try {
    let owner = await readHWiNFOOwner();
    if (!owner) {
      // Recover ownership when the prior Vite instance disappeared after
      // starting HWiNFO but before its owner record was persisted/retained.
      // The parent-process check inside adoptManagedHWiNFO keeps this scoped
      // to the pre-registered ObsUI task and away from manual HWiNFO launches.
      for (const processSnapshot of await readHWiNFOProcesses()) {
        owner = await adoptManagedHWiNFO(processSnapshot);
        if (owner) break;
      }
    }
    if (!owner) {
      await removeHWiNFOOwner();
      return { status: "not-owned" };
    }
    const processName = owner.processName.replace(/\.exe$/i, "").toLocaleLowerCase();
    const current = (await readHWiNFOProcesses()).find((candidate) => candidate.pid === owner.pid && candidate.processName.replace(/\.exe$/i, "").toLocaleLowerCase() === processName);
    if (!current) {
      await removeHWiNFOOwner();
      return { status: "already-closed" };
    }
    const creationTime = await readHWiNFOProcessCreationTime(owner.pid);
    const ownerStart = Date.parse(owner.startedAt);
    // If the creation-time probe is unavailable or the PID was reused, fail
    // safe and leave the process running. This keeps automatic page teardown
    // from touching an externally started HWiNFO instance.
    if (creationTime === null || !Number.isFinite(ownerStart) || Math.abs(creationTime - ownerStart) > 5_000) return { status: "not-owned" };
    // The task owns an elevated HWiNFO process, so a normal Vite process may
    // not have permission to taskkill it. The task host already watches this
    // request file and performs the stop in its elevated context.
    const stopRequested = await requestHWiNFOStop(owner.pid);
    const deadline = Date.now() + (stopRequested ? 8_000 : 0);
    while (Date.now() < deadline) {
      if (!(await readHWiNFOProcesses()).some((candidate) => candidate.pid === owner.pid)) {
        await unlink(hwinfoStopRequestFile).catch(() => undefined);
        await removeHWiNFOOwner();
        return { status: "closed" };
      }
      await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 300));
    }
    // If the elevated task host is unavailable, retain the previous direct
    // kill attempt for processes that were started without elevation.
    try {
      await execFileAsync("taskkill.exe", ["/PID", String(owner.pid), "/T", "/F"], {
        windowsHide: true,
        timeout: 20_000,
        maxBuffer: 16 * 1024,
      });
    } catch {
      return { status: "unavailable" };
    }
    const killDeadline = Date.now() + 8_000;
    while (Date.now() < killDeadline) {
      if (!(await readHWiNFOProcesses()).some((candidate) => candidate.pid === owner.pid)) {
        await unlink(hwinfoStopRequestFile).catch(() => undefined);
        await removeHWiNFOOwner();
        return { status: "closed" };
      }
      await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 300));
    }
    return { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

async function waitForAllHWiNFOClosed(deadline: number) {
  do {
    if ((await readHWiNFOProcesses()).length === 0) return true;
    await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 300));
  } while (Date.now() < deadline);
  return (await readHWiNFOProcesses()).length === 0;
}

async function taskKillHWiNFOProcesses(processes: HWiNFOProcessSnapshot[]) {
  await Promise.all(processes.map(async (processSnapshot) => {
    try {
      await execFileAsync("taskkill.exe", ["/PID", String(processSnapshot.pid), "/T", "/F"], {
        windowsHide: true,
        timeout: 20_000,
        maxBuffer: 16 * 1024,
      });
    } catch {
      // Elevated HWiNFO instances may reject a medium-integrity taskkill. The
      // pre-registered elevated task below is the authoritative fallback.
    }
  }));
}

async function closeAllHWiNFO(): Promise<HWiNFOCloseResult> {
  if (process.platform !== "win32") return { status: "unavailable" };
  try {
    let current = await readHWiNFOProcesses();
    if (current.length === 0) {
      await unlink(hwinfoStopRequestFile).catch(() => undefined);
      await removeHWiNFOOwner();
      return { status: "already-closed" };
    }

    // First try the normal process exit path. This also handles HWiNFO that
    // was started manually without requiring the elevated task.
    await taskKillHWiNFOProcesses(current);
    if (await waitForAllHWiNFOClosed(Date.now() + 1_500)) {
      await unlink(hwinfoStopRequestFile).catch(() => undefined);
      await removeHWiNFOOwner();
      return { status: "closed" };
    }

    const taskStatus = await readHWiNFOTaskStatus();
    const taskSupportsStopAll = taskStatus?.supportsStopAll === true || await readHWiNFOTaskCapability();
    if (taskSupportsStopAll) {
      // Write before waking a stopped task. The updated task host consumes the
      // request before launching anything, so Vite shutdown cannot create a
      // fresh HWiNFO instance while trying to close the old one.
      const stopRequested = await requestAllHWiNFOStop();
      if (stopRequested && taskStatus?.status !== "running") await runHWiNFOTask();
    } else if (taskStatus?.status === "running") {
      // Compatibility with an older installed task host: it understands the
      // legacy one-PID request, but not the all-process request yet.
      for (const processSnapshot of current) {
        await requestHWiNFOStop(processSnapshot.pid);
        await waitForAllHWiNFOClosed(Date.now() + 2_000);
        current = await readHWiNFOProcesses();
        if (current.length === 0) break;
      }
    }

    if (await waitForAllHWiNFOClosed(Date.now() + 8_000)) {
      await unlink(hwinfoStopRequestFile).catch(() => undefined);
      await removeHWiNFOOwner();
      return { status: "closed" };
    }

    // The task host may have completed just as the first poll observed the
    // process. Give direct taskkill one final, PID-scoped attempt before
    // reporting that an external privilege boundary remains.
    current = await readHWiNFOProcesses();
    await taskKillHWiNFOProcesses(current);
    if (await waitForAllHWiNFOClosed(Date.now() + 2_000)) {
      await unlink(hwinfoStopRequestFile).catch(() => undefined);
      await removeHWiNFOOwner();
      return { status: "closed" };
    }
    return { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

const sensorCategories: SystemSensorCategory[] = ["cpu", "gpu", "memory", "motherboard", "storage", "system"];
const sensorKinds: SystemSensorKind[] = ["clock", "voltage", "power", "load", "temperature"];
const sensorSources: SystemSensorSource[] = ["windows", "hardware-monitor", "hwinfo", "nvidia-smi"];
const sensorSourcePriority: Record<SystemSensorSource, number> = { hwinfo: 4, "hardware-monitor": 3, "nvidia-smi": 2, windows: 1 };
const emptyDetailedSensorSnapshot = (): DetailedSensorSnapshot => ({ sensors: [], sources: { hardwareMonitor: null, hwinfo: false, nvidia: false } });
let sensorCache: { sampledAt: number; data: DetailedSensorSnapshot } = { sampledAt: 0, data: emptyDetailedSensorSnapshot() };
let sensorPending: Promise<DetailedSensorSnapshot> | null = null;
type DeviceProfileSnapshot = RecordLike | null;
type SystemMetricsSnapshot = { metrics: RecordLike; detailed: DetailedSensorSnapshot; device: DeviceProfileSnapshot };
let systemMetricsCache: { sampledAt: number; data: SystemMetricsSnapshot } | null = null;
let systemMetricsPending: Promise<SystemMetricsSnapshot> | null = null;
let deviceProfileCache: { sampledAt: number; data: DeviceProfileSnapshot } = { sampledAt: 0, data: null };
let deviceProfilePending: Promise<DeviceProfileSnapshot> | null = null;

function isSensorUnit(kind: SystemSensorKind, value: unknown): value is SystemSensorSnapshot["unit"] {
  return kind === "clock" && value === "MHz" || kind === "voltage" && value === "V" || kind === "power" && value === "W" || kind === "load" && value === "%" || kind === "temperature" && value === "°C";
}

function readSensorValue(value: unknown, kind: SystemSensorKind) {
  const numeric = asFiniteNumber(value);
  const maximum = kind === "temperature" ? 150 : kind === "voltage" ? 20 : kind === "load" ? 100 : kind === "clock" ? 50_000 : 5_000;
  const precision = kind === "voltage" ? 100 : 10;
  return numeric !== null && numeric >= 0 && numeric <= maximum ? Math.round(numeric * precision) / precision : null;
}

function readSystemSensor(value: unknown): SystemSensorSnapshot | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = asNonEmptyString(record.id);
  const label = asNonEmptyString(record.label);
  const category = typeof record.category === "string" && sensorCategories.includes(record.category as SystemSensorCategory) ? record.category as SystemSensorCategory : null;
  const kind = typeof record.kind === "string" && sensorKinds.includes(record.kind as SystemSensorKind) ? record.kind as SystemSensorKind : null;
  const source = typeof record.source === "string" && sensorSources.includes(record.source as SystemSensorSource) ? record.source as SystemSensorSource : null;
  const sourceLabel = asNonEmptyString(record.sourceLabel);
  const role = record.role === null || record.role === undefined ? null : asNonEmptyString(record.role);
  if (!id || !label || !category || !kind || !source || !sourceLabel || role === undefined || !isSensorUnit(kind, record.unit)) return null;
  const sensorValue = readSensorValue(record.value, kind);
  return sensorValue === null ? null : { id, label, category, kind, value: sensorValue, unit: record.unit, source, sourceLabel, role };
}

function parseDetailedSensorSnapshot(payload: unknown): DetailedSensorSnapshot | null {
  const record = asRecord(payload);
  if (!record || !Array.isArray(record.sensors)) return null;
  const hardwareMonitor = record.hardwareMonitor === "LibreHardwareMonitor" || record.hardwareMonitor === "OpenHardwareMonitor" ? record.hardwareMonitor : record.hardwareMonitor === null ? null : undefined;
  if (hardwareMonitor === undefined || typeof record.hwinfo !== "boolean" || typeof record.nvidia !== "boolean") return null;
  const sensors = record.sensors.map(readSystemSensor);
  return sensors.some((sensor) => sensor === null) || new Set(sensors.map((sensor) => sensor!.id)).size !== sensors.length ? null : { sensors: sensors as SystemSensorSnapshot[], sources: { hardwareMonitor, hwinfo: record.hwinfo, nvidia: record.nvidia } };
}

function createWindowsSensor(id: string, label: string, category: SystemSensorCategory, role: string, value: unknown, kind: SystemSensorKind = "load"): SystemSensorSnapshot | null {
  const sensorValue = readSensorValue(value, kind);
  if (sensorValue === null) return null;
  const unit = kind === "clock" ? "MHz" : kind === "voltage" ? "V" : kind === "power" ? "W" : kind === "temperature" ? "°C" : "%";
  return { id, label, category, role, value: sensorValue, kind, unit, source: "windows", sourceLabel: "Windows" };
}

function dedupeSensors(sensors: SystemSensorSnapshot[]) {
  const selected = new Map<string, SystemSensorSnapshot>();
  for (const sensor of sensors) {
    const key = sensor.role ? `role:${sensor.role}` : `id:${sensor.id}`;
    const previous = selected.get(key);
    if (!previous || sensorSourcePriority[sensor.source] > sensorSourcePriority[previous.source]) selected.set(key, sensor);
  }
  return [...selected.values()];
}

function temperaturesFromSensors(sensors: SystemSensorSnapshot[]) {
  const temperature = (role: string) => sensors.find((sensor) => sensor.role === role && sensor.kind === "temperature")?.value ?? null;
  return { cpu: temperature("cpu-temperature"), gpu: temperature("gpu-temperature"), memory: temperature("memory-temperature"), disk: temperature("storage-temperature") };
}

function baselineSensors(metrics: RecordLike): SystemSensorSnapshot[] {
  return [
    createWindowsSensor("windows:cpu-load", "CPU 占用", "cpu", "cpu-load", metrics.cpu),
    createWindowsSensor("windows:gpu-load", "GPU 占用", "gpu", "gpu-load", metrics.gpu),
    createWindowsSensor("windows:memory-load", "内存占用", "memory", "memory-load", metrics.memory),
    createWindowsSensor("windows:disk-load", "硬盘活动", "storage", "disk-load", metrics.disk),
    createWindowsSensor("windows:cpu-clock", "CPU 频率", "cpu", "cpu-clock", metrics.cpuClock, "clock"),
  ].filter((sensor): sensor is SystemSensorSnapshot => sensor !== null);
}

async function readDetailedSensors(): Promise<DetailedSensorSnapshot> {
  try {
    const { stdout } = await execFileAsync(telemetryPowerShell, powerShellCommandArgs(sensorScript), { windowsHide: true, timeout: 8_000, maxBuffer: 512 * 1024 });
    return parseDetailedSensorSnapshot(JSON.parse(stdout.trim())) ?? emptyDetailedSensorSnapshot();
  } catch {
    return emptyDetailedSensorSnapshot();
  }
}

async function readCachedDetailedSensors() {
  if (Date.now() - sensorCache.sampledAt < systemSensorIntervalMs) return sensorCache.data;
  if (!sensorPending) {
    sensorPending = readDetailedSensors().then((data) => {
      sensorCache = { sampledAt: Date.now(), data };
      return data;
    }).finally(() => { sensorPending = null; });
  }
  return sensorPending;
}

async function readDeviceProfile(): Promise<DeviceProfileSnapshot> {
  try {
    const { stdout } = await execFileAsync(telemetryPowerShell, powerShellCommandArgs(deviceProfileScript), { windowsHide: true, timeout: 12_000, maxBuffer: 256 * 1024 });
    return asRecord(stdout.trim() ? JSON.parse(stdout.trim()) : null);
  } catch {
    return null;
  }
}

async function readCachedDeviceProfile() {
  if (Date.now() - deviceProfileCache.sampledAt < deviceProfileIntervalMs) return deviceProfileCache.data;
  if (!deviceProfilePending) {
    deviceProfilePending = readDeviceProfile().then((data) => {
      deviceProfileCache = { sampledAt: Date.now(), data };
      return data;
    }).finally(() => { deviceProfilePending = null; });
  }
  return deviceProfilePending;
}

async function readCachedSystemMetrics(): Promise<SystemMetricsSnapshot> {
  if (systemMetricsCache && Date.now() - systemMetricsCache.sampledAt < systemSensorIntervalMs) return systemMetricsCache.data;
  if (!systemMetricsPending) {
    systemMetricsPending = Promise.all([
      execFileAsync(telemetryPowerShell, powerShellCommandArgs(metricsScript), { windowsHide: true, timeout: 8_000, maxBuffer: 64 * 1024 }),
      readCachedDetailedSensors(),
      readCachedDeviceProfile(),
    ]).then(([raw, detailed, device]) => {
      const metrics = asRecord(raw.stdout.trim() ? JSON.parse(raw.stdout.trim()) : null);
      if (!metrics) throw new Error("Invalid Windows metrics response.");
      const data = { metrics, detailed, device };
      systemMetricsCache = { sampledAt: Date.now(), data };
      return data;
    }).finally(() => { systemMetricsPending = null; });
  }
  return systemMetricsPending;
}

async function sendSystemMetrics(response: ServerResponse) {
  try {
    const { metrics, detailed, device } = await readCachedSystemMetrics();
    const sensors = dedupeSensors([...detailed.sensors, ...baselineSensors(metrics)]);
    sendJson(response, 200, { ...metrics, temperatures: temperaturesFromSensors(sensors), sensors, sources: detailed.sources, device });
  } catch {
    sendJson(response, 503, { message: "Windows performance counters are unavailable." });
  }
}

function usageFromRateLimits(rateLimits: RecordLike, sampledAt: number) {
  const limitId = asNonEmptyString(rateLimits.limit_id) ?? asNonEmptyString(rateLimits.limitId);
  if (limitId && limitId !== "codex") return null;
  const windows = ["primary", "secondary"]
    .map((name) => asRecord(rateLimits[name]))
    .map((window) => {
      if (!window) return null;
      const usedPercent = asFiniteNumber(window.used_percent) ?? asFiniteNumber(window.usedPercent);
      const windowMinutes = asFiniteNumber(window.window_minutes) ?? asFiniteNumber(window.windowDurationMins);
      const resetsAt = asEpochMilliseconds(window.resets_at ?? window.resetsAt);
      if (usedPercent === null || windowMinutes === null || resetsAt === null || windowMinutes <= 0) return null;
      return { usedPercent: Math.round(Math.min(100, Math.max(0, usedPercent))), windowMinutes: Math.round(windowMinutes), resetsAt };
    })
    .filter((window): window is CodexUsageWindowRecord => window !== null);
  return windows.length ? { windows, sampledAt } : null;
}

let codexCliExecutablePromise: Promise<string> | null = null;

async function resolveCodexCliExecutable() {
  if (configuredCodexCliExecutable) return configuredCodexCliExecutable;
  if (!codexCliExecutablePromise) {
    codexCliExecutablePromise = (async () => {
      try {
        const entries = await readdir(codexInstallRoot, { withFileTypes: true });
        const candidates = (await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
          const path = join(codexInstallRoot, entry.name, "codex.exe");
          try {
            const metadata = await stat(path);
            return metadata.isFile() ? { path, modifiedAt: metadata.mtimeMs } : null;
          } catch {
            return null;
          }
        }))).filter((candidate): candidate is { path: string; modifiedAt: number } => candidate !== null);
        candidates.sort((left, right) => right.modifiedAt - left.modifiedAt);
        return candidates[0]?.path ?? "codex.exe";
      } catch {
        return "codex.exe";
      }
    })();
  }
  return codexCliExecutablePromise;
}

async function readLiveCodexUsage(): Promise<CodexUsageRecord | null> {
  const codexCliExecutable = await resolveCodexCliExecutable();
  return new Promise((resolve, reject) => {
    const child = spawn(codexCliExecutable, ["app-server", "--listen", "stdio://"], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "ignore"],
    });
    let buffer = "";
    let settled = false;
    let initialized = false;
    const timeout = setTimeout(() => finish(new Error("Codex app-server timed out.")), 10_000);
    const finish = (error: Error | null, usage: CodexUsageRecord | null = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.kill();
      if (error) reject(error);
      else resolve(usage);
    };
    child.on("error", (error) => finish(error));
    child.on("close", () => {
      if (!settled) finish(new Error("Codex app-server closed before returning rate limits."));
    });
    child.stdout.on("data", (chunk: Buffer | string) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let message: RecordLike | null = null;
        try { message = asRecord(JSON.parse(line)); } catch { continue; }
        if (!message || message.id !== 1 || initialized) {
          if (!message || message.id !== 2) continue;
          const result = asRecord(message.result);
          const byLimitId = asRecord(result?.rateLimitsByLimitId);
          const usage = [asRecord(byLimitId?.codex), asRecord(result?.rateLimits)]
            .map((rateLimits) => rateLimits ? usageFromRateLimits(rateLimits, Date.now()) : null)
            .find((candidate): candidate is CodexUsageRecord => candidate !== null) ?? null;
          return usage ? finish(null, usage) : finish(new Error("Codex rate-limit response is malformed."));
        }
        initialized = true;
        try {
          child.stdin.write(`${JSON.stringify({ method: "initialized", params: {} })}\n`);
          child.stdin.write(`${JSON.stringify({ id: 2, method: "account/rateLimits/read", params: null })}\n`);
        } catch (error) {
          finish(error instanceof Error ? error : new Error("Codex app-server request failed."));
        }
      }
    });
    try {
      child.stdin.write(`${JSON.stringify({ id: 1, method: "initialize", params: { clientInfo: { name: "obsui", title: "ObsUI", version: "0.1.0" } } })}\n`);
    } catch (error) {
      finish(error instanceof Error ? error : new Error("Codex app-server initialization failed."));
    }
  });
}

async function listCodexSessionFiles(directory: string): Promise<{ path: string; modifiedAt: number }[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
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
  try {
    const live = await readLiveCodexUsage();
    if (live) return live;
  } catch {
    // Fall back to the newest local Codex session record when the app-server is unavailable.
  }
  const sessionRoots = [join(codexHome, "sessions"), join(codexHome, "archived_sessions")];
  const files = (await Promise.all(sessionRoots.map((root) => listCodexSessionFiles(root)))).flat();
  const usages = [];
  for (const file of files.sort((left, right) => right.modifiedAt - left.modifiedAt).slice(0, maxCodexSessionFiles)) {
    try {
      const usage = await usageFromSessionFile(file.path, file.modifiedAt);
      if (usage) usages.push(usage);
    } catch {
      // A session can be locked or removed while Codex is running. Try the next recent file.
    }
  }
  const latest = usages.sort((left, right) => right.sampledAt - left.sampledAt)[0];
  if (latest) return latest;
  throw new Error("No recent Codex usage record is available.");
}

async function sendCodexUsage(response: ServerResponse) {
  try {
    sendJson(response, 200, await readCodexUsage());
  } catch {
    sendJson(response, 503, { message: "Local Codex usage data is unavailable." });
  }
}

async function fetchWeatherJson(config: NetworkConfig, endpoint: string): Promise<unknown> {
  const readResponse = async (response: { ok: boolean; json: () => Promise<unknown> }) => {
    if (!response.ok) throw new Error("Weather response is unavailable.");
    return response.json();
  };

  if (config.proxyUrl) {
    const proxy = new ProxyAgent(config.proxyUrl);
    try {
      return await readResponse(await fetchWithProxy(endpoint, { dispatcher: proxy, signal: AbortSignal.timeout(8_000) }));
    } catch {
      // A configured loopback proxy may be stopped. Try the user's normal network path before giving up.
    } finally {
      await proxy.close().catch(() => undefined);
    }
  }

  return readResponse(await fetch(endpoint, { signal: AbortSignal.timeout(8_000) }));
}

async function fetchWeatherCoordinates(config: NetworkConfig): Promise<WeatherCoordinates> {
  const coordinates = parseWeatherCoordinates(await fetchWeatherJson(config, weatherLocationEndpoint));
  if (!coordinates) throw new Error("Network weather location is malformed.");
  return coordinates;
}

async function fetchWeatherForecast(config: NetworkConfig, latitude: number, longitude: number) {
  const query = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    current: "temperature_2m,weather_code,is_day",
    daily: "temperature_2m_max,temperature_2m_min",
    forecast_days: "1",
    timezone: "auto",
    temperature_unit: "celsius",
  });
  const endpoint = `${weatherEndpoint}?${query.toString()}`;
  const snapshot = parseOpenMeteoWeather(await fetchWeatherJson(config, endpoint));
  if (!snapshot) throw new Error("Weather response is malformed.");
  return snapshot;
}

async function readCodexAutomations(): Promise<CodexAutomationsState> {
  try {
    const entries = await readdir(codexAutomationsRoot, { withFileTypes: true });
    const directories = entries.filter((entry) => entry.isDirectory()).slice(0, maxCodexAutomations);
    const data = (await Promise.all(directories.map(async (entry) => {
      const filePath = join(codexAutomationsRoot, entry.name, "automation.toml");
      try {
        const metadata = await lstat(filePath);
        if (!metadata.isFile()) return null;
        const content = await readFile(filePath, "utf8");
        return parseAutomationMetadata(content, entry.name, entry.name, metadata.mtimeMs);
      } catch {
        return null;
      }
    }))).filter((item): item is NonNullable<typeof item> => item !== null).sort((left, right) => right.updatedAt - left.updatedAt);
    return { status: "ready", checkedAt: Date.now(), data };
  } catch (error) {
    const code = asRecord(error)?.code;
    if (code === "ENOENT" || code === "ENOTDIR") return { status: "ready", checkedAt: Date.now(), data: [] };
    throw error;
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
  const encodedName = decodeUtf8Base64(record.adapterNameUtf8Base64);
  const plainName = asNonEmptyString(record.adapterName);
  const name = encodedName ?? (plainName && !plainName.includes("\uFFFD") ? plainName : null);
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
    const { stdout } = await execFileAsync(telemetryPowerShell, powerShellCommandArgs(latencyScript), {
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
  return Boolean(config.proxyUrl);
}

function readEgressProviderPayload(payload: unknown): EgressCache["data"] {
  const record = asRecord(payload);
  if (!record) return null;
  const ip = asNonEmptyString(record.ip);
  const optionalString = (name: string) => record[name] === undefined || record[name] === null ? null : asNonEmptyString(record[name]);
  const country = optionalString("country");
  const countryCode = optionalString("country_code");
  const asn = optionalString("asn");
  const asName = optionalString("as_name");
  if (!ip || isIP(ip) === 0 || country === null && record.country !== undefined && record.country !== null ||
    countryCode === null && record.country_code !== undefined && record.country_code !== null ||
    asn === null && record.asn !== undefined && record.asn !== null || asName === null && record.as_name !== undefined && record.as_name !== null) return null;
  return { ip, country, countryCode, asn, asName };
}

async function refreshEgressCache(config: NetworkConfig): Promise<EgressCache> {
  if (!isEgressConfigured(config)) return { status: "unconfigured", checkedAt: null, data: null };
  const proxy = new ProxyAgent(config.proxyUrl!);
  try {
    const endpoint = config.ipInfoToken ? ipInfoEndpoint : ipifyEndpoint;
    const response = await fetchWithProxy(endpoint, {
      dispatcher: proxy,
      ...(config.ipInfoToken ? { headers: { authorization: `Bearer ${config.ipInfoToken}` } } : {}),
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) throw new Error("Egress IP response is unavailable.");
    const data = readEgressProviderPayload(await response.json());
    if (!data) throw new Error("Egress IP response is malformed.");
    return { status: "ready", checkedAt: Date.now(), data };
  } catch {
    return { status: "unavailable", checkedAt: null, data: null };
  } finally {
    await proxy.close().catch(() => undefined);
  }
}

async function readLocalModels(): Promise<LocalModelState> {
  const settings = await readLocalModelSettings();
  const base = {
    provider: "ollama" as const,
    endpoint: ollamaEndpoint,
    modelRoot: ollamaModelRoot,
    selectedModel: ollamaSelectedModel,
    settings,
    configured: (process.env.OLLAMA_MODELS ?? "").trim().replace(/[\\/]+$/, "").toLocaleLowerCase() === ollamaModelRoot.toLocaleLowerCase(),
  };
  const busy = await readLocalModelBusy();
  try {
    const response = await fetch(ollamaModelsEndpoint, { cache: "no-store", signal: AbortSignal.timeout(2_500) });
    if (!response.ok) throw new Error("Ollama model list is unavailable.");
    const payload = asRecord(await response.json());
    if (!Array.isArray(payload?.models)) throw new Error("Ollama model list is malformed.");
    const models = payload.models.map((candidate) => {
      const model = asRecord(candidate);
      const name = asNonEmptyString(model?.name);
      const size = asFiniteNumber(model?.size);
      const modifiedAt = asEpochMilliseconds(model?.modified_at);
      return name ? { name, size, modifiedAt } : null;
    }).filter((model): model is { name: string; size: number | null; modifiedAt: number | null } => model !== null && model.name !== "qwen3.5:9b");
    const state = parseLocalModelState({ status: "ready", checkedAt: Date.now(), models, ...base, busy, download: { status: "unknown", modelName: null, jobId: null, output: null } });
    if (!state) throw new Error("Local model state is malformed.");
    return state;
  } catch {
    return { status: "unavailable", checkedAt: null, models: [], ...base, busy, download: { status: "unknown", modelName: null, jobId: null, output: null } };
  }
}

const updateLocalModelSettings = async (request: IncomingMessage, response: ServerResponse) => {
  if (!hasSameOrigin(request)) return sendJson(response, 403, { message: "本机来源校验失败。" });
  try {
    const payload = asRecord(await readJsonBody(request));
    const settings = parseLocalModelSettings(payload?.settings ?? payload);
    if (!settings) return sendJson(response, 400, { message: "本地模型设置无效。" });
    await writeLocalModelSettings(settings);
    return sendJson(response, 200, await readLocalModels());
  } catch {
    return sendJson(response, 503, { message: "本地模型设置无法保存。" });
  }
};

const ollamaEnvironment = () => ({
  ...process.env,
  OLLAMA_MODELS: ollamaModelRoot,
  OLLAMA_CONTEXT_LENGTH: "65536",
  OLLAMA_MAX_LOADED_MODELS: "1",
  OLLAMA_NUM_PARALLEL: "1",
});

async function isOllamaReady() {
  try {
    const result = await fetch(ollamaVersionEndpoint, { cache: "no-store", signal: AbortSignal.timeout(1_500) });
    return result.ok;
  } catch {
    return false;
  }
}

async function isOllamaProcessRunning() {
  if (process.platform !== "win32") return false;
  try {
    const { stdout } = await execFileAsync("tasklist.exe", ["/FI", "IMAGENAME eq ollama.exe", "/FO", "CSV", "/NH"], {
      windowsHide: true,
      timeout: 2_000,
      maxBuffer: 16 * 1024,
    });
    return stdout.toLocaleLowerCase().includes('"ollama.exe"');
  } catch {
    return false;
  }
}

async function waitForOllamaAvailability(expected: boolean, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  do {
    if ((await isOllamaReady()) === expected) return true;
    await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 250));
  } while (Date.now() < deadline);
  return (await isOllamaReady()) === expected;
}

let ollamaStartPromise: Promise<void> | null = null;

async function startOllamaService() {
  if (await isOllamaReady()) return;
  if (!ollamaStartPromise) {
    ollamaStartPromise = (async () => {
      // The workbench startup plugin and the reader can request the same
      // service at nearly the same time after login. Reuse an existing Ollama
      // process while it is coming up instead of spawning a second console
      // host for the first translation.
      if (await isOllamaProcessRunning()) {
        if (await waitForOllamaAvailability(true, 12_000)) return;
        throw new Error("检测到 Ollama 正在启动但服务尚未就绪，请稍后重试。");
      }
      let launchError: Error | null = null;
      try {
        const child = spawn(ollamaExecutable, ["serve"], {
          // Keep Ollama and its llama-server child in the hidden Vite process
          // group. A detached group can otherwise surface Windows Terminal.
          detached: false,
          windowsHide: true,
          stdio: "ignore",
          env: ollamaEnvironment(),
        });
        child.once("error", (error) => { launchError = error; });
        child.unref();
      } catch (error) {
        launchError = error instanceof Error ? error : new Error("Ollama 启动失败。");
      }
      if (await waitForOllamaAvailability(true, 12_000)) return;
      throw launchError ?? new Error("Ollama 启动超时。");
    })().finally(() => { ollamaStartPromise = null; });
  }
  return ollamaStartPromise;
}

async function stopOllamaService() {
  if (process.platform !== "win32") throw new Error("当前系统不支持由 ObsUI 关闭 Ollama 服务。");
  const images = ["ollama.exe", "ollama_llama_server.exe"];
  for (const image of images) {
    await execFileAsync("taskkill.exe", ["/F", "/T", "/IM", image], {
      windowsHide: true,
      timeout: 5_000,
      maxBuffer: 32 * 1024,
    }).catch(() => undefined);
  }
  if (!(await waitForOllamaAvailability(false, 5_000))) throw new Error("Ollama 仍在运行，关闭失败。");
}

async function startInstalledLocalModel(modelName: string) {
  await startOllamaService();
  const result = await fetch(`${ollamaEndpoint}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: modelName, prompt: "", stream: false, think: false, keep_alive: -1, options: { num_predict: 1 } }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!result.ok) {
    const payload = asRecord(await result.json().catch(() => null));
    throw new Error(asNonEmptyString(payload?.error) ?? `模型 ${modelName} 启动失败（HTTP ${result.status}）。`);
  }
  await result.json().catch(() => undefined);
}

async function hasExternalOllamaClient() {
  if (process.platform !== "win32") return true;
  try {
    const { stdout } = await execFileAsync("netstat.exe", ["-ano", "-p", "tcp"], {
      windowsHide: true,
      timeout: 2_500,
      maxBuffer: 128 * 1024,
    });
    return stdout.split(/\r?\n/g).some((line) => {
      const fields = line.trim().split(/\s+/g);
      if (fields.length < 5 || fields[0]?.toLocaleUpperCase() !== "TCP") return false;
      const remotePort = fields[2]?.match(/:(\d+)$/)?.[1];
      const owningPid = Number(fields[4]);
      return fields[3]?.toLocaleUpperCase() === "ESTABLISHED" && remotePort === "11434" && Number.isInteger(owningPid) && owningPid > 0 && owningPid !== process.pid;
    });
  } catch {
    // Fail closed: an unavailable connection probe must not interrupt another client.
    return true;
  }
}

async function stopInstalledLocalModel(modelName: string, protectExternalConsumers = false) {
  if (protectExternalConsumers && await hasExternalOllamaClient()) {
    throw new Error("检测到其他本地模型客户端正在使用 Ollama，已跳过自动卸载。");
  }
  try {
    await execFileAsync(ollamaExecutable, ["stop", modelName], {
      windowsHide: true,
      timeout: 10_000,
      maxBuffer: 32 * 1024,
      env: ollamaEnvironment(),
    });
  } catch {
    throw new Error(`模型 ${modelName} 关闭失败。`);
  }
}

const controlLocalModel = async (request: IncomingMessage, response: ServerResponse) => {
  if (!hasSameOrigin(request)) return sendJson(response, 403, { message: "本机来源校验失败。" });
  try {
    const payload = asRecord(await readJsonBody(request));
    const action = asNonEmptyString(payload?.action);
    if (!action || !["start-service", "stop-service", "start-model", "stop-model"].includes(action)) {
      return sendJson(response, 400, { ok: false, message: "本地模型操作无效。" });
    }
    if (action === "start-service") {
      await startOllamaService();
      invalidateOllamaProbe();
      return sendJson(response, 200, { ok: true, message: "Ollama 已启动。", state: await readLocalModels() });
    }
    if (action === "stop-service") {
      await stopOllamaService();
      invalidateOllamaProbe();
      return sendJson(response, 200, { ok: true, message: "Ollama 已关闭。", state: await readLocalModels() });
    }

    const modelName = asNonEmptyString(payload?.model);
    if (!modelName || modelName.length > 128 || !/^[a-z0-9][a-z0-9._:/@+-]*$/i.test(modelName)) {
      return sendJson(response, 400, { ok: false, message: "模型名称无效。" });
    }
    if (action === "start-model") await startOllamaService();
    const current = await readLocalModels();
    if (current.status !== "ready") return sendJson(response, 503, { ok: false, message: "Ollama 未连接，无法操作模型。" });
    if (!current.models.some((model) => model.name === modelName)) return sendJson(response, 404, { ok: false, message: `未找到本机模型 ${modelName}。` });
    if (action === "start-model") {
      await startInstalledLocalModel(modelName);
      invalidateOllamaProbe();
      return sendJson(response, 200, { ok: true, message: `模型 ${modelName} 已启动。`, state: await readLocalModels() });
    }
    await stopInstalledLocalModel(modelName, payload?.protectExternalConsumers === true);
    invalidateOllamaProbe();
    return sendJson(response, 200, { ok: true, message: `模型 ${modelName} 已关闭。`, state: await readLocalModels() });
  } catch (error) {
    return sendJson(response, 503, { ok: false, message: error instanceof Error ? error.message : "本地模型操作失败。" });
  }
};

async function readLocalModelBusy(): Promise<LocalModelState["busy"]> {
  try {
    const { stdout } = await execFileAsync(ollamaExecutable, ["ps"], {
      windowsHide: true,
      timeout: 2_500,
      maxBuffer: 32 * 1024,
      env: { ...process.env, OLLAMA_MODELS: ollamaModelRoot },
    });
    const runningModels = stdout.split(/\r?\n/g)
      .map((line) => line.trim())
      .filter((line) => line && !/^name\s+id\s+/i.test(line) && !/^-{3,}/.test(line))
      .map((line) => line.split(/\s+/g)[0])
      .filter((name): name is string => Boolean(name));
    return { status: runningModels.length ? "busy" : "idle", runningModels };
  } catch {
    return { status: "unknown", runningModels: [] };
  }
}

function localMetricsPlugin(config: NetworkConfig): Plugin {
  let previousCounter: NetworkCounterSample | null = null;
  let latency: LatencySample = { milliseconds: null, sampledAt: null };
  let latencyRequestedAt = 0;
  let latencyPending = false;
  let egressCache: EgressCache = isEgressConfigured(config) ? { status: "idle", checkedAt: null, data: null } : { status: "unconfigured", checkedAt: null, data: null };
  let egressRefreshPending: Promise<EgressCache> | null = null;
  let weatherCache: { key: string; expiresAt: number; state: WeatherApiState } | null = null;
  let weatherLocationCache: { expiresAt: number; coordinates: WeatherCoordinates } | null = null;
  let weatherLocationPending: Promise<WeatherCoordinates> | null = null;
  let hwinfoClosePending: Promise<HWiNFOCloseResult> | null = null;
  let hwinfoStartPending: Promise<HWiNFOStartResult> | null = null;
  let hwinfoShutdownStarted = false;
  const hwinfoPageTokens = new Map<string, string>();
  let hwinfoCloseTimer: ReturnType<typeof setTimeout> | null = null;
  let hwinfoRetryTimer: ReturnType<typeof setTimeout> | null = null;
  let networkMetricsCache: { sampledAt: number; data: NetworkMetricsPayload } | null = null;
  let networkMetricsPending: Promise<NetworkMetricsPayload> | null = null;

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

  const readCachedNetworkMetrics = async (): Promise<NetworkMetricsPayload> => {
    if (networkMetricsCache && Date.now() - networkMetricsCache.sampledAt < systemSensorIntervalMs) return networkMetricsCache.data;
    if (!networkMetricsPending) {
      networkMetricsPending = (async () => {
        const { stdout } = await execFileAsync(telemetryPowerShell, powerShellCommandArgs(networkMetricsScript), {
          windowsHide: true,
          timeout: 8000,
          maxBuffer: 64 * 1024,
        });
        const snapshot = parseNetworkCounter(JSON.parse(stdout.trim()));
        if (!snapshot) throw new Error("Network metric response is malformed.");
        const traffic = calculateTrafficRates(previousCounter, snapshot.counter);
        previousCounter = snapshot.counter;
        void refreshLatency();
        return {
          adapter: snapshot.adapter,
          downloadBytesPerSecond: traffic?.downloadBytesPerSecond ?? null,
          uploadBytesPerSecond: traffic?.uploadBytesPerSecond ?? null,
          latency: { target: publicLatencyTarget, milliseconds: latency.milliseconds, sampledAt: latency.sampledAt },
          flClash: { running: snapshot.flClashRunning, launchConfigured: await isExecutableConfigured(config.flClashPath, proxyLaunchDefinitions.flclash.executableName) },
          sampledAt: snapshot.counter.sampledAt,
        } satisfies NetworkMetricsPayload;
      })().then((data) => {
        networkMetricsCache = { sampledAt: Date.now(), data };
        return data;
      }).finally(() => { networkMetricsPending = null; });
    }
    return networkMetricsPending;
  };

  const sendNetworkMetrics = async (response: ServerResponse) => {
    try {
      sendJson(response, 200, await readCachedNetworkMetrics());
    } catch {
      sendJson(response, 503, { message: "Local network metrics are unavailable." });
    }
  };

  const sendProxyLaunch = async (response: ServerResponse, kind: ProxyLaunchKind, path: string | null) => {
    const definition = proxyLaunchDefinitions[kind];
    try {
      const launchConfigured = await isExecutableConfigured(path, definition.executableName);
      const { stdout } = await execFileAsync(powerShell, powerShellCommandArgs(proxyLaunchScript), {
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

  const resolveWeatherLocation = async () => {
    if (weatherLocationCache && weatherLocationCache.expiresAt > Date.now()) return weatherLocationCache.coordinates;
    if (!weatherLocationPending) {
      weatherLocationPending = fetchWeatherCoordinates(config).then((coordinates) => {
        weatherLocationCache = { coordinates, expiresAt: Date.now() + weatherLocationCacheTtlMs };
        return coordinates;
      }).finally(() => { weatherLocationPending = null; });
    }
    return weatherLocationPending;
  };

  const sendWeather = async (request: IncomingMessage, response: ServerResponse) => {
    try {
      const url = new URL(request.url ?? "", `http://${request.headers.host ?? "127.0.0.1"}`);
      const hasLatitude = url.searchParams.has("latitude");
      const hasLongitude = url.searchParams.has("longitude");
      if (hasLatitude !== hasLongitude) return sendJson(response, 400, { status: "unavailable", checkedAt: null, data: null, message: "天气坐标不完整。" });

      let coordinates: WeatherCoordinates;
      if (hasLatitude && hasLongitude) {
        const latitude = Number(url.searchParams.get("latitude"));
        const longitude = Number(url.searchParams.get("longitude"));
        const parsed = parseWeatherCoordinates({ latitude, longitude });
        if (!parsed) return sendJson(response, 400, { status: "unavailable", checkedAt: null, data: null, message: "天气坐标无效。" });
        coordinates = parsed;
      } else {
        try {
          // Browser geolocation is optional; the server can use a coarse network location
          // so the dashboard still works in another browser or outside Codex.
          coordinates = await resolveWeatherLocation();
        } catch {
          if (weatherCache?.state.status === "ready") return sendJson(response, 200, weatherCache.state);
          return sendJson(response, 503, { status: "unavailable", checkedAt: null, data: null });
        }
      }

      const key = `${coordinates.latitude.toFixed(2)},${coordinates.longitude.toFixed(2)}`;
      const cached = weatherCache?.key === key ? weatherCache : null;
      if (cached && cached.expiresAt > Date.now()) return sendJson(response, 200, cached.state);
      try {
        const snapshot = await fetchWeatherForecast(config, coordinates.latitude, coordinates.longitude);
        const checkedAt = Date.now();
        const state: WeatherApiState = { status: "ready", checkedAt, data: snapshot };
        weatherCache = { key, expiresAt: Date.now() + weatherCacheTtlMs, state };
        weatherLocationCache = { coordinates, expiresAt: Date.now() + weatherLocationCacheTtlMs };
        return sendJson(response, 200, state);
      } catch {
        if (cached?.state.status === "ready") {
          weatherCache = { ...cached, expiresAt: Date.now() + weatherCacheTtlMs };
          return sendJson(response, 200, cached.state);
        }
        if (!hasLatitude && weatherCache?.state.status === "ready") return sendJson(response, 200, weatherCache.state);
        return sendJson(response, 503, { status: "unavailable", checkedAt: null, data: null });
      }
    } catch {
      return sendJson(response, 400, { status: "unavailable", checkedAt: null, data: null, message: "天气请求无效。" });
    }
  };

  const sendCodexAutomations = async (response: ServerResponse) => {
    try {
      const state = await readCodexAutomations();
      sendJson(response, 200, state);
    } catch {
      sendJson(response, 503, { status: "unavailable", checkedAt: null, data: [] });
    }
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

  const updateEgress = async () => {
    if (!egressRefreshPending) {
      egressRefreshPending = refreshEgressCache(config).then((next) => {
        egressCache = next;
        return next;
      }).finally(() => { egressRefreshPending = null; });
    }
    return egressRefreshPending;
  };

  const refreshEgress = async (response: ServerResponse) => {
    await updateEgress();
    sendJson(response, egressCache.status === "ready" ? 200 : 503, egressCache);
  };

  const cancelScheduledHWiNFOClose = () => {
    if (!hwinfoCloseTimer) return;
    clearTimeout(hwinfoCloseTimer);
    hwinfoCloseTimer = null;
  };

  const cancelScheduledHWiNFORetry = () => {
    if (!hwinfoRetryTimer) return;
    clearTimeout(hwinfoRetryTimer);
    hwinfoRetryTimer = null;
  };

  const shutdownHWiNFO = () => {
    if (hwinfoShutdownStarted) return;
    hwinfoShutdownStarted = true;
    cancelScheduledHWiNFOClose();
    cancelScheduledHWiNFORetry();
    hwinfoPageTokens.clear();
    void (async () => {
      // A page can be closing while the first launch is still waiting for the
      // scheduled task. Let that launch settle, then release the owned process.
      if (hwinfoStartPending) await hwinfoStartPending.catch(() => undefined);
      if (hwinfoClosePending) await hwinfoClosePending.catch(() => undefined);
      if (!hwinfoClosePending) {
        hwinfoClosePending = closeAllHWiNFO().finally(() => { hwinfoClosePending = null; });
        await hwinfoClosePending.catch(() => undefined);
      }
    })();
  };

  const ensureHWiNFOForPage = () => {
    if (!hwinfoStartPending) {
      hwinfoStartPending = (async () => {
        if (hwinfoClosePending) await hwinfoClosePending;
        return startOwnedHWiNFO();
      })().finally(() => { hwinfoStartPending = null; });
    }
    return hwinfoStartPending;
  };

  const scheduleHWiNFORetry = (delayMs = 5_000) => {
    if (hwinfoRetryTimer || hwinfoPageTokens.size === 0) return;
    hwinfoRetryTimer = setTimeout(() => {
      hwinfoRetryTimer = null;
      if (hwinfoPageTokens.size === 0) return;
      void ensureHWiNFOForPage()
        .then((result) => { if (result.status === "unavailable") scheduleHWiNFORetry(30_000); })
        .catch(() => scheduleHWiNFORetry(30_000));
    }, delayMs);
  };

  const scheduleHWiNFOClose = () => {
    cancelScheduledHWiNFOClose();
    if (hwinfoPageTokens.size > 0) return;
    hwinfoCloseTimer = setTimeout(() => {
      hwinfoCloseTimer = null;
      if (hwinfoPageTokens.size > 0 || hwinfoClosePending) return;
      if (hwinfoStartPending) {
        scheduleHWiNFOClose();
        return;
      }
      hwinfoClosePending = closeAllHWiNFO().finally(() => { hwinfoClosePending = null; });
    }, 3_000);
  };

  const releaseHWiNFOPage = (pageToken: string, connectionId?: string) => {
    const activeConnectionId = hwinfoPageTokens.get(pageToken);
    if (!activeConnectionId || (connectionId && activeConnectionId !== connectionId)) return false;
    hwinfoPageTokens.delete(pageToken);
    if (hwinfoPageTokens.size === 0) {
      cancelScheduledHWiNFORetry();
      scheduleHWiNFOClose();
    }
    return true;
  };

  const openHWiNFOSession = async (request: IncomingMessage, response: ServerResponse) => {
    try {
      const url = new URL(request.url ?? "", `http://${request.headers.host ?? "127.0.0.1"}`);
      const pageToken = readHWiNFOPageToken({ pageToken: url.searchParams.get("pageToken") });
      if (!pageToken) return sendJson(response, 400, { status: "invalid-page" });

      const connectionId = randomUUID();
      // React development StrictMode and browser visibility changes can close
      // an old session while the replacement session is still starting. Cancel
      // the delayed shutdown before awaiting the shared start operation.
      cancelScheduledHWiNFOClose();
      const hwinfo = await ensureHWiNFOForPage();
      if (response.destroyed) {
        if (hwinfoPageTokens.size === 0) scheduleHWiNFOClose();
        return;
      }

      hwinfoPageTokens.set(pageToken, connectionId);
      cancelScheduledHWiNFOClose();
      if (hwinfo.status === "unavailable") scheduleHWiNFORetry();
      response.statusCode = 200;
      response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Connection", "keep-alive");
      response.flushHeaders();
      response.write(`retry: 1000\nevent: ready\ndata: ${JSON.stringify({ status: "open", pages: hwinfoPageTokens.size, hwinfo: hwinfo.status !== "unavailable" })}\n\n`);

      const keepAlive = setInterval(() => {
        if (!response.destroyed) response.write(": keepalive\n\n");
      }, 15_000);
      response.once("close", () => {
        clearInterval(keepAlive);
        releaseHWiNFOPage(pageToken, connectionId);
      });
    } catch {
      if (!response.headersSent) sendJson(response, 400, { status: "invalid-page" });
      else response.end();
    }
  };

  const openHWiNFOPage = async (request: IncomingMessage, response: ServerResponse) => {
    try {
      const pageToken = readHWiNFOPageToken(await readJsonBody(request));
      if (!pageToken) return sendJson(response, 400, { status: "invalid-page" });
      cancelScheduledHWiNFOClose();
      const hwinfo = await ensureHWiNFOForPage();
      hwinfoPageTokens.set(pageToken, `legacy:${pageToken}`);
      cancelScheduledHWiNFOClose();
      if (hwinfo.status === "unavailable") scheduleHWiNFORetry();
      sendJson(response, 200, { status: "open", pages: hwinfoPageTokens.size, hwinfo: hwinfo.status !== "unavailable" });
    } catch {
      sendJson(response, 400, { status: "invalid-page" });
    }
  };

  const closeHWiNFOPage = async (request: IncomingMessage, response: ServerResponse) => {
    try {
      const pageToken = readHWiNFOPageToken(await readJsonBody(request));
      if (!pageToken) return sendJson(response, 400, { status: "invalid-page" });
      const removed = releaseHWiNFOPage(pageToken);
      if (!removed) return sendJson(response, 200, { status: "ignored", pages: hwinfoPageTokens.size });
      if (hwinfoPageTokens.size > 0) return sendJson(response, 200, { status: "open", pages: hwinfoPageTokens.size });
      sendJson(response, 202, { status: "closing", pages: 0 });
    } catch {
      sendJson(response, 400, { status: "invalid-page" });
    }
  };

  const registerRoutes = (server: { middlewares: { use: (path: string, handler: (request: IncomingMessage, response: ServerResponse, next: () => void) => void) => void }; httpServer?: { once: (event: string | symbol, listener: (...args: any[]) => void) => unknown } | null }) => {
    server.httpServer?.once("close", shutdownHWiNFO);
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
      if (request.method === "GET") return void sendLocalModels(response);
      if (request.method === "PUT") return void updateLocalModelSettings(request, response);
      return next();
    });
    server.middlewares.use("/api/local-models/control", (request, response, next) => {
      if (request.method !== "POST") return next();
      void controlLocalModel(request, response);
    });
    server.middlewares.use("/api/weather", (request, response, next) => {
      if (request.method !== "GET") return next();
      if (request.headers.origin && !hasSameOrigin(request)) return sendJson(response, 403, { status: "unavailable", checkedAt: null, data: null });
      void sendWeather(request, response);
    });
    server.middlewares.use("/api/codex-automations", (request, response, next) => {
      if (request.method !== "GET") return next();
      if (request.headers.origin && !hasSameOrigin(request)) return sendJson(response, 403, { status: "unavailable", checkedAt: null, data: [] });
      void sendCodexAutomations(response);
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
    server.middlewares.use("/api/hwinfo/open", (request, response, next) => {
      if (request.method !== "POST") return next();
      if (!hasSameOrigin(request)) return sendJson(response, 403, { status: "unavailable", message: "本机来源校验失败。" });
      void openHWiNFOPage(request, response);
    });
    server.middlewares.use("/api/hwinfo/session", (request, response, next) => {
      if (request.method !== "GET") return next();
      if (typeof request.headers.origin === "string" && !hasSameOrigin(request)) return sendJson(response, 403, { status: "unavailable", message: "本机来源校验失败。" });
      void openHWiNFOSession(request, response);
    });
    server.middlewares.use("/api/hwinfo/close", (request, response, next) => {
      if (request.method !== "POST") return next();
      if (!hasSameOrigin(request)) return sendJson(response, 403, { status: "unavailable", message: "本机来源校验失败。" });
      void closeHWiNFOPage(request, response);
    });
    if (isEgressConfigured(config) && egressCache.status === "idle") void updateEgress();
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
  const buildHistory = (() => {
    try {
      return execFileSync("git", ["log", "-4", "--date=short", "--pretty=format:%h\t%ad\t%s"], { cwd: process.cwd(), windowsHide: true, encoding: "utf8" })
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
          const [commit, date, ...summary] = line.split("\t");
          return { commit, date, summary: summary.join("\t") };
        });
    } catch { return []; }
  })();
  return {
    plugins: [react(), localMetricsPlugin(resolveNetworkConfig(environment)), createHddBridgePlugin(workspaceRoot), createLiteraturePlugin(), createScreenshotPlugin(process.cwd()), createWorkbenchSettingsPlugin({ environment, powerShell, projectRoot: process.cwd() }), createRepositoryPlugin(workspaceRoot)],
    define: {
      __OBSUI_VERSION__: JSON.stringify(packageJson.version),
      __OBSUI_BUILD_HISTORY__: JSON.stringify(buildHistory),
    },
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      watch: {
        ignored: [join(process.cwd(), ".obsui-runtime", "**")],
      },
    },
  };
});

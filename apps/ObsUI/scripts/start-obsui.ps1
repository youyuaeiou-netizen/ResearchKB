[CmdletBinding()]
param(
    [int]$Port = 5173,
    [string]$OpenPath = '/?ui=tab-v2',
    [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'

$appRoot = Split-Path -Parent $PSScriptRoot
$hostName = '127.0.0.1'
$env:OBSUI_HWINFO_RUNTIME_DIRECTORY = Join-Path $appRoot '.obsui-runtime\hwinfo'

function Test-ObsUiPowerShellExecutable([string]$Path) {
    if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $false
    }
    # The WindowsApps app-execution alias is a shim rather than the real host.
    # Child processes launched through it can ignore windowsHide/-WindowStyle.
    $normalized = $Path.Replace('/', '\').ToLowerInvariant()
    return $normalized -notmatch '\\(?:appdata\\local\\microsoft\\windowsapps\\pwsh\.exe|windowsapps\\microsoft\.powershell_[^\\]+\\pwsh\.exe)$'
}

function Resolve-ObsUiPowerShellPath {
    $candidates = @($env:OBSUI_POWERSHELL_PATH)
    try {
        $appx = Get-AppxPackage -Name 'Microsoft.PowerShell' -ErrorAction SilentlyContinue |
            Sort-Object Version -Descending |
            Select-Object -First 1
        if ($appx -and $appx.InstallLocation) {
            $candidates += Join-Path $appx.InstallLocation 'pwsh.exe'
        }
    }
    catch { }

    $localAppData = [Environment]::GetEnvironmentVariable('LOCALAPPDATA')
    $programFiles = [Environment]::GetEnvironmentVariable('ProgramFiles')
    $systemRoot = [Environment]::GetEnvironmentVariable('SystemRoot')
    if ($localAppData) { $candidates += Join-Path $localAppData 'Programs\PowerShell\7\pwsh.exe' }
    if ($programFiles) {
        $candidates += @(Get-ChildItem -Path (Join-Path $programFiles 'PowerShell\*\pwsh.exe') -File -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName)
    }
    $candidates += @(Get-Command pwsh.exe -CommandType Application -All -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)
    if ($systemRoot) { $candidates += Join-Path $systemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe' }

    foreach ($candidate in $candidates) {
        if (Test-ObsUiPowerShellExecutable ([string]$candidate)) { return [string]$candidate }
    }
    return $null
}

function Test-ObsUiNodeExecutable([string]$Path) {
    if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $false
    }
    # The WindowsApps app-execution alias is a shim rather than the real host.
    # Do not use it for the Vite child process because it can surface a console.
    $normalized = $Path.Replace('/', '\').ToLowerInvariant()
    return $normalized -notmatch '\\appdata\\local\\microsoft\\windowsapps\\node\.exe$'
}

function Resolve-ObsUiNodePath {
    $candidates = @($env:OBSUI_NODE_PATH)
    try {
        $nodeCommand = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($nodeCommand -and $nodeCommand.Source) { $candidates += [string]$nodeCommand.Source }
    }
    catch { }

    if ($env:ProgramFiles) {
        $candidates += Join-Path $env:ProgramFiles 'nodejs\node.exe'
    }
    if ($env:LOCALAPPDATA) {
        $candidates += Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'
    }
    if ($env:USERPROFILE) {
        $candidates += Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
    }

    foreach ($candidate in $candidates) {
        if (Test-ObsUiNodeExecutable ([string]$candidate)) { return [string]$candidate }
    }
    return $null
}

$resolvedPowerShellPath = Resolve-ObsUiPowerShellPath
if (-not [string]::IsNullOrWhiteSpace($resolvedPowerShellPath)) {
    # Pass the resolved executable to Vite so a desktop launch does not depend on
    # an app-execution alias or Codex's transient PATH.
    $env:OBSUI_POWERSHELL_PATH = $resolvedPowerShellPath
}

# The screenshot helper is a WinForms C# host and therefore runs in the
# Windows PowerShell/.NET Framework process; keep this separate from the
# pwsh path used by provider and companion integrations.
if ([string]::IsNullOrWhiteSpace($env:OBSUI_WINDOWS_POWERSHELL_PATH)) {
    $windowsPowerShellCommand = Get-Command powershell.exe -CommandType Application -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($windowsPowerShellCommand -and -not [string]::IsNullOrWhiteSpace($windowsPowerShellCommand.Source)) {
        $env:OBSUI_WINDOWS_POWERSHELL_PATH = $windowsPowerShellCommand.Source
    }
}
$env:OLLAMA_MODELS = 'C:\AIModels'
$env:OLLAMA_CONTEXT_LENGTH = '65536'
$env:OLLAMA_MAX_LOADED_MODELS = '1'
$env:OLLAMA_NUM_PARALLEL = '1'
$localOllamaExecutable = Join-Path $env:USERPROFILE 'AppData\Local\Programs\Ollama\ollama.exe'
if (Test-Path -LiteralPath $localOllamaExecutable -PathType Leaf) {
    $env:OBSUI_OLLAMA_PATH = $localOllamaExecutable
}
$baseUrl = "http://${hostName}:$Port/"
$normalizedOpenPath = if ([string]::IsNullOrWhiteSpace($OpenPath)) { '/' } elseif ($OpenPath.StartsWith('/')) { $OpenPath } else { "/$OpenPath" }
$openUrl = if ($normalizedOpenPath -eq '/') { $baseUrl } else { "$baseUrl$($normalizedOpenPath.TrimStart('/'))" }

function Test-ObsUiReady {
    try {
        $response = Invoke-WebRequest -Uri $baseUrl -UseBasicParsing -TimeoutSec 2
        return ($response.StatusCode -eq 200 -and $response.Content -match 'ObsUI')
    }
    catch {
        return $false
    }
}

function Test-ObsUiHardwareMonitorReady {
    try {
        $response = Invoke-WebRequest -Uri 'http://127.0.0.1:8085/data.json' -UseBasicParsing -TimeoutSec 1
        return $response.StatusCode -eq 200
    }
    catch {
        return $false
    }
}

function Test-ObsUiLogonHardwareMonitorTask {
    try {
        $task = Get-ScheduledTask -TaskName 'ObsUI LibreHardwareMonitor' -ErrorAction Stop
        return @($task.Triggers | Where-Object {
            ([string]$_.CimClass.CimClassName) -match 'Logon'
        }).Count -gt 0
    }
    catch {
        return $false
    }
}

function Stop-ObsUiLogonHardwareMonitorTask {
    try {
        Stop-ScheduledTask -TaskName 'ObsUI LibreHardwareMonitor' -ErrorAction Stop
    }
    catch {
        return
    }

    # Task Scheduler can report Ready before the process has actually exited.
    # Wait briefly so the replacement instance is not started alongside it.
    $deadline = [DateTime]::UtcNow.AddSeconds(4)
    do {
        $running = @(Get-Process -Name 'LibreHardwareMonitor' -ErrorAction SilentlyContinue)
        if ($running.Count -eq 0) { return }
        Start-Sleep -Milliseconds 200
    } while ([DateTime]::UtcNow -lt $deadline)
}

function Invoke-ObsUiCompanionLaunch {
    try {
        $headers = @{ Origin = $baseUrl.TrimEnd('/') }
        $response = Invoke-WebRequest -Uri ($baseUrl.TrimEnd('/') + '/api/workbench-startup/launch') -Method Post -Headers $headers -Body '{}' -ContentType 'application/json' -UseBasicParsing -TimeoutSec 20
        if ($response.StatusCode -ne 200) {
            Write-Warning "ObsUI 随行应用检查返回 HTTP $($response.StatusCode)。"
        }
    }
    catch {
        Write-Warning 'ObsUI 随行应用检查失败；请打开工作台设置确认启动项状态。'
    }
}

function Start-ObsUiHardwareMonitor {
    # LibreHardwareMonitor declares requireAdministrator in its manifest.
    # Starting its executable directly therefore creates a UAC prompt that
    # -WindowStyle Hidden cannot suppress. The triggerless, hidden task is
    # registered once with highest available privileges; normal ObsUI starts
    # may request that task without another UAC prompt.
    $hasLogonTask = Test-ObsUiLogonHardwareMonitorTask
    if ($hasLogonTask) {
        Stop-ObsUiLogonHardwareMonitorTask
    }
    if (Test-ObsUiHardwareMonitorReady) { return }

    try {
        $task = Get-ScheduledTask -TaskName 'ObsUI LibreHardwareMonitor' -ErrorAction Stop
        if ($task.State -ne 'Running') {
            Start-ScheduledTask -TaskName 'ObsUI LibreHardwareMonitor' -ErrorAction Stop
        }
    }
    catch {
        # Never fall back to launching the requireAdministrator executable.
        # Without the pre-registered task ObsUI keeps its non-elevated sensor
        # sources instead of interrupting a desktop launch with UAC.
        return
    }

    $deadline = [DateTime]::UtcNow.AddSeconds(4)
    do {
        Start-Sleep -Milliseconds 400
        if (Test-ObsUiHardwareMonitorReady) { return }
    } while ([DateTime]::UtcNow -lt $deadline)
}

Start-ObsUiHardwareMonitor

if (-not (Test-ObsUiReady)) {
    if (-not (Test-Path -LiteralPath (Join-Path $appRoot 'package.json') -PathType Leaf)) {
        throw "ObsUI 应用目录不完整：$appRoot"
    }
    $viteCliPath = Join-Path $appRoot 'node_modules\vite\bin\vite.js'
    $nodePath = Resolve-ObsUiNodePath
    if (-not $nodePath -or -not (Test-Path -LiteralPath $viteCliPath -PathType Leaf)) {
        throw '找不到真实 Node.js 或 Vite。请先在应用目录运行 pnpm install，并确认 node.exe 可用。'
    }
    # Launch Node directly: cmd/pnpm wrappers can create a visible console host
    # during a desktop or post-login launch even when PowerShell is hidden.
    $server = Start-Process -FilePath $nodePath -ArgumentList @("`"$viteCliPath`"", '--host', $hostName, '--port', $Port) -WorkingDirectory $appRoot -WindowStyle Hidden -PassThru
    $ready = $false
    $deadline = [DateTime]::UtcNow.AddSeconds(60)
    do {
        Start-Sleep -Milliseconds 500
        if ($server.HasExited) {
            throw "ObsUI Vite 进程提前退出，退出码：$($server.ExitCode)"
        }
        $ready = Test-ObsUiReady
    } while (-not $ready -and [DateTime]::UtcNow -lt $deadline)

    if (-not $ready) {
        throw "ObsUI 未能在 $baseUrl 启动"
    }
}

# A reused Vite process does not run plugin initialization again. Trigger the
# idempotent server-side check before opening the page so enabled companions
# such as Zotero are handled on every shortcut launch.
Invoke-ObsUiCompanionLaunch

if (-not $NoOpen) {
    Start-Process $openUrl
}

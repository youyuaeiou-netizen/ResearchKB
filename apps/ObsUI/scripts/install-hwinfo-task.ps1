#Requires -RunAsAdministrator
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$taskName = 'ObsUI HWiNFO'
$obsUiRoot = Split-Path -Parent $PSScriptRoot
$taskHost = Join-Path $env:SystemRoot 'System32\wscript.exe'
$powerShellHost = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$taskRuntimeDirectory = Join-Path $env:ProgramData 'ObsUI\HWiNFO'
$taskWrapperPath = Join-Path $taskRuntimeDirectory 'hwinfo-task-host.vbs'
$taskCapabilityPath = Join-Path $taskRuntimeDirectory 'task-capabilities.json'
$stateDirectory = Join-Path $obsUiRoot '.obsui-runtime\hwinfo'
$resultDirectory = $stateDirectory
$resultPath = Join-Path $resultDirectory 'hwinfo-task-install.json'
$taskStatusPath = Join-Path $resultDirectory 'hwinfo-task-status.json'
$stopRequestPath = Join-Path $resultDirectory 'hwinfo-stop.request.json'

trap {
    try {
        if (-not (Test-Path -LiteralPath $resultDirectory -PathType Container)) {
            New-Item -ItemType Directory -Path $resultDirectory -Force | Out-Null
        }
        [ordered]@{
            status = 'failed'
            verified = $false
            taskName = $taskName
            message = $_.Exception.Message
            failedAt = [DateTime]::UtcNow.ToString('o')
        } | ConvertTo-Json -Compress | Set-Content -LiteralPath $resultPath -Encoding UTF8
    }
    catch { }
    exit 1
}

function Resolve-ObsUiHWiNFOExecutable {
    $programFiles = [Environment]::GetEnvironmentVariable('ProgramFiles')
    $programFilesX86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
    $candidates = @(
        $env:OBSUI_HWINFO_PATH
        if ($programFiles) { Join-Path $programFiles 'HWiNFO64\HWiNFO64.exe' }
        if ($programFilesX86) { Join-Path $programFilesX86 'HWiNFO64\HWiNFO64.exe' }
        if ($programFiles) { Join-Path $programFiles 'HWiNFO\HWiNFO64.exe' }
        if ($programFilesX86) { Join-Path $programFilesX86 'HWiNFO\HWiNFO64.exe' }
    ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) -and (Test-Path -LiteralPath $_ -PathType Leaf) }
    return $candidates | Select-Object -First 1
}

$executable = Resolve-ObsUiHWiNFOExecutable
if ([string]::IsNullOrWhiteSpace($executable)) {
    throw '找不到 HWiNFO64.exe。请先安装 HWiNFO，或设置 OBSUI_HWINFO_PATH。'
}
if (-not (Test-Path -LiteralPath $taskHost -PathType Leaf)) {
    throw "找不到任务宿主：$taskHost"
}
if (-not (Test-Path -LiteralPath $powerShellHost -PathType Leaf)) {
    throw "找不到 PowerShell：$powerShellHost"
}
if (-not (Test-Path -LiteralPath $resultDirectory -PathType Container)) {
    New-Item -ItemType Directory -Path $resultDirectory -Force | Out-Null
}
Remove-Item -LiteralPath $resultPath, $stopRequestPath -Force -ErrorAction SilentlyContinue

$taskCommandTemplate = @'
$ErrorActionPreference = 'Stop'
$stateDirectory = '__OBSUI_HWINFO_RUNTIME_DIRECTORY__'
if (-not (Test-Path -LiteralPath $stateDirectory -PathType Container)) {
    New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
}
$statusPath = Join-Path $stateDirectory 'hwinfo-task-status.json'
$stopRequestPath = Join-Path $stateDirectory 'hwinfo-stop.request.json'
$ownerPath = Join-Path $stateDirectory 'hwinfo-owner.json'
$executable = '__OBSUI_HWINFO_EXECUTABLE__'
function Write-Status([string]$Status, [string]$Message = '', [int]$HWiNFOPid = 0) {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    [ordered]@{
        status = $Status
        isAdministrator = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
        supportsStopAll = $true
        processId = $PID
        hwinfoPid = $HWiNFOPid
        message = $Message
        sampledAt = [DateTime]::UtcNow.ToString('o')
    } | ConvertTo-Json -Compress | Set-Content -LiteralPath $statusPath -Encoding UTF8
}
function Stop-AllObsUiHWiNFO {
    Get-Process -Name 'HWiNFO64', 'HWiNFO32', 'HWiNFO' -ErrorAction SilentlyContinue |
        Stop-Process -Force -ErrorAction SilentlyContinue
}
function Test-ObsUiOwnerProcessAlive([int]$HWiNFOPid) {
    try {
        if (-not (Test-Path -LiteralPath $ownerPath -PathType Leaf)) { return $true }
        $owner = Get-Content -LiteralPath $ownerPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $ownerHWiNFOPid = 0
        $ownerProcessId = 0
        if (-not [int]::TryParse([string]$owner.pid, [ref]$ownerHWiNFOPid) -or $ownerHWiNFOPid -ne $HWiNFOPid) { return $true }
        if (-not [int]::TryParse([string]$owner.ownerProcessId, [ref]$ownerProcessId) -or $ownerProcessId -le 0) { return $true }
        return $null -ne (Get-Process -Id $ownerProcessId -ErrorAction SilentlyContinue)
    }
    catch {
        # A transient read/ACL error must not stop an external HWiNFO process.
        return $true
    }
}
try {
    $stopAllPending = $false
    if (Test-Path -LiteralPath $stopRequestPath -PathType Leaf) {
        try {
            $pendingRequest = Get-Content -LiteralPath $stopRequestPath -Raw -Encoding UTF8 | ConvertFrom-Json
            $stopAllPending = [bool]$pendingRequest.all
        }
        catch { }
    }
    if (-not $stopAllPending) {
        Remove-Item -LiteralPath $stopRequestPath -Force -ErrorAction SilentlyContinue
    }
    if ($stopAllPending) {
        Stop-AllObsUiHWiNFO
        Remove-Item -LiteralPath $stopRequestPath -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $ownerPath -Force -ErrorAction SilentlyContinue
        Write-Status 'closed'
        exit 0
    }
    Write-Status 'launching'
    $process = Start-Process -FilePath $executable -WorkingDirectory (Split-Path -Parent $executable) -WindowStyle Hidden -PassThru
    Write-Status 'running' '' $process.Id
    $stopAllRequested = $false
    while (-not $process.HasExited) {
        if (Test-Path -LiteralPath $stopRequestPath -PathType Leaf) {
            try {
                $request = Get-Content -LiteralPath $stopRequestPath -Raw -Encoding UTF8 | ConvertFrom-Json
                if ([bool]$request.all) {
                    Stop-AllObsUiHWiNFO
                    $stopAllRequested = $true
                }
                elseif ([int]$request.pid -eq $process.Id) {
                    Stop-Process -Id $process.Id -Force -ErrorAction Stop
                }
            }
            catch { }
            Remove-Item -LiteralPath $stopRequestPath -Force -ErrorAction SilentlyContinue
        }
        if ($stopAllRequested) { break }
        if (-not $process.HasExited -and -not (Test-ObsUiOwnerProcessAlive $process.Id)) {
            # Vite can be terminated before its HTTP close hook runs. Once the
            # owner process is gone, the user-requested policy is to close all
            # HWiNFO instances, including ones started outside ObsUI.
            try {
                Stop-AllObsUiHWiNFO
                $stopAllRequested = $true
            }
            catch { }
            if ($stopAllRequested) { break }
        }
        Start-Sleep -Milliseconds 250
        $process.Refresh()
    }
    Write-Status 'closed' '' $process.Id
    try {
        $owner = Get-Content -LiteralPath $ownerPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ([int]$owner.pid -eq $process.Id) {
            Remove-Item -LiteralPath $ownerPath -Force -ErrorAction SilentlyContinue
        }
    }
    catch { }
    exit $process.ExitCode
}
catch {
    Write-Status 'failed' $_.Exception.Message
    exit 1
}
'@
$taskCommand = $taskCommandTemplate.Replace('__OBSUI_HWINFO_EXECUTABLE__', $executable.Replace("'", "''")).Replace('__OBSUI_HWINFO_RUNTIME_DIRECTORY__', $stateDirectory.Replace("'", "''"))
$encodedCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($taskCommand))
$taskWrapper = @'
Option Explicit
If WScript.Arguments.Count <> 2 Then WScript.Quit 2

Dim shell, powerShellPath, encodedCommand, command, exitCode
powerShellPath = WScript.Arguments(0)
encodedCommand = WScript.Arguments(1)
command = QuoteArgument(powerShellPath) & " -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand " & encodedCommand

Set shell = CreateObject("WScript.Shell")
exitCode = shell.Run(command, 0, True)
WScript.Quit exitCode

Function QuoteArgument(ByVal value)
    QuoteArgument = Chr(34) & Replace(value, Chr(34), Chr(34) & Chr(34)) & Chr(34)
End Function
'@
if (-not (Test-Path -LiteralPath $taskRuntimeDirectory -PathType Container)) {
    New-Item -ItemType Directory -Path $taskRuntimeDirectory -Force | Out-Null
}
$taskWrapper | Set-Content -LiteralPath $taskWrapperPath -Encoding ASCII
$icacls = Join-Path $env:SystemRoot 'System32\icacls.exe'
& $icacls $taskRuntimeDirectory '/inheritance:r' '/grant:r' '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-32-545:(OI)(CI)RX' | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "无法保护 HWiNFO 任务宿主目录：$taskRuntimeDirectory"
}
$taskArguments = '//B //Nologo "{0}" "{1}" {2}' -f $taskWrapperPath, $powerShellHost, $encodedCommand
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask -and $existingTask.State -eq 'Running') {
    $previousTaskStatus = try {
        Get-Content -LiteralPath $taskStatusPath -Raw -Encoding UTF8 | ConvertFrom-Json
    }
    catch {
        $null
    }
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
    $previousPid = 0
    if ($previousTaskStatus -and [int]::TryParse([string]$previousTaskStatus.hwinfoPid, [ref]$previousPid) -and $previousPid -gt 0) {
        $previousProcess = Get-Process -Id $previousPid -ErrorAction SilentlyContinue
        if ($previousProcess -and @('HWiNFO64', 'HWiNFO32', 'HWiNFO') -contains $previousProcess.ProcessName) {
            Stop-Process -Id $previousPid -Force -ErrorAction Stop
        }
    }
}
Remove-Item -LiteralPath $taskStatusPath -Force -ErrorAction SilentlyContinue
$action = New-ScheduledTaskAction -Execute $taskHost -Argument $taskArguments -WorkingDirectory $PSScriptRoot
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value) -LogonType Interactive -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$task = New-ScheduledTask -Action $action -Principal $principal -Settings $settings -Description '按需为 ObsUI 无窗口启动 HWiNFO 传感器；不设置自动触发器。'
Register-ScheduledTask -TaskName $taskName -InputObject $task -Force | Out-Null

$beforeIds = @(Get-Process -Name 'HWiNFO64', 'HWiNFO32', 'HWiNFO' -ErrorAction SilentlyContinue | ForEach-Object Id)
if ($beforeIds.Count -eq 0) {
    Start-ScheduledTask -TaskName $taskName
    $deadline = [DateTime]::UtcNow.AddSeconds(12)
    do {
        Start-Sleep -Milliseconds 400
        $started = Get-Process -Name 'HWiNFO64', 'HWiNFO32', 'HWiNFO' -ErrorAction SilentlyContinue |
            Where-Object { $beforeIds -notcontains $_.Id } |
            Select-Object -First 1
    } while (-not $started -and [DateTime]::UtcNow -lt $deadline)
    $taskStatus = if (Test-Path -LiteralPath $taskStatusPath -PathType Leaf) { Get-Content -LiteralPath $taskStatusPath -Raw -Encoding UTF8 | ConvertFrom-Json } else { $null }
    if (-not $started -or -not $taskStatus -or $taskStatus.status -ne 'running' -or -not $taskStatus.isAdministrator) {
        $lastResult = (Get-ScheduledTaskInfo -TaskName $taskName).LastTaskResult
        $detail = if ($taskStatus) { "；状态：$($taskStatus.status)；管理员：$($taskStatus.isAdministrator)；消息：$($taskStatus.message)" } else { '；未生成任务状态' }
        throw (('HWiNFO 任务验证失败，结果：0x{0:X8}' -f ([uint32]$lastResult)) + $detail)
    }
    Stop-ScheduledTask -TaskName $taskName
    $deadline = [DateTime]::UtcNow.AddSeconds(8)
    do {
        Start-Sleep -Milliseconds 300
        $stillRunning = Get-Process -Id $started.Id -ErrorAction SilentlyContinue
    } while ($stillRunning -and [DateTime]::UtcNow -lt $deadline)
    if ($stillRunning) {
        Stop-Process -Id $started.Id -Force -ErrorAction Stop
    }
}

Remove-Item -LiteralPath (Join-Path $resultDirectory 'hwinfo-retry.json') -Force -ErrorAction SilentlyContinue
[ordered]@{
    supportsStopAll = $true
    installedAt = [DateTime]::UtcNow.ToString('o')
} | ConvertTo-Json -Compress | Set-Content -LiteralPath $taskCapabilityPath -Encoding UTF8
[ordered]@{
    status = 'installed'
    verified = $true
    taskName = $taskName
    installedAt = [DateTime]::UtcNow.ToString('o')
} | ConvertTo-Json -Compress | Set-Content -LiteralPath $resultPath -Encoding UTF8

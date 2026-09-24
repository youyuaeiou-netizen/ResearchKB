[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Start', 'Stop', 'Status')]
    [string]$Action
)

$ErrorActionPreference = 'Stop'
$taskName = 'ObsUI HWiNFO'
$obsUiRoot = Split-Path -Parent $PSScriptRoot
$stateDirectory = if ($env:OBSUI_HWINFO_RUNTIME_DIRECTORY) { $env:OBSUI_HWINFO_RUNTIME_DIRECTORY } else { Join-Path $obsUiRoot '.obsui-runtime\hwinfo' }
$ownerPath = if ($env:OBSUI_HWINFO_OWNER_FILE) { $env:OBSUI_HWINFO_OWNER_FILE } else { Join-Path $stateDirectory 'hwinfo-owner.json' }
$retryPath = Join-Path $stateDirectory 'hwinfo-retry.json'
$stopRequestPath = Join-Path $stateDirectory 'hwinfo-stop.request.json'
$mutex = [Threading.Mutex]::new($false, 'Local\ObsUI.HWiNFO.Control')
$mutexAcquired = $false

function Write-ObsUiResult([hashtable]$Payload) {
    $Payload | ConvertTo-Json -Compress
}

function Get-ObsUiHWiNFOProcesses {
    return @(Get-Process -Name 'HWiNFO64', 'HWiNFO32', 'HWiNFO' -ErrorAction SilentlyContinue | ForEach-Object {
        try {
            [pscustomobject]@{
                Id = $_.Id
                ProcessName = $_.ProcessName
                StartedAt = $_.StartTime.ToUniversalTime()
            }
        }
        catch { }
    })
}

function Remove-ObsUiStateFile([string]$Path) {
    if (Test-Path -LiteralPath $Path -PathType Leaf) {
        Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    }
}

function Write-ObsUiJsonFile([string]$Path, $Payload) {
    $directory = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $directory -PathType Container)) {
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }
    $temporaryPath = "$Path.$PID.tmp"
    $Payload | ConvertTo-Json -Compress | Set-Content -LiteralPath $temporaryPath -Encoding UTF8
    Move-Item -LiteralPath $temporaryPath -Destination $Path -Force
}

function Get-ObsUiOwner {
    try {
        return Get-Content -LiteralPath $ownerPath -Raw -Encoding UTF8 | ConvertFrom-Json
    }
    catch {
        return $null
    }
}

function Test-ObsUiRetryCooldown {
    try {
        $retry = Get-Content -LiteralPath $retryPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $retryAfter = [DateTime]::Parse([string]$retry.retryAfter, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind)
        return $retryAfter -gt [DateTime]::UtcNow
    }
    catch {
        return $false
    }
}

function Set-ObsUiRetryCooldown {
    Write-ObsUiJsonFile $retryPath ([ordered]@{ retryAfter = [DateTime]::UtcNow.AddSeconds(30).ToString('o') })
}

try {
    try {
        $mutexAcquired = $mutex.WaitOne([TimeSpan]::FromSeconds(15))
    }
    catch [Threading.AbandonedMutexException] {
        $mutexAcquired = $true
    }
    if (-not $mutexAcquired) {
        Write-ObsUiResult @{ status = 'busy' }
        return
    }

    if ($Action -eq 'Status') {
        $process = Get-ObsUiHWiNFOProcesses | Select-Object -First 1
        Write-ObsUiResult @{ status = if ($process) { 'running' } else { 'stopped' }; pid = if ($process) { [int]$process.Id } else { $null } }
        return
    }

    if ($Action -eq 'Start') {
        $existing = Get-ObsUiHWiNFOProcesses | Select-Object -First 1
        if ($existing) {
            Remove-ObsUiStateFile $retryPath
            Write-ObsUiResult @{ status = 'already-running'; pid = [int]$existing.Id }
            return
        }
        if (Test-ObsUiRetryCooldown) {
            Write-ObsUiResult @{ status = 'cooldown' }
            return
        }

        Remove-ObsUiStateFile $ownerPath
        Remove-ObsUiStateFile $stopRequestPath
        $task = $null
        # Task Scheduler can take several seconds to materialize the elevated
        # interactive process during a cold login. Keep polling instead of
        # entering the retry cooldown while HWiNFO is still starting.
        $taskReadyDeadline = [DateTime]::UtcNow.AddSeconds(12)
        do {
            $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
            if ($task) {
                break
            }
            Start-Sleep -Milliseconds 300
        } while ([DateTime]::UtcNow -lt $taskReadyDeadline)
        if (-not $task) {
            Set-ObsUiRetryCooldown
            Write-ObsUiResult @{ status = 'task-unavailable' }
            return
        }

        for ($attempt = 1; $attempt -le 2; $attempt++) {
            $existing = Get-ObsUiHWiNFOProcesses | Select-Object -First 1
            if ($existing) {
                Remove-ObsUiStateFile $retryPath
                Write-ObsUiResult @{ status = 'already-running'; pid = [int]$existing.Id }
                return
            }

            $beforeIds = @(Get-ObsUiHWiNFOProcesses | ForEach-Object Id)
            $launchStartedAt = [DateTime]::UtcNow.AddSeconds(-2)
            $startSucceeded = $false
            try {
                $task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
                if ($task.State -ne 'Running') {
                    Start-ScheduledTask -TaskName $taskName -ErrorAction Stop
                }
                $startSucceeded = $true
            }
            catch {
                if ($attempt -lt 2) {
                    Start-Sleep -Milliseconds 500
                }
            }

            if ($startSucceeded) {
                $deadline = [DateTime]::UtcNow.AddSeconds(15)
                do {
                    Start-Sleep -Milliseconds 400
                    $newProcess = Get-ObsUiHWiNFOProcesses |
                        Where-Object { $beforeIds -notcontains $_.Id -and $_.StartedAt -ge $launchStartedAt } |
                        Sort-Object StartedAt -Descending |
                        Select-Object -First 1
                    if ($newProcess) {
                        Write-ObsUiJsonFile $ownerPath ([ordered]@{
                            pid = [int]$newProcess.Id
                            processName = [string]$newProcess.ProcessName
                            startedAt = $newProcess.StartedAt.ToString('o')
                        })
                        Remove-ObsUiStateFile $retryPath
                        Write-ObsUiResult @{ status = 'started'; pid = [int]$newProcess.Id; processName = [string]$newProcess.ProcessName; startedAt = $newProcess.StartedAt.ToString('o') }
                        return
                    }
                } while ([DateTime]::UtcNow -lt $deadline)
            }

            if ($attempt -lt 2) {
                Start-Sleep -Milliseconds 500
            }
        }

        Set-ObsUiRetryCooldown
        Write-ObsUiResult @{ status = 'task-failed' }
        return
    }

    $owner = Get-ObsUiOwner
    if (-not $owner) {
        Remove-ObsUiStateFile $ownerPath
        Write-ObsUiResult @{ status = 'not-owned' }
        return
    }

    $targetPid = 0
    if (-not [int]::TryParse([string]$owner.pid, [ref]$targetPid) -or $targetPid -le 0) {
        Remove-ObsUiStateFile $ownerPath
        Write-ObsUiResult @{ status = 'not-owned' }
        return
    }
    $process = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
    if (-not $process) {
        Remove-ObsUiStateFile $ownerPath
        Write-ObsUiResult @{ status = 'already-closed' }
        return
    }
    try {
        $expectedStart = [DateTime]::Parse([string]$owner.startedAt, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind)
        $actualStart = $process.StartTime.ToUniversalTime()
    }
    catch {
        Write-ObsUiResult @{ status = 'unavailable' }
        return
    }
    if (@('HWiNFO64', 'HWiNFO32', 'HWiNFO') -notcontains $process.ProcessName -or [Math]::Abs(($actualStart - $expectedStart).TotalSeconds) -gt 3) {
        Remove-ObsUiStateFile $ownerPath
        Write-ObsUiResult @{ status = 'not-owned' }
        return
    }

    Write-ObsUiJsonFile $stopRequestPath ([ordered]@{ pid = $targetPid; requestedAt = [DateTime]::UtcNow.ToString('o') })
    $deadline = [DateTime]::UtcNow.AddSeconds(8)
    do {
        Start-Sleep -Milliseconds 300
        $process = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
    } while ($process -and [DateTime]::UtcNow -lt $deadline)
    if ($process) {
        Write-ObsUiResult @{ status = 'unavailable' }
        return
    }
    Remove-ObsUiStateFile $stopRequestPath
    Remove-ObsUiStateFile $ownerPath
    Write-ObsUiResult @{ status = 'closed' }
}
catch {
    Write-ObsUiResult @{ status = 'unavailable' }
}
finally {
    if ($mutexAcquired) {
        try { $mutex.ReleaseMutex() } catch { }
    }
    $mutex.Dispose()
}

[CmdletBinding()]
param(
    [switch]$Apply,
    [switch]$NoWrite
)

$ErrorActionPreference = 'Stop'
if ($Apply -and $NoWrite) {
    throw 'Apply 与 NoWrite 不能同时使用。'
}

$harnessRoot = Split-Path -Parent $PSScriptRoot
$workspaceRoot = Split-Path -Parent $harnessRoot
$pwsh = 'C:\Program Files\PowerShell\7\pwsh.exe'

function Invoke-ResearchKBStep {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$TaskPath,
        [string[]]$Arguments = @()
    )

    Write-Output ("[ResearchKB weekly] {0}" -f $Name)
    $output = (& $pwsh -NoLogo -NoProfile -File $TaskPath @Arguments 2>&1 | Out-String)
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        Write-Output $output
        throw "ResearchKB weekly step failed: $Name (exit $exitCode)"
    }
    Write-Output ("[ResearchKB weekly] {0} completed" -f $Name)
}

Set-Location -LiteralPath $workspaceRoot
$tasksRoot = Join-Path $harnessRoot 'tasks'
$readOnly = -not $Apply

if ($readOnly) {
    # Manual invocation is read-only by default, including staging/state files.
    Invoke-ResearchKBStep -Name 'compile (no-write)' -TaskPath (Join-Path $tasksRoot 'run-knowledge-compile-weekly.ps1') -Arguments @('-NoWrite')
    Invoke-ResearchKBStep -Name 'maintenance (no-write)' -TaskPath (Join-Path $tasksRoot 'run-knowledge-maintenance-weekly.ps1') -Arguments @('-NoWrite')
    Invoke-ResearchKBStep -Name 'usage (no-write)' -TaskPath (Join-Path $tasksRoot 'run-knowledge-usage-weekly.ps1') -Arguments @('-NoWrite')
    Invoke-ResearchKBStep -Name 'upgrade (no-write)' -TaskPath (Join-Path $tasksRoot 'run-knowledge-upgrade-weekly.ps1') -Arguments @('-NoWrite')
    Invoke-ResearchKBStep -Name 'Areas (no-write)' -TaskPath (Join-Path $tasksRoot 'run-knowledge-areas-weekly.ps1') -Arguments @('-NoWrite')
    exit 0
}

# The scheduled task is the explicit apply boundary.  Compile is included
# before maintenance because maintenance reports the latest Curated result;
# it reuses the existing v3/Codex compiler and does not create a second rule.
Invoke-ResearchKBStep -Name 'compile (Codex + apply)' -TaskPath (Join-Path $tasksRoot 'run-knowledge-compile-weekly.ps1') -Arguments @('-Codex', '-Apply')
Invoke-ResearchKBStep -Name 'maintenance (apply)' -TaskPath (Join-Path $tasksRoot 'run-knowledge-maintenance-weekly.ps1') -Arguments @('-Apply')
Invoke-ResearchKBStep -Name 'usage aggregate' -TaskPath (Join-Path $tasksRoot 'run-knowledge-usage-weekly.ps1') -Arguments @()
Invoke-ResearchKBStep -Name '90-day upgrade' -TaskPath (Join-Path $tasksRoot 'run-knowledge-upgrade-weekly.ps1') -Arguments @()
Invoke-ResearchKBStep -Name 'Curated to Areas (apply)' -TaskPath (Join-Path $tasksRoot 'run-knowledge-areas-weekly.ps1') -Arguments @('-Apply')
exit 0

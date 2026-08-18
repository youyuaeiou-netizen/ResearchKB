[CmdletBinding()]
param(
    [switch]$Network
)
$ErrorActionPreference = 'Stop'
$harnessRoot = Split-Path -Parent $PSScriptRoot
$workspaceRoot = Split-Path -Parent $harnessRoot
. (Join-Path $PSScriptRoot 'Resolve-ResearchKBPython.ps1')
$python = Resolve-ResearchKBPython -Horizon
$script = Join-Path $harnessRoot 'scripts\horizon_fetch_only.py'
Set-Location -LiteralPath $workspaceRoot
$mode = if ($Network) { '--network' } else { '--dry-run' }
& $python $script $mode
exit $LASTEXITCODE

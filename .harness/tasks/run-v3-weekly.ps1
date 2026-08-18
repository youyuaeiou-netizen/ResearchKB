$ErrorActionPreference = 'Stop'
$harnessRoot = Split-Path -Parent $PSScriptRoot
$workspaceRoot = Split-Path -Parent $harnessRoot
. (Join-Path $PSScriptRoot 'Resolve-ResearchKBPython.ps1')
$python = Resolve-ResearchKBPython
$script = Join-Path $harnessRoot 'scripts\researchkb_v3.py'
Set-Location -LiteralPath $workspaceRoot
& $python $script weekly
exit $LASTEXITCODE

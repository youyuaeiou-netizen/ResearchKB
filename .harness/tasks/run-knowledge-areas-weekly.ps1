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
. (Join-Path $PSScriptRoot 'Resolve-ResearchKBPython.ps1')
$python = Resolve-ResearchKBPython
$script = Join-Path $harnessRoot 'scripts\knowledge_areas.py'

Set-Location -LiteralPath $workspaceRoot
$arguments = @($script, 'sync', '--root', $workspaceRoot)
if ($Apply) {
    $arguments += '--apply'
}
if ($NoWrite) {
    $arguments += '--no-write'
}
& $python @arguments
exit $LASTEXITCODE

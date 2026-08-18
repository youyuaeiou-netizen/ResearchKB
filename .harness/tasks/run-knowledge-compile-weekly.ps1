[CmdletBinding()]
param(
    [switch]$Codex,
    [switch]$Apply,
    [switch]$NoWrite
)

$ErrorActionPreference = 'Stop'
$harnessRoot = Split-Path -Parent $PSScriptRoot
$workspaceRoot = Split-Path -Parent $harnessRoot
. (Join-Path $PSScriptRoot 'Resolve-ResearchKBPython.ps1')
$python = Resolve-ResearchKBPython
$script = Join-Path $harnessRoot 'scripts\knowledge_lifecycle.py'

Set-Location -LiteralPath $workspaceRoot
$arguments = @($script, 'compile', '--root', $workspaceRoot)
if ($Codex) {
    $arguments += '--codex'
}
if ($Apply) {
    $arguments += '--apply'
}
if ($NoWrite) {
    $arguments += '--no-write'
}
& $python @arguments
exit $LASTEXITCODE

[CmdletBinding()]
param(
    [switch]$Apply
)

$ErrorActionPreference = 'Stop'
$harnessRoot = Split-Path -Parent $PSScriptRoot
$workspaceRoot = Split-Path -Parent $harnessRoot
. (Join-Path $PSScriptRoot 'Resolve-ResearchKBPython.ps1')
$python = Resolve-ResearchKBPython
$script = Join-Path $harnessRoot 'scripts\knowledge_raw_migrate.py'

Set-Location -LiteralPath $workspaceRoot
$arguments = @($script, '--root', $workspaceRoot)
if ($Apply) {
    $arguments += '--apply'
}
& $python @arguments
exit $LASTEXITCODE

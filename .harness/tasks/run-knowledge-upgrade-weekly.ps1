[CmdletBinding()]
param(
    [switch]$NoWrite
)

$ErrorActionPreference = 'Stop'
$harnessRoot = Split-Path -Parent $PSScriptRoot
$workspaceRoot = Split-Path -Parent $harnessRoot
. (Join-Path $PSScriptRoot 'Resolve-ResearchKBPython.ps1')
$python = Resolve-ResearchKBPython
$script = Join-Path $harnessRoot 'scripts\knowledge_upgrade.py'

Set-Location -LiteralPath $workspaceRoot
$arguments = @($script, 'evaluate', '--root', $workspaceRoot)
if ($NoWrite) {
    $arguments += '--no-write'
}
& $python @arguments
exit $LASTEXITCODE

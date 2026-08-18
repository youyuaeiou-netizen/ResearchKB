[CmdletBinding()]
param(
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$harnessRoot = Split-Path -Parent $PSScriptRoot
$workspaceRoot = Split-Path -Parent $harnessRoot
$canonicalTask = Join-Path $PSScriptRoot 'run-horizon-weekly-digest.ps1'

Set-Location -LiteralPath $workspaceRoot
$arguments = @()
if ($Force) {
    $arguments += '-Force'
}
Write-Verbose 'run-horizon-daily-digest.ps1 is a compatibility alias for run-horizon-weekly-digest.ps1.'
& $canonicalTask @arguments
exit $LASTEXITCODE

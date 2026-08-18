[CmdletBinding()]
param(
    [ValidateSet('prepare', 'status', 'start', 'checkpoint', 'finalize', 'apply')]
    [string]$ReviewCommand = 'prepare',
    [string]$Quarter,
    [string]$BatchId,
    [string]$AnswersFile,
    [string]$ActionsFile,
    [string]$Confirm,
    [switch]$NoWrite
)

$ErrorActionPreference = 'Stop'
$harnessRoot = Split-Path -Parent $PSScriptRoot
$workspaceRoot = Split-Path -Parent $harnessRoot
. (Join-Path $PSScriptRoot 'Resolve-ResearchKBPython.ps1')
$python = Resolve-ResearchKBPython
$script = Join-Path $harnessRoot 'scripts\knowledge_review.py'

Set-Location -LiteralPath $workspaceRoot
$arguments = @($script, $ReviewCommand, '--root', $workspaceRoot)
if ($Quarter) {
    $arguments += @('--quarter', $Quarter)
}
if ($BatchId) {
    $arguments += @('--batch-id', $BatchId)
}
if ($AnswersFile) {
    $arguments += @('--answers-file', $AnswersFile)
}
if ($ActionsFile) {
    $arguments += @('--actions-file', $ActionsFile)
}
if ($Confirm) {
    $arguments += @('--confirm', $Confirm)
}
if ($NoWrite) {
    $arguments += '--no-write'
}
& $python @arguments
exit $LASTEXITCODE

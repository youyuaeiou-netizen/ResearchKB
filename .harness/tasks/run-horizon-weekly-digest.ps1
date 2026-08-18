[CmdletBinding()]
param(
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$harnessRoot = Split-Path -Parent $PSScriptRoot
$workspaceRoot = Split-Path -Parent $harnessRoot
. (Join-Path $PSScriptRoot 'Resolve-ResearchKBPython.ps1')
$python = Resolve-ResearchKBPython -Horizon
$script = Join-Path $harnessRoot 'scripts\horizon_daily_digest.py'

Set-Location -LiteralPath $workspaceRoot
if (-not $Force) {
    $timezone = [TimeZoneInfo]::FindSystemTimeZoneById('China Standard Time')
    $scheduledNow = [TimeZoneInfo]::ConvertTime([DateTimeOffset]::UtcNow, $timezone)
    $minutesSinceMidnight = $scheduledNow.Hour * 60 + $scheduledNow.Minute
    $withinScheduledWindow = (
        $scheduledNow.DayOfWeek -eq [DayOfWeek]::Sunday -and
        $minutesSinceMidnight -ge 720 -and
        $minutesSinceMidnight -le 749
    )
    if (-not $withinScheduledWindow) {
        [ordered]@{
            status = 'SKIPPED_OUTSIDE_SCHEDULE_WINDOW'
            reason = 'Automatic Horizon weekly runs are allowed only on Sunday 12:00-12:29 Asia/Shanghai; use -Force for an explicit manual run.'
            evaluated_at = $scheduledNow.ToString('o')
            timezone = 'Asia/Shanghai'
        } | ConvertTo-Json -Compress
        exit 0
    }
}
$arguments = @($script, '--network')
if ($Force) {
    $arguments += '--force'
}
& $python @arguments
exit $LASTEXITCODE

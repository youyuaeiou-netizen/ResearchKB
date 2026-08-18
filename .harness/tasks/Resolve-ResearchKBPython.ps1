Set-StrictMode -Version Latest

function Resolve-ResearchKBPython {
    [CmdletBinding()]
    param(
        [switch]$Horizon
    )

    $environmentVariable = if ($Horizon) { 'RESEARCHKB_HORIZON_PYTHON' } else { 'RESEARCHKB_PYTHON' }
    $configured = [Environment]::GetEnvironmentVariable($environmentVariable)
    if ($configured) {
        if (Test-Path -LiteralPath $configured -PathType Leaf) {
            return (Resolve-Path -LiteralPath $configured).Path
        }
        throw "$environmentVariable points to a missing Python executable: $configured"
    }

    $harnessRoot = Split-Path -Parent $PSScriptRoot
    if ($Horizon) {
        $horizonPython = Join-Path $harnessRoot 'vendor\Horizon\.venv\Scripts\python.exe'
        if (Test-Path -LiteralPath $horizonPython -PathType Leaf) {
            return (Resolve-Path -LiteralPath $horizonPython).Path
        }
        throw 'Horizon Python environment is missing. Run `uv sync --project .harness/vendor/Horizon --extra twitter`, or set RESEARCHKB_HORIZON_PYTHON to its python.exe.'
    }

    $candidates = @()
    if ($env:USERPROFILE) {
        $candidates += Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
    }
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }

    $python = Get-Command python -CommandType Application -ErrorAction SilentlyContinue |
        Where-Object { $_.Source -notmatch '\\WindowsApps\\' } |
        Select-Object -First 1
    if ($python) {
        return $python.Source
    }
    throw 'No usable Python was found. Install Python 3.11+ or set RESEARCHKB_PYTHON to python.exe.'
}

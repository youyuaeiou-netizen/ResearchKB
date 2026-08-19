[CmdletBinding()]
param(
    [int]$Port = 5173
)

$ErrorActionPreference = 'Stop'

$appRoot = Split-Path -Parent $PSScriptRoot
$hostName = '127.0.0.1'
$url = "http://${hostName}:$Port/"

function Test-ObsUiReady {
    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
        return ($response.StatusCode -eq 200 -and $response.Content -match 'ObsUI')
    }
    catch {
        return $false
    }
}

if (-not (Test-ObsUiReady)) {
    $pnpm = (Get-Command pnpm.cmd -ErrorAction SilentlyContinue).Source
    if ([string]::IsNullOrWhiteSpace($pnpm)) {
        $fallback = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd'
        if (Test-Path -LiteralPath $fallback -PathType Leaf) {
            $pnpm = $fallback
        }
    }
    if ([string]::IsNullOrWhiteSpace($pnpm)) {
        throw '找不到 pnpm.cmd。请先安装 pnpm，或在应用目录运行 pnpm install。'
    }
    if (-not (Test-Path -LiteralPath (Join-Path $appRoot 'package.json') -PathType Leaf)) {
        throw "ObsUI 应用目录不完整：$appRoot"
    }

    $server = Start-Process -FilePath $pnpm -ArgumentList @('dev', '--', '--host', $hostName, '--port', $Port) -WorkingDirectory $appRoot -WindowStyle Hidden -PassThru
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    do {
        Start-Sleep -Milliseconds 500
        if ($server.HasExited) {
            throw "ObsUI Vite 进程提前退出，退出码：$($server.ExitCode)"
        }
    } while (-not (Test-ObsUiReady) -and [DateTime]::UtcNow -lt $deadline)

    if (-not (Test-ObsUiReady)) {
        throw "ObsUI 未能在 $url 启动"
    }
}

Start-Process $url

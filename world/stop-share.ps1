$ErrorActionPreference = 'Stop'
$TownRoot = $PSScriptRoot
$TownData = Join-Path $TownRoot 'backend\data'
foreach ($TownService in @('cloudflared','share')) {
    $TownPidFile = Join-Path $TownData "$TownService.pid"
    if (-not (Test-Path -LiteralPath $TownPidFile)) { continue }
    $TownProcessId = 0
    if (-not [int]::TryParse((Get-Content -LiteralPath $TownPidFile -Raw).Trim(), [ref]$TownProcessId)) { continue }
    $TownProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$TownProcessId" -ErrorAction SilentlyContinue
    if (-not $TownProcess) { continue }
    $TownValid = if ($TownService -eq 'cloudflared') {
        $TownProcess.ExecutablePath -eq (Join-Path $TownRoot 'tools\cloudflared.exe') -and $TownProcess.CommandLine -match '127\.0\.0\.1:8002'
    } else {
        $TownProcess.ExecutablePath -eq (Join-Path $TownRoot '.venv\Scripts\python.exe') -and $TownProcess.CommandLine -match 'app\.share:app'
    }
    if ($TownValid) {
        # The venv launcher may own a child running the real Python interpreter.
        $TownChildren = Get-CimInstance Win32_Process -Filter "ParentProcessId=$TownProcessId" -ErrorAction SilentlyContinue
        foreach ($TownChild in $TownChildren) {
            if ($TownChild.CommandLine -match 'app\.share:app') { Stop-Process -Id $TownChild.ProcessId -Force -ErrorAction SilentlyContinue }
        }
        Stop-Process -Id $TownProcessId -Force -ErrorAction SilentlyContinue
        Write-Host "Stopped $TownService ($TownProcessId)."
    }
}


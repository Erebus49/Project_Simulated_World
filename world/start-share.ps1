$ErrorActionPreference = 'Stop'
$TownRoot = $PSScriptRoot
$TownData = Join-Path $TownRoot 'backend\data'
$TownPython = Join-Path $TownRoot '.venv\Scripts\python.exe'
$TownCloudflared = Join-Path $TownRoot 'tools\cloudflared.exe'
if (-not (Test-Path -LiteralPath $TownCloudflared)) { throw 'Missing tools/cloudflared.exe. Download the official Windows amd64 cloudflared release first.' }
try { $null = Invoke-RestMethod 'http://127.0.0.1:8000/api/health' -TimeoutSec 3 }
catch { throw 'Start the local game with start.bat first (port 8000).' }
if (Get-NetTCPConnection -LocalPort 8002 -State Listen -ErrorAction SilentlyContinue) { throw 'A share gateway is already running. Use stop-share.ps1 before restarting it.' }
New-Item -ItemType Directory -Force -Path $TownData | Out-Null
$TownShareProcess = $null
$TownTunnelProcess = $null
try {
    $TownShareProcess = Start-Process -FilePath $TownPython -ArgumentList @('-m','uvicorn','app.share:app','--host','127.0.0.1','--port','8002','--no-access-log') -WorkingDirectory (Join-Path $TownRoot 'backend') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $TownData 'share.log') -RedirectStandardError (Join-Path $TownData 'share.error.log') -PassThru
    $TownShareProcess.Id | Set-Content -LiteralPath (Join-Path $TownData 'share.pid')
    $TownTunnelProcess = Start-Process -FilePath $TownCloudflared -ArgumentList @('tunnel','--url','http://127.0.0.1:8002','--protocol','http2','--no-autoupdate') -WorkingDirectory $TownRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $TownData 'cloudflared.stdout.log') -RedirectStandardError (Join-Path $TownData 'cloudflared.log') -PassThru
    $TownTunnelProcess.Id | Set-Content -LiteralPath (Join-Path $TownData 'cloudflared.pid')
    $TownPublicUrl = $null
    for ($TownAttempt = 0; $TownAttempt -lt 30; $TownAttempt++) {
        if ($TownTunnelProcess.HasExited) { throw 'Tunnel exited. Inspect backend/data/cloudflared.log.' }
        $TownLog = Get-Content -LiteralPath (Join-Path $TownData 'cloudflared.log') -Raw -ErrorAction SilentlyContinue
        if ($TownLog -match 'https://[a-z0-9-]+\.trycloudflare\.com') { $TownPublicUrl = $Matches[0]; break }
        Start-Sleep -Seconds 1
    }
    if (-not $TownPublicUrl) { throw 'No public URL received. Inspect backend/data/cloudflared.log.' }
    $TownAccess = Get-Content -LiteralPath (Join-Path $TownData 'share-access.json') -Raw | ConvertFrom-Json
    $TownPrivateUrl = "$TownPublicUrl/enter/$($TownAccess.token)"
    $TownPrivateUrl | Set-Content -LiteralPath (Join-Path $TownData 'share-url.txt')
    Write-Host "Private play link: $TownPrivateUrl" -ForegroundColor Green
    Write-Host 'Temporary Cloudflare tunnel. Keep this session running; Ctrl+C or stop-share.ps1 stops sharing.'
    while (-not $TownTunnelProcess.HasExited) { Start-Sleep -Seconds 1 }
}
finally {
    & (Join-Path $TownRoot 'stop-share.ps1')
}


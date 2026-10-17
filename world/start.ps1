param([int]$Port = 8000)
$ErrorActionPreference = 'Stop'
$ProjectRoot = $PSScriptRoot
$OriginalDirectory = Get-Location
try {
    Set-Location -LiteralPath $ProjectRoot
    $PythonPath = Join-Path $ProjectRoot '.venv\Scripts\python.exe'
    if (-not (Test-Path -LiteralPath $PythonPath)) {
        Write-Host 'Creating Python environment...'
        python -m venv .venv
        if ($LASTEXITCODE -ne 0) { throw 'Python 3.11+ is required.' }
    }
    & $PythonPath -c 'import importlib.util,sys; sys.exit(0 if all(importlib.util.find_spec(m) for m in ["fastapi","uvicorn","httpx","dotenv","yaml","pytest"]) else 1)'
    if ($LASTEXITCODE -ne 0) {
        & $PythonPath -m pip install -r backend/requirements.txt
        if ($LASTEXITCODE -ne 0) { throw 'Python dependency installation failed.' }
    }
    Set-Location -LiteralPath (Join-Path $ProjectRoot 'frontend')
    if (-not (Test-Path -LiteralPath 'node_modules')) {
        & npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
    }
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
    Set-Location -LiteralPath (Join-Path $ProjectRoot 'backend')
    Write-Host "Pinecone Town: http://127.0.0.1:$Port (Ctrl+C to stop)" -ForegroundColor Green
    & $PythonPath -m uvicorn app.main:app --host 127.0.0.1 --port $Port
    if ($LASTEXITCODE -ne 0) { throw 'Server exited. Check whether the port is in use.' }
}
finally { Set-Location -LiteralPath $OriginalDirectory }


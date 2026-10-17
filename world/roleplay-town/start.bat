@echo off
cd /d "%~dp0"
if not exist "node_modules\tsx" (
    call npm ci
    if errorlevel 1 goto failed
)
call npm run build
if errorlevel 1 goto failed
call npm start
if errorlevel 1 goto failed
exit /b 0
:failed
echo Runtime startup failed. Please check the output above.
pause
exit /b 1

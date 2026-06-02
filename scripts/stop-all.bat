@echo off
setlocal

echo [Stop] Stopping Docker services...
cd /d "%~dp0.."
docker compose down

echo [Stop] Checking port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr "0.0.0.0:3000" ^| findstr "LISTENING"') do (
    if not "%%a"=="0" (
        echo [Stop] Killing PID %%a on port 3000...
        taskkill /F /PID %%a >nul 2>&1
    )
)

echo [Stop] Checking port 3001...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr "0.0.0.0:3001" ^| findstr "LISTENING"') do (
    if not "%%a"=="0" (
        echo [Stop] Killing PID %%a on port 3001...
        taskkill /F /PID %%a >nul 2>&1
    )
)

echo [Stop] All services stopped.
pause
endlocal

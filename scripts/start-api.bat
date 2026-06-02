@echo off
setlocal

echo [API] Checking port 3001...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr "0.0.0.0:3001" ^| findstr "LISTENING"') do (
    if not "%%a"=="0" (
        echo [API] Killing PID %%a on port 3001...
        taskkill /F /PID %%a >nul 2>&1
        if errorlevel 1 (
            echo [API] Failed to kill PID %%a, trying PowerShell...
            powershell -Command "try { Stop-Process -Id %%a -Force } catch {}"
        )
        timeout /t 1 /nobreak >nul
    )
)

echo [API] Starting API server...
cd /d "%~dp0..\apps\api"
start "API Server (NestJS)" cmd /c "pnpm start:dev"

echo [API] Server window opened.
endlocal

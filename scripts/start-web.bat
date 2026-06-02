@echo off
setlocal

echo [Web] Checking port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr "0.0.0.0:3000" ^| findstr "LISTENING"') do (
    if not "%%a"=="0" (
        echo [Web] Killing PID %%a on port 3000...
        taskkill /F /PID %%a >nul 2>&1
        if errorlevel 1 (
            echo [Web] Failed to kill PID %%a, trying PowerShell...
            powershell -Command "try { Stop-Process -Id %%a -Force } catch {}"
        )
        timeout /t 1 /nobreak >nul
    )
)

echo [Web] Starting Web dev server...
cd /d "%~dp0..\apps\web"
start "Web Server (Next.js)" cmd /c "pnpm dev"

echo [Web] Server window opened.
endlocal

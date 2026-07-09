@echo off
setlocal

cd /d "%~dp0"

echo Stopping Node dev servers...
taskkill /F /IM node.exe >nul 2>nul

echo Stopping Docker containers...
docker compose down

echo.
echo Local dev stopped.
pause

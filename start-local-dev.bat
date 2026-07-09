@echo off
setlocal

cd /d "%~dp0"

echo ==========================================
echo Starting LetsChat local development...
echo ==========================================

where docker >nul 2>nul
if errorlevel 1 (
  echo ERROR: Docker is not installed or not in PATH.
  pause
  exit /b 1
)

where pnpm >nul 2>nul
if errorlevel 1 (
  echo ERROR: pnpm is not installed or not in PATH.
  pause
  exit /b 1
)

if not exist ".\scripts\start-local-dev.ps1" (
  echo ERROR: scripts\start-local-dev.ps1 not found.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\start-local-dev.ps1"

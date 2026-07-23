@echo off
setlocal

cd /d "%~dp0"

if not exist ".\scripts\setup-local-account.ps1" (
  echo ERROR: scripts\setup-local-account.ps1 not found.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\setup-local-account.ps1" %*

endlocal

@echo off
setlocal

cd /d "%~dp0"

if not exist ".\scripts\restore-letschat-local-data.ps1" (
  echo ERROR: scripts\restore-letschat-local-data.ps1 not found.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\restore-letschat-local-data.ps1" %*
if errorlevel 1 (
  pause
  exit /b 1
)

endlocal

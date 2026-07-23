@echo off
setlocal

cd /d "%~dp0"

echo ==========================================
echo Starting LetsChat Vercel frontend with local backend...
echo ==========================================

if not exist ".\start-vercel-local-backend.bat" (
  echo ERROR: start-vercel-local-backend.bat not found.
  pause
  exit /b 1
)

echo.
echo Reusing existing Vercel-local backend launcher...
call ".\start-vercel-local-backend.bat"
if errorlevel 1 (
  echo ERROR: Backend startup failed.
  pause
  exit /b 1
)

echo.
echo Waiting for local API health endpoint...
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\wait-for-local-api-health.ps1"
if errorlevel 1 (
  pause
  exit /b 1
)

set "OPEN_URL=https://lets-chat-web.vercel.app/login?apiUrl=http://localhost:3001/api/v1&wsUrl=ws://localhost:3001"
echo.
echo Opening browser with local API override...
start "" "%OPEN_URL%"

echo.
echo ==========================================
echo Vercel frontend is connected to LOCAL API.
echo Database: letschat_local
echo Postgres volume is preserved.
echo Do not use the plain Vercel URL without the local override.
echo ==========================================

endlocal

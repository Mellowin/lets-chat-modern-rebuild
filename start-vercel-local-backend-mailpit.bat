@echo off
setlocal

cd /d "%~dp0"

echo ==========================================
echo Starting LetsChat Vercel + local backend with Mailpit...
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

echo Checking Docker engine...
docker info >nul 2>nul
if not errorlevel 1 (
  echo Docker is already running.
  goto docker_ready
)

echo Docker engine is not running. Trying to start Docker Desktop...

set "DOCKER_DESKTOP=%ProgramFiles%\Docker\Docker\Docker Desktop.exe"

if not exist "%DOCKER_DESKTOP%" (
  set "DOCKER_DESKTOP=%LocalAppData%\Docker\Docker Desktop.exe"
)

if not exist "%DOCKER_DESKTOP%" (
  set "DOCKER_DESKTOP=%LocalAppData%\Programs\Docker\Docker\Docker Desktop.exe"
)

if not exist "%DOCKER_DESKTOP%" (
  echo ERROR: Docker Desktop executable was not found.
  echo Open Docker Desktop once manually or check installation path.
  pause
  exit /b 1
)

start "" "%DOCKER_DESKTOP%"

echo Waiting for Docker Desktop to become ready...
set /a WAITED=0

:wait_docker
docker info >nul 2>nul
if not errorlevel 1 (
  echo Docker is ready.
  goto docker_ready
)

if %WAITED% GEQ 180 (
  echo ERROR: Docker Desktop did not become ready within 180 seconds.
  echo Check Docker Desktop window for errors, updates, WSL problems, or login prompts.
  pause
  exit /b 1
)

timeout /t 3 /nobreak >nul
set /a WAITED+=3
echo Still waiting for Docker... %WAITED%s
goto wait_docker

:docker_ready

echo.
echo Starting Vercel local backend script with Mailpit...
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\start-local-dev.ps1" -VercelBackend -Mailpit

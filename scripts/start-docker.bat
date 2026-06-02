@echo off
setlocal

cd /d "%~dp0.."

echo [Docker] Starting services (postgres, redis, minio)...
docker compose up -d

echo [Docker] Waiting for postgres to be healthy...
:wait_pg
for /f %%i in ('docker inspect --format="{{.State.Health.Status}}" letschat-postgres 2^>nul') do (
    if "%%i"=="healthy" goto pg_ready
)
timeout /t 2 /nobreak >nul
goto wait_pg

:pg_ready
echo [Docker] Postgres is healthy.
echo [Docker] All services started.
endlocal

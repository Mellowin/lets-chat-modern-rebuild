@echo off
setlocal

cd /d "%~dp0"

echo ==========================================
echo Stopping LetsChat Vercel local backend...
echo ==========================================

echo Stopping LetsChat API processes...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'pnpm.*--filter api start:dev|nest start --watch|apps\\api\\dist\\src\\main' } | ForEach-Object { Write-Host ('Stopping API process PID ' + $_.ProcessId); Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

echo Stopping any process still holding port 3001...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$pids = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($p in $pids) { Write-Host ('Stopping PID ' + $p + ' on port 3001'); Stop-Process -Id $p -Force -ErrorAction SilentlyContinue }"

echo Stopping Docker containers...
docker compose down

echo.
echo Vercel local backend stopped.

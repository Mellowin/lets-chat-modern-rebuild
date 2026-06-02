@echo off
setlocal

echo ==========================================
echo  Lets Chat — Start All Services
echo ==========================================

call "%~dp0start-docker.bat"

echo.
echo [All] Waiting 5 sec for Docker to warm up...
timeout /t 5 /nobreak >nul

call "%~dp0start-api.bat"

echo.
echo [All] Waiting 3 sec for API to start...
timeout /t 3 /nobreak >nul

call "%~dp0start-web.bat"

echo.
echo ==========================================
echo  All services started:
echo    Web:  http://localhost:3000
echo    API:  http://localhost:3001
echo ==========================================

endlocal

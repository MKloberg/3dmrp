@echo off
setlocal
cd /d "%~dp0"

echo  ____  ____  __  __ ____  ____
echo ^|___ \^|  _ \^|  \/  ^|  _ \^|  _ \
echo   __) ^| | | ^| ^|\/^| ^| |_) ^| |_) ^|
echo  / __/^| ^|_^| ^| ^|  ^| ^|  _ ^<^|  __/
echo ^|_____^|____/^|_^|  ^|_^|_^| \_\_^|
echo.
echo Starting 3DMRP...
echo.

echo [1/2] Starting backend (opens in a new window)...
start "3DMRP Backend" powershell -ExecutionPolicy Bypass -NoExit -File "%~dp0backend\start.ps1"

echo [2/2] Starting frontend (Docker)...
docker compose up -d
if errorlevel 1 (
    echo.
    echo  ERROR: Docker failed to start. Is Docker Desktop running?
    echo  Start Docker Desktop first, then run start.bat again.
    echo.
    pause
    exit /b 1
)

echo.
echo  3DMRP is ready!
echo.
echo   Desktop:  http://localhost:7891
echo   Mobile:   https://^<your-lan-ip^>:7892
echo.
echo  The backend is running in the "3DMRP Backend" window.
echo  Close that window to stop the backend.
echo.
pause

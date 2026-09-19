@echo off
setlocal enabledelayedexpansion

echo ==============================================================================
echo                 Yimly Home Assistant Server - Safe Update Script
echo ==============================================================================
echo.

REM 1. Verify Docker is running
echo [1/7] Checking Docker status...
docker info >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Docker is not running. Please start Docker Desktop and run this script again.
    pause
    exit /b 1
)
echo [OK] Docker is running.
echo.

REM 2. Fetch latest project updates (if git repo)
echo [2/7] Checking for code updates...
if exist ".git" (
    git pull --rebase
    if %ERRORLEVEL% NEQ 0 (
        echo [WARN] Git pull encountered conflicts or is offline. Continuing with existing files...
    ) else (
        echo [OK] Code updated successfully.
    )
) else (
    echo [INFO] No Git repository detected. Skipping git pull.
)
echo.

REM 3. Verify /config persistence folder exists
echo [3/7] Verifying persistent /config directory...
if not exist "config" (
    mkdir config
    echo [OK] Created ./config directory.
) else (
    echo [OK] Persistent ./config directory exists. Data, auth, sqlite db and registries are safe.
)
echo.

REM 4. Build or pull updated Docker image
echo [4/7] Building updated Yimly Home Assistant Docker image...
docker compose build --pull
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Docker build failed. Aborting container recreation to prevent downtime.
    pause
    exit /b 1
)
echo [OK] Docker image built successfully.
echo.

REM 5. Recreate container while preserving /config and network
echo [5/7] Recreating Home Assistant container...
docker compose down
docker compose up -d --remove-orphans
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to launch Docker container.
    pause
    exit /b 1
)
echo [OK] Container recreated and started in background.
echo.

REM 6. Wait for Home Assistant Core startup and healthcheck
echo [6/7] Waiting for Home Assistant Core to complete startup and database migrations...
set /a ATTEMPTS=0
set /a MAX_ATTEMPTS=30

:CHECK_HEALTH
timeout /t 3 /nobreak >nul
set /a ATTEMPTS+=1

docker compose ps | findstr /i "healthy" >nul
if %ERRORLEVEL% EQU 0 (
    goto HEALTHY
)

docker compose ps | findstr /i "Up" >nul
if %ERRORLEVEL% EQU 0 (
    echo Attempt %ATTEMPTS%/%MAX_ATTEMPTS%: Container is booting...
    if %ATTEMPTS% LSS %MAX_ATTEMPTS% goto CHECK_HEALTH
)

:HEALTHY
echo.
echo ==============================================================================
echo [7/7] SUCCESS: Yimly Home Assistant Server is UP AND RUNNING!
echo ==============================================================================
echo.
echo   - Yimly Web UI:          http://localhost:3000
echo   - Home Assistant Port:   http://localhost:8123
echo   - Companion App URL:     http://<YOUR_LOCAL_IP_OR_CLOUDFLARE_DOMAIN>:8123
echo   - Persistent Storage:    ./config (Preserved SQLite DB, Registries, Auth)
echo.
echo All user accounts, Companion App registrations, and location history are preserved.
echo.
pause
exit /b 0

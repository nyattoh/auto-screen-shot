@echo off
setlocal ENABLEEXTENSIONS ENABLEDELAYEDEXPANSION
cd /d "%~dp0"

set "WIN_SCREENSHOT_DB_PATH=%CD%\recovered.db"
echo Using local DB: %WIN_SCREENSHOT_DB_PATH%

call npm run build
if errorlevel 1 (
  echo Build failed.
  pause
  exit /b 1
)

start "" npx electron dist\main.js --background
echo Started with local DB. You can close this window.
exit /b 0

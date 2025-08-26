@echo off
setlocal ENABLEDELAYEDEXPANSION
cd /d "%~dp0"

echo ==== Win Screenshot App (background) ====

REM Build
call npm run build
if errorlevel 1 (
  echo Build failed.
  pause
  exit /b 1
)

REM Electron path
set "ELECTRON_EXE=%~dp0node_modules\electron\dist\electron.exe"
if not exist "%ELECTRON_EXE%" (
  echo electron.exe not found: %ELECTRON_EXE%
  echo Run "npm install electron@28" and retry.
  pause
  exit /b 1
)

REM Launch detached (no extra console)
start "" "%ELECTRON_EXE%" "%~dp0dist\main.js" --background

echo Started in background. You can close this window.
exit /b 0

@echo off
setlocal ENABLEEXTENSIONS ENABLEDELAYEDEXPANSION
chcp 65001 >nul
cd /d "%~dp0"

echo ==== Restore by merging all backups (one-click) ====
set "APPDIR=%APPDATA%\win-screenshot-app"
if not exist "%APPDIR%" (
  echo AppData not found: %APPDIR%
  pause
  exit /b 1
)

echo Stopping app (electron.exe)...
taskkill /IM electron.exe /F >nul 2>&1

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js not found in PATH. Please install Node.js or open this repo in a Node-enabled shell.
  pause
  exit /b 1
)

echo Merging all backups under: %APPDIR%
node scripts\restore-from-backups.js "%APPDIR%"
if errorlevel 1 (
  echo Merge failed.
  pause
  exit /b 1
)

echo Starting app...
start "" "%~dp0start.bat"
echo Done. You can close this window.
exit /b 0


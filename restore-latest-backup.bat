@echo off
setlocal ENABLEEXTENSIONS ENABLEDELAYEDEXPANSION
cd /d "%~dp0"

echo ==== Restore latest backup (one-click) ====
set "APPDIR=%APPDATA%\win-screenshot-app"
set "DB=%APPDIR%\usage-statistics.db"

if not exist "%APPDIR%" (
  echo AppData not found: %APPDIR%
  pause
  exit /b 1
)

echo Stopping app (electron.exe)...
taskkill /IM electron.exe /F >nul 2>&1

if exist "%DB%" (
  set "BK=%APPDIR%\usage-statistics.manual-backup.db"
  copy /Y "%DB%" "%BK%" >nul
  echo Current DB backed up to: %BK%
)

set "LATEST="
for /f "delims=" %%f in ('dir /b /o:d "%APPDIR%\usage-statistics.backup.*.db" 2^>nul') do set "LATEST=%%f"

if "%LATEST%"=="" (
  echo No timestamped backups found under: %APPDIR%
  echo If you want to merge all backups, run: restore-merge-all.bat
  pause
  exit /b 1
)

echo Latest backup: %LATEST%
copy /Y "%APPDIR%\%LATEST%" "%DB%" >nul
if errorlevel 1 (
  echo Failed to restore from backup.
  pause
  exit /b 1
)

echo Restored DB: %DB%
echo Starting app...
start "" "%~dp0start.bat"
echo Done. You can close this window.
exit /b 0

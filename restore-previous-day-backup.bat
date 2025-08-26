@echo off
setlocal ENABLEEXTENSIONS ENABLEDELAYEDEXPANSION
cd /d "%~dp0"

set "APPDIR=%APPDATA%\win-screenshot-app"
set "DB=%APPDIR%\usage-statistics.db"

if not exist "%APPDIR%" (
  echo AppData not found: %APPDIR%
  pause
  exit /b 1
)

echo Stopping app (electron.exe)...
taskkill /IM electron.exe /F >nul 2>&1

for /f %%d in ('powershell -NoProfile -Command "(Get-Date).AddDays(-1).ToString(''yyyy-MM-dd'')"') do set YDAY=%%d
echo Yesterday: %YDAY%

set "CANDIDATE="
for /f "delims=" %%f in ('dir /b /o:d "%APPDIR%\usage-statistics.backup.%YDAY%T*.db" 2^>nul') do set "CANDIDATE=%%f"

if "%CANDIDATE%"=="" (
  echo No backup found for yesterday: %YDAY%
  echo Try restore-latest-backup.bat or restore-merge-all.bat
  pause
  exit /b 1
)

echo Found: %CANDIDATE%
if exist "%DB%" copy /Y "%DB%" "%APPDIR%\usage-statistics.manual-backup.db" >nul
copy /Y "%APPDIR%\%CANDIDATE%" "%DB%" >nul
if errorlevel 1 (
  echo Failed to restore yesterday backup.
  pause
  exit /b 1
)

echo Starting app...
start "" "%~dp0start.bat"
echo Done.
exit /b 0


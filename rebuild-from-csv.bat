@echo off
setlocal ENABLEEXTENSIONS ENABLEDELAYEDEXPANSION
cd /d "%~dp0"

if "%~1"=="" (
  echo 使い方: このファイルに CSV をドラッグ&ドロップして実行してください。
  echo 例) rebuild-from-csv.bat "D:\data\merged-usage.csv"
  pause
  exit /b 1
)

set "CSV=%~1"
if not exist "%CSV%" (
  echo CSV が見つかりません: %CSV%
  pause
  exit /b 1
)

set "APPDIR=%APPDATA%\win-screenshot-app"
set "DB=%APPDIR%\usage-statistics.db"
if not exist "%APPDIR%" mkdir "%APPDIR%" >nul 2>&1

echo 停止中... (electron.exe)
taskkill /IM electron.exe /F >nul 2>&1

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js が見つかりません。Node をインストールしてから実行してください。
  pause
  exit /b 1
)

echo CSV から DB を再構築します... ^(%CSV%^)
node scripts\build-db-from-csv.js "%CSV%"
if errorlevel 1 (
  echo 再構築に失敗しました。
  pause
  exit /b 1
)

rem 最新の usage-statistics.new.*.db を usage-statistics.db に差し替え
pushd "%APPDIR%"
set "NEWFILE="
for /f "delims=" %%f in ('dir /b /o:d "usage-statistics.new.*.db" 2^>nul') do set "NEWFILE=%%f"
if not "%NEWFILE%"=="" (
  if exist "usage-statistics.db" ren "usage-statistics.db" "usage-statistics.db.bak" >nul 2>&1
  copy /Y "%NEWFILE%" "usage-statistics.db" >nul
  echo 置き換え完了: %APPDIR%\usage-statistics.db
) else (
  echo 新しい DB ファイルが見つかりませんでした。手動でご確認ください: %APPDIR%
)
popd

echo 起動します...
start "" "%~dp0start.bat"
echo 完了。このウィンドウは閉じて構いません。
exit /b 0


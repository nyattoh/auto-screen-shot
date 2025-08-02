@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo Win Screenshot App - バックグラウンドモード起動
echo =====================================

echo ビルド中...
npm run build
if %errorlevel% neq 0 (
    echo ビルドエラーが発生しました
    pause
    exit /b 1
)

echo バックグラウンドモードでアプリケーションを起動中...
start "" /B npx electron dist/main.js --background

if %errorlevel% neq 0 (
    echo アプリケーション起動エラーが発生しました
    pause
    exit /b 1
)

echo.
echo アプリケーションをバックグラウンドで起動しました。
echo システムトレイアイコンを確認してください。
echo.
echo このウィンドウを閉じてもアプリケーションは動作し続けます。
echo 終了するには、トレイアイコンから「終了」を選択してください。
echo.
echo Electronプロセスが起動していることを確認してください:
tasklist | findstr electron.exe

echo.
echo Enterキーを押して続行...
pause 
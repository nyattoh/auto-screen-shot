@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo Win Screenshot App - フォアグラウンドモード起動
echo ===============================================

echo ビルド中...
npm run build
if %errorlevel% neq 0 (
    echo ビルドエラーが発生しました
    pause
    exit /b 1
)

echo.
echo フォアグラウンドモードでアプリケーションを起動します...
echo - コンソールが表示されます
echo - このウィンドウを閉じるとアプリケーションも終了します
echo - 親プロセスとの接続が維持されます
echo.
echo 終了するには Ctrl+C または q キーを押してください。
echo.

npx electron dist/main.js --foreground

echo.
echo アプリケーションが終了しました。
pause
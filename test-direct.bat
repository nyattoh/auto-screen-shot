@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo === 直接起動テスト ===
echo.

echo ビルド結果確認:
if exist "dist\main.js" (
    echo dist\main.js が存在します
) else (
    echo [ERROR] dist\main.js が存在しません！
    echo ビルドを実行してください: npm run build
    pause
    exit /b 1
)

echo.
echo Electron直接起動（ログ付き）:
echo コマンド: npx electron dist/main.js --background --enable-logging --log-level=verbose
echo.

set ELECTRON_ENABLE_LOGGING=1
npx electron dist/main.js --background --enable-logging --log-level=verbose 2>&1

echo.
echo 終了コード: %errorlevel%
echo.

if exist "error.log" (
    echo === error.log の内容 ===
    type error.log
    echo.
)

pause
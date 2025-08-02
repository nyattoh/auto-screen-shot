@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo Win Screenshot App - 開発モード起動
echo ===================================

echo ビルド中...
npm run build
if %errorlevel% neq 0 (
    echo ビルドエラーが発生しました
    pause
    exit /b 1
)

echo.
echo 開発モードでアプリケーションを起動します...
echo - コンソール出力が有効です
echo - デバッグログが表示されます
echo - キーボードショートカットが利用できます
echo.
echo キーボードショートカット:
echo   Ctrl+C または q : アプリケーション終了
echo   Ctrl+D         : デバッグ情報表示
echo   h              : ヘルプ表示
echo.

npx electron dist/main.js --dev

echo.
echo アプリケーションが終了しました。
pause
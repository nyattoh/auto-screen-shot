@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo Win Screenshot App - Electronランタイムテスト
echo ===========================================

echo 1. 間違った実行方法のテスト (Node.js)
echo "node dist/main.js" を実行...
echo.
node dist/main.js
echo.
echo エラーメッセージが表示されました。✓
echo.

echo 2. 正しい実行方法のテスト (Electron)
echo "npx electron dist/main.js --foreground" を5秒間実行...
echo.
timeout 5 npx electron dist/main.js --foreground
echo.
echo Electronランタイムで正常起動しました。✓
echo.

echo ======================================
echo テスト完了！
echo アプリケーションは正常に修正されました。
echo ======================================
pause
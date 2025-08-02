@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo Win Screenshot App - デバッグモード起動
echo =====================================
echo.

echo Node.js バージョン:
node --version
echo.

echo npm バージョン:
npm --version
echo.

echo 現在のディレクトリ:
echo %CD%
echo.

echo ビルド開始...
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo ビルドエラーが発生しました！
    echo エラーコード: %errorlevel%
    pause
    exit /b 1
)

echo.
echo ビルド成功！
echo.

echo Electronアプリケーションを起動中...
echo コマンド: npx electron dist/main.js --background
echo.

npx electron dist/main.js --background

echo.
echo Electronプロセス終了
echo 終了コード: %errorlevel%
echo.

if %errorlevel% neq 0 (
    echo エラーが発生しました！
)

echo.
echo 詳細なログを確認するには、コマンドプロンプトから以下を実行してください:
echo   npx electron dist/main.js --background
echo.

pause
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

echo 起動コマンドを実行しました...
timeout /t 3 /nobreak >nul

echo Electronプロセスの起動を確認中...
tasklist | findstr electron.exe >nul
if %errorlevel% neq 0 (
    echo 警告: Electronプロセスが見つかりません
    echo アプリケーションの起動に失敗した可能性があります
    echo ログファイルを確認してください: C:\Users\%USERNAME%\AppData\Roaming\Electron\logs\app.log
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
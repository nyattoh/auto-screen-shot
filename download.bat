@echo off
REM ダウンロード用バッチファイル
REM 使用方法: download.bat "ファイル名" "URL"

if "%~1"=="" (
    echo 使用方法: download.bat "ファイル名" "URL"
    pause
    exit /b 1
)

if "%~2"=="" (
    echo 使用方法: download.bat "ファイル名" "URL"
    pause
    exit /b 1
)

echo ダウンロード開始: %~1
echo URL: %~2
echo.

curl -o "%~1" "%~2"

if %errorlevel% neq 0 (
    echo ダウンロードに失敗しました
    pause
    exit /b 1
) else (
    echo ダウンロード完了: %~1
)
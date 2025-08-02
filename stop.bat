@echo off
chcp 65001 >nul
echo 自動スクリーンキャプチャアプリケーションを停止しています...
taskkill /f /im electron.exe >nul 2>&1
echo アプリケーションを停止しました。
timeout /t 2 >nul 
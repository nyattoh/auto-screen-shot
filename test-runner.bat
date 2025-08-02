@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo Win Screenshot App - テスト実行
echo ================================

echo.
echo 1. ビルドを実行中...
npm run build
if %errorlevel% neq 0 (
    echo ビルドに失敗しました
    pause
    exit /b 1
)

echo.
echo 2. 単体テストを実行中...
npm test -- --testPathPattern="service/__tests__" --testNamePattern="^(?!.*integration|.*system)"
if %errorlevel% neq 0 (
    echo 単体テストに失敗しました
    pause
    exit /b 1
)

echo.
echo 3. 統合テストを実行中...
npm test -- --testPathPattern="integration.test.ts"
if %errorlevel% neq 0 (
    echo 統合テストに失敗しました
    pause
    exit /b 1
)

echo.
echo 4. システムテストを実行中...
npm test -- --testPathPattern="system.test.ts"
if %errorlevel% neq 0 (
    echo システムテストに失敗しました
    pause
    exit /b 1
)

echo.
echo ================================
echo すべてのテストが正常に完了しました！
echo ================================
echo.

pause
@echo off
chcp 65001 >nul
title OMU1gradEXP 実験実習システム起動

echo ========================================================
echo   OMU1gradEXP 総合工学システム実験実習 M2 システム
echo ========================================================
echo.

cd /d "%~dp0"

echo Electron アプリケーションを起動中...
call npm start
if %ERRORLEVEL% neq 0 (
    echo.
    echo Electron 起動に失敗したため、ローカルWebサーバーで起動します...
    where python >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        start http://localhost:8000/index.html
        python -m http.server 8000
    ) else (
        start http://localhost:8000/index.html
        npx -y serve -l 8000 .
    )
)
pause

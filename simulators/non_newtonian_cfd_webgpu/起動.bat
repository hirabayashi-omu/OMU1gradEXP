@echo off
chcp 65001 >nul
title 化粧品充填CFDシミュレーター (ローカルサーバー起動)

echo ========================================================
echo   化粧品充填プロセス CFDシミュレーター
echo   Cosmetic Filling & Rheology Modeling
echo ========================================================
echo.
echo [情報] ES Modules / WebGPU のCORS制限を回避するため、
echo        ローカルHTTPサーバーを起動してブラウザを開きます...
echo.

cd /d "%~dp0"

:: 1. Python がインストールされている場合
where python >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo Python サーバーをポート 8080 で起動中...
    start http://localhost:8080/index.html
    python -m http.server 8080
    goto end
)

:: 2. Node.js (npx) がインストールされている場合
where npx >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo npx serve をポート 8080 で起動中...
    start http://localhost:8080/index.html
    npx -y serve -l 8080 .
    goto end
)

:: 3. PowerShell 簡易HTTPサーバー (フォールバック)
echo PowerShell 簡易サーバーを起動中...
start http://localhost:8080/index.html
powershell -NoProfile -ExecutionPolicy Bypass -Command "$listener = New-Object System.Net.HttpListener; $listener.Prefixes.Add('http://localhost:8080/'); $listener.Start(); Write-Host 'Server running at http://localhost:8080/'; while ($listener.IsListening) { $context = $listener.GetContext(); $request = $context.Request; $response = $context.Response; $path = '.' + $request.Url.LocalPath; if ($path -eq './') { $path = './index.html' }; if (Test-Path $path) { $bytes = [System.IO.File]::ReadAllBytes($path); $ext = [System.IO.Path]::GetExtension($path); switch ($ext) { '.html' { $response.ContentType = 'text/html; charset=utf-8' } '.js' { $response.ContentType = 'application/javascript; charset=utf-8' } '.css' { $response.ContentType = 'text/css; charset=utf-8' } '.json' { $response.ContentType = 'application/json' } default { $response.ContentType = 'application/octet-stream' } }; $response.AddHeader('Access-Control-Allow-Origin', '*'); $response.ContentLength64 = $bytes.Length; $response.OutputStream.Write($bytes, 0, $bytes.Length) } else { $response.StatusCode = 404 }; $response.OutputStream.Close() }"

:end
pause

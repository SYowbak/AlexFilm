@echo off
setlocal

cd /d "%~dp0"
title Kino App Server

echo ==============================================
echo       Starting Kino App (Vue 3 + Vite)    
echo ==============================================
echo.
echo Checking and starting local server...
echo Please wait...
echo.

start cmd /c "npm run dev"

timeout /t 3 /nobreak >nul

echo Opening browser at http://localhost:5173...
start http://localhost:5173/

echo.
echo ==============================================
echo App Started!
echo To stop the server, close the other console window.
echo This window will close automatically.
echo ==============================================
timeout /t 3 >nul
exit

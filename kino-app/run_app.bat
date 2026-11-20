@echo off
REM ================================================================
REM  AlexFilm launcher (kino-app).
REM
REM  This file used to start ONLY Vite - the UA stream proxy on
REM  port 3001 was missing, so the player could not find any stream
REM  and every movie ended up in the fallback path.
REM
REM  Now it delegates to the root launcher, which starts and
REM  verifies both the proxy and the web app.
REM
REM  Usage: run_app.bat            - start everything + open browser
REM         run_app.bat --no-browser - start everything, no browser
REM ================================================================
setlocal
cd /d "%~dp0.."
call "%~dp0..\start.bat" %*
endlocal
exit /b %ERRORLEVEL%

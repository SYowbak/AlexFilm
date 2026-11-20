@echo off
setlocal EnableDelayedExpansion
cd /d %~dp0

set "PROXY_PORT=3001"
set "PROXY_HEALTH=http://127.0.0.1:%PROXY_PORT%/health"
set "PROXY_DIR=%~dp0proxy-server"
set "APP_DIR=%~dp0kino-app"

echo ==============================================
echo   AlexFilm - launcher
echo ==============================================
echo.

REM ================================================================
REM 1) Stop stale processes left from a previous run.
REM    This is the fix for "port 3001 busy -> skip proxy": the
REM    launcher used to trust any listener on 3001 and then start
REM    nothing, so the app ended up without a proxy at all.
REM ================================================================
echo [1/4] Checking for stale AlexFilm processes...

call :get_pid %PROXY_PORT%
if not "!PORT_PID!"=="" (
  call :probe_health
  if "!PROXY_IS_OURS!"=="1" (
    echo       - stale AlexFilm proxy ^(PID !PORT_PID!^) - restarting
    taskkill /PID !PORT_PID! /T /F >nul 2>&1
    call :wait_port_free %PROXY_PORT% 30
  ) else (
    call :get_cmdline !PORT_PID!
    echo !PORT_CMD! | findstr /i /c:"server.js" >nul
    if not errorlevel 1 (
      echo       - hung AlexFilm proxy ^(PID !PORT_PID!^) - restarting
      taskkill /PID !PORT_PID! /T /F >nul 2>&1
      call :wait_port_free %PROXY_PORT% 30
    ) else (
      echo.
      echo [ERROR] Port %PROXY_PORT% is used by another program ^(PID !PORT_PID!^).
      echo         !PORT_CMD!
      echo         Close that program and run start.bat again.
      echo.
      pause
      exit /b 1
    )
  )
)

REM Vite: stop only OUR instances (recognised by "kino-app" in cmdline).
for %%p in (5173 5174 5175 5176 5177 5178 5179 5180) do (
  call :get_pid %%p
  if not "!PORT_PID!"=="" (
    call :get_cmdline !PORT_PID!
    echo !PORT_CMD! | findstr /i /c:"kino-app" >nul
    if not errorlevel 1 (
      echo       - stopping stale Vite ^(PID !PORT_PID!^)
      taskkill /PID !PORT_PID! /T /F >nul 2>&1
      call :wait_port_free %%p 30
    )
  )
)

REM Remember dev ports held by FOREIGN programs - Vite must skip them.
set "P5173=" & set "P5174=" & set "P5175=" & set "P5176=" & set "P5177=" & set "P5178=" & set "P5179=" & set "P5180="
for %%p in (5173 5174 5175 5176 5177 5178 5179 5180) do (
  call :is_listening %%p
  if "!IS_LISTENING!"=="1" set "P%%p=1"
)

REM ================================================================
REM 2) Start the UA stream proxy (port 3001)
REM ================================================================
echo.
echo [2/4] Starting UA Stream Server ^(port %PROXY_PORT%^)...
REM `start /d` sets the working directory. Using `cd /d "..."` inside the
REM command string breaks on paths with spaces ("... PROYEKTY UZHU ...").
start "AlexFilm UA Proxy" /d "%PROXY_DIR%" cmd /k node server.js

call :wait_health 40
if not "!PROXY_IS_OURS!"=="1" (
  echo.
  echo [ERROR] The UA stream server did not become ready.
  echo         Look at the "AlexFilm UA Proxy" window for details.
  echo.
  pause
  exit /b 1
)
echo       - proxy is ready ^(http://127.0.0.1:%PROXY_PORT%^)

REM ================================================================
REM 3) Start the web app (Vite)
REM ================================================================
echo.
echo [3/4] Starting web app ^(Vite^)...
start "AlexFilm Web" /d "%APP_DIR%" cmd /k npm run dev

set "WEB_PORT="
for /l %%i in (1,1,40) do (
  if not defined WEB_PORT (
    for %%p in (5173 5174 5175 5176 5177 5178 5179 5180) do (
      if not defined WEB_PORT (
        call :is_listening %%p
        if "!IS_LISTENING!"=="1" (
          if not defined P%%p set "WEB_PORT=%%p"
        )
      )
    )
  )
  if not defined WEB_PORT ping -n 2 127.0.0.1 >nul
)

if not defined WEB_PORT (
  echo.
  echo [ERROR] Vite did not start on any dev port ^(5173-5180^).
  echo         Look at the "AlexFilm Web" window for details.
  echo.
  pause
  exit /b 1
)

REM ================================================================
REM 4) Report
REM ================================================================
echo.
echo [4/4] Verifying the web app...
call :wait_http %WEB_PORT% 30
echo.
echo ==============================================
echo   AlexFilm is running!
echo.
echo   Web app:      http://localhost:%WEB_PORT%
echo   UA Server:    http://127.0.0.1:%PROXY_PORT%
echo   Health check: http://127.0.0.1:%PROXY_PORT%/health
echo ==============================================
echo.
if /i "%~1"=="--no-browser" goto :skip_browser
start "" "http://localhost:%WEB_PORT%/"
:skip_browser

endlocal
exit /b 0


REM ================================================================
REM  Helpers
REM ================================================================

:is_listening
set "IS_LISTENING=0"
netstat -ano -p TCP | findstr /r /c:":%~1 .*LISTENING" >nul 2>&1
if not errorlevel 1 set "IS_LISTENING=1"
exit /b 0

:get_pid
set "PORT_PID="
for /f "tokens=5" %%P in ('netstat -ano -p TCP ^| findstr /r /c:":%~1 .*LISTENING"') do (
  if not defined PORT_PID set "PORT_PID=%%P"
)
exit /b 0

:get_cmdline
set "PORT_CMD="
for /f "usebackq delims=" %%C in (`powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=%~1' -ErrorAction SilentlyContinue).CommandLine"`) do (
  if not defined PORT_CMD set "PORT_CMD=%%C"
)
REM Strip characters that would break `echo` in the batch parser.
set "PORT_CMD=!PORT_CMD:"=!"
set "PORT_CMD=!PORT_CMD:&=!"
set "PORT_CMD=!PORT_CMD:<=!"
set "PORT_CMD=!PORT_CMD:>=!"
set "PORT_CMD=!PORT_CMD:|=!"
exit /b 0

:wait_port_free
set "WAIT_N=%~2"
for /l %%i in (1,1,!WAIT_N!) do (
  call :is_listening %~1
  if "!IS_LISTENING!"=="0" exit /b 0
  ping -n 2 127.0.0.1 >nul
)
exit /b 0

:probe_health
set "PROXY_IS_OURS=0"
set "PROXY_BODY="
for /f "usebackq delims=" %%H in (`powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 '%PROXY_HEALTH%').Content } catch { 'NO' }"`) do (
  if not defined PROXY_BODY set "PROXY_BODY=%%H"
)
echo(!PROXY_BODY! | findstr /i /c:"alexfilm-ua-proxy" >nul 2>&1
if not errorlevel 1 set "PROXY_IS_OURS=1"
exit /b 0

:wait_health
set "WAIT_N=%~1"
for /l %%i in (1,1,!WAIT_N!) do (
  call :probe_health
  if "!PROXY_IS_OURS!"=="1" exit /b 0
  ping -n 2 127.0.0.1 >nul
)
exit /b 0

:wait_http
set "WAIT_N=%~2"
for /l %%i in (1,1,!WAIT_N!) do (
  powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 'http://127.0.0.1:%~1/'; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; exit 1" >nul 2>&1
  if not errorlevel 1 exit /b 0
  ping -n 2 127.0.0.1 >nul
)
exit /b 0

@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto nonode
if not "%~1"=="" goto run
node ctl.mjs check
if not errorlevel 1 goto already
:run
node ctl.mjs begin
node server.mjs %*
echo.
node ctl.mjs bye
pause
exit /b 0

:already
node ctl.mjs open
pause
exit /b 0

:nonode
echo.
echo Node.js not found. Install it from https://nodejs.org/ then run this file again.
echo.
pause
exit /b 1

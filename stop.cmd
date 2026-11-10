@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto nonode
node ctl.mjs stop
pause
exit /b 0

:nonode
echo.
echo Node.js not found. Install it from https://nodejs.org/ then run this file again.
echo.
pause
exit /b 1

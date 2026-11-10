@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto nonode
node ctl.mjs open
pause
exit /b 0

:nonode
echo.
echo Node.js not found. Open http://127.0.0.1:8737/ in your browser instead.
echo.
pause
exit /b 1

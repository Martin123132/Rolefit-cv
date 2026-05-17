@echo off
setlocal
title Rolefit CV

cd /d "%~dp0"

echo.
echo Rolefit CV
echo ==========
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required to run this app.
  echo Opening the Node.js download page...
  start "" "https://nodejs.org/en/download"
  echo.
  echo Install the LTS version of Node.js, then double-click this file again.
  pause
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Reinstall Node.js using the LTS installer.
  pause
  exit /b 1
)

echo Starting Rolefit CV...
echo The app will choose a free local port and open itself.
echo Close this window, or press Ctrl+C, to stop the app.
echo.

call npm.cmd start

pause

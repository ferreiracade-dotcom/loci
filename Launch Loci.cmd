@echo off
title Loci
cd /d "D:\Code\Loci"

REM --- Make sure Node/npm is reachable -------------------------------------
where npm >nul 2>&1 || set "PATH=%ProgramFiles%\nodejs;%PATH%"
where npm >nul 2>&1 || (
  echo [Loci] Could not find npm. Install Node.js, then try again.
  echo        ^(If Node is installed somewhere unusual, edit the PATH line in this file.^)
  echo.
  echo Press any key to close.
  pause >nul
  exit /b 1
)

REM --- Clear any leftover Loci dev instance so you never get a stale window --
echo [Loci] Tidying up any previous session...
taskkill /F /IM electron.exe >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr LISTENING ^| findstr ":5173"') do taskkill /F /PID %%p >nul 2>&1

echo [Loci] Starting Loci...
echo        Keep this window open while you use Loci. Close it to quit.
echo.
call npm run dev

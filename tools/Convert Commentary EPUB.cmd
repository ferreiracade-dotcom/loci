@echo off
setlocal
title Convert Commentary EPUB to Loci

REM IMPORTANT: this script deliberately uses "goto :label" for every error path instead of
REM parenthesised "if ( ... )" blocks. A dragged EPUB path often contains parentheses
REM (e.g. "Luke (Reformation Heritage Bible Commentary).epub"); inside an if-block, cmd expands
REM the path at parse time and the ")" closes the block early, crashing the window before it can
REM even ask for a book name. Top-level echoes have no such problem.

REM --- Make sure Node is reachable (same trick as Launch Loci.cmd) --------------
where node >nul 2>&1
if errorlevel 1 set "PATH=%ProgramFiles%\nodejs;%PATH%"
where node >nul 2>&1
if errorlevel 1 goto :nonode

echo ============================================================
echo   Convert a commentary EPUB into a Loci commentary file
echo ============================================================
echo.

REM --- Locate the converter script. It normally sits next to this .cmd, but if
REM     you copied only the .cmd somewhere (e.g. the Desktop), fall back to the
REM     copy in the project's tools folder. -------------------------------------
set "CONVERTER=%~dp0epub-to-md.mjs"
if not exist "%CONVERTER%" set "CONVERTER=D:\Code\Loci\tools\epub-to-md.mjs"
if not exist "%CONVERTER%" goto :noconverter

REM --- The EPUB: dragged onto this file, or typed/pasted ------------------------
set "EPUB=%~1"
if not defined EPUB set /p "EPUB=Drag your .epub onto this window (or paste its full path) and press Enter: "
set "EPUB=%EPUB:"=%"
if not exist "%EPUB%" goto :nofile

REM --- Which Bible book is it? -------------------------------------------------
set /p "BOOK=Bible book name (e.g. Matthew, 1 Corinthians): "
if not defined BOOK goto :noname

REM --- Extract the EPUB (it's a zip) to a temp folder --------------------------
set "WORK=%TEMP%\loci-epub-convert"
if exist "%WORK%" rmdir /s /q "%WORK%"
mkdir "%WORK%"
echo [Convert] Extracting...
tar -xf "%EPUB%" -C "%WORK%"
if errorlevel 1 goto :extractfail

REM --- Convert straight into the vault's commentaries folder -------------------
set "OUTDIR=%APPDATA%\Loci\vault\commentaries"
if not exist "%OUTDIR%" mkdir "%OUTDIR%"
set "OUT=%OUTDIR%\%BOOK%.md"
node "%CONVERTER%" "%WORK%" "%BOOK%" "%OUT%"
if errorlevel 1 goto :convertfail

echo.
echo [Convert] Saved to your vault:
echo           %OUT%
echo [Convert] Restart Loci ^(or click the refresh icon on the source^) and "%BOOK%" will appear.
echo.
pause
exit /b 0

:nonode
echo [Convert] Could not find Node.js. Install Node, then try again.
echo.
pause
exit /b 1

:noconverter
echo [Convert] Could not find epub-to-md.mjs.
echo           Keep it in the same folder as this file, or in D:\Code\Loci\tools.
echo.
pause
exit /b 1

:nofile
echo [Convert] File not found:
echo           %EPUB%
echo.
pause
exit /b 1

:noname
echo [Convert] No book name given.
echo.
pause
exit /b 1

:extractfail
echo [Convert] Could not extract the EPUB.
echo.
pause
exit /b 1

:convertfail
echo.
echo [Convert] Conversion FAILED - nothing was saved. See the error above.
echo.
pause
exit /b 1

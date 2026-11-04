@echo off
rem Starts DRAFTEX and opens it in the browser. Closing this window stops DRAFTEX (D46).
title DRAFTEX
cd /d "%~dp0"
if not exist ".runtime\node\node.exe" (
  echo DRAFTEX is not set up yet. Double-click setup-windows.bat in this folder first.
  if not defined DRAFTEX_NO_PAUSE pause
  exit /b 1
)
set "PATH=%~dp0.runtime\node;%PATH%"
".runtime\node\node.exe" scripts\start.ts --open
if errorlevel 1 (
  echo.
  echo DRAFTEX stopped because of a problem. The message above says what went wrong.
  if not defined DRAFTEX_NO_PAUSE pause
  exit /b 1
)

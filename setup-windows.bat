@echo off
rem DRAFTEX setup. Runs setup-windows.ps1 with the execution policy relaxed for this run only (D44).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-windows.ps1" %*
set "DRAFTEX_EXIT=%ERRORLEVEL%"
if not defined DRAFTEX_NO_PAUSE pause
exit /b %DRAFTEX_EXIT%

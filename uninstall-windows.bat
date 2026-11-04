@echo off
rem DRAFTEX uninstall (D52). Runs uninstall-windows.ps1 with the execution policy relaxed for this run only (D44).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall-windows.ps1" %*
set "DRAFTEX_EXIT=%ERRORLEVEL%"
if not defined DRAFTEX_NO_PAUSE pause
exit /b %DRAFTEX_EXIT%

@echo off
rem Gives an account a new temporary password from this computer (D49).
rem Close DRAFTEX first; the reset is applied when DRAFTEX next starts.
title DRAFTEX password reset
cd /d "%~dp0"
if not exist ".runtime\node\node.exe" (
  echo DRAFTEX is not set up yet. Double-click setup-windows.bat first.
  if not defined DRAFTEX_NO_PAUSE pause
  exit /b 1
)
set "DRAFTEX_EMAIL="
set /p "DRAFTEX_EMAIL=Email of the account to reset: "
".runtime\node\node.exe" scripts\reset-password.ts "%DRAFTEX_EMAIL%"
set "DRAFTEX_EXIT=%ERRORLEVEL%"
if not defined DRAFTEX_NO_PAUSE pause
exit /b %DRAFTEX_EXIT%

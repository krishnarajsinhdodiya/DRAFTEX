@echo off
rem DRAFTEX update (D44). One line on purpose: git pull may change this file while it runs.
(set "DRAFTEX_FAILED=" & (powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0update-windows.ps1" %* || set "DRAFTEX_FAILED=1") & (if not defined DRAFTEX_NO_PAUSE pause) & (if defined DRAFTEX_FAILED (exit /b 1) else (exit /b 0)))

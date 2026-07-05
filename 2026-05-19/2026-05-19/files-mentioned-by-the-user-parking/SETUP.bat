@echo off
title VayAccess Setup Launcher
REM =============================================================
REM VayAccess On-Site Agent -- ONE-CLICK SETUP
REM
REM Double-click this file on any Windows laptop.
REM
REM What happens next:
REM   1. This window opens (it's just the launcher).
REM   2. Windows asks for Administrator permission -- click YES.
REM   3. A NEW blue "Administrator: Windows PowerShell" window
REM      opens. THAT is where the actual setup runs.
REM   4. This launcher window can be closed once step 3 opens.
REM   5. Watch the blue window through Steps 1..5. It will
REM      prompt you for 5 config values in Step 3.
REM
REM First run takes ~15-25 minutes (mostly PyTorch download).
REM =============================================================

echo.
echo VayAccess Setup Launcher
echo.
echo Step 1: A blue "Administrator" PowerShell window will open shortly.
echo Step 2: DO NOT CLOSE THAT BLUE WINDOW -- the real work happens there.
echo Step 3: You can close THIS window whenever you want.
echo.
echo Requesting Administrator privileges...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"

echo.
echo The elevated PowerShell window has been launched.
echo Watch the BLUE window (titled "Administrator: Windows PowerShell 5.1")
echo for the actual setup progress.
echo.
echo You can close this launcher window now.
pause

@echo off
title VayAccess On-Site Agent -- Configure
REM =============================================================
REM Double-click this to change the camera IP, RFID reader IP, or
REM any other config value in .env on THIS laptop.
REM
REM Steps:
REM   1. Reads the current .env
REM   2. Shows each value on-screen with its current setting
REM   3. Prompts you for a new value (press Enter to keep the old
REM      one)
REM   4. Writes the updated .env
REM   5. Restarts the scheduled task so changes take effect NOW
REM
REM No admin rights required for the .env edit; the task restart
REM step auto-elevates.
REM =============================================================

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0configure.ps1"
echo.
pause

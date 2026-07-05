@echo off
REM ─────────────────────────────────────────────────────────────
REM VayAccess On-Site Agent — ONE-CLICK SETUP
REM
REM Double-click this file on any Windows laptop.
REM
REM It will (in order):
REM   1. Install Python 3.12 if not already present
REM   2. Create a Python virtual environment
REM   3. Install every dependency (YOLO, OpenCV, EasyOCR, ...)
REM   4. Prompt you for 3 config values (DATABASE_URL,
REM      CLOUD_PUSH_TOKEN, camera IP)
REM   5. Register a Windows Scheduled Task so the agent
REM      auto-starts on every boot
REM   6. Start the agent right now
REM
REM First run takes ~15-25 minutes (mostly PyTorch download).
REM Second run (updates) takes ~30 seconds.
REM ─────────────────────────────────────────────────────────────

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
echo.
echo Setup script finished. Press any key to close this window.
pause > nul

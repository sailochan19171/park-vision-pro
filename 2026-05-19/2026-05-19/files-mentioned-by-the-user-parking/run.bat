@echo off
REM =============================================================
REM VayAccess On-Site Agent -- starts the local Flask app that
REM talks to the UHF reader + ANPR camera and pushes scans/frames
REM to https://vayaccess-cloud.onrender.com.
REM
REM Called by the "VayAccessOnSiteAgent" scheduled task on system
REM startup. Can also be double-clicked manually.
REM
REM Logs to logs\onsite-YYYYMMDD.log next to app.py.
REM =============================================================
setlocal enabledelayedexpansion

REM Move to the app.py folder FIRST so relative paths in app.py
REM (.env, detections\, debug_snapshots\, logs\) resolve
REM correctly regardless of where this .bat was launched.
cd /d "%~dp0"

REM ---------- Locate a usable Python 3.12 --------------------------
REM Search order:
REM   1. venv next to this .bat  (setup.ps1 creates this)
REM   2. per-user AppData install (Python's default for a
REM      non-elevated install)
REM   3. all-users Program Files install
REM   4. all-users C:\Python312 install
REM Do NOT fall back to bare "python" -- the SYSTEM user (which
REM runs the scheduled task) has NO Python on its PATH.
set VENV_PYTHON=

if exist "%~dp0venv\Scripts\python.exe" (
    set "VENV_PYTHON=%~dp0venv\Scripts\python.exe"
    goto :python_found
)
if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" (
    set "VENV_PYTHON=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
    goto :python_found
)
if exist "C:\Program Files\Python312\python.exe" (
    set "VENV_PYTHON=C:\Program Files\Python312\python.exe"
    goto :python_found
)
if exist "C:\Python312\python.exe" (
    set "VENV_PYTHON=C:\Python312\python.exe"
    goto :python_found
)

REM No Python found -- write to log + exit non-zero so the
REM scheduled task's restart-on-failure kicks in.
if not exist logs mkdir logs
for /f "usebackq" %%d in (`powershell -NoProfile -Command "Get-Date -Format yyyyMMdd"`) do set LOG_DATE=%%d
set LOG_FILE=logs\onsite-!LOG_DATE!.log
echo [ERR] %DATE% %TIME% - No Python 3.12 found. Run SETUP.bat first. >> "!LOG_FILE!"
exit /b 1

:python_found

REM ---------- Prepare the log file --------------------------------
if not exist logs mkdir logs
for /f "usebackq" %%d in (`powershell -NoProfile -Command "Get-Date -Format yyyyMMdd"`) do set LOG_DATE=%%d
set LOG_FILE=logs\onsite-!LOG_DATE!.log

echo [INFO] Starting VayAccess on-site agent at %DATE% %TIME%  >> "!LOG_FILE!"
echo [INFO] Python: !VENV_PYTHON!                              >> "!LOG_FILE!"
echo [INFO] Working folder: %CD%                               >> "!LOG_FILE!"
echo [INFO] Log file: !LOG_FILE!
echo.
echo Starting VayAccess On-Site Agent -- logging to !LOG_FILE!
echo Press Ctrl+C to stop.
echo.

REM PYTHONUNBUFFERED=1 forces line-buffered stdout even when
REM redirected. Without this the log stays empty until Flask
REM exits -- which makes headless debugging impossible.
set PYTHONUNBUFFERED=1

REM Run Flask with -u (also-unbuffered). Redirect stdout + stderr
REM to the log file. 2^>^&1 = merge stderr into stdout.
"!VENV_PYTHON!" -u app.py >> "!LOG_FILE!" 2>&1

REM If we reach here, python.exe exited. Note this and let the
REM scheduled task's restart-on-failure policy relaunch us.
echo [WARN] app.py exited at %DATE% %TIME% >> "!LOG_FILE!"
endlocal

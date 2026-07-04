@echo off
REM ─────────────────────────────────────────────────────────────────────────────
REM VayAccess On-Site Agent — starts the local Flask app that talks to the UHF
REM reader + ANPR camera and pushes scans/frames to https://vayaccess-cloud.onrender.com.
REM
REM Called by the "VayAccessOnSiteAgent" scheduled task on system startup.
REM Can also be double-clicked manually.
REM
REM Logs to logs/onsite-YYYYMMDD.log next to app.py — check that file if the
REM cloud stops seeing frame pushes.
REM ─────────────────────────────────────────────────────────────────────────────

REM Use the venv Python — it has YOLO/EasyOCR/OpenCV pre-installed.
SET VENV_PYTHON=D:\park-vision-pro\2026-05-19\venv\Scripts\python.exe

REM Fall back to system Python only if the venv is missing.
IF NOT EXIST "%VENV_PYTHON%" (
    echo [WARN] venv Python not found at %VENV_PYTHON% — falling back to system python
    SET VENV_PYTHON=python
)

REM Move to the app.py directory so relative paths in the code (.env, detections/,
REM debug_snapshots/) resolve correctly regardless of where this .bat was launched.
cd /d "%~dp0"

REM Create logs/ folder if missing.
IF NOT EXIST logs mkdir logs

REM Date-stamped log so restarts don't clobber older runs. Console output +
REM stderr are both tee'd via >> so they survive a crash. Uses PowerShell for
REM the timestamp because cmd's %DATE% format varies by regional settings.
FOR /F "usebackq" %%d IN (`powershell -NoProfile -Command "Get-Date -Format yyyyMMdd"`) DO SET LOG_DATE=%%d
SET LOG_FILE=logs\onsite-%LOG_DATE%.log

echo [INFO] Starting VayAccess on-site agent at %DATE% %TIME%  >> "%LOG_FILE%"
echo [INFO] Python: %VENV_PYTHON%                              >> "%LOG_FILE%"
echo [INFO] Log file: %LOG_FILE%
echo.
echo Starting VayAccess On-Site Agent — logging to %LOG_FILE%
echo Press Ctrl+C to stop.
echo.

REM PYTHONUNBUFFERED=1 forces line-buffered stdout even when redirected.
REM Without this the log stays empty until Flask exits, which makes headless
REM debugging impossible.
SET PYTHONUNBUFFERED=1

REM Run Flask with -u (also-unbuffered, belt-and-braces). Redirect stdout +
REM stderr to the log file so the scheduled task runs headless without a lost
REM console. 2^>^&1 = merge stderr into stdout.
"%VENV_PYTHON%" -u app.py >> "%LOG_FILE%" 2>&1

REM If we reach here, python.exe exited. Note this and let the scheduled task
REM restart us via its "restart on failure" policy (see install script).
echo [WARN] app.py exited at %DATE% %TIME% >> "%LOG_FILE%"

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

REM Move to the app.py directory FIRST so relative paths in the code (.env,
REM detections/, debug_snapshots/) resolve correctly regardless of where this
REM .bat was launched.
cd /d "%~dp0"

REM Use the venv Python next to this .bat -- setup.ps1 always creates one at
REM .\venv\Scripts\python.exe. Using %~dp0 makes this work from ANY install
REM path (D:\, E:\, C:\Program Files\, ...).
SET VENV_PYTHON=%~dp0venv\Scripts\python.exe

REM Fall back to well-known Python install locations only if the local venv is
REM missing. Do NOT fall back to just "python" -- when this .bat runs as the
REM SYSTEM user via the scheduled task, that user has no PATH entry for Python
REM and Windows returns "The system cannot execute the specified program."
IF NOT EXIST "%VENV_PYTHON%" (
    echo [WARN] Local venv Python not found at %VENV_PYTHON%
    IF EXIST "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" (
        SET VENV_PYTHON=%LOCALAPPDATA%\Programs\Python\Python312\python.exe
    ) ELSE IF EXIST "C:\Program Files\Python312\python.exe" (
        SET VENV_PYTHON=C:\Program Files\Python312\python.exe
    ) ELSE IF EXIST "C:\Python312\python.exe" (
        SET VENV_PYTHON=C:\Python312\python.exe
    ) ELSE (
        echo [ERR] No usable Python found. Re-run SETUP.bat.
        exit /b 1
    )
    echo [WARN] Falling back to system Python at %VENV_PYTHON%
)

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

# VayAccess On-Site Agent -- one-click setup script
# Called by SETUP.bat. Do NOT run this directly -- the .bat
# wrapper handles execution policy for you.
#
# Pure ASCII only (no em-dashes / smart quotes) so Windows
# PowerShell 5.1 parses it without needing a UTF-8 BOM.

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Write-Banner($text, $color = 'Cyan') {
    Write-Host ""
    Write-Host "==============================================================" -ForegroundColor $color
    Write-Host "  $text" -ForegroundColor $color
    Write-Host "==============================================================" -ForegroundColor $color
}

# ----- Step 0. Self-elevate to Administrator -----
$principal = [Security.Principal.WindowsPrincipal]::new(
    [Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Banner "Requesting Administrator privileges..." 'Yellow'
    Write-Host "Windows will ask you to approve. Click Yes."
    Start-Sleep 2
    $argList = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    Start-Process powershell -ArgumentList $argList -Verb RunAs
    exit
}

Write-Banner "VayAccess On-Site Agent -- Setup Started" 'Green'
Write-Host "Working folder: $PSScriptRoot"

# ----- Step 1. Check / install Python 3.12 -----
Write-Banner "Step 1 of 5 -- Python 3.12 check" 'Cyan'
$pythonExe = $null
try {
    $ver = & python --version 2>&1
    if ($ver -match "Python 3\.1[12]") {
        $pythonExe = (Get-Command python).Source
        Write-Host "[OK] Found $ver at $pythonExe" -ForegroundColor Green
    }
} catch { }

if (-not $pythonExe) {
    Write-Host "Python 3.12 not found. Downloading and installing..." -ForegroundColor Yellow
    $installer = Join-Path $env:TEMP "python-3.12.9-amd64.exe"
    $url       = "https://www.python.org/ftp/python/3.12.9/python-3.12.9-amd64.exe"
    Write-Host "  Downloading from $url ..." -ForegroundColor Gray
    Invoke-WebRequest -Uri $url -OutFile $installer -UseBasicParsing
    Write-Host "  Running silent installer (2 to 3 minutes) ..." -ForegroundColor Gray
    Start-Process $installer -ArgumentList `
        "/quiet", "InstallAllUsers=1", "PrependPath=1", "Include_test=0" -Wait
    Remove-Item $installer -Force -ErrorAction SilentlyContinue

    # Refresh PATH so python is visible in this session
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [Environment]::GetEnvironmentVariable("Path", "User")

    try {
        $pythonExe = (Get-Command python).Source
        $ver = & python --version 2>&1
        Write-Host "[OK] Installed $ver at $pythonExe" -ForegroundColor Green
    } catch {
        Write-Host "[ERR] Python install failed. Install manually from python.org and re-run this script." -ForegroundColor Red
        exit 1
    }
}

# ----- Step 2. Create virtualenv + install dependencies -----
Write-Banner "Step 2 of 5 -- Python virtualenv + dependencies" 'Cyan'
$venvPython = Join-Path $PSScriptRoot 'venv\Scripts\python.exe'

if (-not (Test-Path $venvPython)) {
    Write-Host "Creating virtualenv at .\venv ..." -ForegroundColor Gray
    & $pythonExe -m venv venv
    if (-not (Test-Path $venvPython)) {
        Write-Host "[ERR] Could not create venv." -ForegroundColor Red
        exit 1
    }
}
Write-Host "[OK] venv ready at $venvPython" -ForegroundColor Green

$reqFile = Join-Path $PSScriptRoot 'requirements.txt'
if (-not (Test-Path $reqFile)) {
    Write-Host "requirements.txt not in this folder -- downloading from GitHub..." -ForegroundColor Yellow
    $reqUrl = "https://raw.githubusercontent.com/sailochan19171/park-vision-pro/my-branch/2026-05-19/2026-05-19/files-mentioned-by-the-user-parking/requirements.txt"
    try {
        Invoke-WebRequest -Uri $reqUrl -OutFile $reqFile -UseBasicParsing
    } catch {
        Write-Host "[ERR] Could not fetch requirements.txt. Check internet." -ForegroundColor Red
        exit 1
    }
}

Write-Host "Upgrading pip ..." -ForegroundColor Gray
& $venvPython -m pip install --upgrade pip --quiet --disable-pip-version-check

Write-Host "Installing dependencies (10 to 15 min first time, mostly PyTorch)..." -ForegroundColor Gray
& $venvPython -m pip install -r $reqFile --disable-pip-version-check
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERR] pip install failed. See errors above." -ForegroundColor Red
    exit 1
}
Write-Host "[OK] All dependencies installed" -ForegroundColor Green

# ----- Step 3. Configure .env (only if not already present) -----
Write-Banner "Step 3 of 5 -- Configuration (.env)" 'Cyan'
$envFile = Join-Path $PSScriptRoot '.env'

if (Test-Path $envFile) {
    Write-Host "[OK] .env already exists at $envFile -- skipping prompts." -ForegroundColor Green
    Write-Host "     If you need to change values, edit .env in Notepad after this script finishes."
} else {
    Write-Host "Enter these values. They will be saved into .env." -ForegroundColor White
    Write-Host "Values stay on this laptop only -- never sent to chat."
    Write-Host ""

    $dbUrl   = Read-Host "  DATABASE_URL  (Neon postgres connection string)"
    $pushUrl = Read-Host "  CLOUD_PUSH_URL  (press Enter for default: https://vayaccess-cloud.onrender.com)"
    if ([string]::IsNullOrWhiteSpace($pushUrl)) { $pushUrl = 'https://vayaccess-cloud.onrender.com' }
    $pushTok = Read-Host "  CLOUD_PUSH_TOKEN  (64-char token from Render env vars)" -AsSecureString
    $camIp   = Read-Host "  CAMERA_IP  (press Enter for default: 192.168.1.12)"
    if ([string]::IsNullOrWhiteSpace($camIp)) { $camIp = '192.168.1.12' }
    $rfidIp  = Read-Host "  RFID_READER_IP  (press Enter for default: 192.168.0.200)"
    if ([string]::IsNullOrWhiteSpace($rfidIp)) { $rfidIp = '192.168.0.200' }

    $tokPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($pushTok))

    @(
        "# Auto-generated by SETUP.bat on $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
        ""
        "DATABASE_URL=$dbUrl"
        "CLOUD_PUSH_URL=$pushUrl"
        "CLOUD_PUSH_TOKEN=$tokPlain"
        "CLOUD_MODE=0"
        "CLOUD_STREAM_FPS=10"
        "CLOUD_STREAM_JPEG_Q=60"
        "CAMERA_IP=$camIp"
        "RFID_READER_IP=$rfidIp"
    ) | Set-Content -Encoding ascii -Path $envFile

    $tokPlain = $null
    [GC]::Collect()
    Write-Host "[OK] .env written to $envFile" -ForegroundColor Green
}

# ----- Step 4. Register the scheduled task (auto-boot) -----
Write-Banner "Step 4 of 5 -- Register auto-start scheduled task" 'Cyan'
$installer = Join-Path $PSScriptRoot 'install-onsite-agent.ps1'
if (-not (Test-Path $installer)) {
    Write-Host "[ERR] install-onsite-agent.ps1 missing -- copy it from the source folder." -ForegroundColor Red
    exit 1
}
& $installer

# ----- Step 5. Verification instructions -----
Write-Banner "Step 5 of 5 -- All done" 'Green'
$logDir = Join-Path $PSScriptRoot 'logs'
Write-Host ""
Write-Host "The agent is now running." -ForegroundColor Green
Write-Host "It will start automatically 30 seconds after every boot."
Write-Host ""
Write-Host "To watch the log in real time:" -ForegroundColor Cyan
Write-Host "  Get-Content `"$logDir\onsite-*.log`" -Wait -Tail 20" -ForegroundColor White
Write-Host ""
Write-Host "To stop the agent (temporary):" -ForegroundColor Cyan
Write-Host "  Stop-ScheduledTask -TaskName VayAccessOnSiteAgent" -ForegroundColor White
Write-Host ""
Write-Host "To start it again:" -ForegroundColor Cyan
Write-Host "  Start-ScheduledTask -TaskName VayAccessOnSiteAgent" -ForegroundColor White
Write-Host ""
Write-Host "To remove everything:" -ForegroundColor Cyan
Write-Host "  .\uninstall-onsite-agent.ps1  (as admin)" -ForegroundColor White
Write-Host ""

# Show the last 20 log lines so the operator can see it working
Start-Sleep 5
if (Test-Path "$logDir\onsite-*.log") {
    Write-Banner "Last 20 log lines (verify agent is talking)" 'Cyan'
    Get-Content "$logDir\onsite-*.log" -Tail 20
}

# Keep the window open so the operator can read everything.
# Without this, the PowerShell auto-closes the instant the script
# exits and it looks like a crash / silent failure.
Write-Host ""
Write-Host "=============================================================="  -ForegroundColor Green
Write-Host "  Setup complete. Press Enter to close this window."             -ForegroundColor Green
Write-Host "  (The agent keeps running in the background.)"                  -ForegroundColor Green
Write-Host "=============================================================="  -ForegroundColor Green
Read-Host "Press Enter to exit"

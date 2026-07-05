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

function Pause-Exit($msg = "Press Enter to close this window") {
    Write-Host ""
    Write-Host "==============================================================" -ForegroundColor Yellow
    Write-Host "  $msg" -ForegroundColor Yellow
    Write-Host "==============================================================" -ForegroundColor Yellow
    Read-Host " "
    exit
}

# ----- Step 0. Self-elevate to Administrator -----
$principal = [Security.Principal.WindowsPrincipal]::new(
    [Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Banner "Requesting Administrator privileges..." 'Yellow'
    Write-Host "Windows will ask you to approve. Click Yes."
    Start-Sleep 2
    # -NoExit keeps the elevated window open even if the script errors
    # before it reaches its own trailing Read-Host. Without this, any
    # unhandled exception during Step 1 / Step 2 closes the window and
    # the operator sees an unexplained silent failure.
    $argList = "-NoExit -NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    Start-Process powershell -ArgumentList $argList -Verb RunAs
    exit
}

# ----- MAIN body wrapped in try/catch so any error PAUSES instead of closing -----
try {

Write-Banner "VayAccess On-Site Agent -- Setup Started" 'Green'
Write-Host "Working folder: $PSScriptRoot"

# ----- Step 1. Check / install Python 3.12 -----
Write-Banner "Step 1 of 5 -- Python 3.12 check" 'Cyan'

# Helper: find Python 3.11+ in the well-known install locations.
# PATH refresh from Environment.GetEnvironmentVariable doesn't propagate
# to a running process on Windows, so relying on `Get-Command python`
# right after install is unreliable. Direct file check is definitive.
function Find-InstalledPython {
    $candidates = @(
        "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
        "C:\Program Files\Python312\python.exe",
        "C:\Program Files\Python311\python.exe",
        "C:\Program Files (x86)\Python312\python.exe",
        "C:\Python312\python.exe",
        "C:\Python311\python.exe"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) {
            return $c
        }
    }
    # Fall back to whatever "python" resolves to on PATH
    try {
        $onPath = (Get-Command python -ErrorAction SilentlyContinue).Source
        if ($onPath -and (Test-Path $onPath)) {
            $ver = & $onPath --version 2>&1
            if ($ver -match "Python 3\.1[12]") { return $onPath }
        }
    } catch { }
    return $null
}

$pythonExe = Find-InstalledPython
if ($pythonExe) {
    $ver = & $pythonExe --version 2>&1
    Write-Host "[OK] Found $ver at $pythonExe" -ForegroundColor Green
} else {
    Write-Host "Python 3.12 not found. Downloading and installing..." -ForegroundColor Yellow
    $installer = Join-Path $env:TEMP "python-3.12.9-amd64.exe"
    $url       = "https://www.python.org/ftp/python/3.12.9/python-3.12.9-amd64.exe"

    Write-Host "  Downloading from $url ..." -ForegroundColor Gray
    Invoke-WebRequest -Uri $url -OutFile $installer -UseBasicParsing
    if (-not (Test-Path $installer)) {
        throw "Python installer download failed. Check internet and retry."
    }
    $sizeMB = [math]::Round((Get-Item $installer).Length / 1MB, 1)
    Write-Host "  Downloaded $sizeMB MB" -ForegroundColor Gray

    # Three fallback attempts, each fully silent. If any of them
    # produces python.exe in a known location we stop.
    $logFile = Join-Path $env:TEMP "python-install.log"
    $attempts = @(
        @{ name = "all-users into Program Files";
           args = @("/quiet", "/log", $logFile,
                    "InstallAllUsers=1", "PrependPath=1",
                    "Include_test=0", "Include_launcher=1",
                    "SimpleInstall=1") },
        @{ name = "per-user into AppData (no admin rights needed)";
           args = @("/quiet", "/log", $logFile,
                    "InstallAllUsers=0", "PrependPath=1",
                    "Include_test=0", "Include_launcher=0",
                    "SimpleInstall=1") },
        @{ name = "all-users into C:\Python312 (fallback path)";
           args = @("/quiet", "/log", $logFile,
                    "InstallAllUsers=1", "PrependPath=1",
                    "Include_test=0", "Include_launcher=0",
                    "TargetDir=C:\Python312", "SimpleInstall=1") }
    )

    $lastExit = -1
    foreach ($attempt in $attempts) {
        Write-Host "  Attempt: $($attempt.name) ..." -ForegroundColor Gray
        try {
            $proc = Start-Process $installer -ArgumentList $attempt.args -Wait -PassThru
            $lastExit = $proc.ExitCode
            Write-Host "    Exit code: $lastExit" -ForegroundColor Gray
        } catch {
            Write-Host "    Launch failed: $_" -ForegroundColor Yellow
            $lastExit = -2
        }
        Start-Sleep 3
        $pythonExe = Find-InstalledPython
        if ($pythonExe) {
            Write-Host "  Found python.exe at $pythonExe" -ForegroundColor Green
            break
        }
        Write-Host "  Attempt didn't produce python.exe -- trying next fallback..." -ForegroundColor Yellow
    }

    Remove-Item $installer -Force -ErrorAction SilentlyContinue

    if (-not $pythonExe) {
        # Grab last 40 lines of the installer log so the error message
        # tells us what actually went wrong.
        $logExcerpt = "(no log file)"
        if (Test-Path $logFile) {
            $logExcerpt = (Get-Content $logFile -Tail 40 -ErrorAction SilentlyContinue) -join "`n"
        }
        throw @"
All 3 automatic install attempts failed. Last installer exit code: $lastExit.

Locations checked (none had python.exe):
  * $env:LOCALAPPDATA\Programs\Python\Python312\python.exe
  * C:\Program Files\Python312\python.exe
  * C:\Python312\python.exe

Last 40 lines of installer log ($logFile):
$logExcerpt

Common exit codes:
  1603 = Fatal error (usually old Python still installed or corrupt state)
  1618 = Another Windows Installer is running -- close other installs
  1638 = Newer version already installed -- uninstall it first
  1633 = This platform is not supported (32-bit installer on 64-bit OS?)

Fix: uninstall any existing Python (Settings -> Apps), reboot, re-run.
"@
    }

    $ver = & $pythonExe --version 2>&1
    Write-Host "[OK] Installed $ver at $pythonExe" -ForegroundColor Green
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

# ----- Step 3. Configure .env (auto-discover + prompt-with-defaults) -----
Write-Banner "Step 3 of 5 -- Auto-detect camera + RFID reader on the LAN" 'Cyan'

# Load existing .env values (empty hashtable if the file doesn't exist yet)
$envFile = Join-Path $PSScriptRoot '.env'
$current = @{}
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith('#') -and $line.Contains('=')) {
            $parts = $line.Split('=', 2)
            $current[$parts[0].Trim()] = $parts[1].Trim()
        }
    }
    Write-Host "[..] Existing .env found. Its values will be used as defaults." -ForegroundColor Gray
}

# ----- LAN subnet discovery -----
Write-Host "[..] Enumerating LAN adapters..." -ForegroundColor Gray
$subnets = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -match '^(192\.168|10\.|172\.(1[6-9]|2[0-9]|3[0-1]))\.' } |
    Where-Object { $_.InterfaceAlias -notmatch 'Loopback' } |
    ForEach-Object { $_.IPAddress -replace '\.\d+$', '' } |
    Sort-Object -Unique
if (-not $subnets) {
    Write-Host "[WARN] No usable IPv4 LAN adapter found -- will fall back to prompting." -ForegroundColor Yellow
} else {
    Write-Host "     Found subnets: $($subnets -join ', ')" -ForegroundColor Gray
}

# ----- Parallel TCP port scan via runspaces (works on Win PowerShell 5.1) -----
function Find-DevicesOnLan {
    param(
        [string[]]$Subnets,
        [int[]]$Ports,
        [int]$TimeoutMs = 800,
        [int]$MaxThreads = 60
    )
    if (-not $Subnets) { return @() }
    $pool = [runspacefactory]::CreateRunspacePool(1, $MaxThreads)
    $pool.Open()
    $jobs = @()
    foreach ($subnet in $Subnets) {
        foreach ($port in $Ports) {
            foreach ($i in 1..254) {
                $ps = [powershell]::Create()
                $ps.RunspacePool = $pool
                [void]$ps.AddScript({
                    param($ip, $port, $timeoutMs)
                    $tcp = New-Object System.Net.Sockets.TcpClient
                    try {
                        $conn = $tcp.BeginConnect($ip, $port, $null, $null)
                        if ($conn.AsyncWaitHandle.WaitOne($timeoutMs, $false)) {
                            $tcp.EndConnect($conn)
                            return "$($ip):$($port)"
                        }
                    } catch { }
                    finally { if ($tcp) { $tcp.Close() } }
                    return $null
                })
                [void]$ps.AddArgument("$subnet.$i")
                [void]$ps.AddArgument($port)
                [void]$ps.AddArgument($TimeoutMs)
                $jobs += [PSCustomObject]@{ PS = $ps; Handle = $ps.BeginInvoke() }
            }
        }
    }
    $found = @()
    foreach ($job in $jobs) {
        try {
            $result = $job.PS.EndInvoke($job.Handle)
            if ($result) { $found += $result }
        } catch { } finally { $job.PS.Dispose() }
    }
    $pool.Close(); $pool.Dispose()
    return $found
}

$foundCamera = $null
$foundRfid   = $null

if ($subnets) {
    Write-Host "[..] Scanning $($subnets.Count * 254 * 2) addresses for RTSP cameras (~15 sec)..." -ForegroundColor Gray
    # Force array with @() so a single-hit result doesn't get auto-unwrapped
    # to a bare string (in which case $cams[0] would return the first char).
    [array]$cams = @(Find-DevicesOnLan -Subnets $subnets -Ports @(8557, 554))
    if ($cams.Count -gt 0) {
        $foundCamera = [string]$cams[0]
        Write-Host "     Camera found at $foundCamera" -ForegroundColor Green
        if ($cams.Count -gt 1) {
            Write-Host "     (Also saw: $($cams[1..($cams.Count-1)] -join ', '))" -ForegroundColor Gray
        }
    } else {
        Write-Host "     No RTSP responder on 8557/554 -- will prompt." -ForegroundColor Yellow
    }

    Write-Host "[..] Scanning $($subnets.Count * 254) addresses for RFID reader (TCP 200)..." -ForegroundColor Gray
    [array]$rfids = @(Find-DevicesOnLan -Subnets $subnets -Ports @(200))
    if ($rfids.Count -gt 0) {
        $foundRfid = [string]$rfids[0]
        Write-Host "     RFID reader found at $foundRfid" -ForegroundColor Green
    } else {
        Write-Host "     No TCP responder on port 200 -- will prompt." -ForegroundColor Yellow
    }
}

# ----- Now write .env with discovered values, current values, or defaults -----
Write-Banner "Step 3 of 5 -- Writing .env" 'Cyan'

function Prompt-WithDefault {
    param([string]$label, [string]$default)
    if ($default) {
        $v = Read-Host "  $label (Enter = $default)"
        if ([string]::IsNullOrWhiteSpace($v)) { return $default } else { return $v.Trim() }
    } else {
        $v = Read-Host "  $label"
        return $v.Trim()
    }
}

# Cloud credentials (only prompted if not already set)
if (-not $current.ContainsKey('DATABASE_URL')) {
    Write-Host ""
    Write-Host "Cloud credentials (one-time, kept in .env from now on):" -ForegroundColor White
    $current['DATABASE_URL'] = Prompt-WithDefault -label "DATABASE_URL (Neon postgres URL)"
}
if (-not $current.ContainsKey('CLOUD_PUSH_URL')) {
    $current['CLOUD_PUSH_URL'] = Prompt-WithDefault -label "CLOUD_PUSH_URL" -default 'https://vayaccess-cloud.onrender.com'
}
if (-not $current.ContainsKey('CLOUD_PUSH_TOKEN')) {
    $secTok = Read-Host "  CLOUD_PUSH_TOKEN (64-char token from Render env vars)" -AsSecureString
    $current['CLOUD_PUSH_TOKEN'] = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secTok))
}

# Hardware fields -- priority: env-current > auto-detected > historical default
Write-Host ""
Write-Host "Hardware IPs (Enter = accept, or type to override):" -ForegroundColor White
# Compute all defaults ahead of time -- PowerShell 5.1 does NOT support `if`
# as an inline expression inside function-argument parentheses. Each default
# gets its own variable so the syntax is legal 5.1.

# Camera IP + port from discovery, existing .env, or historical default.
$camDefault = $null
if ($foundCamera) {
    $camDefault = ($foundCamera -split ':')[0]
} elseif ($current.ContainsKey('CAMERA_IP')) {
    $camDefault = $current['CAMERA_IP']
} else {
    $camDefault = '192.168.1.12'
}
$current['CAMERA_IP'] = Prompt-WithDefault -label "CAMERA_IP" -default $camDefault

$camPortDefault = $null
if ($foundCamera) {
    $camPortDefault = ($foundCamera -split ':')[1]
} elseif ($current.ContainsKey('CAMERA_PORT')) {
    $camPortDefault = $current['CAMERA_PORT']
} else {
    $camPortDefault = '8557'
}
$current['CAMERA_PORT'] = Prompt-WithDefault -label "CAMERA_PORT" -default $camPortDefault

$camUserDefault = 'admin'
if ($current.ContainsKey('CAMERA_USER')) { $camUserDefault = $current['CAMERA_USER'] }
$current['CAMERA_USER'] = Prompt-WithDefault -label "CAMERA_USER" -default $camUserDefault

$camPassDefault = ''
if ($current.ContainsKey('CAMERA_PASS')) { $camPassDefault = $current['CAMERA_PASS'] }
$current['CAMERA_PASS'] = Prompt-WithDefault -label "CAMERA_PASS (empty for none)" -default $camPassDefault

$camPathDefault = '/stream2'
if ($current.ContainsKey('CAMERA_PATH')) { $camPathDefault = $current['CAMERA_PATH'] }
$current['CAMERA_PATH'] = Prompt-WithDefault -label "CAMERA_PATH" -default $camPathDefault

$rfidDefault = $null
if ($foundRfid) {
    $rfidDefault = ($foundRfid -split ':')[0]
} elseif ($current.ContainsKey('RFID_READER_IP')) {
    $rfidDefault = $current['RFID_READER_IP']
} else {
    $rfidDefault = '192.168.0.200'
}
$current['RFID_READER_IP'] = Prompt-WithDefault -label "RFID_READER_IP" -default $rfidDefault

$rfidPortDefault = $null
if ($foundRfid) {
    $rfidPortDefault = ($foundRfid -split ':')[1]
} elseif ($current.ContainsKey('RFID_READER_PORT')) {
    $rfidPortDefault = $current['RFID_READER_PORT']
} else {
    $rfidPortDefault = '200'
}
$current['RFID_READER_PORT'] = Prompt-WithDefault -label "RFID_READER_PORT" -default $rfidPortDefault

# Sensible defaults for the streaming knobs
if (-not $current.ContainsKey('CLOUD_MODE'))         { $current['CLOUD_MODE']         = '0' }
if (-not $current.ContainsKey('CLOUD_STREAM_FPS'))   { $current['CLOUD_STREAM_FPS']   = '10' }
if (-not $current.ContainsKey('CLOUD_STREAM_JPEG_Q')){ $current['CLOUD_STREAM_JPEG_Q']= '60' }

# Write .env back with a stable key ordering
$keyOrder = @(
    'DATABASE_URL', 'CLOUD_PUSH_URL', 'CLOUD_PUSH_TOKEN', 'CLOUD_MODE',
    'CAMERA_IP', 'CAMERA_PORT', 'CAMERA_USER', 'CAMERA_PASS', 'CAMERA_PATH',
    'RFID_READER_IP', 'RFID_READER_PORT',
    'CLOUD_STREAM_FPS', 'CLOUD_STREAM_JPEG_Q'
)
$lines = @("# Auto-generated by SETUP.bat on $(Get-Date -Format 'yyyy-MM-dd HH:mm')")
foreach ($k in $keyOrder) {
    if ($current.ContainsKey($k)) {
        $lines += "$k=$($current[$k])"
    }
}
# Any custom keys the operator added get appended
foreach ($k in $current.Keys) {
    if (-not ($keyOrder -contains $k)) {
        $lines += "$k=$($current[$k])"
    }
}
$lines | Set-Content -Encoding ascii -Path $envFile
Write-Host "[OK] .env written to $envFile" -ForegroundColor Green

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

} catch {
    # Any unhandled error lands here. Print it PROMINENTLY and pause
    # so the operator can screenshot it instead of the window closing.
    Write-Host ""
    Write-Host "==============================================================" -ForegroundColor Red
    Write-Host "  SETUP FAILED"                                                 -ForegroundColor Red
    Write-Host "==============================================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Error message:" -ForegroundColor Yellow
    Write-Host "  $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Where it failed:" -ForegroundColor Yellow
    Write-Host "  $($_.InvocationInfo.PositionMessage)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Full stack trace:" -ForegroundColor Yellow
    Write-Host "  $($_.ScriptStackTrace)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "==============================================================" -ForegroundColor Red
    Write-Host "  Copy the error above and share it, then press Enter to close" -ForegroundColor Yellow
    Write-Host "==============================================================" -ForegroundColor Red
    Read-Host " "
    exit 1
}

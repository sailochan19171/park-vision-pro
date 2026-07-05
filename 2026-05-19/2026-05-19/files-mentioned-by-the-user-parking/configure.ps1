# VayAccess On-Site Agent -- .env configurator
# Launched by CONFIGURE.bat. Reads .env, prompts for each hardware
# field (Enter keeps current), writes .env back, restarts the
# scheduled task. Pure ASCII so PowerShell 5.1 parses without a BOM.

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Write-Banner($text, $color = 'Cyan') {
    Write-Host ""
    Write-Host "==============================================================" -ForegroundColor $color
    Write-Host "  $text" -ForegroundColor $color
    Write-Host "==============================================================" -ForegroundColor $color
}

$envFile = Join-Path $PSScriptRoot '.env'

# ----- Step 1. Load current .env into a hashtable -----
$current = @{}
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith('#') -and $line.Contains('=')) {
            $parts = $line.Split('=', 2)
            $current[$parts[0].Trim()] = $parts[1].Trim()
        }
    }
} else {
    Write-Host "[WARN] No .env found -- creating a fresh one." -ForegroundColor Yellow
}

Write-Banner "VayAccess On-Site Agent -- Configure" 'Green'
Write-Host ""
Write-Host "For each field:  press ENTER to keep the current value,"
Write-Host "                 or type a new value and press ENTER."
Write-Host ""

# ----- Step 2. Prompt for each editable field -----
#   name           = key in .env
#   label          = human-friendly prompt text
#   default        = fallback if the key isn't in .env yet
#   isSecret       = mask input (used only for CLOUD_PUSH_TOKEN)
$fields = @(
    @{ name='CAMERA_IP';        label='Camera IP address on this LAN';           default='192.168.1.12';   isSecret=$false }
    @{ name='CAMERA_PORT';      label='Camera RTSP port';                        default='8557';            isSecret=$false }
    @{ name='CAMERA_USER';      label='Camera RTSP username';                    default='admin';           isSecret=$false }
    @{ name='CAMERA_PASS';      label='Camera RTSP password  (leave empty=none)';default='';                isSecret=$false }
    @{ name='CAMERA_PATH';      label='Camera RTSP path (e.g. /stream2)';        default='/stream2';        isSecret=$false }
    @{ name='RFID_READER_IP';   label='RFID/UHF reader IP address';              default='192.168.0.200';   isSecret=$false }
    @{ name='RFID_READER_PORT'; label='RFID/UHF reader TCP port';                default='200';             isSecret=$false }
    @{ name='CLOUD_STREAM_FPS'; label='Cloud stream FPS  (10 default)';          default='10';              isSecret=$false }
    @{ name='CLOUD_STREAM_JPEG_Q';label='Cloud stream JPEG quality (60 default)';default='60';              isSecret=$false }
)

foreach ($f in $fields) {
    $cur = if ($current.ContainsKey($f.name)) { $current[$f.name] } else { $f.default }
    if ($f.isSecret -and $cur) {
        $curDisplay = "<set, $($cur.Length) chars>"
    } else {
        $curDisplay = $cur
    }
    $prompt = "  {0,-24} [current: {1}]" -f $f.label, $curDisplay
    Write-Host $prompt -ForegroundColor White
    $new = Read-Host "  new value (Enter=keep current)"
    if (-not [string]::IsNullOrEmpty($new)) {
        $current[$f.name] = $new.Trim()
    } else {
        $current[$f.name] = $cur
    }
    Write-Host ""
}

# ----- Step 3. Preserve fields the user must NOT change accidentally -----
# DATABASE_URL, CLOUD_PUSH_URL, CLOUD_PUSH_TOKEN and CLOUD_MODE are set once
# by SETUP.bat and should remain untouched. We keep whatever value already
# lives in .env for those keys.
$preservedKeys = @('DATABASE_URL','CLOUD_PUSH_URL','CLOUD_PUSH_TOKEN','CLOUD_MODE')

# ----- Step 4. Write .env back -----
$lines = @("# Auto-updated by CONFIGURE.bat on $(Get-Date -Format 'yyyy-MM-dd HH:mm')")
foreach ($k in $preservedKeys) {
    if ($current.ContainsKey($k)) {
        $lines += "$k=$($current[$k])"
    }
}
$lines += ""
$lines += "# Per-site hardware -- editable via CONFIGURE.bat"
foreach ($f in $fields) {
    $lines += "$($f.name)=$($current[$f.name])"
}
# Include any custom keys the user added manually that we don't know about
foreach ($k in $current.Keys) {
    if (-not ($preservedKeys -contains $k) -and -not ($fields.name -contains $k)) {
        $lines += "$k=$($current[$k])"
    }
}

$lines | Set-Content -Encoding ascii -Path $envFile
Write-Host "[OK] .env written to $envFile" -ForegroundColor Green

# ----- Step 5. Restart the scheduled task so changes take effect -----
Write-Banner "Restarting the on-site agent so new values take effect" 'Cyan'

$principal = [Security.Principal.WindowsPrincipal]::new(
    [Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Restart step needs Administrator. Requesting elevation..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
        "Stop-ScheduledTask -TaskName VayAccessOnSiteAgent -ErrorAction SilentlyContinue; " +
        "Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue; " +
        "Start-Sleep 3; " +
        "Start-ScheduledTask -TaskName VayAccessOnSiteAgent; " +
        "Write-Host '[OK] Task restarted.' -ForegroundColor Green; " +
        "Start-Sleep 15; " +
        "Write-Host ''; Write-Host 'Latest log lines:' -ForegroundColor Cyan; " +
        "Get-Content 'logs\onsite-*.log' -Tail 20; " +
        "Read-Host 'Press Enter to close'"
    ) -Verb RunAs
} else {
    Stop-ScheduledTask -TaskName VayAccessOnSiteAgent -ErrorAction SilentlyContinue
    Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep 3
    Start-ScheduledTask -TaskName VayAccessOnSiteAgent
    Write-Host "[OK] Task restarted." -ForegroundColor Green
    Start-Sleep 15
    Write-Host ""
    Write-Host "Latest log lines:" -ForegroundColor Cyan
    Get-Content "$PSScriptRoot\logs\onsite-*.log" -Tail 20
}

Write-Host ""
Write-Host "==============================================================" -ForegroundColor Green
Write-Host "  Configuration saved. Press Enter to close." -ForegroundColor Green
Write-Host "==============================================================" -ForegroundColor Green
Read-Host " "

# VayAccess On-Site Agent — auto-start installer
#
# Registers a Windows Scheduled Task named "VayAccessOnSiteAgent" that runs
# run.bat on every system boot. Restarts app.py within 1 minute if it crashes.
# Runs whether or not a user is logged in.
#
# USE:
#   1. Right-click PowerShell → "Run as Administrator" (required for boot tasks)
#   2. cd D:\park-vision-pro\2026-05-19\2026-05-19\files-mentioned-by-the-user-parking
#   3. .\install-onsite-agent.ps1
#
# UNINSTALL:
#   .\uninstall-onsite-agent.ps1

[CmdletBinding()]
param(
    [string]$TaskName = 'VayAccessOnSiteAgent',
    [string]$RunBat   = (Join-Path $PSScriptRoot 'run.bat')
)

$ErrorActionPreference = 'Stop'

# --- 1. Guard: must run elevated ---
$principal = [Security.Principal.WindowsPrincipal]::new(
    [Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "[ERR] This script must be run as Administrator." -ForegroundColor Red
    Write-Host "     Right-click PowerShell -> 'Run as administrator', then run it again."
    exit 1
}

# --- 2. Guard: run.bat must exist ---
if (-not (Test-Path $RunBat)) {
    Write-Host "[ERR] run.bat not found at $RunBat" -ForegroundColor Red
    Write-Host "     Are you running this script from the files-mentioned-by-the-user-parking folder?"
    exit 1
}

# --- 3. If task already exists, remove it so we can recreate cleanly ---
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "[..] Removing existing '$TaskName' task..."
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

# --- 4. Build the task definition ---
# Action: run the batch file. We wrap it so any relative paths resolve
# from the script's directory (WorkingDirectory).
$action = New-ScheduledTaskAction `
    -Execute 'cmd.exe' `
    -Argument "/c `"$RunBat`"" `
    -WorkingDirectory (Split-Path $RunBat -Parent)

# Trigger: at every system boot. Delay 30 s so networking + Ethernet
# adapters are up before Flask tries to open the RTSP stream.
$trigger = New-ScheduledTaskTrigger -AtStartup
$trigger.Delay = 'PT30S'   # ISO-8601 duration: 30 seconds

# Run as SYSTEM so login is not required. NetworkService or a specific user
# would also work; SYSTEM keeps setup simplest for a dedicated gate PC.
$principal2 = New-ScheduledTaskPrincipal `
    -UserId 'NT AUTHORITY\SYSTEM' `
    -LogonType ServiceAccount `
    -RunLevel Highest

# Settings: allow the task to run for up to 999 days, don't stop it if the
# task engine can't reach the network initially, and restart if it fails.
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Days 999) `
    -MultipleInstances IgnoreNew

# --- 5. Register it ---
Register-ScheduledTask `
    -TaskName    $TaskName `
    -Description 'VayAccess on-site agent — polls UHF reader, decodes RTSP, pushes scans + frames to cloud. Runs on system startup.' `
    -Action      $action `
    -Trigger     $trigger `
    -Principal   $principal2 `
    -Settings    $settings | Out-Null

# --- 6. Start it immediately so the operator can verify without a reboot ---
Write-Host "[OK] Task '$TaskName' registered." -ForegroundColor Green
Write-Host "[..] Starting it now to confirm it works..."
Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 3

$state = (Get-ScheduledTask -TaskName $TaskName).State
Write-Host "[OK] Task state: $state" -ForegroundColor Green

Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Tail the log:  Get-Content logs\onsite-*.log -Wait -Tail 20"
Write-Host "  2. Reboot to prove it survives -- the task will fire 30 s after boot."
Write-Host "  3. To stop:       Stop-ScheduledTask -TaskName '$TaskName'"
Write-Host "  4. To uninstall:  .\uninstall-onsite-agent.ps1"

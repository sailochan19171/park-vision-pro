# ─────────────────────────────────────────────────────────────
# VayAccess On-Site Agent — Target Uninstaller
#
# Run on the gate PC to remove:
#   1. The scheduled task
#   2. Any running VayAccessAgent process
#   3. The installed folder (default C:\Program Files\VayAccess)
#
# USE:
#   Right-click PowerShell -> Run as Administrator
#   cd 'C:\Program Files\VayAccess'
#   .\uninstall.ps1
# ─────────────────────────────────────────────────────────────

[CmdletBinding()]
param(
    [string]$TaskName   = 'VayAccessOnSiteAgent',
    [string]$InstallDir = 'C:\Program Files\VayAccess'
)

$ErrorActionPreference = 'Continue'

$principal = [Security.Principal.WindowsPrincipal]::new(
    [Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "[ERR] Run this script as Administrator." -ForegroundColor Red
    exit 1
}

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "[..] Stopping + unregistering scheduled task '$TaskName'..."
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Start-Sleep 2
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "[OK] Task removed." -ForegroundColor Green
} else {
    Write-Host "[OK] No task named '$TaskName' — nothing to unregister."
}

Write-Host "[..] Killing any running agent process..."
Get-Process VayAccessAgent -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep 2

if (Test-Path $InstallDir) {
    Write-Host "[..] Removing install folder $InstallDir ..."
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $InstallDir
    if (Test-Path $InstallDir) {
        Write-Host "[WARN] Some files could not be deleted (locked). Reboot and remove manually." -ForegroundColor Yellow
    } else {
        Write-Host "[OK] Install folder removed." -ForegroundColor Green
    }
} else {
    Write-Host "[OK] No install folder at $InstallDir."
}

Write-Host ""
Write-Host "Uninstall complete. Reinstall by running install.ps1 in a fresh bundle copy."

# VayAccess On-Site Agent — uninstaller
#
# Removes the "VayAccessOnSiteAgent" scheduled task registered by
# install-onsite-agent.ps1. Also kills any running python.exe under this
# working directory so the next `python app.py` starts cleanly.
#
# USE:
#   1. Right-click PowerShell -> Run as Administrator
#   2. cd D:\park-vision-pro\2026-05-19\2026-05-19\files-mentioned-by-the-user-parking
#   3. .\uninstall-onsite-agent.ps1

[CmdletBinding()]
param(
    [string]$TaskName = 'VayAccessOnSiteAgent'
)

$ErrorActionPreference = 'Continue'

$principal = [Security.Principal.WindowsPrincipal]::new(
    [Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "[ERR] This script must be run as Administrator." -ForegroundColor Red
    exit 1
}

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $existing) {
    Write-Host "[OK] No task named '$TaskName' — nothing to uninstall." -ForegroundColor Green
} else {
    Write-Host "[..] Stopping task..."
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue

    Write-Host "[..] Unregistering task..."
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "[OK] Task removed." -ForegroundColor Green
}

# Kill any python.exe that's still running our app.py (identifies by cmdline).
# Skip anything that isn't ours so we don't take down another Python project.
$agentPython = Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
               Where-Object { $_.CommandLine -match 'files-mentioned-by-the-user-parking' -and $_.CommandLine -match 'app\.py' }

if ($agentPython) {
    Write-Host "[..] Killing $($agentPython.Count) running agent python.exe process(es)..."
    foreach ($p in $agentPython) {
        try {
            Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop
            Write-Host "     killed PID $($p.ProcessId)"
        } catch {
            Write-Host "     could not kill PID $($p.ProcessId): $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "[OK] No agent python.exe currently running."
}

Write-Host ""
Write-Host "Uninstall complete. The on-site agent will NOT start on next boot."
Write-Host "To reinstall: .\install-onsite-agent.ps1"

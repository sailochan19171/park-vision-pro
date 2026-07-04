# ─────────────────────────────────────────────────────────────
# VayAccess On-Site Agent — Portable Bundle Builder
#
# Run this ONCE on your dev PC (the one with the working
# Python + venv + all ML deps installed). Produces a folder at
#   dist\VayAccessAgent\
# that you copy to any Windows gate PC. The target PC needs
# NO Python, NO git, NO pip — just Windows 10/11 x64.
#
# What ships inside the bundle:
#   VayAccessAgent.exe       — launcher (embedded Python runtime)
#   _internal\               — Python interpreter + all deps
#                              (numpy, cv2, ultralytics, easyocr,
#                              flask, sqlalchemy, ~1.2 GB)
#   templates\               — Flask templates
#   static\                  — JS + CSS
#   install.ps1              — target-side installer (registers
#                              scheduled task, prompts for env vars)
#   uninstall.ps1            — reverses the install
#   README.txt               — one-page operator guide
#
# USE:
#   cd D:\park-vision-pro\2026-05-19\2026-05-19\files-mentioned-by-the-user-parking
#   .\build-portable.ps1
#
# First build is slow (~10-15 minutes) because PyInstaller collects
# every dependency. Subsequent builds reuse the PyInstaller cache
# and take ~2 minutes.
# ─────────────────────────────────────────────────────────────

[CmdletBinding()]
param(
    [string]$Python = 'D:\park-vision-pro\2026-05-19\venv\Scripts\python.exe',
    [string]$OutDir = (Join-Path $PSScriptRoot 'dist'),
    [switch]$Clean
)

$ErrorActionPreference = 'Stop'
$AppDir  = $PSScriptRoot
$AppName = 'VayAccessAgent'

# Step 1: verify the source Python has the deps we need.
if (-not (Test-Path $Python)) {
    Write-Host "[ERR] Python not found at $Python" -ForegroundColor Red
    Write-Host "     Point -Python to a venv or system python that has YOLO/OpenCV installed."
    exit 1
}

Write-Host "[..] Verifying dev-side dependencies..." -ForegroundColor Cyan
$check = & $Python -c "import cv2, flask, ultralytics, easyocr; print('OK')" 2>&1
if ($check -notmatch 'OK') {
    Write-Host "[ERR] Missing deps in the source Python:" -ForegroundColor Red
    Write-Host $check
    Write-Host "     Run 'pip install -r requirements.txt' inside the venv first."
    exit 1
}

# Step 2: install PyInstaller into the source venv (idempotent).
Write-Host "[..] Ensuring PyInstaller is installed..." -ForegroundColor Cyan
& $Python -m pip install --quiet --disable-pip-version-check pyinstaller

if ($Clean) {
    Write-Host "[..] Wiping build cache..." -ForegroundColor Cyan
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue "$AppDir\build"
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $OutDir
    Remove-Item -Force -ErrorAction SilentlyContinue "$AppDir\$AppName.spec"
}

# Step 3: build the bundle.
Write-Host "[..] Building portable bundle (first run: 10-15 min)..." -ForegroundColor Cyan
Push-Location $AppDir
try {
    & $Python -m PyInstaller `
        --noconfirm `
        --clean `
        --name $AppName `
        --distpath $OutDir `
        --workpath (Join-Path $AppDir 'build') `
        --add-data "templates;templates" `
        --add-data "static;static" `
        --add-data ".env.example;." `
        --collect-all "ultralytics" `
        --collect-all "easyocr" `
        --collect-all "torch" `
        --collect-data "flask" `
        --hidden-import "engineio.async_drivers.threading" `
        --console `
        app.py

    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERR] PyInstaller failed. Check output above." -ForegroundColor Red
        exit 1
    }
} finally {
    Pop-Location
}

$BundleDir = Join-Path $OutDir $AppName
if (-not (Test-Path $BundleDir)) {
    Write-Host "[ERR] Bundle dir missing at $BundleDir" -ForegroundColor Red
    exit 1
}

# Step 4: drop install.ps1 + uninstall.ps1 + README + .env template into the bundle.
Write-Host "[..] Copying installer scripts + docs into bundle..." -ForegroundColor Cyan
Copy-Item -Force (Join-Path $AppDir 'install-portable.ps1')  (Join-Path $BundleDir 'install.ps1')
Copy-Item -Force (Join-Path $AppDir 'uninstall-portable.ps1') (Join-Path $BundleDir 'uninstall.ps1')
Copy-Item -Force (Join-Path $AppDir 'PORTABLE_README.txt')    (Join-Path $BundleDir 'README.txt')
Copy-Item -Force (Join-Path $AppDir '.env.example')           (Join-Path $BundleDir '.env.example')

# Step 5: report size + instructions.
$sizeMB = [math]::Round(((Get-ChildItem $BundleDir -Recurse -File | Measure-Object -Property Length -Sum).Sum) / 1MB)
Write-Host ""
Write-Host "[OK] Bundle ready at:  $BundleDir" -ForegroundColor Green
Write-Host "     Size: $sizeMB MB"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Copy the folder '$BundleDir' to any Windows gate PC"
Write-Host "     (via USB stick, network share, or zip + email)."
Write-Host "  2. On the target PC, right-click PowerShell -> Run as Administrator"
Write-Host "  3. cd into the copied folder"
Write-Host "  4. .\install.ps1"
Write-Host "     (Will prompt for CLOUD_PUSH_URL, CLOUD_PUSH_TOKEN, DATABASE_URL)"
Write-Host "  5. Done. Auto-starts on every boot from then on."

# VayAccess Email Backend Setup Script
# Run this script to automatically set up the email automation system

Write-Host "Setting up VayAccess Email Backend..." -ForegroundColor Green

# Check if Node.js is installed
try {
    $nodeVersion = node --version
    Write-Host "Node.js detected: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "Node.js not found. Please install Node.js from https://nodejs.org/" -ForegroundColor Red
    exit 1
}

# Navigate to backend directory
Write-Host "Navigating to backend directory..." -ForegroundColor Yellow
Set-Location "$PSScriptRoot\backend"

# Install dependencies
Write-Host "Installing backend dependencies..." -ForegroundColor Yellow
npm install

if ($LASTEXITCODE -eq 0) {
    Write-Host "Dependencies installed successfully!" -ForegroundColor Green
} else {
    Write-Host "Failed to install dependencies" -ForegroundColor Red
    exit 1
}

# Check if .env file exists
if (Test-Path ".env") {
    Write-Host ".env file already exists" -ForegroundColor Green
} else {
    Write-Host "Creating .env file from template..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host "Please edit the .env file with your email credentials!" -ForegroundColor Yellow
    Write-Host "   Required: SMTP_USER and SMTP_PASS" -ForegroundColor Yellow
}

# Create frontend .env if it doesn't exist
Set-Location "$PSScriptRoot"
if (!(Test-Path ".env")) {
    Write-Host "Creating frontend .env file..." -ForegroundColor Yellow
    "VITE_API_URL=http://localhost:3001/api" | Out-File -FilePath ".env" -Encoding UTF8
    Write-Host "Frontend .env created" -ForegroundColor Green
}

Write-Host ""
Write-Host "Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Edit backend/.env with your email credentials" -ForegroundColor White
Write-Host "2. Run: Set-Location backend; npm run dev" -ForegroundColor White
Write-Host "3. Test: http://localhost:3001/api/health" -ForegroundColor White
Write-Host ""
Write-Host "See EMAIL_AUTOMATION_SETUP_GUIDE.md for detailed instructions" -ForegroundColor Yellow

# Offer to start the server
$startServer = Read-Host "Would you like to start the email server now? (y/N)"
if ($startServer -eq "y" -or $startServer -eq "Y") {
    Write-Host "Starting email backend server..." -ForegroundColor Green
    Set-Location "backend"
    npm run dev
}
# VayAccess AI Call Agent Setup Script
# This script automates the installation and setup of the AI Call Agent system

Write-Host "🤖 VayAccess AI Call Agent Setup Script" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan

# Check if Node.js is installed
Write-Host "`n📋 Checking prerequisites..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js not found. Please install Node.js 16+ from https://nodejs.org" -ForegroundColor Red
    exit 1
}

# Check if npm is available
try {
    $npmVersion = npm --version
    Write-Host "✅ npm found: v$npmVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ npm not found. Please ensure npm is installed with Node.js" -ForegroundColor Red
    exit 1
}

Write-Host "`n📦 Installing dependencies..." -ForegroundColor Yellow

# Install backend dependencies
Write-Host "Installing backend dependencies..." -ForegroundColor Blue
Set-Location "backend"
npm install

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Backend dependencies installed successfully" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to install backend dependencies" -ForegroundColor Red
    exit 1
}

# Go back to root and install frontend dependencies
Set-Location ".."
Write-Host "Installing frontend dependencies..." -ForegroundColor Blue
npm install

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Frontend dependencies installed successfully" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to install frontend dependencies" -ForegroundColor Red
    exit 1
}

# Create necessary directories
Write-Host "`n📁 Creating required directories..." -ForegroundColor Yellow
$directories = @(
    "backend/recordings",
    "backend/recordings/call_logs",
    "backend/recordings/tts",
    "backend/temp"
)

foreach ($dir in $directories) {
    if (!(Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "✅ Created directory: $dir" -ForegroundColor Green
    } else {
        Write-Host "✅ Directory already exists: $dir" -ForegroundColor Green
    }
}

# Check environment files
Write-Host "`n🔧 Checking environment configuration..." -ForegroundColor Yellow

$backendEnvPath = "backend/.env"
$backendEnvExamplePath = "backend/.env.example"

if (!(Test-Path $backendEnvPath)) {
    if (Test-Path $backendEnvExamplePath) {
        Copy-Item $backendEnvExamplePath $backendEnvPath
        Write-Host "✅ Created backend/.env from template" -ForegroundColor Green
        Write-Host "⚠️  Please edit backend/.env with your API keys" -ForegroundColor Yellow
    } else {
        Write-Host "❌ backend/.env.example not found" -ForegroundColor Red
    }
} else {
    Write-Host "✅ Backend environment file exists" -ForegroundColor Green
}

# Check for required environment variables
Write-Host "`n🔑 Checking required API keys..." -ForegroundColor Yellow
$envContent = Get-Content $backendEnvPath -ErrorAction SilentlyContinue

$requiredKeys = @("OPENAI_API_KEY", "SMTP_USER", "SMTP_PASS")
$missingKeys = @()

foreach ($key in $requiredKeys) {
    if ($envContent -match "^$key=.+") {
        $value = ($envContent | Select-String "^$key=(.+)" | ForEach-Object { $_.Matches.Groups[1].Value })
        if ($value -and $value -ne "your_${key}_here" -and $value -ne "your_openai_api_key_here") {
            Write-Host "✅ $key is configured" -ForegroundColor Green
        } else {
            $missingKeys += $key
            Write-Host "⚠️  $key needs to be set" -ForegroundColor Yellow
        }
    } else {
        $missingKeys += $key
        Write-Host "❌ $key not found in .env file" -ForegroundColor Red
    }
}

if ($missingKeys.Count -gt 0) {
    Write-Host "`n⚠️  IMPORTANT: Please configure these environment variables in backend/.env:" -ForegroundColor Yellow
    foreach ($key in $missingKeys) {
        Write-Host "   - $key" -ForegroundColor Red
    }
}

# Create frontend environment file if it doesn't exist
$frontendEnvPath = ".env.local"
if (!(Test-Path $frontendEnvPath)) {
    $frontendEnvContent = "VITE_API_BASE_URL=http://localhost:3001"
    $frontendEnvContent | Out-File -FilePath $frontendEnvPath -Encoding UTF8
    Write-Host "✅ Created .env.local for frontend" -ForegroundColor Green
}

# Test basic functionality
Write-Host "`n🧪 Running basic tests..." -ForegroundColor Yellow

# Test backend startup (without API keys for now)
Write-Host "Testing backend startup..." -ForegroundColor Blue
Set-Location "backend"

# Create a temporary test file to check if the service loads
$testScript = @"
try {
    const express = require('express');
    console.log('✅ Express loaded successfully');
    const { Server } = require('socket.io');
    console.log('✅ Socket.IO loaded successfully');
    const multer = require('multer');
    console.log('✅ Multer loaded successfully');
    console.log('✅ All backend dependencies are working');
    process.exit(0);
} catch (error) {
    console.log('❌ Backend dependency error:', error.message);
    process.exit(1);
}
"@

$testScript | Out-File -FilePath "test-deps.js" -Encoding UTF8
node test-deps.js

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Backend dependencies test passed" -ForegroundColor Green
} else {
    Write-Host "❌ Backend dependencies test failed" -ForegroundColor Red
}

Remove-Item "test-deps.js" -ErrorAction SilentlyContinue
Set-Location ".."

# Final summary
Write-Host "`n🎉 Setup Complete!" -ForegroundColor Green
Write-Host "=================" -ForegroundColor Green

Write-Host "`n📋 Next Steps:" -ForegroundColor Cyan
Write-Host "1. Configure your API keys in backend/.env:" -ForegroundColor White
Write-Host "   - Get OpenAI API key from: https://platform.openai.com/api-keys" -ForegroundColor Gray
Write-Host "   - Configure your SMTP settings for email notifications" -ForegroundColor Gray

if ($missingKeys -contains "OPENAI_API_KEY") {
    Write-Host "`n   Example OPENAI_API_KEY configuration:" -ForegroundColor Yellow
    Write-Host "   OPENAI_API_KEY=sk-proj-your_actual_openai_key_here" -ForegroundColor Gray
}

Write-Host "`n2. Start the development servers:" -ForegroundColor White
Write-Host "   Backend:  cd backend && npm run dev" -ForegroundColor Gray
Write-Host "   Frontend: npm run dev" -ForegroundColor Gray

Write-Host "`n3. Test the AI Call Agent:" -ForegroundColor White
Write-Host "   - Open http://localhost:5173" -ForegroundColor Gray
Write-Host "   - Go to Contact section" -ForegroundColor Gray
Write-Host "   - Click '🤖 Talk to AI Expert'" -ForegroundColor Gray

Write-Host "`n4. Access Admin Dashboard:" -ForegroundColor White
Write-Host "   - Go to http://localhost:5173/admin/calls" -ForegroundColor Gray
Write-Host "   - Monitor all AI call interactions" -ForegroundColor Gray

Write-Host "`n📚 Documentation:" -ForegroundColor Cyan
Write-Host "   Full setup guide: AI_CALL_AGENT_SETUP_GUIDE.md" -ForegroundColor Gray

Write-Host "`n🚀 Your AI Call Agent system is ready to revolutionize customer support!" -ForegroundColor Green

# Pause to let user read the information
Write-Host "`nPress any key to continue..." -ForegroundColor DarkGray
$host.UI.RawUI.ReadKey() | Out-Null
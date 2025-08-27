# Simple PowerShell script to check users and test creation
Write-Host "Checking existing users..." -ForegroundColor Cyan

try {
    # Login first
    $loginResult = Invoke-RestMethod -Uri "http://localhost:8080/api/test/login" -Method POST -ContentType "application/json" -SessionVariable websession
    Write-Host "Login successful" -ForegroundColor Green
    
    # Get users
    $usersResult = Invoke-RestMethod -Uri "http://localhost:8080/api/admin/users" -Method GET -ContentType "application/json" -WebSession $websession
    Write-Host "Found users:" -ForegroundColor Yellow
    
    foreach ($user in $usersResult.users) {
        Write-Host "  - $($user.email) ($($user.name))" -ForegroundColor White
    }
    
    Write-Host "`nTips:" -ForegroundColor Cyan
    Write-Host "- Don't use admin@test.com (already exists)" -ForegroundColor White
    Write-Host "- Try: user1@test.com, john@example.com, etc." -ForegroundColor White
    
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "Done!" -ForegroundColor Green
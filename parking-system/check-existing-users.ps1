# PowerShell script to check existing users and test user creation
Write-Host "🔍 Checking existing users..." -ForegroundColor Cyan

try {
    # First login to get session
    Write-Host "`n1. Logging in as test admin..."
    $loginResponse = Invoke-RestMethod -Uri "http://localhost:8080/api/test/login" -Method POST -ContentType "application/json" -SessionVariable session
    Write-Host "✅ Logged in successfully"
    
    # Get existing users
    Write-Host "`n2. Fetching existing users..."
    $usersResponse = Invoke-RestMethod -Uri "http://localhost:8080/api/admin/users" -Method GET -ContentType "application/json" -WebSession $session
    
    if ($usersResponse.success) {
        $users = $usersResponse.users
        Write-Host "✅ Found $($users.Count) existing users:" -ForegroundColor Green
        
        foreach ($user in $users) {
            Write-Host "   📧 $($user.email) - $($user.name) ($($user.role))" -ForegroundColor Yellow
        }
        
        # Test creating a user with a unique email
        Write-Host "`n3. Testing user creation with unique email..."
        $timestamp = Get-Date -Format "yyyyMMddHHmmss"
        $testUser = @{
            name = "Test User $timestamp"
            email = "testuser$timestamp@example.com"
            phone = "9999999999"
            role = "user"
            password = "testpass123"
            status = "active"
        } | ConvertTo-Json
        
        try {
            $createResponse = Invoke-RestMethod -Uri "http://localhost:8080/api/admin/users" -Method POST -ContentType "application/json" -Body $testUser -WebSession $session
            
            if ($createResponse.success) {
                Write-Host "✅ User created successfully: $($createResponse.user.email)" -ForegroundColor Green
            } else {
                Write-Host "❌ User creation failed: $($createResponse.message)" -ForegroundColor Red
            }
        } catch {
            Write-Host "❌ User creation request failed: $($_.Exception.Message)" -ForegroundColor Red
        }
        
    } else {
        Write-Host "❌ Failed to fetch users: $($usersResponse.message)" -ForegroundColor Red
    }
    
} catch {
    Write-Host "❌ Script failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n📝 Tips for creating users:" -ForegroundColor Cyan
Write-Host "   • Use unique email addresses (not admin@test.com or existing emails)" -ForegroundColor White
Write-Host "   • Email format: user@example.com" -ForegroundColor White
Write-Host "   • Available roles: user, admin, premium" -ForegroundColor White
Write-Host "   • Try: user1@test.com, john.doe@company.com, etc." -ForegroundColor White

Write-Host "`n🏁 User check completed!" -ForegroundColor Cyan
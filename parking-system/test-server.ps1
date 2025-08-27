# PowerShell script to test server APIs
Write-Host "🧪 Testing server APIs..." -ForegroundColor Cyan

# Test 1: Test login
Write-Host "`n1. Testing test login..."
try {
    $loginResponse = Invoke-RestMethod -Uri "http://localhost:8080/api/test/login" -Method POST -ContentType "application/json"
    Write-Host "✅ Test login successful" -ForegroundColor Green
    
    # Test 2: Test users API (should return 401 without proper session)
    Write-Host "`n2. Testing users API without auth..."
    try {
        $usersResponse = Invoke-RestMethod -Uri "http://localhost:8080/api/admin/users" -Method GET -ContentType "application/json"
        Write-Host "❌ Users API should have required auth" -ForegroundColor Red
    } catch {
        if ($_.Exception.Response.StatusCode -eq 401) {
            Write-Host "✅ Users API correctly returns 401 for unauthenticated requests" -ForegroundColor Green
        } else {
            Write-Host "❌ Users API returned unexpected error: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
    
    Write-Host "`n3. Testing server status..."
    $dashboardResponse = Invoke-WebRequest -Uri "http://localhost:8080/admin/login" -UseBasicParsing
    if ($dashboardResponse.StatusCode -eq 200) {
        Write-Host "✅ Admin login page is accessible" -ForegroundColor Green
    } else {
        Write-Host "❌ Admin login page failed" -ForegroundColor Red
    }
    
} catch {
    Write-Host "❌ Test login failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n🏁 Server tests completed!" -ForegroundColor Cyan
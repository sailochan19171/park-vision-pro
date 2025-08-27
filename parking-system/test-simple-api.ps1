# Simple API test to debug the issue
Write-Host "Starting server test..." -ForegroundColor Cyan

# Start server in the background and capture output
$serverProcess = Start-Process -FilePath "node" -ArgumentList "admin-server.js" -WorkingDirectory "c:\Users\Home\park-vision-pro\parking-system" -PassThru -RedirectStandardOutput "server-output.log" -RedirectStandardError "server-error.log"

Write-Host "Server started with PID: $($serverProcess.Id)" -ForegroundColor Green
Write-Host "Waiting 5 seconds for server to start..." -ForegroundColor Yellow
Start-Sleep 5

try {
    # Test login
    $loginResult = Invoke-RestMethod -Uri "http://localhost:8080/api/test/login" -Method POST -ContentType "application/json" -SessionVariable websession
    Write-Host "✅ Login successful" -ForegroundColor Green
    
    # Simple booking test
    $bookingData = @{
        customerName = "Test User"
        customerEmail = "test@example.com"
        vehicleNumber = "ABC123"
        parkingSpot = "BLR-001"
        startDateTime = (Get-Date).ToString("yyyy-MM-ddTHH:mm")
        endDateTime = (Get-Date).AddHours(1).ToString("yyyy-MM-ddTHH:mm")
    } | ConvertTo-Json
    
    Write-Host "Testing booking creation..." -ForegroundColor Yellow
    
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8080/api/admin/bookings" -Method POST -ContentType "application/json" -Body $bookingData -WebSession $websession -UseBasicParsing
        Write-Host "✅ Response Status: $($response.StatusCode)" -ForegroundColor Green
        Write-Host "Response: $($response.Content)" -ForegroundColor White
    } catch {
        Write-Host "❌ Request failed: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.Exception.Response) {
            $stream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $errorBody = $reader.ReadToEnd()
            Write-Host "Error body: $errorBody" -ForegroundColor Red
        }
    }
    
} catch {
    Write-Host "❌ Test failed: $($_.Exception.Message)" -ForegroundColor Red
} finally {
    Write-Host "`nServer logs:" -ForegroundColor Cyan
    if (Test-Path "server-output.log") {
        Get-Content "server-output.log" | ForEach-Object { Write-Host $_ -ForegroundColor White }
    }
    if (Test-Path "server-error.log") {
        Write-Host "`nErrors:" -ForegroundColor Red
        Get-Content "server-error.log" | ForEach-Object { Write-Host $_ -ForegroundColor Red }
    }
    
    # Kill server
    Stop-Process -Id $serverProcess.Id -Force
    Write-Host "`n✅ Test completed" -ForegroundColor Green
}
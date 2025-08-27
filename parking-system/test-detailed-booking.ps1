# Test booking creation with detailed error logging
Write-Host "Testing booking creation with detailed errors..." -ForegroundColor Cyan

try {
    # Login
    $loginResult = Invoke-RestMethod -Uri "http://localhost:8080/api/test/login" -Method POST -ContentType "application/json" -SessionVariable websession
    Write-Host "✅ Login successful" -ForegroundColor Green
    
    # Test booking creation with same data as the user
    $bookingData = @{
        customerName = "manikanta"
        customerEmail = "manikanta@doctorite.ai"
        vehicleNumber = "TS994040224"
        parkingSpot = "BLR-002"
        startDateTime = "2026-05-18T06:38"
        endDateTime = "2026-06-23T18:07"
    } | ConvertTo-Json
    
    Write-Host "`nTesting booking creation..." -ForegroundColor Yellow
    Write-Host "Data: $bookingData" -ForegroundColor Gray
    
    try {
        $bookingResult = Invoke-RestMethod -Uri "http://localhost:8080/api/admin/bookings" -Method POST -ContentType "application/json" -Body $bookingData -WebSession $websession
        
        if ($bookingResult.success) {
            Write-Host "✅ Booking created successfully!" -ForegroundColor Green
        } else {
            Write-Host "❌ Booking failed: $($bookingResult.message)" -ForegroundColor Red
            if ($bookingResult.error) {
                Write-Host "Error details: $($bookingResult.error)" -ForegroundColor Red
            }
        }
    } catch {
        $errorResponse = $_.Exception.Response
        if ($errorResponse) {
            $stream = $errorResponse.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $errorBody = $reader.ReadToEnd()
            $errorObj = $errorBody | ConvertFrom-Json
            
            Write-Host "❌ Detailed Error:" -ForegroundColor Red
            Write-Host "Message: $($errorObj.message)" -ForegroundColor Red
            if ($errorObj.error) {
                Write-Host "Stack: $($errorObj.error)" -ForegroundColor Red
            }
        } else {
            Write-Host "❌ Network error: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
    
} catch {
    Write-Host "❌ Test setup failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n✅ Test completed" -ForegroundColor Green
# PowerShell script to test booking creation
Write-Host "🧪 Testing booking creation..." -ForegroundColor Cyan

try {
    # Login first
    Write-Host "`n1. Logging in..."
    $loginResult = Invoke-RestMethod -Uri "http://localhost:8080/api/test/login" -Method POST -ContentType "application/json" -SessionVariable websession
    Write-Host "✅ Login successful" -ForegroundColor Green
    
    # Check available parking spots
    Write-Host "`n2. Checking available parking spots..."
    $spotsResult = Invoke-RestMethod -Uri "http://localhost:8080/api/admin/parking-spots" -Method GET -ContentType "application/json" -WebSession $websession
    
    if ($spotsResult.success) {
        $availableSpots = $spotsResult.spots | Where-Object { $_.status -eq "available" }
        Write-Host "✅ Found $($availableSpots.Count) available spots:" -ForegroundColor Green
        foreach ($spot in $availableSpots | Select-Object -First 3) {
            Write-Host "   📍 $($spot.spotNumber) - $($spot.location.name)" -ForegroundColor Yellow
        }
        
        if ($availableSpots.Count -gt 0) {
            # Test booking creation
            Write-Host "`n3. Testing booking creation..."
            $testSpot = $availableSpots[0].spotNumber
            $startTime = (Get-Date).ToString("yyyy-MM-ddTHH:mm")
            $endTime = (Get-Date).AddHours(2).ToString("yyyy-MM-ddTHH:mm")
            
            $bookingData = @{
                customerName = "Test Customer"
                customerEmail = "testcustomer@example.com"
                vehicleNumber = "TEST-BOOK-001"
                parkingSpot = $testSpot
                startDateTime = $startTime
                endDateTime = $endTime
            } | ConvertTo-Json
            
            Write-Host "   📝 Creating booking for spot: $testSpot" -ForegroundColor White
            
            try {
                $bookingResult = Invoke-RestMethod -Uri "http://localhost:8080/api/admin/bookings" -Method POST -ContentType "application/json" -Body $bookingData -WebSession $websession
                
                if ($bookingResult.success) {
                    Write-Host "✅ Booking created successfully!" -ForegroundColor Green
                    Write-Host "   📋 Booking ID: $($bookingResult.booking.id)" -ForegroundColor White
                    Write-Host "   🚗 Vehicle: $($bookingResult.booking.vehicle.licensePlate)" -ForegroundColor White
                    Write-Host "   📍 Spot: $($bookingResult.booking.parkingSpot.spotNumber)" -ForegroundColor White
                } else {
                    Write-Host "❌ Booking creation failed: $($bookingResult.message)" -ForegroundColor Red
                }
            } catch {
                $errorDetails = $_.Exception.Response
                if ($errorDetails) {
                    $reader = New-Object System.IO.StreamReader($errorDetails.GetResponseStream())
                    $errorBody = $reader.ReadToEnd()
                    Write-Host "❌ Booking creation failed with details: $errorBody" -ForegroundColor Red
                } else {
                    Write-Host "❌ Booking creation failed: $($_.Exception.Message)" -ForegroundColor Red
                }
            }
        } else {
            Write-Host "⚠️ No available parking spots found" -ForegroundColor Yellow
        }
    } else {
        Write-Host "❌ Failed to fetch parking spots: $($spotsResult.message)" -ForegroundColor Red
    }
    
} catch {
    Write-Host "❌ Test failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n🎯 Instructions for manual testing:" -ForegroundColor Cyan
Write-Host "1. Go to: http://localhost:8080/admin/login" -ForegroundColor White
Write-Host "2. Login with admin@test.com / admin123" -ForegroundColor White
Write-Host "3. Navigate to Bookings page" -ForegroundColor White
Write-Host "4. Click 'Create New Booking'" -ForegroundColor White
Write-Host "5. Fill form with:" -ForegroundColor White
Write-Host "   - Customer: John Doe" -ForegroundColor Gray
Write-Host "   - Email: john@example.com" -ForegroundColor Gray  
Write-Host "   - Vehicle: ABC-123" -ForegroundColor Gray
Write-Host "   - Spot: BLR-001 (or any available)" -ForegroundColor Gray
Write-Host "   - Times: Current time + 1-2 hours" -ForegroundColor Gray

Write-Host "`n🏁 Booking test completed!" -ForegroundColor Green
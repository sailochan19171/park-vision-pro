# Simple curl test to see raw response
Write-Host "Testing with raw HTTP request..." -ForegroundColor Cyan

# First login to get session cookie
$loginHeaders = @{ "Content-Type" = "application/json" }
$loginBody = "{}"

try {
    $loginResponse = Invoke-WebRequest -Uri "http://localhost:8080/api/test/login" -Method POST -Headers $loginHeaders -Body $loginBody -UseBasicParsing -SessionVariable session
    Write-Host "Login Status: $($loginResponse.StatusCode)" -ForegroundColor Green
    
    # Now test booking creation
    $bookingHeaders = @{ "Content-Type" = "application/json" }
    $bookingBody = @{
        customerName = "manikanta"
        customerEmail = "manikanta@doctorite.ai"
        vehicleNumber = "TS994040224"
        parkingSpot = "BLR-002"
        startDateTime = "2026-05-18T06:38"
        endDateTime = "2026-06-23T18:07"
    } | ConvertTo-Json
    
    Write-Host "Sending booking request..." -ForegroundColor Yellow
    Write-Host "Body: $bookingBody" -ForegroundColor Gray
    
    try {
        $bookingResponse = Invoke-WebRequest -Uri "http://localhost:8080/api/admin/bookings" -Method POST -Headers $bookingHeaders -Body $bookingBody -UseBasicParsing -WebSession $session
        Write-Host "Booking Status: $($bookingResponse.StatusCode)" -ForegroundColor Green
        Write-Host "Response: $($bookingResponse.Content)" -ForegroundColor Green
    } catch {
        Write-Host "Booking Error Status: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
        Write-Host "Error Response: $($_.Exception.Response)" -ForegroundColor Red
        
        # Try to read the error response body
        if ($_.Exception.Response) {
            $stream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $errorBody = $reader.ReadToEnd()
            Write-Host "Error Body: $errorBody" -ForegroundColor Red
            $reader.Close()
        }
    }
    
} catch {
    Write-Host "Login failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "Test completed" -ForegroundColor Cyan
# PowerShell script to test auto-publish API
$headers = @{
    "Content-Type" = "application/json"
    "x-admin-token" = "test-token"
}

$body = @{
    version = "1.0.0"
    title = "Test Update"
    body = "Testing auto-publish functionality"
    link = "/"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3001/api/updates/auto-publish" -Method Post -Headers $headers -Body $body
    Write-Host "✅ API Response:" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "❌ API Error:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "Status Code:" $_.Exception.Response.StatusCode.Value__ -ForegroundColor Red
    Write-Host "Status Description:" $_.Exception.Response.StatusDescription -ForegroundColor Red
}

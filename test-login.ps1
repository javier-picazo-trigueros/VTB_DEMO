# Test VTB Login Flow
Write-Host "🧪 Testing VTB Login Flow..." -ForegroundColor Cyan

$headers = @{"Content-Type"="application/json"}

# Test 1: Admin Login
Write-Host "`n📝 Test 1: Admin Login (admin@universidad.edu / admin123)"
$body = @{email="admin@universidad.edu"; password="admin123"; electionId=1} | ConvertTo-Json
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/auth/login" -Method POST -Headers $headers -Body $body -UseBasicParsing
    $json = $response.Content | ConvertFrom-Json
    Write-Host "✅ Admin Login Success!" -ForegroundColor Green
    Write-Host "   User ID: $($json.user.id)"
    Write-Host "   Email: $($json.user.email)"
    Write-Host "   Role: $($json.user.role)"
    Write-Host "   Token: $($json.token.Substring(0, 50))..."
    Write-Host "   Nullifier: $($json.voting.nullifier)"
} catch {
    Write-Host "❌ Admin Login Failed: $($_.Exception.Message.Substring(0, 100))" -ForegroundColor Red
}

# Test 2: Student Login
Write-Host "`n📝 Test 2: Student Login (juan@universidad.edu / password123)"
$body = @{email="juan@universidad.edu"; password="password123"; electionId=1} | ConvertTo-Json
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/auth/login" -Method POST -Headers $headers -Body $body -UseBasicParsing
    $json = $response.Content | ConvertFrom-Json
    Write-Host "✅ Student Login Success!" -ForegroundColor Green
    Write-Host "   User ID: $($json.user.id)"
    Write-Host "   Email: $($json.user.email)"
    Write-Host "   Role: $($json.user.role)"
    Write-Host "   Token: $($json.token.Substring(0, 50))..."
} catch {
    Write-Host "❌ Student Login Failed: $($_.Exception.Message.Substring(0, 100))" -ForegroundColor Red
}

# Test 3: Health Check
Write-Host "`n📝 Test 3: Backend Health Check"
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/health" -UseBasicParsing
    $json = $response.Content | ConvertFrom-Json
    Write-Host "✅ Health Check Success!" -ForegroundColor Green
    Write-Host "   Status: $($json.status)"
    Write-Host "   Service: $($json.service)"
    Write-Host "   Uptime: $($json.uptime)s"
} catch {
    Write-Host "❌ Health Check Failed" -ForegroundColor Red
}

# Test 4: Check Frontend
Write-Host "`n📝 Test 4: Frontend Availability"
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing
    Write-Host "✅ Frontend Available!" -ForegroundColor Green
    Write-Host "   Status Code: $($response.StatusCode)"
} catch {
    Write-Host "❌ Frontend Not Available" -ForegroundColor Red
}

Write-Host "`n✅ All Tests Complete!" -ForegroundColor Green
Write-Host "`n💡 You can now access the app at: http://localhost:3000"
Write-Host "   - Login with: juan@universidad.edu / password123"
Write-Host "   - Or admin: admin@universidad.edu / admin123"

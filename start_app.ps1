# ============================================================
# VTB - Start All Services (PowerShell)
# ============================================================
# This script starts: Hardhat node, deploys contracts,
# seeds the database, and starts backend + frontend.
# ============================================================

$ErrorActionPreference = "Continue"
$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Definition

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  VTB - Vote Through Blockchain - Starting Services" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# ---- 1. Kill any existing processes on ports 8545, 3001, 5173 ----
Write-Host "[1/6] Cleaning up old processes..." -ForegroundColor Yellow
try {
    Get-NetTCPConnection -LocalPort 8545 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
    Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
    Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
} catch {}
Start-Sleep -Seconds 1
Write-Host "  Done." -ForegroundColor Green

# ---- 2. Delete old database for a clean start ----
Write-Host "[2/6] Resetting database..." -ForegroundColor Yellow
$dbPath = Join-Path $ROOT "backend\vtb.db"
if (Test-Path $dbPath) {
    Remove-Item $dbPath -Force
    Write-Host "  Old database deleted." -ForegroundColor Green
} else {
    Write-Host "  No existing database found, starting fresh." -ForegroundColor Green
}

# ---- 3. Start Hardhat node ----
Write-Host "[3/6] Starting Hardhat blockchain node..." -ForegroundColor Yellow
$hardhatDir = Join-Path $ROOT "blockchain"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$hardhatDir'; npx hardhat node" -WindowStyle Normal
Write-Host "  Waiting for Hardhat to initialize (8s)..."
Start-Sleep -Seconds 8
Write-Host "  Hardhat node started." -ForegroundColor Green

# ---- 4. Deploy smart contracts ----
Write-Host "[4/6] Deploying smart contracts..." -ForegroundColor Yellow
Set-Location $hardhatDir
try {
    $deployOutput = npx hardhat run scripts/deploy.ts --network localhost 2>&1
    Write-Host $deployOutput

    $deployInfoPath = Join-Path $hardhatDir "deployment-info.json"
    if (Test-Path $deployInfoPath) {
        $deployInfo = Get-Content $deployInfoPath -Raw | ConvertFrom-Json
        $address = $deployInfo.contractAddress
        Write-Host "  Contract deployed at: $address" -ForegroundColor Green

        # Update backend .env
        $backendEnv = Join-Path $ROOT "backend\.env"
        if (Test-Path $backendEnv) {
            $content = Get-Content $backendEnv -Raw
            $content = $content -replace "(?m)^CONTRACT_ADDRESS=.*$", "CONTRACT_ADDRESS=$address"
            if (-not ($content -match "(?m)^CONTRACT_ADDRESS=")) {
                $content += "`nCONTRACT_ADDRESS=$address"
            }
            Set-Content $backendEnv $content -NoNewline
        } else {
            Set-Content $backendEnv "CONTRACT_ADDRESS=$address`n"
        }

        # Update frontend .env
        $frontendEnv = Join-Path $ROOT "frontend\.env"
        if (Test-Path $frontendEnv) {
            $content = Get-Content $frontendEnv -Raw
            $content = $content -replace "(?m)^VITE_CONTRACT_ADDRESS=.*$", "VITE_CONTRACT_ADDRESS=$address"
            if (-not ($content -match "(?m)^VITE_CONTRACT_ADDRESS=")) {
                $content += "`nVITE_CONTRACT_ADDRESS=$address"
            }
            Set-Content $frontendEnv $content -NoNewline
        } else {
            Set-Content $frontendEnv "VITE_CONTRACT_ADDRESS=$address`n"
        }
    } else {
        Write-Host "  WARNING: deployment-info.json not found" -ForegroundColor Red
    }
} catch {
    Write-Host "  WARNING: Contract deployment failed: $_" -ForegroundColor Red
}

# ---- 5. Seed database & start backend ----
Write-Host "[5/6] Seeding database and starting backend..." -ForegroundColor Yellow
$backendDir = Join-Path $ROOT "backend"
Set-Location $backendDir

# Run seed synchronously so data is ready before backend starts
try {
    npx tsx src/scripts/seedDatabase.ts 2>&1 | Write-Host
} catch {
    Write-Host "  WARNING: Seed may have failed: $_" -ForegroundColor Red
}

Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$backendDir'; npm run dev" -WindowStyle Normal
Start-Sleep -Seconds 3
Write-Host "  Backend started on http://localhost:3001" -ForegroundColor Green

# ---- 6. Start frontend ----
Write-Host "[6/6] Starting frontend..." -ForegroundColor Yellow
$frontendDir = Join-Path $ROOT "frontend"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$frontendDir'; npm run dev" -WindowStyle Normal
Start-Sleep -Seconds 2
Write-Host "  Frontend started on http://localhost:5173" -ForegroundColor Green

# ---- Done ----
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  All services started successfully!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Frontend:  http://localhost:5173" -ForegroundColor Cyan
Write-Host "  Backend:   http://localhost:3001" -ForegroundColor Cyan
Write-Host "  Hardhat:   http://localhost:8545" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Demo Accounts:" -ForegroundColor Yellow
Write-Host "    Super Admin:  superadmin@vtb.system / superadmin123"
Write-Host "    UFV Admin:    admin@ufv.es / admin123"
Write-Host "    EDU Admin:    admin@universidad.edu / admin123"
Write-Host "    UFV Student:  carlos@ufv.es / demo123"
Write-Host "    EDU Student:  juan@universidad.edu / demo123"
Write-Host ""

Set-Location $ROOT

$ErrorActionPreference = "Stop"
cd C:\Users\javie\Downloads\VTB_DEMO

Write-Host "Iniciando nodo Hardhat en una nueva ventana..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd C:\Users\javie\Downloads\VTB_DEMO\blockchain; npx hardhat node" -WindowStyle Normal

Write-Host "Esperando a terminal Hardhat a iniciar (7s)..."
Start-Sleep -Seconds 7

Write-Host "Desplegando contratos..."
cd C:\Users\javie\Downloads\VTB_DEMO\blockchain
npx hardhat run scripts/deploy.ts --network localhost

if (Test-Path "deployment-info.json") {
    $deployInfo = Get-Content deployment-info.json -Raw | ConvertFrom-Json
    $address = $deployInfo.contractAddress
    
    Write-Host "Contrato extraido: $address"
    
    $backendEnv = "C:\Users\javie\Downloads\VTB_DEMO\backend\.env"
    if (Test-Path $backendEnv) {
        $content = Get-Content $backendEnv -Raw
        $content = $content -replace "(?m)^CONTRACT_ADDRESS=.*$", "CONTRACT_ADDRESS=$address"
        if (-not ($content -match "(?m)^CONTRACT_ADDRESS=")) {
            $content += "`r`nCONTRACT_ADDRESS=$address"
        }
        Set-Content $backendEnv $content
    } else {
        Set-Content $backendEnv "CONTRACT_ADDRESS=$address`n"
    }
    
    $frontendEnv = "C:\Users\javie\Downloads\VTB_DEMO\frontend\.env"
    if (Test-Path $frontendEnv) {
        $content = Get-Content $frontendEnv -Raw
        $content = $content -replace "(?m)^VITE_CONTRACT_ADDRESS=.*$", "VITE_CONTRACT_ADDRESS=$address"
        if (-not ($content -match "(?m)^VITE_CONTRACT_ADDRESS=")) {
            $content += "`r`nVITE_CONTRACT_ADDRESS=$address"
        }
        Set-Content $frontendEnv $content
    } else {
        Set-Content $frontendEnv "VITE_CONTRACT_ADDRESS=$address`n"
    }
}

Write-Host "Regenerando Base de datos y levantando Backend..."
cd C:\Users\javie\Downloads\VTB_DEMO\backend
npm run seed
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd C:\Users\javie\Downloads\VTB_DEMO\backend; npm run dev" -WindowStyle Normal

Write-Host "Levantando Frontend..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd C:\Users\javie\Downloads\VTB_DEMO\frontend; npm run dev" -WindowStyle Normal

Write-Host "¡Todo desplegado exitosamente!"

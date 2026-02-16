# VTB - Script de Inicio de los 3 Servicios (PowerShell)
# Levanta Backend, Frontend y Blockchain simultáneamente

Write-Host "" -ForegroundColor Cyan
Write-Host "^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^" -ForegroundColor Cyan
Write-Host "      VTB - Vote Through Blockchain" -ForegroundColor Cyan
Write-Host "      Iniciando los 3 servicios..." -ForegroundColor Cyan
Write-Host "^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^" -ForegroundColor Cyan
Write-Host ""

# Cambiar a la raíz del proyecto
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)

# Variables para guardar los procesos
[System.Collections.ArrayList]$processes = @()

# Función para limpiar procesos al salir
function Cleanup {
    Write-Host ""
    Write-Host "⏹️  Deteniendo todos los servicios..." -ForegroundColor Yellow
    foreach ($proc in $processes) {
        if ($proc) {
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        }
    }
    Write-Host "✓ Servicios detenidos" -ForegroundColor Green
}

# Registrar el cleanup al salir
$null = Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action { Cleanup }

Write-Host "[1/3] Iniciando Backend (Express) en puerto 3001..." -ForegroundColor Blue
$backendProc = Start-Process powershell -ArgumentList "-NoExit -Command cd backend; npm run dev" -PassThru
$processes.Add($backendProc) | Out-Null
Write-Host "✓ Backend iniciado (PID: $($backendProc.Id))" -ForegroundColor Green
Start-Sleep -Seconds 3

Write-Host "[2/3] Iniciando Frontend (React Vite) en puerto 3000..." -ForegroundColor Blue
$frontendProc = Start-Process powershell -ArgumentList "-NoExit -Command cd frontend; npm run dev" -PassThru
$processes.Add($frontendProc) | Out-Null
Write-Host "✓ Frontend iniciado (PID: $($frontendProc.Id))" -ForegroundColor Green
Start-Sleep -Seconds 3

Write-Host "[3/3] Iniciando Blockchain (Hardhat) en puerto 8545..." -ForegroundColor Blue
$blockchainProc = Start-Process powershell -ArgumentList "-NoExit -Command cd blockchain; npx hardhat node" -PassThru
$processes.Add($blockchainProc) | Out-Null
Write-Host "✓ Blockchain iniciado (PID: $($blockchainProc.Id))" -ForegroundColor Green

Write-Host ""
Write-Host "================================================================" -ForegroundColor Green
Write-Host "✨ Todos los servicios están corriendo:" -ForegroundColor Green
Write-Host ""
Write-Host "   • Backend:    http://localhost:3001" -ForegroundColor Green
Write-Host "   • Frontend:   http://localhost:3000" -ForegroundColor Green
Write-Host "   • Blockchain: http://localhost:8545" -ForegroundColor Green
Write-Host ""
Write-Host "================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Acceso:" -ForegroundColor Cyan
Write-Host "    URL:       http://localhost:3000" -ForegroundColor Cyan
Write-Host "    Usuario:   juan@universidad.edu" -ForegroundColor Cyan
Write-Host "    Pass:      password123" -ForegroundColor Cyan
Write-Host "    Admin:     admin@universidad.edu / admin123" -ForegroundColor Cyan
Write-Host ""
Write-Host "Presiona Ctrl+C en cualquier ventana para detener ese servicio" -ForegroundColor Yellow
Write-Host "O cierra todas las ventanas PowerShell para detener VTB completamente" -ForegroundColor Yellow
Write-Host ""

# Esperar a que cierren todos los procesos
foreach ($proc in $processes) {
    Wait-Process -Id $proc.Id -ErrorAction SilentlyContinue
}

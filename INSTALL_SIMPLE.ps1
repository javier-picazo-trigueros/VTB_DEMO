# VTB INSTALL FIX - Script simple de limpieza

Write-Host "VTB - Limpieza y Reinstalacion"
Write-Host "=============================="

$ProjectRoot = Get-Location

# BLOCKCHAIN
Write-Host "BLOCKCHAIN - Limpiando..."
Set-Location "$ProjectRoot\blockchain"
Remove-Item -Path "node_modules" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "package-lock.json" -Force -ErrorAction SilentlyContinue
Write-Host "BLOCKCHAIN - Instalando..."
npm install

# BACKEND
Write-Host "BACKEND - Limpiando..."
Set-Location "$ProjectRoot\backend"
Remove-Item -Path "node_modules" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "package-lock.json" -Force -ErrorAction SilentlyContinue
Write-Host "BACKEND - Instalando..."
npm install

# FRONTEND
Write-Host "FRONTEND - Limpiando..."
Set-Location "$ProjectRoot\frontend"
Remove-Item -Path "node_modules" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "package-lock.json" -Force -ErrorAction SilentlyContinue
Write-Host "FRONTEND - Instalando..."
npm install

Write-Host "LISTO!"
Set-Location $ProjectRoot

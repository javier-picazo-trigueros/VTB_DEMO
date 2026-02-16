# 🔧 VTB INSTALL FIX - Limpiar y reinstalar dependencias
# Ejecutar como: powershell -ExecutionPolicy Bypass -File INSTALL_FIX.ps1

Write-Host "`n════════════════════════════════════════════════════" -ForeColor Cyan
Write-Host "🔧 VTB - Limpieza y Reinstalación de Dependencias" -ForeColor Green
Write-Host "════════════════════════════════════════════════════`n" -ForeColor Cyan

$ProjectRoot = Get-Location

# ====== BLOCKCHAIN SETUP ======
Write-Host "`n📦 [1/3] BLOCKCHAIN - Limpiando e instalando..." -ForeColor Yellow

Push-Location "$ProjectRoot\blockchain"

# Limpiar
Write-Host "  ▸ Removiendo node_modules..." -ForeColor Gray
Remove-Item -Path "node_modules" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "package-lock.json" -Force -ErrorAction SilentlyContinue

# Instalar
Write-Host "  ▸ Ejecutando npm install..." -ForeColor Gray
npm install

if ($?) {
  Write-Host "  ✅ Blockchain instalado correctamente" -ForeColor Green
} else {
  Write-Host "  ❌ Error en blockchain. Intenta manualmente:" -ForeColor Red
  Write-Host "     cd blockchain; npm install --legacy-peer-deps" -ForeColor Yellow
}

Pop-Location

# ====== BACKEND SETUP ======
Write-Host "`n📦 [2/3] BACKEND - Limpiando e instalando..." -ForeColor Yellow

Push-Location "$ProjectRoot\backend"

# Limpiar
Write-Host "  ▸ Removiendo node_modules..." -ForeColor Gray
Remove-Item -Path "node_modules" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "package-lock.json" -Force -ErrorAction SilentlyContinue

# Instalar
Write-Host "  ▸ Ejecutando npm install..." -ForeColor Gray
npm install

if ($?) {
  Write-Host "  ✅ Backend instalado correctamente" -ForeColor Green
} else {
  Write-Host "  ❌ Error en backend. Intenta manualmente:" -ForeColor Red
  Write-Host "     cd backend; npm install" -ForeColor Yellow
}

Pop-Location

# ====== FRONTEND SETUP ======
Write-Host "`n📦 [3/3] FRONTEND - Limpiando e instalando..." -ForeColor Yellow

Push-Location "$ProjectRoot\frontend"

# Limpiar
Write-Host "  ▸ Removiendo node_modules..." -ForeColor Gray
Remove-Item -Path "node_modules" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "package-lock.json" -Force -ErrorAction SilentlyContinue

# Instalar
Write-Host "  ▸ Ejecutando npm install..." -ForeColor Gray
npm install

if ($?) {
  Write-Host "  ✅ Frontend instalado correctamente" -ForeColor Green
} else {
  Write-Host "  ❌ Error en frontend. Intenta manualmente:" -ForeColor Red
  Write-Host "     cd frontend; npm install" -ForeColor Yellow
}

Pop-Location

# ====== VERIFICACIÓN FINAL ======
Write-Host "`n════════════════════════════════════════════════════" -ForeColor Cyan
Write-Host "✅ Instalación completada" -ForeColor Green
Write-Host "════════════════════════════════════════════════════`n" -ForeColor Cyan

Write-Host "Próximos pasos:" -ForeColor Yellow
Write-Host "  1. Terminal 1: cd blockchain; npm run node" -ForeColor Gray
Write-Host "  2. Terminal 2: cd backend; npm run dev" -ForeColor Gray
Write-Host "  3. Terminal 3: cd frontend; npm run dev" -ForeColor Gray
Write-Host "`n"

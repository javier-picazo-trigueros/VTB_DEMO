@echo off
REM VTB - Script de Inicio de los 3 Servicios (Windows)
REM Levanta Backend, Frontend y Blockchain en ventanas separadas

setlocal enabledelayedexpansion

echo.
echo   [1m[36m^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^[0m
echo   [1m[36m      VTB - Vote Through Blockchain[0m
echo   [1m[36m      Iniciando los 3 servicios...[0m
echo   [1m[36m^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^[0m
echo.

REM Cambiar a la raíz del proyecto
cd /d "%~dp0"

echo [1m[34m[1/3] Iniciando Backend (Express) en puerto 3001...[0m
start "VTB Backend" cmd /k "cd backend && npm run dev"
timeout /t 3 /nobreak

echo [1m[34m[2/3] Iniciando Frontend (React Vite) en puerto 3000...[0m
start "VTB Frontend" cmd /k "cd frontend && npm run dev"
timeout /t 3 /nobreak

echo [1m[34m[3/3] Iniciando Blockchain (Hardhat) en puerto 8545...[0m
start "VTB Blockchain" cmd /k "cd blockchain && npx hardhat node"
timeout /t 2 /nobreak

echo.
echo   [1m[32m================================================================[0m
echo   [1m[32m    ^! Todos los servicios est^án corriendo:[0m
echo.
echo   [32m    • Backend:    http://localhost:3001[0m
echo   [32m    • Frontend:   http://localhost:3000[0m
echo   [32m    • Blockchain: http://localhost:8545[0m
echo.
echo   [1m[32m================================================================[0m
echo.
echo   [33mCadá servicio se abrirá en una ventana separada.[0m
echo   [33mCierra cualquier ventana para detener ese servicio.[0m
echo   [33mCierra todas para detener VTB completamente.[0m
echo.
echo   [1m[36mAcceso:[0m
echo   [36m    URL:       http://localhost:3000[0m
echo   [36m    Usuario:   juan@universidad.edu[0m
echo   [36m    Pass:      password123[0m
echo   [36m    Admin:     admin@universidad.edu / admin123[0m
echo.

pause

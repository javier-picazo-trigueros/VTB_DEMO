#!/bin/bash

# VTB - Script de Inicio de los 3 Servicios
# Levanta Backend, Frontend y Blockchain simultáneamente

set -e

echo "🚀 Iniciando VTB (Vote Through Blockchain)..."
echo ""
echo "Levantando:"
echo "  1️⃣  Backend (Express) en puerto 3001"
echo "  2️⃣  Frontend (React Vite) en puerto 3000"
echo "  3️⃣  Blockchain (Hardhat) en puerto 8545"
echo ""

# Colores
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Función para limpiar procesos al salir
cleanup() {
  echo ""
  echo "${YELLOW}⏹️  Deteniendo todos los servicios...${NC}"
  kill $BACKEND_PID $FRONTEND_PID $BLOCKCHAIN_PID 2>/dev/null || true
  echo "✓ Servicios detenidos"
}

trap cleanup EXIT

# 1. Backend
echo "${BLUE}[1/3] Iniciando Backend en backend/...${NC}"
cd backend
npm run dev &
BACKEND_PID=$!
echo "${GREEN}✓ Backend iniciado (PID: $BACKEND_PID)${NC}"
sleep 2

# 2. Frontend  
echo "${BLUE}[2/3] Iniciando Frontend en frontend/...${NC}"
cd ../frontend
npm run dev &
FRONTEND_PID=$!
echo "${GREEN}✓ Frontend iniciado (PID: $FRONTEND_PID)${NC}"
sleep 2

# 3. Blockchain
echo "${BLUE}[3/3] Iniciando Blockchain en blockchain/...${NC}"
cd ../blockchain
npx hardhat node &
BLOCKCHAIN_PID=$!
echo "${GREEN}✓ Blockchain iniciado (PID: $BLOCKCHAIN_PID)${NC}"

echo ""
echo "${GREEN}================================================================${NC}"
echo "${GREEN}✨ Todos los servicios están corriendo:${NC}"
echo "${GREEN}   • Backend:    http://localhost:3001${NC}"
echo "${GREEN}   • Frontend:   http://localhost:3000${NC}"
echo "${GREEN}   • Blockchain: http://localhost:8545${NC}"
echo "${GREEN}================================================================${NC}"
echo ""
echo "Presiona Ctrl+C para detener todos los servicios"
echo ""

# Mantener el script corriendo
wait

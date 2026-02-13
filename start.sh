#!/bin/bash
# VTB - Script de Inicio Rápido
# Este script levanta simultáneamente el backend y frontend

echo "🚀 Iniciando VTB (Vote Through Blockchain)..."
echo ""

# Colores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verificar Python
if ! command -v python &> /dev/null && ! command -v python3 &> /dev/null; then
    echo "${YELLOW}⚠️  Python no encontrado. Por favor instálapo.${NC}"
    exit 1
fi

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo "${YELLOW}⚠️  Node.js no encontrado. Por favor instálalo.${NC}"
    exit 1
fi

# Crear directorios si no existen
echo "📁 Preparando estructura..."
mkdir -p backend/instance
mkdir -p frontend/node_modules

# Terminal 1: Backend
echo ""
echo "${GREEN}Terminal 1: Iniciando Backend Flask...${NC}"
cd backend
python -m pip install -r requirements.txt > /dev/null 2>&1
echo "✓ Dependencias Python instaladas"
python app.py &
BACKEND_PID=$!

sleep 3

# Terminal 2: Frontend
echo ""
echo "${GREEN}Terminal 2: Iniciando Frontend React...${NC}"
cd ../frontend
npm install > /dev/null 2>&1
echo "✓ Dependencias Node instaladas"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "${GREEN}✅ VTB Iniciado Correctamente${NC}"
echo ""
echo "📍 Accesos:"
echo "   Frontend:  http://localhost:3000"
echo "   Backend:   http://localhost:5000"
echo ""
echo "🔐 Credenciales (auto-rellenadas en login):"
echo "   Votante: alumno@ufv.es / alumno123"
echo "   Admin:   admin@ufv.es / admin123"
echo ""
echo "Presiona Ctrl+C para detener ambos servidores..."
echo ""

# Esperar a ambos procesos
wait $BACKEND_PID $FRONTEND_PID

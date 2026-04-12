#!/bin/bash
# =============================================================================
# VTB - Vote Through Blockchain
# Script de inicio: levanta Blockchain + Backend + Frontend
# =============================================================================

# Directorio raiz del proyecto (siempre relativo a este script)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colores
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC}   $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }

echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN}   VTB - Vote Through Blockchain${NC}"
echo -e "${GREEN}============================================================${NC}"
echo ""

# PIDs de los procesos para poder pararlos al salir
BLOCKCHAIN_PID=""
BACKEND_PID=""
FRONTEND_PID=""

# ----------------------------------------------------------------------------
# Limpieza al salir (Ctrl+C o fin del script)
# ----------------------------------------------------------------------------
cleanup() {
  echo ""
  log_warn "Deteniendo todos los servicios..."
  [ -n "$BLOCKCHAIN_PID" ] && kill "$BLOCKCHAIN_PID" 2>/dev/null
  [ -n "$BACKEND_PID" ]    && kill "$BACKEND_PID"    2>/dev/null
  [ -n "$FRONTEND_PID" ]   && kill "$FRONTEND_PID"   2>/dev/null
  wait 2>/dev/null
  log_success "Todos los servicios detenidos."
  echo ""
}
trap cleanup EXIT INT TERM

# ----------------------------------------------------------------------------
# Función: esperar a que un puerto esté disponible
# Uso: wait_for_port <puerto> <timeout_segundos> <nombre>
# ----------------------------------------------------------------------------
wait_for_port() {
  local port=$1
  local timeout=$2
  local name=$3
  local elapsed=0

  while ! (echo "" > /dev/tcp/127.0.0.1/$port) 2>/dev/null; do
    if [ "$elapsed" -ge "$timeout" ]; then
      log_error "$name no respondio en el puerto $port tras ${timeout}s"
      return 1
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  return 0
}

# ----------------------------------------------------------------------------
# Función: instalar dependencias si no existen
# ----------------------------------------------------------------------------
install_if_needed() {
  local dir=$1
  local name=$2
  if [ ! -d "$dir/node_modules" ]; then
    log_info "Instalando dependencias de $name..."
    (cd "$dir" && npm install --silent) || {
      log_error "Fallo al instalar dependencias de $name"
      exit 1
    }
    log_success "Dependencias de $name instaladas"
  else
    log_info "Dependencias de $name ya instaladas"
  fi
}

# ----------------------------------------------------------------------------
# Verificar que Node.js y npm esten instalados
# ----------------------------------------------------------------------------
if ! command -v node &>/dev/null; then
  log_error "Node.js no esta instalado. Instala Node.js >= 18 y vuelve a intentarlo."
  exit 1
fi
if ! command -v npm &>/dev/null; then
  log_error "npm no esta instalado."
  exit 1
fi

NODE_VERSION=$(node -e "process.stdout.write(process.versions.node)" 2>/dev/null)
log_info "Node.js v$NODE_VERSION detectado"

# ----------------------------------------------------------------------------
# Instalar dependencias de todos los paquetes si hacen falta
# ----------------------------------------------------------------------------
echo ""
log_info "Verificando dependencias..."
install_if_needed "$SCRIPT_DIR/blockchain" "Blockchain"
install_if_needed "$SCRIPT_DIR/backend"    "Backend"
install_if_needed "$SCRIPT_DIR/frontend"   "Frontend"

# ----------------------------------------------------------------------------
# 1. Blockchain (Hardhat)
# ----------------------------------------------------------------------------
echo ""
log_info "[1/3] Iniciando nodo Blockchain (Hardhat) en puerto 8545..."

cd "$SCRIPT_DIR/blockchain"
npx hardhat node > "$SCRIPT_DIR/blockchain.log" 2>&1 &
BLOCKCHAIN_PID=$!

log_info "Esperando a que el nodo este listo..."
if wait_for_port 8545 30 "Blockchain"; then
  log_success "Nodo Blockchain listo (PID: $BLOCKCHAIN_PID)"
else
  log_error "El nodo Blockchain no arranco. Revisa $SCRIPT_DIR/blockchain.log"
  exit 1
fi

# Desplegar contrato
log_info "Desplegando contrato inteligente..."
if cd "$SCRIPT_DIR/blockchain" && npx hardhat run scripts/deploy.ts --network localhost >> "$SCRIPT_DIR/blockchain.log" 2>&1; then
  log_success "Contrato desplegado correctamente"
else
  log_warn "El despliegue del contrato fallo (puede que ya este desplegado). Continua..."
fi

# ----------------------------------------------------------------------------
# 2. Backend (Express + TypeScript)
# ----------------------------------------------------------------------------
echo ""
log_info "[2/3] Iniciando Backend (Express) en puerto 3001..."

cd "$SCRIPT_DIR/backend"
npm run dev > "$SCRIPT_DIR/backend.log" 2>&1 &
BACKEND_PID=$!

log_info "Esperando a que el Backend este listo..."
if wait_for_port 3001 30 "Backend"; then
  log_success "Backend listo (PID: $BACKEND_PID)"
else
  log_error "El Backend no arranco. Revisa $SCRIPT_DIR/backend.log"
  exit 1
fi

# ----------------------------------------------------------------------------
# 3. Frontend (Vite + React)
# ----------------------------------------------------------------------------
echo ""
log_info "[3/3] Iniciando Frontend (Vite) en puerto 5173..."

cd "$SCRIPT_DIR/frontend"
npm run dev > "$SCRIPT_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!

log_info "Esperando a que el Frontend este listo..."
if wait_for_port 5173 30 "Frontend"; then
  log_success "Frontend listo (PID: $FRONTEND_PID)"
else
  # Vite a veces usa el puerto 3000 si 5173 esta ocupado
  if wait_for_port 3000 5 "Frontend (alt)"; then
    log_success "Frontend listo en puerto 3000 (PID: $FRONTEND_PID)"
  else
    log_error "El Frontend no arranco. Revisa $SCRIPT_DIR/frontend.log"
    exit 1
  fi
fi

# ----------------------------------------------------------------------------
# Resumen
# ----------------------------------------------------------------------------
echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN}  Todos los servicios estan corriendo:${NC}"
echo -e "${GREEN}============================================================${NC}"
echo -e "  ${BLUE}Blockchain:${NC}  http://localhost:8545"
echo -e "  ${BLUE}Backend:${NC}     http://localhost:3001"
echo -e "  ${BLUE}Frontend:${NC}    http://localhost:5173"
echo ""
echo -e "  Logs disponibles en:"
echo -e "  - $SCRIPT_DIR/blockchain.log"
echo -e "  - $SCRIPT_DIR/backend.log"
echo -e "  - $SCRIPT_DIR/frontend.log"
echo ""
echo -e "${YELLOW}  Presiona Ctrl+C para detener todos los servicios${NC}"
echo -e "${GREEN}============================================================${NC}"
echo ""

# Mantener el script corriendo y esperando a los hijos
wait

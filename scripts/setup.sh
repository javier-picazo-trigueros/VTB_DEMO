#!/bin/bash
set -e

echo "🚀 VTB Setup Script"
echo "==================="
echo ""

# Check for Node.js and npm
if ! command -v node &> /dev/null; then
  echo "❌ Node.js no está instalado. Por favor, instala Node.js 20+"
  exit 1
fi

echo "✅ Node.js $(node -v) detectado"
echo "✅ npm $(npm -v) detectado"
echo ""

# 1. Environment configuration
echo "📝 Configurando variables de entorno..."
if [ ! -f .env ]; then
  cp .env.example .env
  echo "✅ .env creado desde .env.example"
  echo "⚠️  EDITA .env con tus valores reales ANTES de continuar en producción"
else
  echo "ℹ️  .env ya existe, no se sobreescribe"
fi
echo ""

# 2. Backend dependencies
echo "📦 Instalando dependencias del backend..."
cd backend
npm install
echo "✅ Backend listo"
cd ..
echo ""

# 3. Frontend dependencies
echo "📦 Instalando dependencias del frontend..."
cd frontend
npm install
echo "✅ Frontend listo"
cd ..
echo ""

# 4. Compile smart contracts
echo "⚙️  Compilando smart contracts..."
npx hardhat compile
echo "✅ Smart contracts compilados"
echo ""

# 5. Deploy contract (if needed)
echo "🔗 Desplegando contrato en Hardhat local..."
echo "⚠️  Asegúrate de que Hardhat RPC está corriendo en otra terminal:"
echo "   npx hardhat node"
echo ""
read -p "¿Continuar con el despliegue? (s/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Ss]$ ]]; then
  DEPLOY_OUTPUT=$(npx hardhat run scripts/deploy.js --network localhost 2>&1)
  CONTRACT_ADDR=$(echo "$DEPLOY_OUTPUT" | grep -oP '0x[a-fA-F0-9]{40}' | head -1)

  if [ -n "$CONTRACT_ADDR" ]; then
    # Update .env with contract address
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s|CONTRACT_ADDRESS=.*|CONTRACT_ADDRESS=$CONTRACT_ADDR|" .env
    else
      sed -i "s|CONTRACT_ADDRESS=.*|CONTRACT_ADDRESS=$CONTRACT_ADDR|" .env
    fi
    echo "✅ Contrato desplegado: $CONTRACT_ADDR"
    echo "   Actualizado en .env"
  else
    echo "⚠️  No se pudo detectar dirección del contrato"
    echo "   Actualiza CONTRACT_ADDRESS manualmente en .env"
  fi
else
  echo "⏭️  Saltando despliegue. Actualiza CONTRACT_ADDRESS manualmente en .env"
fi
echo ""

# 6. Seed database (if script exists)
if [ -f "backend/src/scripts/seedDatabase.ts" ]; then
  echo "🌱 Poblando base de datos con datos de prueba..."
  cd backend
  npm run seed 2>/dev/null || echo "⚠️  Script seed no configurado, saltando"
  cd ..
  echo "✅ Base de datos lista"
else
  echo "ℹ️  Script de seed no encontrado, saltando"
fi
echo ""

# Summary
echo "✅ Setup completado"
echo "==================="
echo ""
echo "🌐 URLs de desarrollo:"
echo "   Frontend:   http://localhost:5173  (npm run dev en /frontend)"
echo "   Backend:    http://localhost:3001  (npm run dev en /backend)"
echo "   Blockchain: http://localhost:8545  (npx hardhat node)"
echo ""
echo "👤 Credenciales de prueba:"
echo "   Voter: juan@universidad.edu     / password123"
echo "   Admin: admin@universidad.edu    / admin123"
echo ""
if [ -n "$CONTRACT_ADDR" ]; then
  echo "📄 Smart Contract:"
  echo "   Dirección: $CONTRACT_ADDR"
else
  echo "📄 Smart Contract:"
  echo "   Actualiza CONTRACT_ADDRESS en .env después de desplegar"
fi
echo ""
echo "📚 Próximos pasos:"
echo "   1. Abre 3 terminales"
echo "   2. Terminal 1: npx hardhat node (Blockchain local)"
echo "   3. Terminal 2: cd backend && npm run dev (API)"
echo "   4. Terminal 3: cd frontend && npm run dev (React)"
echo ""
echo "🔒 IMPORTANTE:"
echo "   • Edita .env con secretos reales"
echo "   • NO commitees .env a Git"
echo "   • En producción, usa un gestor de secretos (AWS Secrets Manager, Vault, etc.)"
echo ""

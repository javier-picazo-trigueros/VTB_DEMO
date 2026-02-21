# 🗳️ VTB — Vote Through Blockchain

**Sistema de votación anónima basado en blockchain para entornos universitarios y corporativos.**

Combina lo mejor de ambos mundos:
- **Privacidad Web2**: Autenticación institucional, gestión de usuarios
- **Transparencia Web3**: Votos registrados en blockchain, auditoría pública

## 🔑 Características principales

✅ **Autenticación con credenciales institucionales** — Email + contraseña  
✅ **Anonimato garantizado** — Nullifier HMAC (no reversible)  
✅ **Votos en blockchain** — Inmutables y públicamente auditables  
✅ **Auditoría sin privacidad** — Cualquiera puede verificar la integridad de la elección  
✅ **Sin coste por voto** — Diseñado para redes L2 (Polygon, Arbitrum)  
✅ **Escalable** — Manejo de cientos de elecciones simultáneas  

## 🛠 Stack técnico

| Capa | Tecnología |
|------|-----------|
| **Frontend** | React 18 + Vite + Tailwind CSS |
| **Backend** | Express.js + TypeScript |
| **Blockchain** | Hardhat + Solidity (L2 compatible) |
| **Database** | SQLite3 |
| **Containerización** | Docker + Docker Compose |
| **Autenticación** | JWT (24h) + bcrypt (12 rounds) |

## 📋 Requisitos previos

- **Node.js** 20+ y **npm** 9+
- **Docker** y **Docker Compose** (para despliegue containerizado)
- **Git** (para clonar el repositorio)

## 🚀 Instalación rápida

### Opción A — Script automático (⭐ RECOMENDADO)

```bash
chmod +x scripts/setup.sh
./scripts/setup.sh
```

El script hace:
1. Verifica Node.js + npm
2. Copia `.env.example` → `.env`
3. Instala dependencias (frontend + backend)
4. Compila contrato Solidity
5. Despliega contrato en Hardhat
6. Inicializa base de datos SQLite
7. Imprime resumen de URLs y credenciales

### Opción B — Manual paso a paso

#### 1. Preparación

```bash
# Copiar configuración
cp .env.example .env

# Editar .env con tus valores
nano .env  # o abre en tu editor favorito
```

#### 2. Instalar dependencias

```bash
# Backend
cd backend && npm install && cd ..

# Frontend
cd frontend && npm install && cd ..
```

#### 3. Iniciar Hardhat (Terminal 1)

```bash
npx hardhat node
# Escucha en localhost:8545
```

#### 4. Desplegar contrato (Terminal 2)

```bash
npx hardhat run scripts/deploy.ts --network localhost
# Copiar CONTRACT_ADDRESS a .env
```

#### 5. Iniciar backend (Terminal 3)

```bash
cd backend
npm run seed
npm run dev
# Escucha en http://localhost:3001
```

#### 6. Iniciar frontend (Terminal 4)

```bash
cd frontend
npm run dev
# Accesible en http://localhost:5173
```

## 🐳 Despliegue con Docker

### Compilación y ejecución

```bash
# Compilar todas las imágenes
docker compose build

# Ejecutar servicios (backend + frontend)
docker compose up -d

# Acceder en http://localhost (puerto 80)
```

### Con Hardhat local (desarrollo)

```bash
docker compose --profile dev up --build

# Servicios disponibles:
# - Frontend: http://localhost
# - Backend: http://localhost:3001
# - Hardhat: http://localhost:8545
```

## 👤 Credenciales de prueba

| Rol | Email | Contraseña |
|-----|-------|-----------|
| 🗳️ Votante | juan@universidad.edu | password123 |
| 👨‍💼 Admin | admin@universidad.edu | admin123 |

## 🏗 Arquitectura

```
┌─────────────────────────────────────────────┐
│        Frontend (React 18 + Vite)          │
│  • Dashboard: elecciones asignadas         │
│  • VotingBooth: votación con live feed     │
│  • Results: gráficos + auditoría           │
│  • AdminPanel: gestión de usuarios         │
└──────────────┬──────────────────────────────┘
               │ HTTP/REST + JWT
               │
┌──────────────▼──────────────────────────────┐
│      Backend (Express + TypeScript)        │
│  • Autenticación y gestión de usuarios     │
│  • Validación de elegibilidad              │
│  • Generación de nullifier HMAC            │
│  • Interfaz con smart contract             │
└──────────────┬──────────────────────────────┘
               │
     ┌─────────┼─────────┐
     │         │         │
  ┌──▼──┐  ┌──▼──┐  ┌───▼────────┐
  │SQLite   │Hardhat   │Smart Contract
  │ Users  │ RPC       │(Solidity)
  │Elections│:8545     │
  │ Audit  │           │ • castVote()
  └───────┘  └────────┘  └───────────┘
```

### Flujo de votación

```
1. Usuario login
   ↓
2. Dashboard: ver elecciones asignadas
   ↓
3. Click "Votar" → validar elegibilidad (4 checks)
   ↓
4. VotingBooth: seleccionar candidato
   ↓
5. 3 pasos progresivos: Proof → Sending → Confirming
   ↓
6. SmartContract registra nullifier + voteHash
   ↓
7. Live feed actualiza en tiempo real
   ↓
8. Modal éxito con TxHash + explorador
   ↓
9. Resultados visibles en /results/:id
   ↓
10. Auditoría pública en tab "Blockchain"
```

## 🔐 Seguridad implementada

| Aspecto | Implementación | Impacto |
|---------|---|---|
| **Contraseñas** | bcrypt (12 rounds) | Imposible descifrar |
| **JWT** | 24h + validación cliente | Logout automático si expira |
| **Anonimato** | Nullifier HMAC (no reversible) | Imposible linkar voto a usuario |
| **Doble voto** | SmartContract rechaza nullifiers duplicados | Solo 1 voto por usuario |
| **Rate limiting** | 5 intentos / 15 min (prod) | Protección brute force |
| **CORS** | Whitelist por origen | Solo dominios autorizados |
| **Auditoría** | Tabla nullifier_audit | Prevención de fraude |

## 📊 Endpoints principales

### Públicos

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/auth/login` | Autenticación |
| POST | `/auth/register-request` | Solicitar acceso |
| GET | `/api/elections/:id/audit` | Auditoría pública |

### Protegidos (JWT)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/elections` | Mis elecciones |
| GET | `/api/elections/:id/eligibility` | ¿Puedo votar? |
| GET | `/api/elections/:id/results` | Resultados |
| POST | `/api/elections/register-vote` | Registrar voto |

### Admin

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/admin/registration-requests` | Ver solicitudes |
| PATCH | `/admin/registration-requests/:id` | Aprobar/rechazar |

## 🔧 Variables de entorno

```bash
# SERVIDOR
NODE_ENV=development
PORT=3001

# JWT & AUTENTICACIÓN  
JWT_SECRET=cambiar_en_produccion
JWT_EXPIRATION=24h
NULLIFIER_SECRET=otro_diferente

# BLOCKCHAIN
RPC_URL=http://localhost:8545
CONTRACT_ADDRESS=0x...
PRIVATE_KEY=0x...  # Solo desarrollo

# FRONTEND
VITE_API_URL=http://localhost:3001
VITE_RPC_URL=http://localhost:8545
VITE_EXPLORER_URL=http://localhost:8545
VITE_CONTRACT_ADDRESS=0x...

# SEGURIDAD
CORS_ORIGINS=http://localhost:5173,http://localhost:3001
```

## 🐛 Troubleshooting

### Error: `Cannot connect to Hardhat node`
```bash
npx hardhat node  # Debe estar corriendo en terminal separada
```

### Error: `CORS blocked`
```bash
# Verificar CORS_ORIGINS en .env incluya http://localhost:5173
```

### Error: `Contract address not found`
```bash
npx hardhat run scripts/deploy.ts --network localhost
# Copiar dirección a CONTRACT_ADDRESS
```

### Docker: `Connection refused`
```bash
docker compose logs backend  # Ver por qué no inició
docker compose ps            # Verificar status
```

## 📈 Desarrollo

### Build para producción

```bash
# Backend
cd backend
npm run build
# Salida en dist/

# Frontend
cd frontend
npm run build
# Salida en dist/
```

### Ejecutar tests

```bash
# Backend
cd backend
npm test

# Frontend
cd frontend
npm test
```

## 📄 Licencia

MIT - Libre para uso educativo y comercial

## 📞 Soporte

- **Documentación:** `SESION_2_COMPLETA.md` y `SESION_3_PLAN.md`
- **Archivo de cambios:** `SESION_2_RESUMEN.md`

---

**Construido con ❤️ para votaciones transparentes y seguras**

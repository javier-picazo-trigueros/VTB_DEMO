# 🧪 TESTING CHECKLIST - Verificación Pre-Presentación

**VTB (Vote Through Blockchain)**  
**Guía rápida para verificar que TODA la aplicación funciona**

---

## ✅ PASO 0: PREPARACIÓN (5-10 minutos)

### Abrir 4 terminales lado a lado

```bash
# Terminal 1: Blockchain
# Terminal 2: Backend  
# Terminal 3: Frontend
# Terminal 4: Control/Admin
```

### Verificar variables de entorno

```bash
# Backend
cat backend/.env
# Debería tener:
# JWT_SECRET=tu_secret_key
# HMAC_SECRET=tu_hmac_secret_32_bytes
# RPC_URL=http://localhost:8545
# CONTRACT_ADDRESS=se_llena_después
# PRIVATE_KEY=tu_private_key

# Frontend
cat frontend/.env
# Debería tener:
# VITE_API_URL=http://localhost:3001
# VITE_RPC_URL=http://localhost:8545
# VITE_CONTRACT_ADDRESS=se_llena_después
```

---

## 🔗 ETAPA 1: BLOCKCHAIN (5 minutos)

### Terminal 1: Iniciar Hardhat node

```bash
cd blockchain
npx hardhat node
```

**✓ Éxito si ves:**
```
Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/

Accounts:
0x1111111111111111111111111111111111111111 (10000 ETH)
0x2222222222222222222222222222222222222222 (10000 ETH)
...
```

**Si falla:**
```bash
# Problema: Node modules no instalados
npm install

# Problema: Puerto 8545 ocupado
lsof -i :8545  # Ver qué usa el puerto
kill -9 <PID>
```

---

## 📦 ETAPA 2: DEPLOY SMART CONTRACT (5 minutos)

### Terminal 1 (en nuevo tab) o Terminal 4: Deploy contract

```bash
cd blockchain
npx hardhat run scripts/deploy.ts --network localhost
```

**✓ Éxito si ves:**
```
Compiling Smart Contract...
✅ Contract deployed successfully!
Contract Address: 0x5FbDB2315678afccb333f8a9c36b1176b8cc5a61 (ej)
Election ID: 1
Deployment Info saved to blockchain/deployment-info.json
```

### Guardar la dirección del contrato

```bash
# En Terminal 4, copiar dirección
CONTRACT_ADDRESS=0x5FbDB2315678afccb333f8a9c36b1176b8cc5a61

# Actualizar .env
echo "VITE_CONTRACT_ADDRESS=$CONTRACT_ADDRESS" >> frontend/.env
echo "CONTRACT_ADDRESS=$CONTRACT_ADDRESS" >> backend/.env
```

---

## 🗄️ ETAPA 3: BACKEND + DATABASE (5 minutos)

### Terminal 2: Instalar dependencias + Seed database

```bash
cd backend
npm install
npm run seed
```

**✓ Éxito si ves:**
```
✅ Database initialized
✅ Test users created:
   - juan@universidad.edu (password: password123)
   - maria@universidad.edu (password: password123)
   - carlos@universidad.edu (password: password123)
   - isa@universidad.edu (password: password123)
   - admin@universidad.edu (password: password123)

✅ Test elections created:
   - Election 1: Open
   - Election 2: Open
```

### Verificar database con SQLite

```bash
# Terminal 4:
cd backend
sqlite3 vtb.db

# En SQLite CLI:
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM elections;
SELECT * FROM users LIMIT 1;
```

**Debería mostrar 5 usuarios y 2 elecciones**

### Completar .env del backend

```bash
# Actualizar CONTRACT_ADDRESS en backend/.env
echo "CONTRACT_ADDRESS=$CONTRACT_ADDRESS" >> backend/.env
```

### Terminal 2: Iniciar Backend servidor

```bash
npm run dev
```

**✓ Éxito si ves:**
```
🚀 Server running on http://localhost:3001
✅ Database connected
✅ Routes mounted: /auth, /elections
Health check: GET http://localhost:3001/health
```

---

## 🎨 ETAPA 4: FRONTEND (3 minutos)

### Terminal 3: Instalar dependencias

```bash
cd frontend
npm install
```

### Terminal 3: Iniciar servidor dev

```bash
npm run dev
```

**✓ Éxito si ves:**
```
VITE v5.0.0  ready in XXX ms

➜  Local:   http://localhost:5173/
➜  Press h to show help
```

---

## 🧪 ETAPA 5: TESTING MANUAL

### Test 1: Landing Page (30 segundos)

**URL:** http://localhost:5173/

**Checkpoints:**
- [ ] Ves "End-to-End Voting" (o "Votación E2E" si español)
- [ ] Ves 4 feature cards: Security, Anonymity, Immutability, Auditability
- [ ] Dark mode toggle (luna 🌙) funciona
- [ ] Language toggle funciona (EN/ES)
- [ ] Click "Enter Voting"
- [ ] Te lleva a Login

### Test 2: Login (1 minuto)

**URL:** http://localhost:5173/login

**Pre-filled:**
```
Email: juan@universidad.edu
Password: password123
Election: Election 1
```

**Checkpoints:**
- [ ] Campos pre-llenados correctamente
- [ ] Click "Login"
- [ ] Backend responde con JWT

**Verificar JWT en localStorage:**
```javascript
// En browser console (F12 → Console):
localStorage.getItem('token')
localStorage.getItem('nullifier')
localStorage.getItem('electionId')

// Debería mostrar:
// token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
// nullifier: 0x1a2b3c4d5e6f...
// electionId: 1
```

**En Terminal 2 (Backend logs):**
```
✅ User juan@universidad.edu logged in
✅ Nullifier generated: 0x1a2b3c...
✅ JWT issued
```

### Test 3: Voting Dashboard (2 minutos)

**URL:** http://localhost:5173/voting (automático al login)

**Checkpoints:**
- [ ] Ves 3 candidatos (A, B, C)
- [ ] Ves un botón "Confirmar Voto" deshabilitado
- [ ] Selecciona un candidato
- [ ] Botón ahora está habilitado
- [ ] Ves "Live Feed" sezione (vacío inicialmente)
- [ ] Ves contador de votos = 0

### Test 4: Vote Submission (2 minutos)

**En VotingBooth:**
- [ ] Selecciona Candidato A
- [ ] Click "Confirmar Voto"
- [ ] Espera 2-3 segundos

**En Terminal 2 (Backend):**
```
✅ Vote registration received
✅ Nullifier validated
✅ Vote hash received
✅ Relaying to blockchain...
✅ Transaction hash: 0x9d8c7b...
```

**En Terminal 1 (Hardhat):**
```
  Contract deployment: VTB
  Deployed to: 0x5FbDB2315678afccb333f8a9c36b1176b8cc5a61

  blockNumber: 2
  transactionHash: 0x9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3f2e1d0c...
```

### Test 5: Live Feed (Critical!) (2 minutos)

**Después de "Confirmar Voto":**

**En Frontend (VotingBooth):**
- [ ] Tu voto aparece en "Live Feed"
- [ ] Muestra: Nullifier (primeros 20 chars), timestamp
- [ ] Contador actualiza a 1
- [ ] **NO muestra**: Email, nombre, candidato (privacidad ✓)

**Formato esperado:**
```
Live Feed:
┌─────────────────────────────────────┐
│ New vote cast                       │
│ Nullifier: 0x1a2b3c4d5e6f...     │
│ Time: 14:30:25                      │
│ Total votes: 1                      │
└─────────────────────────────────────┘
```

**Verificar en browser console:**
```javascript
// Debería haber logs:
// "Vote submitted with hash: 0x9d8c..."
// "Listening for blockchain events..."
// "New vote received! Nullifier: 0x1a2b..."
```

---

## 🔐 ETAPA 6: TESTING DE SEGURIDAD

### Test 6: Double Voting Prevention

**Escenario:** Intenta votar 2 veces con same user

```bash
# Terminal 4: En VotingBooth
- Selecciona Candidato A
- Click "Confirmar Voto"
- Espera 2 segundos
- Selecciona Candidato B
- Click "Confirmar Voto" de nuevo
```

**Resultado esperado:**
```
❌ Error: "Ya votaste en esta elección"
O
❌ Smart Contract rechaza (nullifier duplicado)
```

**En Terminal 2 (Backend):**
```
❌ Nullifier already used in this election
❌ Transaction failed: duplicated nullifier
```

### Test 7: Privacy Check

**Verificar que blockchain NO almacena PII:**

```bash
# Terminal 4:
cd blockchain
npx hardhat console --network localhost

# En consola Hardhat:
const VTB = await ethers.getContractAt("VTB", "0x5FbDB2315678afccb333f8a9c36b1176b8cc5a61");
const votes = await VTB.voteHistory(1);  // Election 1

console.log(votes);
// Resultado:
// [
//   {
//     nullifier: "0x1a2b3c4d5e6f...",  ← Hash anónimo ✓
//     voteHash: "0x9d8c7b6a5f...",     ← Voto cifrado ✓
//     timestamp: 1707927025
//   }
// ]
//
// ¿Ves email aquí? NO ✓
// ¿Ves nombre aquí? NO ✓
// ¿Ves candidato aquí? NO ✓
// PRIVACIDAD GARANTIZADA ✓
```

### Test 8: Dark Mode Persistence

```bash
# Frontend
- Click Moon 🌙 para dark mode
- Refresh página F5
- ¿Sigue en dark mode? SÍ ✓
```

### Test 9: i18n Persistence

```bash
# Frontend
- Click language selector ES
- Todos los textos cambian a español
- Refresh página F5
- ¿Sigue en español? SÍ ✓
```

---

## 📊 ETAPA 7: STRESS TEST (Opcional)

### Test 10: Multiple Voters

**En 2 navegadores o ventanas incógnito:**

**Navegador 1:**
```bash
Login: juan@universidad.edu / password123
Vota por Candidato A
```

**Navegador 2:**
```bash
Login: maria@universidad.edu / password123
Vota por Candidato B
```

**Resultado esperado:**
- [ ] Live Feed muestra 2 votos
- [ ] Cada uno con nullifier diferente
- [ ] Contador = 2
- [ ] No hay duplicados

---

## ✅ FINAL CHECKLIST

### Blockchain ✓
- [ ] Hardhat node corriendo
- [ ] Contract deployed
- [ ] Contract address guardado

### Backend ✓
- [ ] Database existe con 5 usuarios
- [ ] Server corriendo en :3001
- [ ] Login genera JWT + nullifier
- [ ] Relay a blockchain funciona

### Frontend ✓
- [ ] Vite dev server corriendo en :5173
- [ ] Landing page responsive
- [ ] Login funciona
- [ ] Voting Dashboard muestra
- [ ] Live Feed actualiza en tiempo real

### Seguridad ✓
- [ ] No puedo votar 2 veces
- [ ] No veo PII en blockchain
- [ ] Dark mode persiste
- [ ] i18n persiste

### Ready para Tribunal ✓
- [ ] Todo funciona sin errores
- [ ] Web3 e2e completo
- [ ] Privacy garantizada
- [ ] Auditoría pública funciona

---

## 🐛 TROUBLESHOOTING QUICK

| Problema | Solución |
|----------|----------|
| Puerto 8545 ocupado | `lsof -i :8545` → `kill -9 <PID>` |
| "Cannot find module 'ethers'" | `npm install ethers` en backend |
| JWT decode error | Verifica `JWT_SECRET` en .env |
| Blockchain no responde | ¿Terminal 1 está corriendo `hardhat node`? |
| Contract deploy falla | Hardhat node debe estar corriendo primero |
| Frontend no carga | ¿Verificaste `VITE_API_URL` y `VITE_CONTRACT_ADDRESS`? |
| Live Feed no actualiza | ¿Contract address correcto? ¿Voto fue submitido? |

---

## 📸 SCREENSHOTS PARA DOCUMENTAR

Toma screenshots de:
1. [ ] Landing page (hero + features)
2. [ ] Login exitoso (con nullifier en console)
3. [ ] VotingBooth con 3 candidatos
4. [ ] Live Feed con votos
5. [ ] Terminal de Hardhat mostrando transacción
6. [ ] Dark mode activado
7. [ ] Interfaz en español

---

## ⏱️ TIEMPO TOTAL

- Preparación: 5 min
- Blockchain: 5 min
- Deploy: 5 min
- Backend: 5 min
- Frontend: 3 min
- Testing: 15 min
- **TOTAL: ~40 minutos**

Haz esto **24 horas antes de presentación** para verificar que todo está perfecto.

---

**¡Suerte en tu defensa! 🎓**

# 🏗️ VTB - Arquitectura Técnica Completa

**Proyecto:** VTB (Vote Through Blockchain) - Sistema de Votación E2E Seguro y Anónimo  
**Año:** 3º Ingeniería Informática - Proyecto Final  
**Stack:** Web2 + Web3 Híbrido (React, Node.js, Hardhat, Solidity)

---

## 1️⃣ CAPA WEB2 (Autenticación & Políticas)

### Base de Datos: SQLite

```sql
-- Tabla: USUARIOS (Censo Electoral)
users
├── id (PK)
├── email (UNIQUE)
├── password_hash (bcrypt)
├── name
├── student_id (UNIQUE)
├── is_eligible (booleano: ¿tiene derecho a votar?)
├── created_at
└── updated_at

-- Tabla: ELECCIONES (Metadata)
elections
├── id (PK)
├── election_id_blockchain (FK)
├── name
├── description
├── start_time (timestamp)
├── end_time (timestamp)
├── is_active (booleano)
└── created_at

-- Tabla: AUDITORÍA DE NULLIFIERS
nullifier_audit
├── id (PK)
├── user_id (FK)
├── election_id (FK)
├── nullifier_hash
└── generated_at
```

### Backend Express.js

```javascript
// Endponts principales:

POST /auth/register        // Registro de usuario
POST /auth/login          // Login + generación de nullifier
GET  /auth/verify         // Verificar JWT válido

GET  /elections           // Listar elecciones
GET  /elections/:id       // Detalles de elección
POST /elections/register-vote  // Registrar voto en blockchain
GET  /elections/:id/vote-feed  // Feed en tiempo real
```

### Funciones Criptográficas (Critical Path)

```typescript
// ✨ LA PIEZA CLAVE: Generación de Nullifier

function generateNullifier(userId: number, electionId: number): string {
  // Fórmula: nullifier = HMAC-SHA256(secret, userId:electionId:salt)
  const message = `${userId}:${electionId}:vtb-voter`;
  
  const nullifier = crypto
    .createHmac("sha256", HMAC_SECRET)
    .update(message)
    .digest("hex");
  
  // Resultado: 0x1a2b3c... (imposible de invertir)
  return "0x" + nullifier;
}

// Propiedades del Nullifier:
// 1. DETERMINÍSTICO: userId + electionId → siempre el mismo nullifier
// 2. ÚNICO: userId1 ≠ userId2 → nullifier1 ≠ nullifier2
// 3. IRREVERSIBLE: No puedo obtener userId del nullifier
// 4. EFECTO ANTI-DOBLE VOTO:
//    - Usuario intenta votar 2 veces
//    - Genera el MISMO nullifier
//    - Smart Contract rechaza (nullifier ya existe)
```

---

## 2️⃣ CAPA WEB3 (Blockchain Smart Contract)

### Smart Contract: ElectionRegistry.sol

```solidity
// Almacenamientos principales:

mapping(uint256 => Election) public elections;
// electionId → {name, startTime, endTime, active, totalVotes}

mapping(uint256 => mapping(bytes32 => bytes32)) public votes;
// electionId → (nullifier → voteHash)
// ↑ La clave es prevenir double-voting

mapping(uint256 => VoteRecord[]) public voteHistory;
// Historial completo para auditoría

// EVENTO CRÍTICO:
event VoteCast(
  uint256 indexed electionId,
  bytes32 indexed nullifier,    // ← Hash anónimo del votante
  bytes32 voteHash,            // ← Voto cifrado
  uint256 timestamp
);
// ✨ Este evento escucha el Live Feed en tiempo real
```

### Función Core: castVote()

```solidity
function castVote(
  uint256 _electionId,
  bytes32 _nullifier,      // Generado en Backend
  bytes32 _voteHash        // Generado en Frontend
) public {
  // 1. Validación de elección existente y activa
  require(elections[_electionId].active, "Elección no activa");
  require(block.timestamp >= elections[_electionId].startTime, "No ha empezado");
  
  // 2. ✨ VALIDACIÓN CRÍTICA: Prevenir double-voting
  require(
    votes[_electionId][_nullifier] == bytes32(0),
    "Ya votaste"  // ← Si nullifier ya existe, rechaza
  );
  
  // 3. Registrar voto
  votes[_electionId][_nullifier] = _voteHash;
  elections[_electionId].totalVotes++;
  
  // 4. Emitir evento para auditoría pública
  emit VoteCast(_electionId, _nullifier, _voteHash, block.timestamp);
}
```

---

## 3️⃣ PUENTES: Backend como RELAYER

### Flujo Crítico de Votación

```
┌─────────────────────────────────────────────────────────────┐
│ USUARIO (Frontend)                                          │
│ - Email, Contraseña, Selecciona Candidato                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
                   REQUEST
                       │
         ┌─────────────▼──────────────┐
         │ POST /auth/login           │
         │ {                          │
         │   email,                   │
         │   password,                │
         │   electionId               │
         │ }                          │
         └─────────────┬──────────────┘
                       │
         ┌─────────────▼──────────────────────────────────┐
         │ BACKEND VALIDA EN SQLite                       │
         │ - ¿Email existe con esa contraseña?           │
         │ - ¿Usuario es elegible?                        │
         └─────────────┬──────────────────────────────────┘
                       │
         ┌─────────────▼──────────────────────────────────┐
         │ BACKEND GENERA NULLIFIER                       │
         │ nullifier = HMAC(userId, electionId, SECRET)  │
         └─────────────┬──────────────────────────────────┘
                       │
         ┌─────────────▼──────────────────────────────────┐
         │ BACKEND CREA JWT                               │
         │ {                                              │
         │   userId,                                      │
         │   email,                                       │
         │   electionId,                                  │
         │   nullifier  ← INCLUIDO EN TOKEN              │
         │ }                                              │
         └─────────────┬──────────────────────────────────┘
                       │
                    RESPONSE
                       │
         ┌─────────────▼──────────────────────────────────┐
         │ FRONTEND RECIBE JWT                            │
         │ - Almacena en localStorage                     │
         │ - Extrae nullifier para uso posterior         │
         └─────────────┬──────────────────────────────────┘
                       │
               ✨ VOTACIÓN ✨
                       │
         ┌─────────────▼──────────────────────────────────┐
         │ USUARIO SELECCIONA CANDIDATO                   │
         │ Click: "Confirmar Voto"                        │
         └─────────────┬──────────────────────────────────┘
                       │
         ┌─────────────▼──────────────────────────────────┐
         │ FRONTEND GENERA VOTE HASH LOCALMENTE           │
         │ voteHash = SHA256(                             │
         │   candidatoId + randomSalt                     │
         │ )                                              │
         │ ✅ Backend NUNCA ve qué votó                  │
         └─────────────┬──────────────────────────────────┘
                       │
         ┌─────────────▼──────────────────────────────────┐
         │ POST /elections/register-vote                  │
         │ {                                              │
         │   token (JWT con nullifier),                   │
         │   electionId,                                  │
         │   voteHash (cifrado)                           │
         │ }                                              │
         └─────────────┬──────────────────────────────────┘
                       │
         ┌─────────────▼──────────────────────────────────┐
         │ BACKEND VALIDA JWT                             │
         │ - ¿Token válido?                               │
         │ - Extrae: userId, nullifier, electionId       │
         └─────────────┬──────────────────────────────────┘
                       │
         ┌─────────────▼──────────────────────────────────┐
         │ BACKEND PREPARA TRANSACCIÓN                    │
         │ contract.castVote(                             │
         │   electionId,                                  │
         │   nullifier,     ← Del JWT                     │
         │   voteHash       ← Del request                 │
         │ )                                              │
         └─────────────┬──────────────────────────────────┘
                       │
         ┌─────────────▼──────────────────────────────────┐
         │ BACKEND FIRMA CON PRIVATE_KEY                  │
         │ - Firma la transacción como relayer            │
         │ - Paga gas fees                                │
         │ - Envía a Hardhat RPC                          │
         └─────────────┬──────────────────────────────────┘
                       │
                   HARDHAT
                       │
         ┌─────────────▼──────────────────────────────────┐
         │ SMART CONTRACT VALIDA                          │
         │ - ¿Elección activa?                            │
         │ - ¿nullifier NO votó aún?    ← ANTI DOBLE     │
         │ - Si todo OK: registra voto                    │
         └─────────────┬──────────────────────────────────┘
                       │
         ┌─────────────▼──────────────────────────────────┐
         │ EMITIR EVENTO: VoteCast                        │
         │ {                                              │
         │   electionId,                                  │
         │   nullifier,    ← Solo hash, sin PII          │
         │   voteHash,     ← Solo hash, sin qué votó      │
         │   timestamp                                    │
         │ }                                              │
         └─────────────┬──────────────────────────────────┘
                       │
         ┌─────────────▼──────────────────────────────────┐
         │ LIVE FEED (Frontend) ESCUCHA EVENTO            │
         │ ethers.js listener registra:                   │
         │ - Nullifier (mostrar en UI)                    │
         │ - Timestamp                                    │
         │ - Contador total de votos                      │
         │ ✨ AUDITORÍA PÚBLICA EN TIEMPO REAL           │
         └─────────────────────────────────────────────────┘
```

---

## 4️⃣ FRONTEND: React + Vite + Web3

### Arquitectura de Componentes

```
App.jsx
├── ThemeProvider (Dark/Light)
│   ├── i18nProvider (EN/ES)
│   │   ├── Router
│   │   │   ├── Landing.jsx (Landing pública)
│   │   │   ├── Login.jsx (Autenticación + nullifier)
│   │   │   ├── VotingBooth.jsx (Votación + Live Feed)
│   │   │   ├── Results.jsx (Resultados)
│   │   │   └── AdminPanel.jsx (Admin)
│   │   │
│   │   └── Navbar.jsx (Global)
│   │       ├── Theme toggle (dark/light)
│   │       ├── Language selector (EN/ES)
│   │       └── Login button
```

### Live Feed Implementation

```typescript
// VotingBooth.jsx - Escuchar eventos blockchain en tiempo real

useEffect(() => {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  
  const contractAbi = [
    "event VoteCast(uint256 indexed electionId, bytes32 indexed nullifier, bytes32 voteHash, uint256 timestamp)",
  ];
  
  const contract = new ethers.Contract(
    CONTRACT_ADDRESS,
    contractAbi,
    provider
  );

  // ✨ EVENT LISTENER EN TIEMPO REAL
  contract.on("VoteCast", (electionId, nullifier, voteHash, timestamp) => {
    setVotes(prev => [{
      nullifier,              // ← Mostrar en UI
      voteHash,              // ← Mostrar hash del voto
      timestamp,             // ← Mostrar hora
    }, ...prev]);
    
    // Actualizar contador
    setVoteCount(prev => prev + 1);
  });
}, []);
```

### State Management

```javascript
// Context API para:
- ThemeContext (Dark/Light)
- i18n (Internacionalización EN/ES)
- AuthContext (JWT, nullifier)
- VoteContext (Estado de votación)
```

---

## 5️⃣ SEGURIDAD & PRIVACIDAD

### Garantías de ANONIMATO

```
┌─────────────────────────────────────────────────────┐
│ USUARIO: Juan García (ID: 1)                        │
│ ELECCIÓN: Universitaria 2026 (ID: 1)               │
│ CONTRASEÑA: "password123"                           │
└─────────────────────────────────────────────────────┘
                    │
                    ▼ (Backend genera)
┌─────────────────────────────────────────────────────┐
│ nullifier = HMAC-SHA256(                           │
│   "1:1:vtb-voter",                                 │
│   HMAC_SECRET                                       │
│ )                                                   │
│ = "0x1a2b3c4d5e6f..."                             │
└─────────────────────────────────────────────────────┘
                    │
          ¿Puedo invertir este hash?
          ¿Puedo saber que es Juan?
          
          ❌ NO - HMAC es irreversible
          ✅ SI - Solo conozco el nullifier
├─────────────────────────────────────────────────────┐
│ VOTO en Blockchain:                                │
│ {                                                   │
│   nullifier: "0x1a2b3c...",  ← Solo hash          │
│   voteHash: "0x9d8c7b...",   ← Voto cifrado       │
│   emai: ❌ NO ALMACENADO                           │
│   name: ❌ NO ALMACENADO                           │
│   student_id: ❌ NO ALMACENADO                     │
│   candidato: ❌ CIFRADO EN voteHash                │
│ }                                                   │
└─────────────────────────────────────────────────────┘
```

### Garantías Anti-Double-Voto

```typescript
// En Smart Contract during castVote():

// Antes:
votes[electionId] = {
  0xnullifier1: 0xvoteHash1,
  0xnullifier2: 0xvoteHash2,
}

// Usuario intenta votar 2 veces con mismo nullifier:
require(
  votes[electionId][0xnullifier1] == bytes32(0),
  "Ya votaste"
);

// Result: ❌ RECHAZADO
// ✅ Double-voting prevenido
```

### Separación de Responsabilidades

```javascript
┌─────────────────────────────────────────┐
│ WEB2 (SQL): ALMACENA PII                │
├─────────────────────────────────────────┤
│ ✓ Email                                 │
│ ✓ Nombre                                │
│ ✓ ID Estudiante                         │
│ ✓ Contraseña (hash)                     │
│ ✓ Elegibilidad                          │
│                                         │
│ RESPONSABILIDAD: Autenticación          │
│ PÚBLICAMENTE: ❌ Privado                  │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ WEB3 (Blockchain): ALMACENA AUDITORÍA   │
├─────────────────────────────────────────┤
│ ✓ Nullifier (hash anónimo)              │
│ ✓ VoteHash (voto cifrado)               │
│ ✓ Timestamp                             │
│ ✓ Contador de votos                     │
│ ✗ Email, Nombre, ID Estudiante          │
│ ✗ Qué candidato recibió voto            │
│                                         │
│ RESPONSABILIDAD: Auditoría              │
│ PÚBLICAMENTE: ✅ Transparente           │
└─────────────────────────────────────────┘
```

---

## 6️⃣ DEFENSA ANTE ATAQUES

### Attack #1: "Quiero saber quién votó"

**Defensa:**
```
Imposible. Solo veo nullifiers (hashes) en blockchain.
Los nullifiers se generan como HMAC-SHA256(userId, electionId, SECRET).
Sin acceso al SECRET_KEY, no puedo invertir el hash.
```

### Attack #2: "Voy a votar dos veces"

**Defensa:**
```
Imposible. Smart Contract valida:
- Si intento votar con el mismo nullifier,
- Verifica que no existe ya en blockchain,
- Si existe, rechaza la transacción.

Cada usuario = nullifier único = un voto máximo
```

### Attack #3: "Voy a cambiar los resultados"

**Defensa:**
```
Imposible. Los datos están en blockchain:
- Inmutables por definición,
- Cualquier cambio requiere re-hacer proof-of-work,
- Públicamente auditable.
```

### Attack #4: "Manipularé la base de datos SQLite"

**Defensa:**
```
Posible impacto limitado:
- NO afecta los votos registrados en blockchain
- Blockchain es la source of truth
- SQL es solo para autenticación y censo electoral
- Cambios en SQL son auditables (audit logs)
```

---

## 7️⃣ FLUJO DE DATOS (Data Flow Diagram)

```
┌─────────────────────────────────────┐
│ Frontend (React)                    │
│ - Vite (SSR)                        │
│ - ethers.js v6                      │
│ - Tailwind CSS                      │
│ - Framer Motion                     │
│ - i18next (EN/ES)                   │
└──────────────┬──────────────────────┘
               │
           HTTP/REST
               │
┌──────────────▼──────────────────────┐
│ Backend (Node.js/Express)           │
│ - TypeScript                        │
│ - JWT Auth                          │
│ - HMAC Nullifier Generation         │
│ - ethers.js (Tx Signing)            │
└──────────────┬──────────────────────┘
       ┌───────┴────────┐
       │                │
   SQL │                │ Web3 RPC
       │                │
┌──────▼────────┐  ┌────▼──────────────┐
│ SQLite DB     │  │ Hardhat Node       │
│ - Users       │  │ - Port 8545        │
│ - Elections   │  │ - 20 test accounts │
│ - Audit logs  │  │ - Mock blockchain  │
└───────────────┘  └────┬───────────────┘
                        │
                ┌───────▼────────────┐
                │ Smart Contract     │
                │ - ElectionRegistry │
                │ - VoteCast event   │
                │ - Nullifier map    │
                └────────────────────┘
```

---

## 8️⃣ PERFORMANCE & ESCALABILIDAD

### Optimizaciones

```javascript
// 1. Nullifier caching (para misma elección)
const nullifierCache = {};

function generateNullifier(userId, electionId) {
  const key = `${userId}:${electionId}`;
  if (key in nullifierCache) {
    return nullifierCache[key];
  }
  // ...generate y cache
  return nullifier;
}

// 2. Event batching (Live Feed)
// Agrupar eventos cada 1 segundo antes de actualizar UI

// 3. Database indices
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_elections_active ON elections(is_active);

// 4. Lazy loading (React components)
const VotingBooth = lazy(() => import('./pages/VotingBooth'));
```

### Escalabilidad a Producción

```javascript
// Cambios necesarios:

// 1. SQL → PostgreSQL (múltiples conexiones)
// 2. Blockchain → Ethereum mainnet (en lugar de Hardhat)
// 3. Backend → Multiple instances + load balancer
// 4. Frontend → CDN + caching
// 5. Seguridad:
//    - HTTPS obligatorio
//    - Rate limiting
//    - CSRF protection
//    - Input validation
//    - Private keys en environment variables
```

---

## 9️⃣ TESTING PROPUESTO

```typescript
// Unit Tests
- generateNullifier() produce datos determinísticos
- hashPassword() verifica contraseñas correctamente
- JWT token incluye nullifier

// Integration Tests
- Login genera nullifier correcto
- Backend firma transacción válida
- Nullifier previene double-voting

// E2E Tests
- Usuario completa flujo login → voto → live feed
- Dark mode persiste
- Idioma persiste
```

---

## 🔟 CONCLUSIÓN TÉCNICA

### Stack Elegido

| Componente | Tecnología | Por qué |
|-----------|-----------|--------|
| **Blockchain** | Hardhat local | Desarrollo rápido, testing fácil |
| **Smart Contract** | Solidity 0.8.24 | Estándar de la industria |
| **Backend** | Node.js/Express | JavaScript full-stack, npm ecosystem |
| **Database** | SQLite | Lightweight, sin dependencias |
| **Frontend** | React + Vite | Performance, developer experience |
| **Styling** | Tailwind CSS | Utilidad-first, temas fácil |
| **Estado** | Context API | Suficiente para esta escala |
| **i18n** | react-i18next | Madurez, soporte comunidad |

### Puntos Fuertes de la Arquitectura

✅ **Separación Web2/Web3**: Cada capa tiene su responsabilidad  
✅ **Anonimato**: Nullifiers imposibles de invertir  
✅ **Auditoría**: Live Feed con eventos públicos  
✅ **Escalable**: Fácil pasar a mainnet/PostgreSQL  
✅ **UX Moderna**: Dark mode, i18n, animaciones  
✅ **Seguridad**: Anti-double-voting, PII protegida  
✅ **Documentación**: Tech comments en código  

### Para Defensa Tribunal

"Demuestro que es posible combinar tecnología tradicional (BD relacional) con blockchain para resolver el problema de votación electrónica: autenticación -> anonimato -> auditoría. La solución es académicamente rigurosa y comercialmente viable."

---

**Fin de Documentación Técnica** 📋

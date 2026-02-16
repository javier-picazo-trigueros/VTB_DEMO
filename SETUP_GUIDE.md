# 🚀 VTB Demo - Setup Completo & Guía de Ejecución

## Descripción General

VTB (Vote Through Blockchain) es un sistema de votación electrónica hybrid Web2 + Web3 que demuestra:

- **Autenticación Web2**: SQLite + JWT Token
- **Blockchain Web3**: Hardhat local + Solidity Smart Contract
- **Anonimato**: Nullifiers previenen correlación usuario↔voto
- **Auditoría Pública**: Live Feed muestra eventos sin revelar PII
- **Tech Stack**: React (Vite) + Node.js/Express + Hardhat + Solidity

---

## 📋 Prerrequisitos

- **Node.js 18+** (https://nodejs.org)
- **npm o yarn**
- **Git**
- **Navegador moderno** (Chrome, Firefox, Edge)

---

## 🔧 Instalación Paso a Paso

### 1. Clonar/Preparar el Repositorio

```bash
cd VTB_DEMO
```

### 2. Instalar Dependencias del Blockchain (Hardhat)

```bash
cd blockchain
npm install
cd ..
```

### 3. Instalar Dependencias del Backend (Express)

```bash
cd backend
npm install
cd ..
```

### 4. Instalar Dependencias del Frontend (React)

```bash
cd frontend
npm install
cd ..
```

---

## 🏗️ Arquitectura del Proyecto

```
VTB_DEMO/
├── blockchain/
│   ├── contracts/VTB.sol              # Smart Contract Solidity
│   ├── scripts/deploy.ts              # Script de deployment
│   ├── hardhat.config.ts              # Config Hardhat
│   └── package.json
│
├── backend/
│   ├── src/
│   │   ├── index.ts                   # Servidor Express
│   │   ├── config/database.ts         # SQLite config
│   │   ├── routes/
│   │   │   ├── auth.ts                # Autenticación + nullifier
│   │   │   └── elections.ts           # Votación + relay blockchain
│   │   ├── utils/auth.ts              # Funciones criptográficas
│   │   └── scripts/seedDatabase.ts    # Datos de prueba
│   ├── package.json
│   └── .env.example
│
└── frontend/
    ├── src/
    │   ├── pages/
    │   │   ├── Landing.jsx            # Landing page
    │   │   ├── Login.jsx              # Login + generación nullifier
    │   │   └── VotingBooth.jsx        # Voting + Live Feed
    │   ├── components/
    │   │   └── Navbar.jsx             # Navbar (theme + i18n)
    │   ├── context/
    │   │   └── ThemeContext.tsx       # Dark/Light mode
    │   ├── i18n/
    │   │   └── config.ts              # i18next EN/ES
    │   └── main.jsx
    ├── vite.config.js
    ├── tailwind.config.js
    ├── package.json
    └── .env.example
```

---

## 🚀 Ejecución Completa (Recomendado)

Abre **4 terminales separadas** (una para cada servicio):

### Terminal 1: Hardhat Node (Blockchain)

```bash
cd blockchain
npx hardhat node
```

**Salida esperada:**
```
✓ 20 accounts con 10,000 ETH cada uno
✓ Listening on 127.0.0.1:8545
```

✅ **Espera a que muestre la URL RPC**

---

### Terminal 2: Deploy Smart Contract

```bash
# En otra terminal, mientras Hardhat está corriendo
cd blockchain
npx hardhat run scripts/deploy.ts --network localhost
```

**Salida esperada:**
```
✅ ElectionRegistry desplegado en: 0x5FbDB2315678...
✅ Elección de prueba creada exitosamente
📍 Deployment info guardado en: deployment-info.json
```

✅ **Guarda la dirección del contrato**

---

### Terminal 3: Backend Node.js

```bash
cd backend

# Copiar variables de entorno
cp .env.example .env

# Editar .env y añadir:
# CONTRACT_ADDRESS=<dirección del contrato paso anterior>
# PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb476caddbc7f721e8fcc7704cea4

# Poblar base de datos con datos de prueba
npm run seed

# Iniciar servidor
npm run dev
```

**Salida esperada:**
```
✅ Base de datos SQLite inicializada
🌱 Seedeando base de datos con datos de prueba
✅ Usuario creado: juan@universidad.edu
✅ Elección creada: Elección Universitaria 2026

🚀 VTB Backend iniciado
📍 Servidor: http://localhost:3001
💚 Health check: http://localhost:3001/health
```

✅ **El backend está listo**

---

### Terminal 4: Frontend React

```bash
cd frontend

# Copiar variables de entorno
cp .env.example .env.local

# Editar .env.local y ajustar la dirección del contrato si es necesario
# VITE_CONTRACT_ADDRESS=<dirección paso anterior>

# Iniciar servidor Vite
npm run dev
```

**Salida esperada:**
```
VITE v5.0.0 ready in 189 ms

➜  Local:   http://localhost:5173/
➜  press h to show help
```

✅ **Frontend está listo**

---

## 🎯 Usar la Aplicación

### 1. Abrir en navegador

```
http://localhost:5173
```

### 2. Landing Page
- Lee la propuesta de valor
- Entiende la arquitectura Web2 + Web3
- Haz click en "Start Voting Now"

### 3. Login

**Credenciales de prueba:**
```
Email: juan@universidad.edu
Contraseña: password123
Elección: Elección Universitaria 2026
```

**Qué sucede:**
1. Backend valida credenciales contra SQLite
2. Backend genera `nullifier = HMAC(userId, electionId)`
3. Backend retorna JWT con nullifier incluido
4. Frontend almacena en localStorage

### 4. Voting Booth

**En la pantalla:**
- Selecciona un candidato
- Click en "Confirmar Voto"
- Frontend envía JWT + voteHash al backend

**En blockchain:**
1. Backend firma transacción con PRIVATE_KEY
2. Envía a Smart Contract: `castVote(electionId, nullifier, voteHash)`
3. Smart Contract previene double-voting con nullifier
4. **Live Feed recibe evento en tiempo real** ✨

### 5. Live Feed de Votos

En la columna derecha verás:
- **Contador de votos** en tiempo real
- **Nullifier** (solo hash anónimo, sin PII)
- **Timestamp** de cada voto
- **Privacidad garantizada**: solo datos públicos en blockchain

---

## 🔐 Flujo de Seguridad Explicado

```
┌─────────────────────────────────────────────────────────────────┐
│ USUARIO ACCEDE AL SITIO                                         │
└────────────────────────┬────────────────────────────────────────┘
                         │
                    LOGIN (Web2)
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    1. Email       2. Password      3. ElectionID
         │               │               │
         └───────────────┼───────────────┘
                         │
         ┌───────────────▼────────────────┐
         │ BACKEND VALIDA EN SQLite       │
         │ ✓ Email existe?                │
         │ ✓ Contraseña correcta?         │
         │ ✓ Usuario elegible?            │
         └───────────────┬────────────────┘
                         │
         ┌───────────────▼────────────────┐
         │ BACKEND GENERA NULLIFIER       │
         │ nullifier = HMAC-SHA256(       │
         │   userId,                      │
         │   electionId,                  │
         │   SECRET_KEY                   │
         │ )                              │
         └───────────────┬────────────────┘
                         │
         ┌───────────────▼────────────────┐
         │ BACKEND CREA JWT              │
         │ {                              │
         │   userId,                      │
         │   email,                       │
         │   electionId,                  │
         │   nullifier,          ← CLAVE │
         │   exp: +24h                    │
         │ }                              │
         └───────────────┬────────────────┘
                         │
         ┌───────────────▼────────────────┐
         │ FRONTEND RECIBE JWT            │
         │ Almacena en localStorage       │
         └───────────────┬────────────────┘
                         │
                  VOTACIÓN (Web3)
                         │
    ┌────────────────────▼────────────────┐
    │ USUARIO SELECCIONA CANDIDATO        │
    │ CLICK: "Confirmar Voto"             │
    └────────────────────┬────────────────┘
                         │
    ┌────────────────────▼────────────────┐
    │ FRONTEND GENERA VOTE HASH           │
    │ voteHash = SHA256(                  │
    │   candidato_id + random_salt        │
    │ )                                   │
    │ ← BACKEND NUNCA VE QUÉ VOTÓ        │
    └────────────────────┬────────────────┘
                         │
    ┌────────────────────▼────────────────┐
    │ FRONTEND ENVÍA:                     │
    │ {                                   │
    │   JWT_token,        ← contiene      │
    │   voteHash          ← cifrado       │
    │ }                                   │
    │ POST /elections/register-vote       │
    └────────────────────┬────────────────┘
                         │
    ┌────────────────────▼────────────────┐
    │ BACKEND VALIDA JWT                  │
    │ Extrae: userId, nullifier           │
    └────────────────────┬────────────────┘
                         │
    ┌────────────────────▼────────────────┐
    │ BACKEND FIRMA + ENVÍA TRANSACCIÓN   │
    │ castVote(                           │
    │   electionId,                       │
    │   nullifier,        ← anónimo       │
    │   voteHash          ← cifrado       │
    │ )                                   │
    │ Usando PRIVATE_KEY (relayer)        │
    └────────────────────┬────────────────┘
                         │
    ┌────────────────────▼────────────────┐
    │ SMART CONTRACT EN HARDHAT           │
    │ ✓ Valida nullifier es único         │
    │ ✓ Previene double-voting            │
    │ ✓ Emite evento VoteCast             │
    └────────────────────┬────────────────┘
                         │
    ┌────────────────────▼────────────────┐
    │ EVENT: VoteCast(                    │
    │   electionId,                       │
    │   nullifier,        ← solo hash     │
    │   voteHash,         ← solo hash     │
    │   timestamp                         │
    │ )                                   │
    │ ← NO HAY PII EN BLOCKCHAIN          │
    └────────────────────┬────────────────┘
                         │
    ┌────────────────────▼────────────────┐
    │ LIVE FEED ESCUCHA EVENTO            │
    │ Muestra:                            │
    │ - Nullifier (anónimo)               │
    │ - Timestamp                         │
    │ - Contador de votos                 │
    │ ✓ AUDITORÍA PÚBLICA                │
    │ ✗ PII PROTEGIDA                    │
    └─────────────────────────────────────┘
```

---

## 📊 Verificar Operación Correcta

### 1. Backend Health Check

```bash
curl http://localhost:3001/health
```

**Respuesta:**
```json
{
  "status": "OK",
  "service": "VTB Backend",
  "uptime": 123.45
}
```

### 2. Verificar Base de Datos

```bash
cd backend
sqlite3 vtb.db

# En la consola sqlite3:
SELECT COUNT(*) FROM users;  -- Debería mostrar 5 usuarios
SELECT * FROM elections;
.quit
```

### 3. Verificar Deploy del Contrato

```bash
cat blockchain/deployment-info.json | jq
```

### 4. Verificar Live Feed en Consola del Frontend

```
🔗 Conectando a Hardhat RPC...
✅ Conectado. Escuchando eventos VoteCast...
📝 Nuevo voto recibido en Live Feed: {
  electionId: "1",
  nullifier: "0x1a2b3c...",
  voteHash: "0x9d8c7b...",
  timestamp: "1708000000"
}
```

---

## 🐛 Solución de Problemas

### "Cannot find module 'ethers'"

```bash
cd frontend
npm install
```

### "Connection refused" al backend

- ✅ Verifica que backend está corriendo en terminal 3
- ✅ Verifica que puerto 3001 no está en uso
- ✅ Comprueba: `lsof -i :3001`

### "Connection refused" al Hardhat

- ✅ Verifica que Hardhat está corriendo en terminal 1
- ✅ Verifica que puerto 8545 no está en uso
- ✅ Regenera en deployment con `npx hardhat clean`

### "No such table: users"

```bash
cd backend
npm run seed
```

### "Voto no se registra"

1. Verifica que el contrato está desplegado:
   ```bash
   cat blockchain/deployment-info.json | grep contractAddress
   ```

2. Verifica que el CONTRACT_ADDRESS está en `.env` backend

3. Comprueba console del navegador (F12) para errores

### "Live Feed no muestra votos"

- ✅ Verifica que RPC_URL en `.env.local` es correcto
- ✅ Verifica que CONTRACT_ADDRESS es correcta
- ✅ Mira consola del navegador para errores de conexión

---

## 🎓 Explicación Técnica para Defensa

### Pregunta: ¿Cómo garantizas anonimato?

**Respuesta:**
1. Nullifier = HMAC determinístico que NO se puede invertir
2. Mismo usuario + elección = siempre el mismo nullifier
3. Pero diferentes usuarios = diferentes nullifiers
4. Blockchain solo ve nullifier (hash), no identidad

### Pregunta: ¿Cómo previene double-voting?

**Respuesta:**
El Smart Contract verifica que `nullifier` no exista ya:
```solidity
if (votes[electionId][_nullifier] != bytes32(0)) {
    revert("Ya votaste");
}
```

### Pregunta: ¿Por qué Web2 + Web3?

**Respuesta:**
- **Web2 (SQLite)**: Autenticación y censo electoral (rápido, offline)
- **Web3 (Blockchain)**: Inmutabilidad y auditoría (transparencia pública)
- **Ventaja**: Lo mejor de ambos mundos

### Pregunta: ¿Qué sucede si alguien intenta votar con otro email?

**Respuesta:**
1. Backend valida email + contraseña contra SQLite
2. Si son incorrectos, rechaza el login
3. Sin JWT, no se puede acceder al voting booth

### Pregunta: ¿Puede un administrador ver los votos?

**Respuesta:**
- NO. El voto está cifrado como `voteHash` en blockchain
- El administrador vería solo: nullifier + voteHash (ambos hashes)
- Los resultados se calculan en frontend (descifrado client-side)

---

## 📚 Archivos Importantes para Entender la Arquitectura

1. **Smart Contract**: `blockchain/contracts/VTB.sol`
   - Comentarios: Explicación de hybrid architecture
   - Eventos: VoteCast, DoubleVoteAttempted

2. **Backend Auth**: `backend/src/utils/auth.ts`
   - Función generateNullifier() - LA PIEZA CLAVE
   - Explicación de seguridad cifrada

3. **Backend Election**: `backend/src/routes/elections.ts`
   - Función castVote() - cómo se registran votos
   - Integración con Hardhat RPC

4. **Frontend Voting**: `frontend/src/pages/VotingBooth.jsx`
   - Live Feed con ethers.js
   - Event listener en tiempo real

---

## ✅ Checklist Pre-Presentación

- [ ] Los 4 servicios están corriendo (Hardhat, Deploy, Backend, Frontend)
- [ ] Frontend abre en http://localhost:5173
- [ ] Puedo hacer login con juan@universidad.edu
- [ ] La cabina de votación carga sin errores
- [ ] Al votar, aparece en el Live Feed inmediatamente
- [ ] Dark mode funciona (navbar toggle)
- [ ] i18n funciona (cambiar a español)
- [ ] Console del navegador sin errores

---

## 🎯 Conclusión

VTB demuestra:
✅ Autenticación segura (Web2)
✅ Anonimato garantizado (nullifiers)
✅ Transparencia pública (blockchain)
✅ Auditoría sin revelar identidad
✅ Tech stack moderno: React, Node.js, Hardhat, Solidity

**¡Listo para presentar a tribunal!** 🚀

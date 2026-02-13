# VTB - Vote Through Blockchain

**Proyecto de Fin de Grado: Ingeniería Informática**

Sistema de votación electrónica híbrido que combina **Web2 (SQL)** y **Web3 (Blockchain simulada)** para garantizar autenticación segura, anonimato de votantes e inmutabilidad de resultados.

---

## 📋 Tabla de Contenidos

1. [Descripción General](#descripción-general)
2. [Arquitectura del Sistema](#arquitectura-del-sistema)
3. [Instalación](#instalación)
4. [Ejecución](#ejecución)
5. [Credenciales de Prueba](#credenciales-de-prueba)
6. [Características Principales](#características-principales)
7. [Estructura de Carpetas](#estructura-de-carpetas)
8. [Tecnologías Utilizadas](#tecnologías-utilizadas)
9. [Documentación Técnica](#documentación-técnica)

---

## 🎯 Descripción General

### Objetivo
Demostrar un sistema de votación que resuelve los siguientes desafíos:
- **Autenticación**: Verificar que el votante tiene derecho a votar (Web2/SQL)
- **Anonimato**: Garantizar que la identidad del votante nunca se vincula a su voto (Web3/Blockchain)
- **Inmutabilidad**: Asegurar que los votos no pueden ser alterados (Hashes SHA-256, Proof-of-Work)
- **Auditoría**: Permitir verificar la integridad de los resultados sin revelar identidades

### Características Clave
✅ **Capa Web2 (SQL)**: Gestión de usuarios, autenticación y censo electoral  
✅ **Capa Web3 (Blockchain)**: Almacenamiento anónimo e inmutable de votos  
✅ **Zero-Knowledge Proof simulado**: Generación de credenciales anónimas  
✅ **Proof-of-Work**: Validación criptográfica de bloques  
✅ **Interfaz responsive**: Dark mode con Tailwind CSS  
✅ **Panel de administración**: Estadísticas y auditoría en tiempo real  

---

## 🏗️ Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────┐
│                     VTB Demo Application                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────┐          ┌──────────────────────┐│
│  │   FRONTEND (React)   │◄────────►│  BACKEND (Flask)     ││
│  │  http://localhost:3000           http://localhost:5000  ││
│  │                      │          │                      ││
│  │ • Landing Page       │          │ • API REST           ││
│  │ • Login              │          │ • Autenticación      ││
│  │ • Dashboard          │          │ • Gestión votos      ││
│  │ • Voting Modal       │          │ • Estadísticas       ││
│  │ • Results            │          │                      ││
│  │ • Admin Panel        │          └──────────────────────┘│
│  └──────────────────────┘                     │            │
│           │                                   │            │
│           │        ┌────────────────────┐    │            │
│           └───────►│  SQL (SQLite)      │────┘            │
│                    │  • users           │                 │
│                    │  • elections       │                 │
│                    │  • votes (censo)   │                 │
│                    └────────────────────┘                 │
│                                                             │
│        ┌─────────────────────────────────────────┐         │
│        │    Blockchain Simulada (En Memoria)    │         │
│        │  • Bloques con votos anónimos          │         │
│        │  • Hashes SHA-256                      │         │
│        │  • Proof-of-Work (2 ceros iniciales)   │         │
│        │  • Validación de cadena                │         │
│        └─────────────────────────────────────────┘         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 Instalación

### Requisitos Previos
- Python 3.8+
- Node.js 16+ (con npm)
- Git (opcional, para clonar el repositorio)

### Paso 1: Configurar Backend

#### 1.1 Navegar a la carpeta backend
```bash
cd backend
```

#### 1.2 Crear entorno virtual (recomendado)
```bash
# Windows
python -m venv venv
venv\Scripts\activate

# macOS/Linux
python3 -m venv venv
source venv/bin/activate
```

#### 1.3 Instalar dependencias
```bash
pip install -r requirements.txt
```

**Dependencias instaladas:**
- Flask 3.0.0
- Flask-CORS 4.0.0
- Flask-SQLAlchemy 3.1.1
- Python-dateutil 2.8.2
- Werkzeug 3.0.1

### Paso 2: Configurar Frontend

#### 2.1 Navegar a la carpeta frontend
```bash
cd frontend
```

#### 2.2 Instalar dependencias
```bash
npm install
```

**Dependencias principales:**
- React 18.2.0
- Vite 5.0.0
- Tailwind CSS 3.4.0
- React Router DOM 6.20.0
- Axios 1.6.2

---

## ▶️ Ejecución

### Terminal 1: Backend Flask

```bash
cd backend
# Si tienes venv activo:
python app.py
```

**Esperado:**
```
🚀 VTB API iniciada en http://localhost:5000
📊 Base de datos: SQLite
⛓️  Blockchain: Simulada (educativa)
🔐 CORS habilitado para React
```

### Terminal 2: Frontend React

```bash
cd frontend
npm run dev
```

**Esperado:**
```
VITE v5.0.0  ready in xxx ms

➜  Local:   http://localhost:3000/
➜  press h to show help
```

### Terminal 3 (Opcional): Para monitorear logs

```bash
# Puedes abrir una tercera terminal para ejecutar comandos
# como consultarla base de datos o hacer peticiones HTTP
```

### Acceder a la Aplicación

- **Landing Page**: http://localhost:3000
- **Backend API**: http://localhost:5000/api

---

## 🔐 Credenciales de Prueba

### Usuario Votante
- **Email**: `alumno@ufv.es`
- **Contraseña**: `alumno123`
- **Rol**: Votante (acceso a Dashboard y votación)

### Usuario Admin
- **Email**: `admin@ufv.es`
- **Contraseña**: `admin123`
- **Rol**: Administrador (acceso a Panel de Administración)

### Elecciones Disponibles (Seed Data)

#### Elección 1: Delegado 3º Ingeniería Informática
- **Estado**: ✅ ACTIVA (puedes votar)
- **Candidatos**:
  - Alice García
  - Bob López
  - Carol Martínez

#### Elección 2: Presupuestos 2025 - Aprobación
- **Estado**: ❌ CERRADA (resultados disponibles)
- **Candidatos**:
  - Opción A: Invertir en becas
  - Opción B: Invertir en infraestructura

---

## ✨ Características Principales

### 1️⃣ Flujo de Autenticación (Web2)

```
Usuario escribe email + contraseña
            ↓
Backend valida contra SQLite
            ↓
Si es correcto → Usuario autenticado
Si es incorrecto → Error 401
```

Archivo responsable: `backend/app.py` ruta `/api/login`

### 2️⃣ Flujo de Votación (Web2 ↔ Web3)

```
1. Usuario autenticado accede a Dashboard
2. Ve elecciones activas → Click "Votar"
3. Modal pregunta por candidato
4. Backend genera UUID anónimo (simula ZK-Proof)
5. Voto se envía a blockchain sin identidad del usuario
6. Hash SHA-256 del voto = "Recibo de Voto"
7. Usuario guarda hash para auditoría
```

Archivos responsables:
- Frontend: `src/components/VoteModal.jsx`, `src/pages/Dashboard.jsx`
- Backend: `backend/app.py` ruta `/api/vote`, `backend/blockchain.py`

### 3️⃣ Blockchain Simulada

#### Estructura de Bloque
```python
Block {
    index: int              # Número secuencial
    timestamp: str          # ISO 8601
    votes: List[Dict]       # Votos anónimos
    previous_hash: str      # Encadenamiento
    nonce: int             # Proof-of-Work
    hash: str              # SHA-256 del bloque
}
```

#### Proceso de Minería
1. Recopila 10 votos pendientes
2. Calcula inicial SHA-256
3. Incrementa `nonce` hasta que hash comienza con "00"
4. Añade bloque a la cadena
5. Limpia votos pendientes

Archivo responsable: `backend/blockchain.py`

### 4️⃣ Lectura de Resultados (desde Blockchain)

```
Usuario solicita resultados de elección
            ↓
Backend itera bloques de blockchain
            ↓
Cuenta votos por candidato (anónimos)
            ↓
Devuelve resultados como JSON
```

**Nota importante**: Los resultados se leen de la blockchain, NO de SQL. Esto garantiza anonimato total.

### 5️⃣ Panel de Administración

Estadísticas en tiempo real:
- Total de usuarios registrados
- Total de elecciones
- Total de votos registrados
- Número de bloques en la blockchain
- Validez de la cadena (integridad)

Visualización de blockchain:
- Lista completa de bloques
- Hash de cada bloque
- Amount de transacciones por bloque
- Nonce utilizado

Archivo responsable: `src/pages/AdminPanel.jsx`

---

## 📁 Estructura de Carpetas

```
VTB_DEMO/
├── backend/
│   ├── app.py                 # Aplicación Flask Principal
│   ├── models.py              # Modelos SQLAlchemy (User, Election, Vote)
│   ├── blockchain.py          # Clase Blockchain con Block
│   ├── requirements.txt        # Dependencias Python
│   ├── __pycache__/           # Cache Python (generado)
│   └── instance/              # Base de datos SQLite (generada)
│       └── vtb_demo.db        # Base de datos
│
└── frontend/
    ├── src/
    │   ├── App.jsx            # Componente raíz + Rutas
    │   ├── main.jsx           # Punto de entrada
    │   ├── index.css          # Estilos globales (Tailwind)
    │   │
    │   ├── context/
    │   │   └── AuthContext.jsx    # Global state: autenticación
    │   │
    │   ├── components/
    │   │   ├── Navbar.jsx         # Barra de navegación
    │   │   ├── ElectionCard.jsx   # Tarjeta de elección
    │   │   ├── VoteModal.jsx      # Modal de votación
    │   │   └── Spinner.jsx        # Spinner de carga
    │   │
    │   └── pages/
    │       ├── Landing.jsx        # Página de inicio
    │       ├── Login.jsx          # Página de autenticación
    │       ├── Dashboard.jsx      # Panel principal de votante
    │       ├── Results.jsx        # Página de resultados
    │       ├── VotingBooth.jsx    # Cabina de votación (legacy)
    │       └── AdminPanel.jsx     # Panel de administración
    │
    ├── public/                 # Archivos estáticos
    ├── index.html             # HTML principal
    ├── package.json           # Dependencias npm
    ├── vite.config.js         # Config Vite
    ├── tailwind.config.js     # Config Tailwind
    └── postcss.config.js      # Config PostCSS
```

---

## 🛠️ Tecnologías Utilizadas

### Backend
- **Framework**: Flask 3.0.0 (Python Web Framework)
- **ORM**: SQLAlchemy 3.1.1 (Object-Relational Mapping)
- **Base de Datos**: SQLite (Base de datos embebida)
- **Autenticación**: Validación simple (en producción: JWT)
- **CORS**: Flask-CORS (para comunicación Frontend-Backend)

### Frontend
- **Framework**: React 18.2.0
- **Build Tool**: Vite 5.0.0 (bundler rápido)
- **Routing**: React Router DOM 6.20.0
- **Styling**: Tailwind CSS 3.4.0 (Utility-first CSS)
- **Cliente HTTP**: Axios 1.6.2
- **Node**: Node.js 16+ con npm

### Blockchain (Simulación)
- **Algoritmo**: SHA-256 (Python hashlib)
- **Proof-of-Work**: Nonce + búsqueda de hash con X ceros iniciales
- **Validación**: Recorrido lineal de cadena

### Extras Educativos
- Documentación en docstrings (PEP-257)
- Comentarios explicativos en código
- Dark mode profesional (Tailwind CSS)
- Emojis para mejor UX

---

## 📚 Documentación Técnica

### Flujo de Registro de Voto (Detallado)

```sequence
USUARIO                FRONTEND            BACKEND            BLOCKCHAIN
   │                      │                    │                   │
   ├─ Click Votar ────────►│                    │                   │
   │                      │                    │                   │
   │◄─ Show VoteModal ────┤                    │                   │
   │                      │                    │                   │
   ├─ Select Candidato ──►│                    │                   │
   │                      │                    │                   │
   ├─ Confirmar ─────────►│                    │                   │
   │                      │ POST /api/vote ───►│                   │
   │                      │ election_id        │ 1. Generar UUID   │
   │                      │ candidate          │ 2. Validar censo  │
   │                      │ user_id            │ 3. Añadir voto    │
   │                      │                    │ 4. Calcular Hash  │
   │                      │                    ├──► add_vote() ───►│
   │                      │                    │                   │
   │                      │                    │ 5. Si 10 votos    │
   │                      │                    │    mine_block()   │
   │                      │◄─ tx_hash + receipt ┤                   │
   │◄─ Show Receipt ──────┤                    │                   │
   │                      │                    │                   │
   ├─ Guardar Hash ──────►│ (localStorage)     │                   │
   │                      │                    │                   │
```

### Validación de Blockchain

La funciónes `is_chain_valid()` valida:
1. **Integridad de Hashes**: Cada bloque recalcula su hash y lo compara
2. **Encadenamiento**: Verificar que `previous_hash` del bloque N = `hash` del bloque N-1
3. **Linealidad**: No puede haber bloques duplicados o faltantes

Si alguna validación falla → blockchain está comprometida

### Endpoints API

#### Autenticación
- **POST** `/api/login`
  - Body: `{email, password}`
  - Response: `{success, user: {id, email, role}}`

#### Elecciones
- **GET** `/api/elections`
  - Response: Array of elections
- **GET** `/api/elections/<id>`
  - Response: Election object

#### Votación
- **POST** `/api/vote`
  - Body: `{election_id, candidate, user_id}`
  - Response: `{success, tx_hash, receipt: {timestamp, anonymous_credential}}`

#### Resultados
- **GET** `/api/results/<election_id>`
  - Response: `{election_id, title, results: {total_votes, candidates}, blockchain_valid}`

#### Blockchain
- **GET** `/api/chain`
  - Response: `{length, is_valid, difficulty, pending_votes, blocks[]}`
- **GET** `/api/chain/validate`
  - Response: `{is_valid, message}`

#### Admin
- **GET** `/api/admin/stats`
  - Response: `{total_users, total_elections, total_votes_registered, blockchain_blocks, blockchain_pending_votes, blockchain_valid}`

---

## 🔍 Ejemplos de Uso

### Ejemplo 1: Votación Básica

```bash
# 1. Usuario accede a http://localhost:3000

# 2. Completa login
curl -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email": "alumno@ufv.es", "password": "alumno123"}'

# Response:
# {
#   "success": true,
#   "user": {
#     "id": 2,
#     "email": "alumno@ufv.es",
#     "role": "votante"
#   }
# }

# 3. Ve elecciones
curl http://localhost:5000/api/elections

# 4. Vota en elección 1
curl -X POST http://localhost:5000/api/vote \
  -H "Content-Type: application/json" \
  -d '{
    "election_id": 1,
    "candidate": "Alice García",
    "user_id": 2
  }'

# Response incluye hash para auditoría
```

### Ejemplo 2: Admin Verifica Integridad

```bash
# Admin accede a panel
# http://localhost:3000/admin

# Backend valida blockchain
curl http://localhost:5000/api/chain/validate

# Response:
# {
#   "is_valid": true,
#   "message": "La blockchain es íntegra"
# }
```

### Ejemplo 3: Ver Resultados

```bash
curl http://localhost:5000/api/results/1

# Response:
# {
#   "election_id": 1,
#   "title": "Delegado 3º Ingeniería",
#   "results": {
#     "total_votes": 5,
#     "candidates": {
#       "Alice García": 2,
#       "Bob López": 2,
#       "Carol Martínez": 1
#     },
#     "blockchain_valid": true
#   },
#   "can_view": false
# }
```

---

## 🎓 Aspectos Destacables para la Defensa

1. **Separación Web2/Web3**: SQL gestiona identidades, Blockchain gestiona votos
2. **Anonimato garantizado**: Usuario nunca se vincula a su voto
3. **Inmutabilidad**: Cambiar un voto invalida toda la cadena
4. **Auditoría transparente**: Cualquiera puede verificar integridad
5. **UI/UX profesionista**: Dark mode, responsive, accesible
6. **Código documentado**: Docstrings y comentarios educativos
7. **Escalable**: Fácil añadir nuevas elecciones o usuarios

---

## 📝 Notas Importantes

### Límites de la Demo

⚠️ **Esta es una DEMOSTRACIÓN educativa**, NO un sistema de producción:
- Blockchain es en memoria (no persistente)
- Sin encriptación real de votos
- Contraseñas en texto plano (usar bcrypt en producción)
- Sin JWT tokens
- Sin rate limiting
- Sin logs de auditoría en BD

### Mejoras para Producción

- [ ] Migrar a Postgres + Redis
- [ ] Implementar JWT + Refresh Tokens
- [ ] Encriptar contraseñas con bcrypt
- [ ] Agregar logging persistente
- [ ] Blockchain en BD (no memoria)
- [ ] Implementar ZK-Proofs reales
- [ ] Usar Polygon para blockchain real
- [ ] Validación de email
- [ ] Rate limiting y DDOS protection
- [ ] Tests unitarios (pytest, Jest)
- [ ] CI/CD (GitHub Actions)

---

## 👨‍💻 Autor

**Tu Nombre**  
Proyecto de Fin de Grado  
Ingeniería Informática - UFV  
Febrero 2026

---

## 📄 Licencia

Este proyecto es de código abierto con fines educativos.

---

## ❓ Preguntas Frecuentes (FAQ)

**¿Dónde se guardan los datos?**
- SQLite: `backend/instance/vtb_demo.db`
- Blockchain: Memoria RAM durante ejecución

**¿Qué pasa si reinicio el backend?**
- La base de datos persiste (SQLite)
- La blockchain se reinicia (es en memoria)

**¿Cómo cambiar el número de votos por bloque?**
- Editar en `backend/blockchain.py` línea `self.block_size = 10`

**¿Puedo votar más de una vez?**
- No, el sistema valida duplicados por (user_id, election_id)

**¿Cómo auditar resultados?**
- Acceder a `/api/chain` y verificar hashes manualmente

---

## 📞 Soporte

Para preguntas sobre el código:
1. Revisar docstrings en los archivos
2. Ejecutar con `debug=True`
3. Revisar console del navegador (F12)
4. Revisar terminal de Flask

---

**¡Buena suerte en la defensa!** 🚀♦️

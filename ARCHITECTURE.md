# VTB - Diagrama de Arquitectura

## 1. Diagrama de Capas

```
┌─────────────────────────────────────────────────────────────┐
│                        UI/UX Layer                          │
│                    (React + Tailwind CSS)                   │
├─────────────────────────────────────────────────────────────┤
│  Landing │ Login │ Dashboard │ VoteModal │ Results │ Admin  │
└────────────┬──────────────────────────────────────────────┬─┘
             │ HTTP Requests (JSON API)                    │
             ▼                                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     API Layer (Flask)                       │
├─────────────────────────────────────────────────────────────┤
│ /login    │ /elections    │ /vote    │ /results │ /chain   │
└────────────┬──────────────┬─────────────────────────────────┘
             │              │
    ┌────────▼────────┐   ┌─▼──────────────┐
    │   SQL Layer     │   │  Blockchain    │
    │    (SQLite)     │   │   (In-Memory)  │
    ├─────────────────┤   ├────────────────┤
    │ users           │   │ blocks[]       │
    │ elections       │   │ pending_votes[]│
    │ votes_audit     │   │ chain status   │
    └─────────────────┘   └────────────────┘
```

---

## 2. Flujo de Votación Detallado

```
USUARIO ABRE NAVEGADOR
        ↓
    [LANDING PAGE]
   (Explica VTB)
        ↓
   [LOGIN PAGE]
user: alumno@ufv.es
pass: alumno123
        ↓
Frontend: POST /api/login
Backend: User.query.filter(email=...)
        ↓
    [DASHBOARD]
   GET /api/elections
   Muestra tarjetas
        ↓
   Usuario selecciona votación
        ↓
    [VOTE MODAL]
   Selecciona candidato
        ↓
Frontend: Genera UUID anónimo
        ↓
Frontend: POST /api/vote
   {
     election_id: 1,
     candidate: "Alice García",
     user_id: 2
   }
        ↓
Backend: app.py → vote()
   1. Valida elección activa
   2. Verifica no hay duplicado
   3. Genera UUID anónimo
   4. Añade a blockchain
        ↓
        [BLOCKCHAIN]
   add_vote(
     election_id: 1,
     candidate: "Alice García",
     anonymous_id: "a7c3f9d0"
   )
        ↓
   blockchain.py:
   1. Crea voto_data dict
   2. Calcula SHA-256 tx_hash
   3. Añade a pending_votes[]
   4. Si pending_votes >= 10:
        mine_block():
          - Crea nuevo bloque
          - Proof-of-Work (nonce)
          - Encadena con bloque anterior
          - Añade a chain[]
        ↓
Backend: Devuelve response
   {
     success: true,
     tx_hash: "a3c5e7d1...",
     receipt: {
       timestamp: "...",
       anonymous_credential: "a7c3f9d0"
     }
   }
        ↓
Frontend: Guarda en localStorage
        ↓
    [RECIBO MODAL]
   Muestra Hash (auditoría)
   Expl: "Guarda para auditar"
        ↓
   Usuario cierra modal
        ↓
    [DASHBOARD ACTUALIZADO]
   Contador de votos +1
```

---

## 3. Estructura de Base de Datos (SQL)

### Tabla: users

```
┌─────────┬──────────────┬──────────┬─────────┬──────────────┐
│ id (PK) │ email (UNIQUE)│ password │  role   │  created_at  │
├─────────┼──────────────┼──────────┼─────────┼──────────────┤
│ 1       │ admin@ufv.es │ admin123 │ admin   │ 2025-02-13   │
│ 2       │alumno@ufv.es │ alumno123│ votante │ 2025-02-13   │
└─────────┴──────────────┴──────────┴─────────┴──────────────┘
```

### Tabla: elections

```
┌─────────┬─────────────────────────┬──────────┬────────────────────┐
│ id (PK) │ title                   │is_active │ candidates (JSON)  │
├─────────┼─────────────────────────┼──────────┼────────────────────┤
│ 1       │ Delegado 3º Ingeniería  │ true     │ [{...}, {...},...] │
│ 2       │ Presupuestos 2025       │ false    │ [{...}, {...}]     │
└─────────┴─────────────────────────┴──────────┴────────────────────┘
```

### Tabla: votes

```
┌─────────┬─────────┬─────────────┬──────────────────────────────┐
│ id (PK) │ user_id │ election_id │blockchain_tx_hash            │
├─────────┼─────────┼─────────────┼──────────────────────────────┤
│ 1       │ 2 (FK)  │ 1 (FK)      │ a3c5e7d1f9b2c4e6a8d0f1c3... │
└─────────┴─────────┴─────────────┴──────────────────────────────┘
```

---

## 4. Estructura de Blockchain (En-Memoria)

### Block 0 (Génesis)

```json
{
  "index": 0,
  "timestamp": "2025-02-13T10:15:20.123456",
  "votes": [],
  "previous_hash": "0",
  "nonce": 45,
  "hash": "00a3c7e9f1b5d2c8e4a6f0g2i4k6m8o0"
}
```

### Block 1

```json
{
  "index": 1,
  "timestamp": "2025-02-13T10:30:45.654321",
  "votes": [
    {
      "election_id": 1,
      "candidate": "Alice García",
      "anonymous_id": "a7c3f9d0",
      "timestamp": "2025-02-13T10:18:30"
    },
    {
      "election_id": 1,
      "candidate": "Bob López",
      "anonymous_id": "b8d4g0e2",
      "timestamp": "2025-02-13T10:19:15"
    },
    ...
  ],
  "previous_hash": "00a3c7e9f1b5d2c8e4a6f0g2i4k6m8o0",
  "nonce": 127,
  "hash": "00f2d4c6e8a0g2i4k6m8o0q2s4u6w8y0"
}
```

---

## 5. Relaciones de Datos

```
                    ┌─────────┐
                    │ Users   │
                    └────┬────┘
                         │
              ┌──────────┴──────────┐
              │                     │
         ┌────▼────┐           ┌───▼───┐
         │ Votes   │           │ Admin │
         │ (censo) │           │ Panel │
         └────┬────┘           └───────┘
              │
    ┌─────────┴─────────┐
    │                   │
┌───▼────┐         ┌───▼────┐
│Elections│   ┌─────►Blockchain│
└────────┘   │     │          │
             │     └──────────┘
    ┌────────┴──────────┐
    │                   │
┌───▼───────┐      ┌───▼───────┐
│ Sql (DB)  │      │ Web3      │
│Autent+    │      │ Votos     │
│Censo      │      │ Anónimos  │
└───────────┘      └───────────┘
```

---

## 6. Componentes React (Árbol de Componentes)

```
App.jsx
├── AuthProvider
│   └── AppContent
│       └── Routes
│           ├── /landing ────── Landing.jsx
│           ├── /login ──────── Login.jsx
│           ├── /dashboard ─── Navbar
│           │                  Dashboard.jsx
│           │                  ├── ElectionCard (x2)
│           │                  │   ├── Spinner
│           │                  │   └── VoteModal
│           │                  │       └── Spinner
│           │                  └── VoteModal
│           ├── /results/:id ─ Navbar
│           │                  Results.jsx
│           │                  └── Spinner
│           └── /admin ──────── Navbar
│                              AdminPanel.jsx
│                              ├── Spinner
│                              └── Chart (conceptual)
└── CSS (Tailwind + index.css)

Global State:
└── AuthContext
    ├── user
    ├── login()
    ├── logout()
    └── hasRole()
```

---

## 7. Flujo de Datos (Data Flow)

### Autenticación

```
User Input Email/Password
        ↓
React: POST /api/login
        ↓
Flask Backend
  ├─ Query: User.query.filter_by(email=...)
  ├─ Validate password match
  └─ Return user data
        ↓
Frontend: AuthContext.setUser()
        ↓
localStorage.setItem('user', JSON.stringify(data))
        ↓
Redirect a /dashboard
```

### Votación

```
User selects candidate
        ↓
Frontend: generate UUID
        ↓
Frontend: POST /api/vote
        ↓
Backend: blockchain.add_vote()
        ├─ Create vote_data
        ├─ Calculate SHA-256
        ├─ Add to pending_votes[]
        └─ If pending_votes >= 10:
            mine_block()
            ├─ Create Block
            ├─ Calculate nonce (PoW)
            ├─ Chain to previous
            └─ Add to chain[]
        ↓
Backend: DB INSERT Vote (audit only)
        ↓
Return: tx_hash + receipt
        ↓
Frontend: Show receipt modal
```

### Lectura de Resultados

```
User clicks "Ver Resultados"
        ↓
Frontend: GET /api/results/election_id
        ↓
Backend: blockchain.get_election_results(id)
        ├─ Loop blockchain.chain[]
        │   └─ Count votes per candidate
        └─ Return results
        ↓
Frontend: Render bar chart
```

---

## 8. Procesos Criptográficos Simulados

### SHA-256 (Hashing)

```python
vote_data = {
    'election_id': 1,
    'candidate': 'Alice García',
    'anonymous_id': 'a7c3f9d0',
    'timestamp': '2025-02-13T10:18:30'
}

# Serializar
json_string = json.dumps(vote_data, sort_keys=True)

# Hash SHA-256
tx_hash = hashlib.sha256(json_string.encode()).hexdigest()

# Resultado: a3c5e7d1f9b2c4e6a8d0f1c3e5g7i9k1m3n5
```

### Proof-of-Work

```python
target = "00"  # difficulty = 2

while not block.hash.startswith(target):
    block.nonce += 1
    block.hash = recalculate_hash()

# Cuando hash comienza con "00", bloque es válido
```

---

## 9. Validación de Integridad

```
is_chain_valid():
    FOR cada bloque en chain[1:]:
        ├─ Recalcular hash
        ├─ ¿Coincide con hash guardado?
        │   └─ NO → return False (manipulado)
        │
        └─ ¿previous_hash == hash del anterior?
            └─ NO → return False (roto)
    
    return True (íntegro)
```

---

## 10. Arquitectura de Carpetas

```
VTB_DEMO/
│
├── backend/
│   ├── app.py              # 200+ líneas
│   │   ├── /login
│   │   ├── /elections
│   │   ├── /vote
│   │   ├── /results
│   │   ├── /chain
│   │   ├── /admin/stats
│   │   └── /init
│   │
│   ├── models.py           # 100+ líneas
│   │   ├── User
│   │   ├── Election
│   │   └── Vote
│   │
│   ├── blockchain.py       # 250+ líneas
│   │   ├── class Block
│   │   │   ├── calculate_hash()
│   │   │   ├── proof_of_work()
│   │   │   └── to_dict()
│   │   │
│   │   └── class Blockchain
│   │       ├── add_vote()
│   │       ├── mine_block()
│   │       ├── is_chain_valid()
│   │       └── get_election_results()
│   │
│   ├── requirements.txt
│   ├── instance/           # Base de datos
│   │   └── vtb_demo.db
│   └── __pycache__/
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx         # Rutas principales
│   │   ├── main.jsx        # Punto de entrada
│   │   ├── index.css       # Estilos globales
│   │   │
│   │   ├── context/
│   │   │   └── AuthContext.jsx   # Global state
│   │   │
│   │   ├── components/     # Componentes reutilizables
│   │   │   ├── Navbar.jsx
│   │   │   ├── ElectionCard.jsx
│   │   │   ├── VoteModal.jsx
│   │   │   └── Spinner.jsx
│   │   │
│   │   └── pages/          # Full pages
│   │       ├── Landing.jsx
│   │       ├── Login.jsx
│   │       ├── Dashboard.jsx
│   │       ├── Results.jsx
│   │       ├── VotingBooth.jsx
│   │       └── AdminPanel.jsx
│   │
│   ├── public/             # Assets estáticos
│   ├── index.html          # HTML principal
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── postcss.config.js
│
├── README.md               # Documentación completa
├── QUICK_START.md          # Guía rápida
├── API_DOCUMENTATION.md    # Endpoints
├── ARCHITECTURE.md         # Este archivo
└── start.sh               # Script de inicio
```

---

## 11. Stack Tecnológico Resumido

```
FRONTEND
├─ React 18.2.0 (framework UI)
├─ Vite 5.0.0 (bundler)
├─ Tailwind CSS 3.4.0 (styling)
├─ React Router 6.20 (routing)
└─ Axios 1.6.2 (HTTP client)

BACKEND
├─ Flask 3.0.0 (HTTP framework)
├─ SQLAlchemy 3.1.1 (ORM)
├─ Flask-CORS 4.0.0 (CORS)
└─ Python 3.8+ (language)

DATABASE
├─ SQLite (users, elections, votes audit)
└─ In-Memory (blockchain)

BLOCKCHAIN (SIM)
├─ SHA-256 (hashing)
├─ Proof-of-Work (validation)
└─ JSON (serialization)
```

---

## 12. Flujo de Ejecución en Defensa

```
Defensa Profesor
        ↓
Abres página landing
        ↓
Explicas: "Web2 + Web3"
        ↓
Click "Ir a Votar"
        ↓
Login (alumno@ufv.es)
        ↓
Dashboard: Muestras elecciones
        ↓
Click Votar → VoteModal
        ↓
Selecciona candidato
        ↓
Muestra loading (simulación criptografía)
        ↓
Recibo con Hash
        ↓
"Este hash prueba que tu voto fue contado"
        ↓
Ver Resultados
        ↓
Logout → Login Admin
        ↓
Admin Panel: Estadísticas
        ↓
Admin Panel: Blockchain
        ↓
"La blockchain es íntegra ✓"
        ↓
Preguntas & Discusión
        ↓
FIN - Felicidades!
```

---

Fin de documentación de arquitectura.

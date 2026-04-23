# VTB API Documentation

Base URL (desarrollo): `http://localhost:3001`

> Todos los endpoints de datos usan el prefijo `/api/` o `/auth/` o `/admin/` o `/registration/`.
> Los endpoints marcados con 🔒 requieren `Authorization: Bearer <JWT>`.

---

## Autenticación

### POST `/auth/login`
Valida credenciales y devuelve un JWT de 24 horas.

**Request:**
```json
{ "email": "carlos@ufv.es", "password": "demo123" }
```

**Response 200:**
```json
{
  "token": "<JWT>",
  "user": {
    "id": 3,
    "email": "carlos@ufv.es",
    "name": "Carlos López Fernández",
    "role": "student",
    "adminDomain": null
  }
}
```

**Errores:**
| Código | Descripción |
|--------|-------------|
| 401 | Credenciales incorrectas |
| 403 | `ACCOUNT_PENDING_APPROVAL` — cuenta no aprobada aún |
| 429 | Rate limit (5 intentos en 15 min en producción) |

---

### POST `/auth/register`
Crea un usuario directamente (pendiente de aprobación manual).

**Request:**
```json
{
  "email": "nuevo@ufv.es",
  "password": "mipassword",
  "name": "Nombre Completo",
  "student_id": "UFV-2024-099"
}
```

**Response 201:**
```json
{ "message": "Usuario registrado. Pendiente de aprobación." }
```

---

### GET `/auth/verify` 🔒
Verifica que el JWT sigue siendo válido.

**Response 200:**
```json
{
  "valid": true,
  "user": { "id": 3, "email": "...", "role": "student" }
}
```

---

## Organizaciones (Multi-Tenant Portal)

### GET `/api/organizations/:domain`
**Público.** Devuelve la información de marca de una institución para renderizar el portal institucional.

**Parámetro URL:** `domain` — p. ej. `ufv.es`, `highland.edu`, `vtb.system`

**Response 200:**
```json
{
  "name": "Universidad Francisco de Vitoria",
  "logo_url": "/logos/ufv.png",
  "primary_color": "#004b87"
}
```

**Response 404:**
```json
{ "error": "Institution not found" }
```

**Uso:** El frontend lo llama al montar `/portal/:domain` para obtener el branding antes de mostrar el formulario de login.

---

## Elecciones

### GET `/api/elections` 🔒
Lista las elecciones asignadas al usuario autenticado (vía `election_voters`).

**Response 200:**
```json
[
  {
    "id": 1,
    "election_id_blockchain": 1,
    "name": "Delegado UFV 2026-2027",
    "description": "...",
    "start_time": 1713000000,
    "end_time": 1718000000,
    "is_active": 1,
    "voter_role": "student",
    "candidates": [
      { "id": 1, "name": "Ana Beltrán", "description": "..." },
      { "id": 2, "name": "Pablo Méndez", "description": "..." }
    ],
    "has_voted": false
  }
]
```

---

### GET `/api/elections/:id` 🔒
Detalle de una elección con candidatos.

**Response 200:** mismo esquema que el elemento de la lista anterior.

**Response 404:** `{ "error": "Election not found" }`

---

### GET `/api/elections/:id/eligibility` 🔒
Comprueba si el usuario puede votar en la elección dada.

**Response 200:**
```json
{
  "eligible": true,
  "reason": null,
  "election": { "id": 1, "name": "...", "is_active": 1 }
}
```

Si no es elegible:
```json
{
  "eligible": false,
  "reason": "You have already voted in this election"
}
```

Posibles razones: `Election not found`, `Election is not active`, `You are not in the voter census`, `You have already voted in this election`.

---

### GET `/api/elections/:id/results` 🔒
Resultados y participación de la elección.

**Response 200:**
```json
{
  "election": { "id": 1, "name": "...", "is_active": 1 },
  "candidates": [
    { "id": 1, "name": "Ana Beltrán", "votes": 12, "percentage": 48.0 },
    { "id": 2, "name": "Pablo Méndez", "votes": 8, "percentage": 32.0 }
  ],
  "total_votes": 25,
  "total_eligible": 40,
  "participation_rate": 62.5
}
```

---

### POST `/api/elections/register-vote` 🔒
Registra el voto del usuario en la blockchain (Ethereum Sepolia).

**Request:**
```json
{
  "electionId": 1,
  "candidateId": 2,
  "voteHash": "0xabc123..."
}
```

**Response 200:**
```json
{
  "success": true,
  "txHash": "0xdeadbeef...",
  "blockNumber": 12345678,
  "nullifierHash": "0xfeed..."
}
```

**Errores comunes:**
| Error | Descripción |
|-------|-------------|
| `You have already voted` | Nullifier duplicado en el contrato |
| `Election is not active` | Fuera de ventana temporal |
| `You are not in the voter census` | No está en `election_voters` |
| `insufficient funds` | Wallet relayer sin Sepolia ETH |
| `ERR: election does not exist` | `election_id_blockchain` no existe on-chain |

---

### GET `/api/elections/:id/audit`
**Público.** Devuelve los registros de auditoría de nullifiers para una elección (sin revelar identidades).

---

### GET `/api/elections/blockchain-sync-status` 🔒
Estado del mapeo entre SQLite y el contrato on-chain.

**Response 200:**
```json
{
  "elections": [
    {
      "local_id": 1,
      "blockchain_id": 1,
      "name": "Delegado UFV 2026-2027",
      "synced": true
    }
  ]
}
```

---

### GET `/api/org-units`
**Público.** Lista las unidades organizativas. Acepta `?domain=ufv.es` para filtrar por institución.

---

## Solicitudes de Registro

### POST `/registration/request`
**Público.** Envía una solicitud de acceso (sin cuenta previa).

**Request:**
```json
{
  "full_name": "Nuevo Estudiante",
  "email": "nuevo@ufv.es",
  "student_id": "UFV-2025-099",
  "password": "mipassword"
}
```

**Response 201:** `{ "message": "Solicitud recibida. Un admin la revisará pronto." }`

Si el email está en `email_whitelist`, la cuenta se aprueba automáticamente al instante.

---

## Panel Admin (requiere rol `admin` o `superadmin`) 🔒

Todos los endpoints de admin requieren JWT con `role: admin` o `role: superadmin`. Los admins de dominio solo ven y modifican recursos de su `admin_domain`.

### Dashboard y Estado

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/admin/dashboard` | KPIs: usuarios, solicitudes, elecciones, votos |
| GET | `/admin/blockchain-status` | Estado del nodo RPC y contrato |

### Usuarios

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/admin/users` | Listar todos los usuarios del dominio |
| POST | `/admin/users` | Crear usuario aprobado directamente |
| PATCH | `/admin/users/:id` | Modificar usuario (aprobar, cambiar rol, etc.) |
| POST | `/admin/users/import` | Importar usuarios desde CSV |
| GET | `/admin/email-whitelist` | Ver whitelist de emails |
| POST | `/admin/email-whitelist` | Añadir emails a whitelist |

### Elecciones

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/admin/elections` | Listar elecciones administrables |
| POST | `/admin/elections` | Crear elección (SQLite + best-effort on-chain) |
| PUT | `/admin/elections/:id` | Editar elección |
| POST | `/admin/elections/:id/domains` | Añadir dominio permitido |
| DELETE | `/admin/elections/:id/domains/:domain` | Quitar dominio |
| POST | `/admin/elections/:id/voters` | Añadir votante concreto |
| DELETE | `/admin/elections/:id/voters/:userId` | Quitar votante |
| POST | `/admin/elections/:id/candidates` | Añadir candidato |
| DELETE | `/admin/elections/:id/candidates/:candidateId` | Quitar candidato |
| GET | `/admin/elections/:id/stats` | Estadísticas detalladas de participación |
| PATCH | `/api/elections/fix-blockchain-ids` | Corregir mapeo SQLite/on-chain |

### Solicitudes de Registro

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/admin/registration-requests` | Listar solicitudes (pending/approved/rejected) |
| PATCH | `/admin/registration-requests/:id` | Aprobar o rechazar solicitud |

### Estadísticas

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/admin/stats/voters` | Estadísticas globales de votantes |
| GET | `/admin/org-units` | Listar/gestionar unidades organizativas |

---

## Sistema

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/health` | Health check simple |
| GET | `/api/health` | Health check con uptime |
| GET | `/api/org-units` | Unidades organizativas (público) |
| GET | `/api/organizations/:domain` | Branding institucional (público) |

---

## Códigos de Estado

| Código | Significado |
|--------|-------------|
| 200 | OK |
| 201 | Creado |
| 400 | Petición malformada |
| 401 | No autenticado (JWT inválido o ausente) |
| 403 | Sin permisos o cuenta pendiente |
| 404 | Recurso no encontrado |
| 429 | Rate limit superado |
| 500 | Error interno del servidor |

---

## Ejemplos cURL

### Login y guardar token
```bash
TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"carlos@ufv.es","password":"demo123"}' \
  | jq -r .token)
```

### Obtener elecciones asignadas
```bash
curl http://localhost:3001/api/elections \
  -H "Authorization: Bearer $TOKEN"
```

### Consultar branding de portal institucional
```bash
curl http://localhost:3001/api/organizations/ufv.es
curl http://localhost:3001/api/organizations/highland.edu
curl http://localhost:3001/api/organizations/vtb.system
```

### Estado de sincronización blockchain
```bash
curl http://localhost:3001/api/elections/blockchain-sync-status \
  -H "Authorization: Bearer $TOKEN"
```

### Aprobar solicitud de registro (admin)
```bash
curl -X PATCH http://localhost:3001/admin/registration-requests/5 \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"approved"}'
```

---

## Seguridad

- JWT firmado con `JWT_SECRET` (HS256), expira en 24h.
- Passwords hasheadas con bcrypt (12 rounds).
- Nullifiers generados con `HMAC-SHA256(userId, electionId, NULLIFIER_SECRET)` — nunca almacenados en claro.
- Rate limiting en `/auth/login`: 5 intentos / 15 min en producción.
- CORS configurable vía `CORS_ORIGINS`.
- `PRIVATE_KEY` del relayer nunca expuesto al frontend.

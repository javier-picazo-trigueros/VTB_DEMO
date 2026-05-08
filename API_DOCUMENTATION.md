# VTB - API Documentation

Base local:

```text
http://localhost:3001
```

La API se organiza en:

- `/auth` para autenticacion y perfil.
- `/api` para elecciones, resultados, auditoria publica y datos publicos.
- `/admin` para panel de administracion.
- `/registration` para solicitudes de acceso.

Los endpoints privados requieren:

```http
Authorization: Bearer <JWT>
```

## Health

### GET `/health`

Comprueba que el backend esta vivo.

Response:

```json
{
  "status": "OK",
  "service": "VTB Backend",
  "timestamp": "2026-05-08T00:00:00.000Z",
  "uptime": 123
}
```

### GET `/api/health`

Alias con la misma funcion.

## Autenticacion

### POST `/auth/login`

Valida email y password. Devuelve JWT y datos basicos del usuario.

Request:

```json
{
  "email": "student@vtb.demo",
  "password": "demo123"
}
```

Response:

```json
{
  "success": true,
  "token": "<JWT>",
  "user": {
    "id": 1,
    "email": "student@vtb.demo",
    "name": "Demo Student VTB",
    "student_id": "VTB-DEMO-001",
    "role": "student",
    "adminDomain": null
  }
}
```

Errores habituales:

| Codigo | Motivo |
| --- | --- |
| 400 | Faltan email o password |
| 401 | Credenciales incorrectas |
| 403 | Cuenta pendiente de aprobacion |
| 429 | Demasiados intentos |

### GET `/auth/me`

Devuelve el usuario actual a partir del JWT. Se usa para persistir sesion.

### GET `/auth/verify`

Verifica si el token sigue siendo valido.

### PATCH `/auth/change-password`

Cambia password del usuario autenticado.

Request:

```json
{
  "currentPassword": "demo123",
  "newPassword": "newpass123"
}
```

### GET `/auth/me/profile`

Devuelve perfil completo del usuario autenticado.

### PATCH `/auth/me/profile`

Actualiza campos editables del perfil.

## Solicitudes de Registro

### POST `/registration/request`

Crea una solicitud de acceso.

Request:

```json
{
  "full_name": "Nuevo Alumno",
  "email": "nuevo@ufv.es",
  "student_id": "UFV-2026-001",
  "password": "demo123",
  "school": "Facultad",
  "degree": "Grado",
  "year": 2,
  "study_group": "A"
}
```

Si el email esta en whitelist, puede aprobarse automaticamente. Si no, queda pendiente para un admin.

## Organizaciones y Datos Publicos

### GET `/api/stats`

Devuelve estadisticas publicas para landing.

### GET `/api/audit/public`

Devuelve ultimos registros publicos de auditoria.

### GET `/api/organizations/:domain`

Devuelve branding de una organizacion.

Ejemplos:

```text
/api/organizations/ufv.es
/api/organizations/highland.edu
/api/organizations/vtb.demo
```

### GET `/api/org-units`

Lista unidades organizativas. Acepta:

```text
/api/org-units?domain=ufv.es
```

### GET `/api/schools-degrees`

Lista escuelas y grados. Acepta:

```text
/api/schools-degrees?domain=ufv.es
```

## Elecciones

### GET `/api/elections`

Privado. Lista elecciones asignadas al usuario autenticado.

Response:

```json
{
  "elections": [
    {
      "id": 1,
      "blockchainId": 1,
      "name": "Demo Election",
      "description": "Election description",
      "startTime": 1713000000,
      "endTime": 1718000000,
      "isActive": true,
      "status": "active",
      "imageUrl": null,
      "bannerColor": "#1E3A5F",
      "voterRole": "student"
    }
  ]
}
```

### GET `/api/elections/:id`

Privado. Devuelve detalle de eleccion y candidatos.

### GET `/api/elections/:id/eligibility`

Privado. Comprueba si el usuario puede votar.

Response elegible:

```json
{
  "eligible": true
}
```

Response no elegible:

```json
{
  "eligible": false,
  "reason": "already_voted"
}
```

Razones habituales:

- `not_found`
- `not_active`
- `not_eligible`
- `already_voted`

### POST `/api/elections/register-vote`

Privado. Registra un voto.

Request:

```json
{
  "electionId": 1,
  "candidateId": 2,
  "voteHash": "0xabc123..."
}
```

Response:

```json
{
  "success": true,
  "txHash": "0xdeadbeef...",
  "blockNumber": 12345678,
  "message": "Voto registrado exitosamente en blockchain",
  "voting": {
    "nullifier": "0x...",
    "electionId": 1,
    "voteHashReceived": "0xabc123..."
  }
}
```

Notas:

- El backend genera el nullifier, no el frontend.
- Si la eleccion no existe on-chain, el MVP puede registrar voto local de demo con `blockNumber: null`.
- Un segundo voto del mismo usuario en la misma eleccion devuelve conflicto.

### GET `/api/elections/:id/results`

Devuelve resultados y participacion.

Response:

```json
{
  "election": {
    "id": 1,
    "name": "Demo Election",
    "description": "",
    "status": "active",
    "startDate": "2026-05-08T10:00:00.000Z",
    "endDate": "2026-05-09T10:00:00.000Z",
    "totalVoters": 20
  },
  "candidates": [
    { "id": 1, "name": "Candidate A", "description": "", "votes": 4, "percentage": 66.7 },
    { "id": 2, "name": "Candidate B", "description": "", "votes": 2, "percentage": 33.3 }
  ],
  "totalVotes": 6,
  "participationRate": 30,
  "onChainVerified": true
}
```

### GET `/api/elections/:id/audit`

Publico. Devuelve auditoria de una eleccion sin identidad personal.

Response:

```json
[
  {
    "nullifier": "0x...",
    "txHash": "0x...",
    "blockNumber": 12345678,
    "timestamp": "2026-05-08 10:00:00",
    "explorerLink": "https://sepolia.etherscan.io/tx/0x...",
    "onChain": true
  }
]
```

### GET `/api/elections/blockchain-sync-status`

Comprueba si los IDs locales cuadran con el contrato.

### PATCH `/api/elections/fix-blockchain-ids`

Corrige IDs blockchain locales en entorno de desarrollo. En produccion requiere admin.

## Admin

Todos requieren rol `admin` o `superadmin`.

### Dashboard

| Metodo | Endpoint | Funcion |
| --- | --- | --- |
| GET | `/admin/dashboard` | KPIs y graficas del panel |
| GET | `/admin/blockchain-status` | Estado RPC/contrato |

### Usuarios

| Metodo | Endpoint | Funcion |
| --- | --- | --- |
| GET | `/admin/users` | Lista usuarios |
| POST | `/admin/users` | Crea usuario aprobado |
| PATCH | `/admin/users/:id` | Actualiza usuario |
| DELETE | `/admin/users/:id` | Elimina usuario si aplica |
| POST | `/admin/users/import` | Importa CSV |
| GET | `/admin/email-whitelist` | Lista whitelist |
| POST | `/admin/email-whitelist` | Anade emails a whitelist |

### Solicitudes

| Metodo | Endpoint | Funcion |
| --- | --- | --- |
| GET | `/admin/registration-requests` | Lista solicitudes |
| PATCH | `/admin/registration-requests/:id` | Aprueba o rechaza |

### Elecciones

| Metodo | Endpoint | Funcion |
| --- | --- | --- |
| GET | `/admin/elections` | Lista elecciones administrables |
| POST | `/admin/elections` | Crea eleccion |
| PUT | `/admin/elections/:id` | Edita eleccion |
| POST | `/admin/elections/:id/voters` | Anade votante |
| DELETE | `/admin/elections/:id/voters/:userId` | Quita votante |
| POST | `/admin/elections/:id/candidates` | Anade candidato |
| DELETE | `/admin/elections/:id/candidates/:candidateId` | Quita candidato |
| GET | `/admin/elections/:id/stats` | Estadisticas de participacion |

## Codigos de Estado

| Codigo | Significado |
| --- | --- |
| 200 | OK |
| 201 | Creado |
| 400 | Request invalida |
| 401 | Falta JWT o token invalido |
| 403 | Sin permisos |
| 404 | No encontrado |
| 409 | Conflicto, por ejemplo voto duplicado |
| 429 | Rate limit |
| 500 | Error interno |

## Ejemplos cURL

Login:

```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"student@vtb.demo\",\"password\":\"demo123\"}"
```

Health:

```bash
curl http://localhost:3001/health
```

Stats publicas:

```bash
curl http://localhost:3001/api/stats
```

Elecciones asignadas:

```bash
curl http://localhost:3001/api/elections \
  -H "Authorization: Bearer <JWT>"
```

## Variables Necesarias

El backend necesita `.env`. Si el proyecto viene de GitHub, crealo manualmente. Minimo:

```env
PORT=3001
JWT_SECRET=replace_me
NULLIFIER_SECRET=replace_me
DATABASE_PATH=./vtb.db
RPC_URL=http://localhost:8545
CONTRACT_ADDRESS=0x0000000000000000000000000000000000000000
PRIVATE_KEY=0x0000000000000000000000000000000000000000000000000000000000000000
```

El frontend necesita:

```env
VITE_API_URL=http://localhost:3001
```

## Seguridad

- No subir `.env`.
- No exponer `PRIVATE_KEY` en frontend.
- Usar secretos aleatorios para JWT/nullifiers.
- Usar wallet de demo para Sepolia.
- Revisar persistencia de base de datos antes de produccion real.

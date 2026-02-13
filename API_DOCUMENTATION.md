# VTB API Documentation

## Base URL
All endpoints start with: `http://localhost:5000/api`

## Authentication

No está implementado JWT en esta demo. En producción usar:
```
Authorization: Bearer <token>
```

---

## Endpoints

### 🔐 Authentication

#### POST `/login`
Autentica un usuario contra la BD SQL.

**Request:**
```json
{
  "email": "alumno@ufv.es",
  "password": "alumno123"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "user": {
    "id": 2,
    "email": "alumno@ufv.es",
    "role": "votante"
  }
}
```

**Response (401 Unauthorized):**
```json
{
  "error": "Credenciales inválidas"
}
```

---

### 🗳️ Elections

#### GET `/elections`
Obtiene todas las elecciones.

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "title": "Delegado 3º Ingeniería Informática",
    "description": "Elección del delegado de curso...",
    "is_active": true,
    "candidates": [
      {
        "name": "Alice García",
        "description": "Propuesta: más recursos en laboratorios"
      },
      {
        "name": "Bob López",
        "description": "Propuesta: flexibilizar horarios"
      },
      {
        "name": "Carol Martínez",
        "description": "Propuesta: mejorar comunicación"
      }
    ],
    "created_at": "2025-02-13T10:00:00",
    "closed_at": null,
    "vote_count": 3
  },
  {
    "id": 2,
    "title": "Presupuestos 2025 - Aprobación",
    "description": "Votación sobre presupuestos...",
    "is_active": false,
    "candidates": [
      {
        "name": "Opción A: Invertir en becas",
        "description": "+40% en becas"
      },
      {
        "name": "Opción B: Invertir en infraestructura",
        "description": "+40% en equipos"
      }
    ],
    "created_at": "2025-01-15T09:00:00",
    "closed_at": "2025-02-01T17:00:00",
    "vote_count": 0
  }
]
```

#### GET `/elections/<id>`
Obtiene una elección específica.

**Path Parameter:**
- `id` (int): ID de la elección

**Response (200 OK):**
```json
{
  "id": 1,
  "title": "Delegado 3º Ingeniería Informática",
  "description": "...",
  "is_active": true,
  "candidates": [...],
  "created_at": "...",
  "closed_at": null,
  "vote_count": 3
}
```

**Response (404 Not Found):**
```json
{
  "error": "Elección no encontrada"
}
```

---

### 🗳️ Voting

#### POST `/vote`
Registra un voto en la blockchain.

**Request:**
```json
{
  "election_id": 1,
  "candidate": "Alice García",
  "user_id": 2
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "tx_hash": "a3c5e7d1f9b2c4e6a8d0f1c3e5g7i9k1m3n5",
  "message": "Voto registrado en la blockchain",
  "receipt": {
    "timestamp": "2025-02-13T14:30:45.123456",
    "election_id": 1,
    "anonymous_credential": "a7c3f9d0",
    "note": "Guarda este recibo para auditoría. Tu voto es anónimo."
  }
}
```

**Response (400 Bad Request):**
```json
{
  "error": "Faltan campos requeridos"
}
```

**Response (403 Forbidden):**
```json
{
  "error": "Ya has votado en esta elección"
}
```

oder

```json
{
  "error": "Esta elección está cerrada"
}
```

---

### 📊 Results

#### GET `/results/<election_id>`
Obtiene resultados de una elección DESDE LA BLOCKCHAIN.

**Path Parameter:**
- `election_id` (int): ID de la elección

**Response (200 OK):**
```json
{
  "election_id": 1,
  "title": "Delegado 3º Ingeniería Informática",
  "results": {
    "election_id": 1,
    "total_votes": 5,
    "candidates": {
      "Alice García": 2,
      "Bob López": 2,
      "Carol Martínez": 1
    },
    "blockchain_valid": true
  },
  "can_view": false
}
```

**Nota importante:** Los resultados se leen de la blockchain, NO de SQL.
Esto garantiza que la identidad del votante jamás está vinculada a su voto.

---

### ⛓️ Blockchain

#### GET `/chain`
Obtiene detalles completos de la blockchain para auditoría.

**Response (200 OK):**
```json
{
  "length": 3,
  "is_valid": true,
  "difficulty": 2,
  "pending_votes": 0,
  "blocks": [
    {
      "index": 0,
      "timestamp": "2025-02-13T10:15:20.123456",
      "votes": [],
      "previous_hash": "0",
      "nonce": 45,
      "hash": "00a3c7e9f1b5d2c8e4a6f0g2i4k6m8o0"
    },
    {
      "index": 1,
      "timestamp": "2025-02-13T10:20:45.654321",
      "votes": [
        {
          "election_id": 1,
          "candidate": "Alice García",
          "anonymous_id": "a7c3f9d0",
          "timestamp": "2025-02-13T10:18:30.123456"
        },
        {
          "election_id": 1,
          "candidate": "Bob López",
          "anonymous_id": "b8d4g0e2",
          "timestamp": "2025-02-13T10:19:15.654321"
        },
        ...
      ],
      "previous_hash": "00a3c7e9f1b5d2c8e4a6f0g2i4k6m8o0",
      "nonce": 127,
      "hash": "00f2d4c6e8a0g2i4k6m8o0q2s4u6w8y0"
    }
  ]
}
```

#### GET `/chain/validate`
Valida la integridad de la blockchain.

**Response (200 OK):**
```json
{
  "is_valid": true,
  "message": "La blockchain es íntegra"
}
```

O si está manipulada:

```json
{
  "is_valid": false,
  "message": "La blockchain ha sido manipulada"
}
```

---

### 👨‍💼 Admin

#### GET `/admin/stats`
Estadísticas generales del sistema (solo admin).

**Response (200 OK):**
```json
{
  "total_users": 2,
  "total_elections": 2,
  "total_votes_registered": 5,
  "blockchain_blocks": 3,
  "blockchain_pending_votes": 0,
  "blockchain_valid": true
}
```

---

### ⚙️ System

#### POST `/init`
Inicializa la base de datos con seed data.

**Response (200 OK):**
```json
{
  "message": "Base de datos inicializada"
}
```

**Nota:** Solo funciona si BD está vacía.

---

## Status Codes

| Code | Meaning |
|------|---------|
| 200 | OK - Solicitud exitosa |
| 201 | Created - Recurso creado |
| 400 | Bad Request - Solicitud malformada |
| 401 | Unauthorized - Credenciales inválidas |
| 403 | Forbidden - Acceso denegado |
| 404 | Not Found - Recurso no existe |
| 500 | Server Error - Error interno del servidor |

---

## Error Responses

### Formato estándar de error

```json
{
  "error": "Descripción del error"
}
```

### Errores comunes

**Email o contraseña incorrectos:**
```json
{
  "error": "Credenciales inválidas"
}
```

**Ya votó en esta elección:**
```json
{
  "error": "Ya has votado en esta elección"
}
```

**Elección cerrada:**
```json
{
  "error": "Esta elección está cerrada"
}
```

**Elección no encontrada:**
```json
{
  "error": "Elección no encontrada"
}
```

---

## Ejemplos de uso (cURL)

### Ejemplo 1: Login

```bash
curl -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alumno@ufv.es",
    "password": "alumno123"
  }'
```

### Ejemplo 2: Obtener elecciones

```bash
curl http://localhost:5000/api/elections
```

### Ejemplo 3: Votar

```bash
curl -X POST http://localhost:5000/api/vote \
  -H "Content-Type: application/json" \
  -d '{
    "election_id": 1,
    "candidate": "Alice García",
    "user_id": 2
  }'
```

### Ejemplo 4: Obtener resultados

```bash
curl http://localhost:5000/api/results/1
```

### Ejemplo 5: Ver blockchain

```bash
curl http://localhost:5000/api/chain
```

### Ejemplo 6: Validar blockchain

```bash
curl http://localhost:5000/api/chain/validate
```

### Ejemplo 7: Obtener estadísticas admin

```bash
curl http://localhost:5000/api/admin/stats
```

---

## Notas Técnicas

### Almacenamiento de Datos

**SQL (SQLite):**
- `users`: Email, password, role
- `elections`: Título, descripción, candidatos, estado
- `votes`: user_id, election_id, tx_hash (vinculación censo)

**Blockchain (En memoria):**
- Bloques con votos anónimos
- Sin user_id en los votos (anonimato)
- Hash SHA-256 por voto
- Proof-of-Work con 2 ceros iniciales

### Seguridad

⚠️ **DEMO EDUCATIVA** - NO USAR EN PRODUCCIÓN

Mejoras necesarias:
- [ ] Hashear contraseñas (bcrypt)
- [ ] JWT para autenticación
- [ ] HTTPS
- [ ] Rate limiting
- [ ] Encripción de datos
- [ ] Validación de input más robusta

---

## Limpia Estructura de Respuestas

### Usuario
```json
{
  "id": int,
  "email": "string@domain.com",
  "role": "admin | votante"
}
```

### Elección
```json
{
  "id": int,
  "title": "string",
  "description": "string",
  "is_active": boolean,
  "candidates": [
    {
      "name": "string",
      "description": "string"
    }
  ],
  "created_at": "ISO 8601",
  "closed_at": "ISO 8601 | null",
  "vote_count": int
}
```

### Voto (en blockchain)
```json
{
  "election_id": int,
  "candidate": "string",
  "anonymous_id": "string (UUID corto)",
  "timestamp": "ISO 8601"
}
```

### Bloque
```json
{
  "index": int,
  "timestamp": "ISO 8601",
  "votes": [...],
  "previous_hash": "string (hex)",
  "nonce": int,
  "hash": "string (hex SHA-256)"
}
```

---

## Rate Limiting

No implementado en demo. En producción:
- 5 login attempts por minuto por IP
- 1 voto por usuario (por elección)
- 100 requests/minuto general

---

## Versionado de API

Versión actual: **1.0** (pre-release)

Todos los endpoints usan `/api/` como prefijo.
En producción considerar:
- `/api/v1/`
- `/api/v2/`
- Mantener compatibilidad hacia atrás

---

## Autor & Documentación

Esta API es para un proyecto de fin de grado de Ingeniería Informática.  
Sistema educativo híbrido Web2 + Web3 basado en blockchain simulada.

Para soporte: revisar el código fuente comentado o `README.md`.

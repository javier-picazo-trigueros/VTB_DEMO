# API

Referencia de los endpoints del backend. La fuente de verdad es el código: cada
fila de las tablas indica el fichero de `backend/src/routes/` que la implementa, y
los cuerpos de petición se validan con esquemas `zod` en ese mismo fichero.

**Base URL local:** `http://localhost:3001` · **Producción:** el navegador usa
siempre `/backend` (proxy de Vercel hacia Render), ver [`DESPLIEGUE.md`](DESPLIEGUE.md).

---

## Convenciones

### Autenticación: cookies, no cabeceras

La sesión va en cookies. **Ninguna ruta usa `Authorization: Bearer`** ni devuelve
el token en el cuerpo de la respuesta.

| Cookie | httpOnly | Duración | Para qué |
|---|---|---|---|
| `vtb_auth` | sí | 15 min | JWT de acceso (HS256) |
| `vtb_refresh` | sí | 7 días | Refresco con rotación; se revoca al cerrar sesión o cambiar la contraseña |
| `vtb_csrf` | no | 15 min | Token CSRF que el frontend lee y reenvía |

Las peticiones que modifican datos (`POST`, `PUT`, `PATCH`, `DELETE`) con sesión
llevan además la cabecera `X-CSRF-Token` con el valor de `vtb_csrf`. Quedan exentas
`/auth/login`, `/auth/demo-login` y `/auth/refresh`, y las peticiones sin sesión.

`requireAuth` comprueba en cada petición que la cuenta no esté dada de baja (401).
`requireAdmin` relee el rol en la base de datos, así que una degradación surte efecto
al instante. Un admin de dominio solo alcanza lo de su dominio; los recursos de otro
dominio responden **404**, no 403.

### Errores

Cuerpo `{ "error": "mensaje" }` y, cuando el cliente debe distinguirlos, un `code`
estable.

| Código HTTP | Significado |
|---|---|
| 400 | Datos inválidos (el mensaje dice cuál) |
| 401 | Sin sesión, sesión caducada o cuenta dada de baja |
| 403 | Sin permiso, cuenta pendiente de aprobación o censo congelado |
| 404 | No existe, o no es de tu dominio |
| 409 | Conflicto: ya votaste, duplicado, solicitud ya resuelta, censo congelado |
| 429 | Límite de peticiones |
| 503 | La elección no está registrada en el contrato (`ELECTION_NOT_ON_CHAIN`) |

Codes que el frontend distingue: `MUST_CHANGE_PASSWORD`, `ACCOUNT_PENDING_APPROVAL`,
`CSRF_MISMATCH`, `CSRF_INVALID`, `CENSUS_FROZEN`, `ELECTION_NOT_ON_CHAIN`.

### Límites de tasa

Login (por IP, por cuenta e IP, y por cuenta), registro, recuperación de contraseña,
voto (por usuario: 3 por minuto, y por IP) y las lecturas públicas que consultan la
cadena (`GET /api/elections/:id` y `/:id/results`). Detalle en
`backend/src/middleware/rateLimit.ts`.

---

## Públicos y salud

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health`, `/api/health` | `200` con `"database":"ok"`; `503` si la base no responde. Sin detalles del error |
| GET | `/` | Información básica del servicio |
| GET | `/api/stats` | Estadísticas agregadas para la portada y la transparencia |
| GET | `/api/audit/public` | Últimas entradas de auditoría de votos, sin datos personales |
| GET | `/api/org-units` | Unidades organizativas (`?domain=`) |
| GET | `/api/schools-degrees` | Escuelas y titulaciones (`?domain=`) |
| GET | `/api/organizations/:domain` | Marca de una institución (`routes/organizations.ts`) |
| GET | `/auth/config` | `{ "demoLoginEnabled": boolean }` |

## Autenticación (`routes/auth.ts`, `routes/registration.ts`)

| Método | Ruta | Sesión | Descripción |
|---|---|---|---|
| POST | `/auth/login` | no | Email y contraseña. Pone las cookies y devuelve `{ success, user }` |
| POST | `/auth/demo-login` | no | Sesión de demostración. **404 salvo `DEMO_LOGIN_ENABLED=true`** |
| POST | `/auth/register` | no | Alta directa |
| POST | `/registration/request` | no | Solicitud de acceso (requiere `acceptedTerms: true`) |
| POST | `/auth/refresh` | cookie | Rota `vtb_refresh` y renueva `vtb_auth` |
| POST | `/auth/logout` | sí | Revoca el refresh en el servidor |
| POST | `/auth/forgot-password`, `/auth/reset-password` | no | Recuperación con enlace por correo |
| GET | `/auth/me`, `/auth/verify` | sí | Usuario de la sesión |
| PATCH | `/auth/change-password` | sí | Cambio de contraseña (revoca los refresh) |
| GET / PATCH | `/auth/me/profile` | sí | Perfil editable |
| GET | `/auth/me/export` | sí | Exportación de datos personales (JSON). No incluye candidato, nullifier, transacción ni fecha de voto |
| DELETE | `/auth/me` | sí | Baja de la propia cuenta |

`POST /auth/login` responde:

```json
{
  "success": true,
  "user": {
    "id": 1, "email": "…", "name": "…", "student_id": "…",
    "role": "student", "adminDomain": null, "mustChangePassword": false
  }
}
```

`401` credenciales erróneas; `403` con `code: "ACCOUNT_PENDING_APPROVAL"` si la cuenta
espera aprobación.

## Elecciones (`routes/elections.ts`, montadas en `/api/elections`)

| Método | Ruta | Sesión | Descripción |
|---|---|---|---|
| GET | `/api/elections` | sí | Elecciones del censo del usuario |
| GET | `/api/elections/:id` | no | Detalle y candidatos; `blockchainInfo` si está en el contrato |
| GET | `/api/elections/:id/eligibility` | sí | `{ eligible, reason? }` |
| POST | `/api/elections/register-vote` | sí | Emite el voto (ver abajo) |
| GET | `/api/elections/:id/results` | no | Recuento, participación y verificación contra la cadena |
| GET | `/api/elections/:id/audit` | no | Registro público de votos, sin datos personales |
| GET | `/api/elections/blockchain-sync-status` | no | Estado de sincronización de cada elección con el contrato |

### `POST /api/elections/register-vote`

```json
{ "electionId": 1, "candidateId": 2 }
```

`candidateId` es el **id de la base de datos** del candidato y es obligatorio; el
servidor comprueba que pertenece a esa elección y envía al contrato su **posición**
(0..n-1). El campo `voteHash`, heredado del contrato v1, se acepta pero se ignora.

Respuesta con voto en cadena:

```json
{
  "success": true,
  "status": "confirmed",
  "pendingConfirmation": false,
  "txHash": "0x…",
  "blockNumber": 12345678,
  "message": "…"
}
```

Si la transacción tarda, `status` es `"pending_confirmation"` y un job la concilia
después con el evento de la cadena. Una cuenta `@vtb.demo` (solo donde las cuentas
demo están habilitadas) recibe `{ success: true, txHash: null, blockNumber: null,
isDemo: true, verifiable: false }`.

| Código | Motivo |
|---|---|
| 400 | Datos inválidos o el candidato no pertenece a la elección |
| 403 | Cuenta no habilitada, no estás en el censo o la elección está fuera de horario |
| 404 | Elección no encontrada o no activa |
| 409 | Ya has votado en esta elección |
| 503 | `ELECTION_NOT_ON_CHAIN`: la elección no está registrada en el contrato. Aplica a **todas** las cuentas |
| 500 | Error de la cadena (el detalle va al log, nunca al cliente) |

### `GET /api/elections/:id/results`

Devuelve `election`, `candidates`, `totalVotes`, `participationRate`,
`onChainVerified` y `verificacion`. Mientras la elección está **activa**, el reparto
por candidato no se publica: `tallyHidden` es `true`, `candidates` no lleva votos y
`tallyPublishedAt` indica cuándo se publicará (el fin de la elección).
`onChainVerified` es `true` solo si el recuento de la base coincide con `getTally()`
del contrato y no hay votos no verificables; `verificacion.estado` distingue
*coincide*, *discrepancia*, *sin-respuesta* y *no-aplica*. Que el nodo no responda
**no** cuenta como verificado.

## Administración (`routes/admin/`, todas con rol `admin` o `superadmin`)

| Método | Ruta | Fichero | Descripción |
|---|---|---|---|
| GET | `/admin/dashboard` | `org.ts` | Indicadores y gráficas |
| GET | `/admin/blockchain-status` | `election-census.ts` | Conectividad con el nodo y el contrato |
| POST | `/api/admin/sync-blockchain` | `app.ts` | Registra las elecciones pendientes en el contrato |
| GET | `/admin/action-log` | `action-log.ts` | Registro de acciones de administración, filtrado por dominio |
| GET / POST | `/admin/users` | `users.ts` | Listar y crear usuarios |
| POST | `/admin/users/import` | `users.ts` | Alta masiva por CSV (`email,full_name,student_id,send_email,role`) |
| PATCH | `/admin/users/:id/approval` | `users.ts` | Aprobar o cambiar el estado |
| DELETE | `/admin/users/:id` | `users.ts` | Baja de un usuario |
| GET | `/admin/registration-requests` | `org.ts` | Bandeja (`?status=pending\|all`) |
| PATCH | `/admin/registration-requests/:id` | `org.ts` | `{ "action": "approve" }` o `{ "action": "reject", "reason": "…" }`. Solo si está `pending` (409 si no) y es de tu dominio |
| GET / POST | `/admin/org-units` | `org.ts` | Unidades organizativas |
| GET / POST | `/admin/domain-admins` | `org.ts` | Administradores de dominio (solo superadmin) |
| GET | `/admin/domains` | `org.ts` | Dominios disponibles |
| GET / POST | `/admin/elections` | `elections.ts` | Listar y crear. Crear responde al momento en estado `pending` y registra en cadena en segundo plano |
| PUT / PATCH | `/admin/elections/:id` | `elections.ts` | Edición total o parcial |
| POST | `/admin/elections/:id/image` | `elections.ts` | Banner (PNG, JPEG, WebP o GIF; 2 MB) |
| POST | `/admin/elections/:id/domains` | `elections.ts` | Añade un dominio al censo. Un admin de dominio solo puede añadir subdominios del suyo; `409 CENSUS_FROZEN` una vez empezada la votación |
| POST | `/admin/elections/:id/voters` | `elections.ts` | Añade un votante de tu dominio; `409 CENSUS_FROZEN` tras el inicio |
| POST | `/admin/elections/:id/candidates` | `elections.ts` | Añade un candidato |
| POST | `/admin/elections/:id/import-voters` | `election-census.ts` | Censo por CSV (`email,full_name,student_id,send_email`) |
| GET | `/admin/elections/:id/stats` | `election-census.ts` | Participación y desglose |
| POST | `/admin/elections/:id/notify-open`, `notify-close` | `election-census.ts` | Avisos por correo |
| GET | `/admin/audit` | `election-census.ts` | Registro de auditoría (filtrado) |
| GET | `/admin/stats/voters` | `election-census.ts` | Participación por elección |

Las rutas con `:id` de elección responden `404` si la elección no es del dominio del
admin.

---

## Ejemplo con `curl`

La sesión es una cookie, así que hace falta un *cookie jar* y reenviar el CSRF:

```bash
# Login: guarda las cookies
curl -c jar.txt -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"student@vtb.demo","password":"<la de tu .env>"}'

# Mis elecciones
curl -b jar.txt http://localhost:3001/api/elections

# Votar: copia el valor de vtb_csrf al encabezado
CSRF=$(awk '$6=="vtb_csrf"{print $7}' jar.txt)
curl -b jar.txt -X POST http://localhost:3001/api/elections/register-vote \
  -H "Content-Type: application/json" -H "X-CSRF-Token: $CSRF" \
  -d '{"electionId":1,"candidateId":2}'
```

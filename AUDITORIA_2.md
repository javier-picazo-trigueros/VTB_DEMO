# AUDITORÍA 2 — VTB (Vote Through Blockchain)

**Fecha:** 26 de agosto de 2026
**Alcance:** `backend/` (6.583 líneas TS), `frontend/` (10.559 líneas JSX/TS), `backend/migrations/`, README y ficheros de entorno.
**Estado del repo:** rama `main`, commit `73da138c`, con cambios sin commitear en 24 ficheros.
**Método:** lectura completa del backend, lectura dirigida del frontend, `tsc --noEmit`, `vitest run`, `vite build`, y consultas estáticas sobre el árbol.
**Sustituye a:** `AUDITORIA.md` (obsoleta desde la migración a PostgreSQL, cookies httpOnly, servicio de email y rediseño).

> **No se ha modificado ningún fichero del proyecto.** Este documento es solo diagnóstico.

---

## Verificación previa

| Comprobación | Resultado |
|---|---|
| `npx tsc --noEmit` (backend) | ✅ Sin errores |
| `npm test` (backend) | ✅ 37 tests, 6 ficheros, todos pasan |
| `npm run build` (frontend) | ✅ Compila; avisa de chunks >500 kB |

Que los tests pasen y el tipado esté limpio **no** contradice lo que sigue: la mayoría de los hallazgos graves están en caminos que ningún test cubre (email, reset de contraseña, PostgreSQL, multi-tenant, frontend).

---

## Resumen ejecutivo

Los ocho fallos que pediste re-verificar (PARTE 1) **siguen cerrados en su forma original**, salvo **S19, que ha vuelto a abrirse en 6 sitios**. El detalle está en la sección PARTE 1.

Pero la superficie nueva ha introducido cuatro problemas que son **más graves que cualquiera de los originales**:

1. **Hay credenciales de superadministrador publicadas en el README y sembradas por el script de seed.** Si el despliegue de Render se ha sembrado alguna vez, cualquiera que lea el repo es superadmin de la plataforma.
2. **Todo el servicio de email está desconectado del frontend.** Los cuatro tipos de enlace que se envían por correo apuntan a rutas que no existen en `App.jsx`. Invitación al censo y recuperación de contraseña llevan a un 404.
3. **La migración a PostgreSQL está hecha a medias.** `auth`, `admin`, `registration` y `middleware` siguen escribiendo en SQLite; solo `elections` y la cola de email usan el cliente nuevo. Con `DB_CLIENT=postgres` la aplicación se parte en dos bases de datos distintas — y varias consultas ni siquiera son SQL válido en PostgreSQL.
4. **Un usuario con contraseña temporal queda encerrado sin salida**: el guard le devuelve 403 en todo, el frontend no entiende ese código, y `POST /auth/logout` tampoco está permitido, así que ni siquiera puede cerrar sesión.

**Conteo:** 6 hallazgos que rompen algo de forma inmediata (P0), 13 de seguridad o integridad (P1), 11 de consistencia y calidad (P2).

---

# PARTE 1 — Regresión de fallos ya corregidos

| # | Fallo | Estado | Evidencia |
|---|---|---|---|
| S1 | Usuario fuera del censo no puede votar | ✅ **Cerrado** | `backend/src/routes/elections.ts:644-650` |
| S2 | Sin endpoint público que enumere usuarios | ⚠️ **Cerrado con matiz** | ver abajo |
| S7 | Ningún endpoint se salta el auth por `NODE_ENV` | ✅ **Cerrado** | ver abajo |
| S8 | Contraseñas temporales impredecibles | ✅ **Cerrado** | `admin.ts:367, 860, 1101` |
| S19 | No devolver `err.message` al cliente | ❌ **REABIERTO — 6 sitios** | ver abajo |
| — | Token fuera del body y de localStorage | ✅ **Cerrado** | ver abajo |
| — | TOCTOU del voto mitigado en PostgreSQL | ⚠️ **Correcto en código, inalcanzable en ejecución** | ver abajo |
| — | Ninguna afirmación de voto anónimo | ⚠️ **Una cadena superviviente en español** | ver abajo |

### S1 — Censo: cerrado ✅

`backend/src/routes/elections.ts:644-650` comprueba `election_voters` antes de votar y devuelve 403. Además hay una comprobación previa de `is_eligible` en `elections.ts:635-641`, y el endpoint `GET /:id/eligibility` (`elections.ts:334-425`) replica la lógica. Cubierto por dos tests: `security-fixes.test.ts:78` y `vote.test.ts:135`.

### S2 — Enumeración de usuarios: cerrado, con un oráculo residual ⚠️

No existe ningún endpoint público que **liste** usuarios. Inventario de rutas sin autenticación: `/health`, `/api/health`, `/api/org-units`, `/api/stats`, `/api/audit/public`, `/api/schools-degrees`, `/`, `/api/organizations/:domain`, `GET /api/elections/:id`, `/:id/results`, `/:id/audit`, `/:id/vote-feed`, `/blockchain-sync-status`, y el bloque `/auth` público. Ninguna devuelve un listado de cuentas. `/api/audit/public` (`app.ts:296`) trunca el nullifier; `/admin/audit`, que sí devuelve emails, exige `requireAdmin`.

**Matiz:** quedan dos oráculos de confirmación uno-a-uno, sin rate limit:
- `POST /auth/register` → 409 `"El email ya está registrado"` (`auth.ts:114`)
- `POST /registration/request` → 409 `"Ese email ya tiene una cuenta activa"` (`registration.ts:51`)

No permiten volcar el censo, pero sí confirmar si una dirección concreta tiene cuenta. Está detallado como hallazgo **P1-16**.

### S7 — Bypass de auth por `NODE_ENV`: cerrado ✅

Todos los usos de `NODE_ENV` en el backend (13 en total, fuera de tests) afectan solo a cabeceras de seguridad, límites de rate limit, flags de cookie y SSL. Ninguno salta autenticación. `PATCH /elections/fix-blockchain-ids` — el endpoint del fallo original — tiene `requireAdmin` incondicional en `elections.ts:183`, con cuatro tests que lo fijan (`security-fixes.test.ts:134-158`).

Dicho esto, `NODE_ENV` sigue gobernando dos comportamientos peligrosos por otra vía. Ver **P1-13**.

### S8 — Contraseñas temporales: cerrado ✅

Los tres sitios que generan contraseña temporal usan `crypto.randomBytes(12).toString('base64url')` — 96 bits de entropía criptográfica: `admin.ts:367` (import CSV de usuarios), `admin.ts:860` (import de votantes) y `admin.ts:1101` (aprobación de solicitud). Los tokens de invitación y reset usan `crypto.randomBytes(32)` con almacenamiento del SHA-256 (`utils/auth.ts:209-217`).

### S19 — `err.message` al cliente: **REABIERTO** ❌

Seis sitios devuelven el mensaje de excepción crudo en el cuerpo de la respuesta:

| Fichero:línea | Ruta | Qué se filtra |
|---|---|---|
| `backend/src/routes/auth.ts:375` | `PATCH /auth/change-password` | Error de SQLite: nombres de tabla/columna, ruta del fichero .db |
| `backend/src/routes/auth.ts:403` | `GET /auth/me/profile` | Ídem |
| `backend/src/routes/auth.ts:452` | `PATCH /auth/me/profile` | Ídem |
| `backend/src/routes/admin.ts:775` | `PATCH /admin/elections/:id` | Ídem |
| `backend/src/routes/elections.ts:849` | `POST /register-vote` (`INVALID_ARGUMENT`) | Error de ethers: puede incluir ABI, dirección de contrato, datos de la tx |
| `backend/src/routes/elections.ts:862` | `POST /register-vote` (error genérico) | Ídem, más `RPC_URL` en errores de red de ethers |

Hay dos más de la misma familia, con menor impacto pero el mismo patrón:
- `admin.ts:1530` — `reason: err.message` en `GET /admin/blockchain-status` (ver **P1-15**).
- `admin.ts:371, 894, 908` — `results.errors.push(\`Error creating ${email}: ${e.message}\`)`, es decir, mensajes de excepción de SQLite devueltos al panel de administración dentro del array de errores del import CSV.

**Coste de arreglo:** trivial. Sustituir por un literal y mantener `console.error` con el error completo. ~20 minutos para los nueve sitios.

### Token fuera del body y de localStorage: cerrado ✅

- `POST /auth/login` (`auth.ts:193-204`) devuelve solo `{ success, user }`. No hay ningún campo `token` en ninguna respuesta.
- `setSessionCookies` (`auth.ts:54-88`) emite las tres cookies: `vtb_auth` (httpOnly, 15 min), `vtb_refresh` (httpOnly, path `/auth`, 7 días) y `vtb_csrf` (legible por JS, por diseño).
- `middleware/auth.ts:23-27` y `app.ts:107-112` leen el JWT **solo** de la cookie. No queda ningún camino que acepte `Authorization: Bearer`, pese a que varios comentarios JSDoc lo siguen anunciando (`auth.ts:213, 246, 340`).
- En el frontend, `grep localStorage` no devuelve ninguna escritura de credenciales. `AuthContext` hidrata desde `GET /auth/me`.

**Residuo:** cuatro componentes siguen *leyendo* claves legacy que ya nadie escribe. Uno de ellos produce un fallo funcional real — ver **P1-18**.

### TOCTOU del voto en PostgreSQL: correcto en código, inalcanzable en ejecución ⚠️

El cerrojo de PostgreSQL está **bien implementado**. `PgClient.acquireVoteLock` (`db/postgres.ts:137-157`) hace un upsert atómico sobre `vote_attempts` con `ON CONFLICT (user_id, election_id) DO UPDATE ... WHERE vote_attempts.status = 'failed'`, y lanza `VoteConflictError` si `rowCount === 0`. La restricción `UNIQUE (user_id, election_id)` existe en la migración (`20260808000001_initial_schema.cjs`, tabla `vote_attempts`). El diseño es correcto: solo un intento concurrente puede ganar.

**El problema es que ese código no se ejecuta.** `getDbClient()` (`db/index.ts:21`) devuelve `SqliteAdapter` salvo que `DB_CLIENT === 'postgres'`, y `DB_CLIENT` no está definido ni en `.env`, ni en `backend/.env`, ni en ninguno de los dos `.env.example`. El camino activo es `SqliteAdapter.acquireVoteLock` (`db/sqlite-adapter.ts:142-154`), que hace un `SELECT` seguido de una comprobación en aplicación — exactamente el TOCTOU original, como reconoce el propio comentario de la clase (`sqlite-adapter.ts:115-117`).

En la práctica el doble voto lo impide el contrato (el nullifier es determinista, `utils/auth.ts:126-137`, y el contrato rechaza el repetido), no la base de datos. La consecuencia real de la carrera no es un voto duplicado sino una respuesta 500 confusa y una fila `nullifier_audit` que falla por `UNIQUE`.

**Y además:** aunque se pusiera `DB_CLIENT=postgres`, el camino de PostgreSQL está roto por otros motivos. Ver **P0-3**.

### Afirmaciones de voto anónimo ⚠️

El barrido está bien hecho **en inglés y en los emails**, pero quedó una cadena en español y dos restos:

**1. `frontend/src/i18n/config.ts:901` (español):**
```
confirmMessage: "¿Estás seguro? Tu voto es final y anónimo."
```
El equivalente inglés **sí** se corrigió (`config.ts:338`: `"Are you sure? Your vote is final and cannot be changed."`). La divergencia demuestra que el barrido no cubrió el bloque `es`.

La afirmación es falsa: `nullifier_audit` guarda `user_id`, `election_id` y `candidate_id` en la misma fila (`config/database.ts:76-87` + migración), y `GET /admin/elections/:id/stats` (`admin.ts:1588-1595`) devuelve la lista de votantes con su email y si han votado. El administrador puede reconstruir quién votó a quién con un `JOIN`.

**Atenuante importante:** esa clave **no se renderiza actualmente** — ningún componente referencia `votingBooth.confirmMessage`. Es una trampa latente, no una afirmación en pantalla hoy. Pero está en el bundle y se activaría en cuanto alguien la use.

**2. `backend/src/routes/elections.ts:888`** — `GET /:electionId/vote-feed` devuelve literalmente `nullifier: "Hash anónimo del votante"` en el cuerpo de la respuesta. Endpoint público, sin autenticación.

**3. `frontend/src/components/VoteModal.jsx:8, 99`** — comentario "Se genera credencial anónima (simulada)" y render de `receipt.receipt.anonymous_credential`. Componente muerto (ver **P2-24a**), pero el texto sigue en el repo.

**Lo que sí está bien redactado** y no hace falta tocar: `votingBooth.anonymousInfo` (ES `config.ts:907`, EN `:344`) dice "No identifican al votante **en la cadena**" — preciso; `privacyAnonymous` (`:931`, `:368`) habla solo de impedir el doble voto; `landing.features.anonymity` se titula "Un voto por persona" / "One Person, One Vote" (`:674`, `:111`) y describe solo el nullifier. Los cinco templates de email (`services/email/templates.ts`) no contienen ninguna afirmación de anonimato. No se generan PDFs en el backend; el único PDF es `ElectionResults.jsx:104` (resultados agregados, sin identidades).

---

# Hallazgos ordenados por gravedad

---

## P0 — Rompe algo o expone algo, ahora mismo

---

### P0-1 · Credenciales de superadministrador publicadas en el README

**Dónde:** `README.md:87-91` y `backend/src/scripts/seedDatabase.ts:128-132`

```
README.md:91   | `superadmin@vtb.system` | `superadmin123` | Super admin (platform) | Super Admin |
seed:128       { email: "superadmin@vtb.system", ..., password: "superadmin123", role: "superadmin", admin_domain: null }
```

**Por qué importa.** El seed no crea esta cuenta en un dominio de demostración: `@vtb.system` no es `@vtb.demo`. Todos los filtros de datos ficticios del código son literalmente `email NOT LIKE '%@vtb.demo'` (`app.ts:270`, `app.ts:303`, `elections.ts:466`, `index.ts:128`, `admin.ts:1656`), así que esta cuenta **cuenta como real** en las estadísticas públicas y en la auditoría. Un superadmin con `admin_domain: null` no está limitado por ningún filtro de dominio: ve y administra todas las instituciones.

El último commit del historial es literalmente *"arreglar q todas las cuentas nombradas en el readme esten creadas y tengan esas contraseñas"*, lo que sugiere que el seed se ha ejecutado deliberadamente para que estas credenciales funcionen. Si eso ocurrió contra el backend de Render, la plataforma está comprometida desde el momento en que alguien lee el README público.

Las otras cuatro (`admin@vtb.demo/admin123`, `superadmin@vtb.demo/superadmin123`, `student@vtb.demo/demo123`, `student2@vtb.demo/demo123`) son defendibles como cuentas de demostración documentadas, aunque `superadmin@vtb.demo` también tiene `admin_domain: null` y por tanto alcance global.

**Rompe algo:** sí — es una puerta trasera abierta y documentada.

**Coste de arreglo.** Inmediato: comprobar en la base de datos de producción si existe `superadmin@vtb.system`; si existe, borrarla o cambiarle la contraseña. Después: sacar `superadmin@vtb.system` del array de seed, o generar su contraseña desde una variable de entorno obligatoria y no imprimirla. Quitar la fila 91 del README. ~1 hora, incluida la verificación en producción.

---

### P0-2 · Todo el servicio de email apunta a rutas que no existen en el frontend

**Dónde:** `frontend/src/App.jsx:96-132` (rutas declaradas) frente a los cuatro constructores de URL del backend.

Las rutas que el frontend registra son:
```
/landing  /login  /register-request  /portal/:domain  /transparency  /pricing
/results/:id  /dashboard  /voting/:id  /admin  /change-password  /profile  *
```

Las URLs que se envían por correo:

| Origen | URL enviada | Ruta que existe | Resultado |
|---|---|---|---|
| `admin.ts:887` (invitación al censo) | `/auth/set-password?token=…` | — | **404** |
| `index.ts:155` (invitación regenerada) | `/auth/set-password?token=…` | — | **404** |
| `auth.ts:598` (reset de contraseña) | `/auth/reset-password?token=…` | — | **404** |
| `admin.ts:1666`, `index.ts:168` (apertura) | `/elections/:id` | `/voting/:id` | **404** |
| `admin.ts:1719`, `index.ts:208` (cierre) | `/elections/:id/results` | `/results/:id` | **404** |

Verificado: `grep -rn "set-password\|reset-password\|forgot-password" frontend/src/` no devuelve **ni una sola línea**. No existe página de "olvidé mi contraseña", ni de "establecer contraseña", ni ningún enlace hacia `POST /auth/forgot-password`.

**Por qué importa.** Los endpoints del backend (`POST /auth/forgot-password`, `POST /auth/reset-password`) están implementados y son correctos. Pero no hay ninguna forma de llegar a ellos desde la aplicación. Esto significa:

- **El import de censo por CSV no produce usuarios utilizables.** `admin.ts:855-897` crea al usuario con una contraseña temporal aleatoria que **no se muestra a nadie y no se guarda**, marca `must_change_password = 1`, y envía una invitación cuyo enlace es un 404. El usuario no puede entrar de ninguna manera. Este es el flujo principal de alta de votantes del producto.
- **No hay recuperación de contraseña.** Nadie que olvide su contraseña puede recuperarla.
- Los correos de apertura y cierre de votación llevan a una pantalla de "no encontrado" (`NotFound.jsx`), que además es una de las páginas sin soporte de modo oscuro.

**Rompe algo:** sí, rompe el flujo de alta de usuarios completo. Es el hallazgo con mayor impacto funcional del informe.

**Coste de arreglo.** Dos páginas React nuevas (`SetPassword` y `ResetPassword`, prácticamente idénticas: leen `?token=`, piden contraseña dos veces, hacen `POST /auth/reset-password`), un enlace "¿Olvidaste tu contraseña?" en `Login.jsx` con su página, y tres rutas en `App.jsx`. Corregir las dos URLs de elección para que apunten a `/voting/:id` y `/results/:id` es un cambio de dos líneas en cuatro sitios. **~1 día de trabajo.**

---

### P0-3 · La migración a PostgreSQL está a medias: la aplicación usaría dos bases de datos a la vez

**Dónde:** `backend/src/config/database.ts:360-365` frente a `backend/src/db/index.ts:18-36`

Coexisten dos capas de acceso a datos y **no se hablan entre sí**:

| Capa | Motor | Quién la usa |
|---|---|---|
| `getDatabase()` — `config/database.ts:360` | **SQLite, siempre** (`new sqlite3.Database(...)`, sin ninguna rama condicional) | `app.ts`, `middleware/auth.ts`, `routes/auth.ts`, `routes/admin.ts`, `routes/registration.ts`, `routes/organizations.ts`, `scripts/seedDatabase.ts`, `scripts/syncElections.ts` |
| `getDbClient()` — `db/index.ts:18` | SQLite **o** PostgreSQL según `DB_CLIENT` | `routes/elections.ts`, `services/email/queue.ts`, y dos bloques de `index.ts` |

Con `DB_CLIENT=postgres`, un administrador crearía la elección en **SQLite** (`admin.ts:17`) y el listado de elecciones del votante la leería en **PostgreSQL** (`elections.ts:11`). Login, usuarios, censo, tokens de refresco y solicitudes de registro viven en SQLite; votos, log de email y notificaciones en PostgreSQL. La aplicación aparentaría estar vacía.

Y aunque se unificara el enrutado, el camino de PostgreSQL tiene **cuatro roturas de SQL** ya presentes en el código que hoy va por `getDbClient()`:

1. **`is_active = 1` sobre una columna `BOOLEAN`.** `elections.ts:610` (`POST /register-vote`) e `index.ts:114` (job de notificaciones). PostgreSQL responde `operator does not exist: boolean = integer`. **Votar sería imposible.**
2. **`RETURNING id` añadido a toda sentencia `INSERT`.** `db/postgres.ts:30-32` lo inyecta incondicionalmente. `election_voters` no tiene columna `id` — su clave primaria es `(election_id, user_id)` en la migración. Los 15 `INSERT INTO election_voters` del código fallarían con `column "id" does not exist`.
3. **La tabla `refresh_tokens` no existe en PostgreSQL.** Está definida solo en `config/database.ts:199-208` (SQLite). Ninguna de las tres migraciones la crea. Login y refresco de sesión fallarían.
4. **`elections.image_url` no existe en PostgreSQL.** La migración movió las imágenes a la tabla `election_images` (fix S11), pero `admin.ts:793` sigue haciendo `UPDATE elections SET image_url = ?` y `elections.ts:229` sigue leyendo `e.image_url`.

Añadido: `config/env.ts:47-52` lanza si `DB_CLIENT=postgres` sin `DATABASE_URL`, pero **ese fichero nunca se importa** (ver **P1-13**), así que esa protección no existe.

**Por qué importa.** El README documenta `DB_CLIENT=postgres` como opción soportada de producción en cinco sitios (`README.md:232-240, 385-388, 582-601`). Cualquiera que siga esas instrucciones se encontrará con una aplicación que arranca sin error y se comporta de forma incoherente. El aviso de arranque en `index.ts:73-80` incluso *recomienda* activarlo por seguridad.

**Rompe algo:** sí, en cuanto se active la opción que el propio README recomienda.

**Coste de arreglo.** Migrar los 8 ficheros restantes de `getDatabase()` a `getDbClient()` es mecánico (las interfaces son deliberadamente compatibles), pero arrastra: normalizar los booleanos, arreglar `normalizeSql` para que solo añada `RETURNING id` cuando la tabla tenga esa columna (o eliminar la heurística y usar `RETURNING` explícito), añadir la migración de `refresh_tokens`, reconciliar `image_url`/`election_images`, y sustituir `instr()` y `strftime()` (`app.ts:262`, `app.ts:296`, `admin.ts:147`, `admin.ts:1468`) por equivalentes de PostgreSQL. **~3-5 días, con pruebas contra una instancia real.**

**Alternativa honesta y mucho más barata:** si PostgreSQL no es un requisito para la defensa del proyecto, quitar `DB_CLIENT` del README y documentar SQLite como el motor único soportado. **~1 hora**, y elimina de golpe P0-3 y buena parte de la deuda. Merece la pena decidir esto antes de invertir los cinco días.

---

### P0-4 · Un usuario con contraseña temporal queda encerrado, sin poder ni cerrar sesión

**Dónde:** `backend/src/app.ts:98-141`, `backend/src/routes/auth.ts:314`, `frontend/src/pages/Login.jsx:91-108`

El guard de `must_change_password` bloquea con 403 todo lo que no esté en esta lista (`app.ts:98-105`):
```
POST /auth/login   GET /auth/me   PATCH /auth/change-password
GET /health        GET /api/health   GET /
```

Fallan **cuatro** piezas encadenadas:

1. **`POST /auth/logout` no está en la lista** → el usuario recibe 403 al intentar cerrar sesión. Está atrapado.
2. **`POST /auth/refresh` tampoco está** → a los 15 minutos el access token caduca, el interceptor de `apiClient.js:90` intenta refrescar, recibe 403 (no 401), y como `apiClient.js:74` solo intercepta 401, el error se propaga en crudo.
3. **`GET /auth/me` no devuelve `must_change_password`.** La consulta de `auth.ts:314` selecciona `id, email, name, role, admin_domain` y nada más. `POST /auth/login` sí lo devuelve (`auth.ts:202`), pero al recargar la página `AuthContext` rehidrata desde `/auth/me` (`AuthContext.jsx:150`) y la bandera se pierde.
4. **El frontend no maneja el código en absoluto.** `grep -rn "MUST_CHANGE_PASSWORD" frontend/src/` → cero resultados. `Login.jsx:91-108` hace login y navega a `/admin` o `/dashboard` sin mirar `mustChangePassword`.

**Recorrido real de un usuario importado por CSV:** entra con éxito → aterriza en `/dashboard` → cada petición devuelve 403 con un JSON que la UI no interpreta → ve un dashboard vacío o roto → intenta cerrar sesión → 403 → cierra el navegador. `/change-password` está en el menú de `Navbar.jsx:245`, pero nada le dirige allí ni le explica que debe ir.

**Rompe algo:** sí. Combinado con P0-2 (la invitación tampoco le llega), un usuario dado de alta por CSV no tiene *ningún* camino operativo hacia la aplicación.

**Coste de arreglo.** Añadir `POST /auth/logout` y `POST /auth/refresh` al conjunto de `app.ts:98`; añadir `must_change_password` al `SELECT` de `auth.ts:314` y al objeto de respuesta; redirigir a `/change-password` en `Login.jsx` y en `AuthContext` cuando la bandera esté activa. **~2 horas.**

---

### P0-5 · Escalada de privilegios: un admin de dominio puede fabricarse un admin de cualquier otro dominio

**Dónde:** `backend/src/routes/admin.ts:260-290`

```ts
260  router.post("/users", requireAdmin, async (req, res) => {
262    const { email, password, name, student_id, role = "student", admin_domain = null } = req.body;
...
269    if (!isSuperAdmin(req)) {
270      const adminDomain = getAdminDomain(req);
272      if (adminDomain && !isSubDomain(email.split("@")[1], adminDomain)) { → 403 }
278      if (role === "superadmin") { → 403 }
281    }
...
286    `INSERT INTO users (..., role, admin_domain, ...)`, [..., role, admin_domain, ...]
```

Se valida que `role !== 'superadmin'` y que el **email** pertenezca al dominio del admin. **No se valida `admin_domain` en absoluto**, y `role === 'admin'` está permitido.

**Explotación.** Un admin de `@uni-a.edu` envía:
```json
{ "email": "yo2@uni-a.edu", "password": "...", "name": "x", "student_id": "x",
  "role": "admin", "admin_domain": "uni-b.edu" }
```
El email pasa la comprobación (es de su propio dominio), `role` no es `superadmin`, y la fila se inserta con `admin_domain = 'uni-b.edu'`. Al entrar con esa cuenta, `requireAdmin` (`middleware/auth.ts:80-92`) lee `admin_domain` de la base de datos y le concede alcance completo sobre `uni-b.edu`.

**Peor:** `admin_domain` acaba interpolado en patrones `LIKE` sin escapar — `admin.ts:213` (`email LIKE '%@' || ?`), `admin.ts:942`, `admin.ts:1006`. Con `"admin_domain": "%"` el atacante obtiene un admin que coincide con **todos** los dominios: superadmin de facto, sorteando la comprobación de la línea 278.

Compárese con `POST /admin/domain-admins` (`admin.ts:1381-1432`), que sí lo hace bien: exige superadmin y valida `email.split("@")[1] === admin_domain`. La lógica correcta existe; simplemente no se aplica en esta ruta.

**Rompe algo:** sí, rompe el aislamiento multi-tenant y el modelo de roles.

**Coste de arreglo.** Para un no-superadmin: forzar `role = 'student'` y `admin_domain = null`, o rechazar la petición si vienen presentes. Validar `admin_domain` contra el dominio del email como ya se hace en `/domain-admins`. **~30 minutos.**

---

### P0-6 · Ocho rutas de administración operan sobre cualquier elección sin comprobar el dominio

**Dónde:** `backend/src/routes/admin.ts`

`GET /admin/elections` (`admin.ts:499`) sí filtra correctamente por dominio vía `election_access`. Pero todas estas rutas comprueban únicamente que la elección **exista**:

| Línea | Ruta | Qué permite a un admin ajeno |
|---|---|---|
| `admin.ts:728` | `PUT /elections/:id` | Desactivar (`is_active = 0`) la elección de otra institución **en mitad de la votación** |
| `admin.ts:755` | `PATCH /elections/:id` | Renombrarla, cambiar la descripción, **adelantar `end_time` para cerrarla** |
| `admin.ts:782` | `POST /elections/:id/image` | Sustituir su imagen |
| `admin.ts:807` | `POST /elections/:id/import-voters` | Inyectar votantes en su censo |
| `admin.ts:1200` | `POST /elections/:id/domains` | Añadir su propio dominio, o `*`, al `election_access` ajeno |
| `admin.ts:1241` | `POST /elections/:id/voters` | Añadir **cualquier** usuario, de cualquier dominio, a su censo |
| `admin.ts:1284` | `POST /elections/:id/candidates` | Añadir candidatos a su papeleta |
| `admin.ts:1542` | `GET /elections/:id/stats` | **Descargar el censo completo con emails y quién ha votado** (`admin.ts:1588-1595`) |

Añadidas, dos rutas sin ningún scoping:
- `GET /admin/stats/voters` (`admin.ts:963`) — participación de **todas** las elecciones de **todas** las instituciones, sin filtro.
- `POST /admin/elections/:id/notify-open` y `/notify-close` (`admin.ts:1630`, `:1681`) — enviar hasta 1.000 correos a los votantes de la elección de otro, cuantas veces se quiera.

Y una décima vía, en la creación: `POST /admin/elections` con `target_type: 'domain'` construye el censo con
```sql
SELECT DISTINCT u.id FROM users u WHERE (u.email LIKE '%@' || ? OR ...) AND u.is_approved = 1
```
(`admin.ts:604-612`) **sin validar que `target.value` pertenezca al dominio del admin**. Un admin de `uni-a.edu` puede crear una elección cuyo censo son los estudiantes de `uni-b.edu`.

**Por qué importa.** El aislamiento por dominio es la premisa del producto multi-institución. Los `isSuperAdmin(req)` / `getAdminDomain(req)` existen y se usan bien en unas rutas y se omiten en otras — no es un descuido puntual, es un patrón no sistematizado. Los IDs de elección son enteros secuenciales, así que enumerarlos es trivial.

**Rompe algo:** sí, y de forma silenciosa (no hay auditoría de acciones de admin).

**Coste de arreglo.** Un único helper, por ejemplo `assertElectionInScope(req, electionId)`, que haga un `JOIN` contra `election_access` con la misma lógica que ya usa `GET /admin/elections:512-517`, invocado al principio de las ocho rutas. Añadir el filtro de dominio a `/admin/stats/voters` y a la construcción de censo por `target_values`. **~1 día**, incluyendo un test de aislamiento por cada ruta (hoy solo existe uno, `vote.test.ts:216`, y cubre `/admin/users`).

---

## P1 — Seguridad e integridad

---

### P1-7 · El log de email guarda en claro los tokens de reset e invitación

**Dónde:** `backend/src/services/email/queue.ts:133-146` + `config/database.ts:255-273`

`insertLog()` guarda `html_body` y `text_body` completos en la tabla `email_log`. Esos cuerpos contienen la URL con el token en claro:

- `auth.ts:598` → `${frontendUrl}/auth/reset-password?token=${plaintext}`
- `admin.ts:887` e `index.ts:155` → `${frontendUrl}/auth/set-password?token=${plaintext}`

**Por qué importa.** El diseño de los tokens es correcto: se genera un valor aleatorio de 32 bytes, se envía en claro por email y se guarda **solo el SHA-256** en `password_reset_tokens` (`utils/auth.ts:209-213`). Ese cuidado se anula al escribir el cuerpo completo del correo en otra tabla de la misma base de datos. Cualquiera con lectura sobre `email_log` — un volcado, una copia de seguridad, un `.db` en el disco de Render, un futuro endpoint de "historial de emails" — puede tomar control de cualquier cuenta, incluidas las de administrador. Los tokens de invitación duran **7 días** (`admin.ts:872`).

Se guardan además todos los correos de confirmación de voto, que contienen `txHash` junto al email del votante — una tabla que relaciona identidad con transacción concreta en la cadena.

**Rompe algo:** no rompe funcionalidad, pero degrada seriamente el modelo de seguridad de los tokens.

**Coste de arreglo.** Dos opciones. (a) No guardar el cuerpo y hacer que el worker de reintento vuelva a renderizar el template desde `template_name` y los datos originales — requiere guardar los parámetros del template en lugar del HTML. (b) Guardar el cuerpo pero enmascarar los tokens con una expresión regular antes de escribir, aceptando que esos correos concretos no se puedan reintentar. La opción (b) son **~2 horas**; la (a), **~1 día**.

---

### P1-8 · La cola de email envía duplicados: dos bucles de reintento compiten sobre la misma fila

**Dónde:** `backend/src/services/email/queue.ts:185-229` frente a `queue.ts:241-295`

Hay dos mecanismos de reintento operando sobre la misma tabla, sin coordinación:

- **En memoria:** `enqueue()` (`:222`) inserta con `status='queued'` y llama a `trySend`. Si falla, marca `'failed'` y programa un `setTimeout` con backoff de 10 s → 60 s → 300 s (`:202-207`).
- **En base de datos:** `retryPendingEmails()` corre cada 5 minutos (`index.ts:221-228`) y selecciona `WHERE status IN ('queued','failed') AND attempts < 3 AND html_body IS NOT NULL` (`:258-264`).

Ningún estado distingue "en espera de un reintento programado" de "abandonado tras un reinicio". Un correo que falló el primer intento queda en `'failed'` con `attempts = 1` **y** con un `setTimeout` pendiente. Si el job de 5 minutos cae en esa ventana, lo reenvía — y luego el `setTimeout` lo reenvía otra vez. Un correo puede salir hasta tres veces.

También ocurre en el caso feliz cuando Resend tarda: la fila permanece `'queued'` mientras el envío está en vuelo, y el job la recoge como si estuviera huérfana.

**Efectos concretos.** El usuario recibe invitaciones o enlaces de reset duplicados. Peor: `retryPendingEmails` no comprueba la caducidad, así que puede reenviar un enlace de reset **ya vencido** (TTL 15 minutos, `auth.ts:526`) o **ya usado**, generando un soporte confuso.

**Añadido — saturación de Resend.** `notify-open` encola hasta 1.000 correos en un bucle `for` sin pausa (`admin.ts:1655-1665`). `enqueue` es fire-and-forget, así que se disparan 1.000 llamadas a la API de Resend prácticamente simultáneas. El plan gratuito de Resend limita a 2 peticiones por segundo: la inmensa mayoría fallará con 429, se marcarán `'failed'`, y el job de reintento las volverá a lanzar en tandas de 50 — reproduciendo el problema indefinidamente hasta agotar `attempts`.

**Rompe algo:** sí, en cuanto se envíe una notificación masiva real.

**Coste de arreglo.** Añadir un estado `'sending'` y una columna `next_retry_at`; que el worker seleccione solo `next_retry_at <= NOW()`; eliminar el `setTimeout` en memoria y dejar que el job sea el único reintentador. Añadir una pausa entre envíos (o un semáforo de concurrencia) en los bucles de notificación. **~1 día.**

---

### P1-9 · El job de notificaciones envía correos incorrectos y masivos en el primer arranque

**Dónde:** `backend/src/index.ts:105-219`

Cuatro defectos en `checkElectionNotifications()`:

1. **`toOpen` no filtra por `end_time`** (`index.ts:113-115`):
   ```sql
   SELECT ... FROM elections WHERE start_time <= ? AND is_active = 1 AND notify_open_sent_at IS NULL
   ```
   Una elección que ya **cerró** pero nunca recibió su aviso de apertura dispara correos que dicen *"La votación está ahora abierta"* con un botón "Ir a votar".

2. **`toClose` no filtra nada más que la fecha** (`index.ts:185-187`): `WHERE end_time <= ? AND notify_close_sent_at IS NULL`. Sin `is_active`, sin límite temporal. **En el primer arranque tras desplegar esta funcionalidad, toda elección histórica cuyo `end_time` haya pasado dispara un correo de "resultados disponibles" a todos sus votantes.** Con las elecciones sembradas, eso es un envío masivo inesperado.

3. **No es idempotente frente a un fallo.** `notify_open_sent_at` se actualiza **después** del bucle completo (`index.ts:173-176`). Si el proceso muere en el correo 700 de 1.000, en el siguiente arranque se reenvía a los 1.000.

4. **Duplicación si hay más de una instancia.** El `setInterval` se registra dentro del handler `listening` (`index.ts:221`). Con dos instancias, ambas ejecutan el job; ninguna toma un cerrojo, y la marca se escribe al final. Ambas envían el lote completo.

Y una consecuencia lateral del punto 1: para cada votante con `must_change_password`, el job **invalida su token de invitación anterior y genera uno nuevo** (`index.ts:138-149`). Un usuario que recibió su invitación ayer y aún no la ha usado se encuentra con que su enlace ha dejado de funcionar, sustituido por otro que también lleva a un 404 (P0-2).

**Rompe algo:** sí — envíos masivos incorrectos e invalidación de tokens en uso.

**Coste de arreglo.** Añadir `AND end_time > ?` a `toOpen`; acotar `toClose` con una ventana (por ejemplo, 24 horas) o hacer un backfill de `notify_close_sent_at` para las elecciones antiguas antes de desplegar; marcar la elección **antes** de enviar (aceptando perder un lote en caso de crash, preferible a duplicarlo) o marcar por votante; envolver el job en un cerrojo consultivo. **~4 horas.**

---

### P1-10 · Los resultados son públicos y en tiempo real durante la votación

**Dónde:** `backend/src/routes/elections.ts:404` — `router.get("/:id/results", async (req, res) => {...})`

Sin `requireAuth`. Devuelve `candidates[].votes`, `totalVotes` y `participationRate` para cualquier ID de elección, en cualquier momento — incluido el estado `'active'`, que el propio endpoint calcula y devuelve (`elections.ts:427-430`).

**Por qué importa.** Publicar el recuento parcial mientras la urna está abierta influye en el voto posterior. Es una de las propiedades básicas que se exige a un sistema electoral, y aquí no solo es visible: es un endpoint sin autenticación que cualquiera puede sondear en bucle. Para una plataforma cuyo argumento de venta es la confianza electoral, es un problema de diseño, no de implementación.

`GET /elections/:id` (`elections.ts:210`) y `GET /elections/:id/audit` (`elections.ts:503`) también son públicos. El de auditoría devuelve el `nullifier_hash` completo y el instante exacto de cada voto (`generated_at`), lo que permite correlacionar por tiempo con otras fuentes.

**Rompe algo:** rompe una garantía del producto, no el código.

**Coste de arreglo.** Devolver los recuentos solo cuando `status === 'closed'`, o solo a admins mientras esté abierta; devolver únicamente `participationRate` durante la votación. **~1 hora.** La decisión de producto (¿participación en vivo sí, recuento no?) cuesta más que el código.

---

### P1-11 · Revocación de sesión incompleta

**Dónde:** `backend/src/routes/auth.ts:342-377, 465-522, 612-660`

Cuatro huecos:

1. **Cambiar la contraseña no revoca ninguna sesión.** `PATCH /auth/change-password` (`auth.ts:369-372`) actualiza el hash y nada más. `POST /auth/reset-password` (`auth.ts:644-653`) tampoco. Un atacante que haya robado un refresh token conserva el acceso **7 días completos** después de que la víctima cambie la contraseña. Esto invalida el propio motivo por el que se cambia una contraseña comprometida.

2. **`logout` solo revoca el token presentado.** `auth.ts:509-522` marca `revoked = 1` para el refresh token de esa cookie. No hay "cerrar sesión en todos los dispositivos", ni se revoca al cambiar de contraseña.

3. **El access JWT sobrevive al logout hasta 15 minutos.** Es inherente a los JWT sin lista de revocación; el comentario de `auth.ts:505-507` lo reconoce. Los 15 minutos son una ventana razonable, pero conviene que sea una decisión explícita y no una suposición.

4. **El token CSRF es eterno e idéntico en todos los dispositivos.** `generateCsrfToken(userId, email)` (`utils/auth.ts:243-248`) es `HMAC(CSRF_SECRET, "userId:email")` — una función pura de la identidad. No rota nunca, no caduca, no está ligado a la sesión, y es el mismo en el móvil y en el portátil del usuario. Si se filtra una vez (es legible por JS por diseño: cualquier XSS o extensión del navegador lo lee), sigue siendo válido para siempre, incluso tras cerrar sesión y cambiar la contraseña. Explotarlo requiere además la cookie de acceso httpOnly, así que no es un agujero autónomo, pero elimina la defensa en profundidad que se supone que aporta.

**Además:** `refresh_tokens` no se purga nunca. Una fila por login, para siempre. Crecimiento sin límite.

**Rompe algo:** el punto 1 sí — es un fallo de seguridad real y aprovechable.

**Coste de arreglo.** Punto 1: `UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?` en los dos handlers de cambio de contraseña — **15 minutos**. Punto 4: incluir un `jti` o un `session_id` en el token CSRF y validarlo contra el refresh token activo — **~3 horas**. Purga: un `DELETE` en el job de 5 minutos — **15 minutos**.

---

### P1-12 · Cobertura de CSRF: correcta en métodos, con dos matices

**Dónde:** `backend/src/app.ts:150-176`

**Lo que está bien.** El middleware cubre **todos** los métodos que mutan estado, no solo POST: `CSRF_SAFE_METHODS = ['GET','HEAD','OPTIONS']` y todo lo demás pasa por la validación — POST, PUT, PATCH y DELETE incluidos. Se comprueba doble: que la cabecera `X-CSRF-Token` coincida con la cookie `vtb_csrf` (`app.ts:164`) **y** que el valor sea el que el servidor derivaría para ese usuario (`app.ts:170-173`), lo que impide el *cookie stuffing*. La comparación usa `crypto.timingSafeEqual` (`utils/auth.ts:255`). En el frontend, `apiClient.js:37-42` y `apiFetch:106-116` adjuntan la cabecera en todos los métodos no seguros. Está bien resuelto.

**Matiz 1 — solo se exige si hay cookie de acceso** (`app.ts:158-159`). Correcto en el modelo actual (sin cookie no hay autoridad ambiental), pero deja de serlo si algún día se añade otra forma de autenticación.

**Matiz 2 — `/auth/refresh` está exento** (`app.ts:151`). Un sitio de terceros puede forzar una rotación del refresh token de la víctima. No obtiene nada (no puede leer la respuesta ni las cookies httpOnly), pero puede provocar rotaciones repetidas y, en combinación con la ausencia de detección de reutilización, causar cierres de sesión molestos. Riesgo bajo.

**Riesgo de despliegue, más serio que los dos anteriores.** Las cookies se emiten con `sameSite: 'none'` en producción (`auth.ts:47, 84`) porque el frontend está en Vercel y el backend en Render — dominios registrables distintos. Safari (ITP) y Firefox (Total Cookie Protection) **bloquean cookies de terceros por defecto**, `SameSite=None` incluido. En esos navegadores la sesión completa puede no llegar a establecerse. El README lo menciona de pasada (`README.md:204`) pero no lo trata como limitación. La única solución robusta es servir ambos bajo el mismo dominio registrable (por ejemplo `app.tudominio.com` y `api.tudominio.com`), lo que además permitiría `sameSite: 'lax'`.

**Coste:** el matiz 2 son 10 minutos. El problema de dominio cruzado es configuración de DNS y despliegue, **~medio día**, y conviene resolverlo antes de cualquier demostración pública.

---

### P1-13 · El validador de entorno es código muerto: el proyecto no falla ruidosamente

**Dónde:** `backend/src/config/env.ts` (fichero completo, 80 líneas)

`grep -rn "config/env" backend/src/` → **cero resultados**. El fichero no se importa desde ningún sitio. Su propio comentario dice *"Llamado una sola vez al arrancar (index.ts lo importa antes de app.ts)"* — y `index.ts` no lo importa.

En consecuencia, **ninguna** de sus protecciones está activa: ni la validación de variables obligatorias en producción, ni la comprobación cruzada de `DB_CLIENT=postgres` sin `DATABASE_URL` (`env.ts:47-52`), ni los avisos de `CONTRACT_ADDRESS`/`PRIVATE_KEY`/`RESEND_API_KEY` (`env.ts:54-59`).

**Lo que sí ocurre en su lugar** es peor. `backend/src/utils/auth.ts:56-65`:
```ts
const isProduction = process.env.NODE_ENV === "production";
const HMAC_SECRET = process.env.NULLIFIER_SECRET || (!isProduction ? "dev-only-nullifier-secret-change-before-prod" : undefined);
const JWT_SECRET  = process.env.JWT_SECRET       || (!isProduction ? "dev-only-jwt-secret-change-before-prod"       : undefined);
```

**Si `NODE_ENV` no vale exactamente `"production"`, el servidor arranca con una clave de firma JWT que está escrita en el repositorio público.** Olvidar `NODE_ENV` en Render es uno de los errores de despliegue más comunes que existen. El resultado no es un fallo: es un `console.warn` en la línea 85 y un arranque aparentemente normal. Con esa clave, cualquiera puede forjar un JWT de superadmin.

El mismo olvido rompe además las cookies: `IS_PROD` gobierna `secure` y `sameSite` (`auth.ts:28, 46-47`), así que con `NODE_ENV` sin definir las cookies salen `secure: false; SameSite=Lax` y el navegador nunca las envía al backend cruzado — autenticación totalmente rota, pero de forma silenciosa.

**Respondiendo directamente a la pregunta de la PARTE 4:** el proyecto **no** falla ruidosamente si falta una variable crítica. Arranca, avisa por consola, y funciona con secretos públicos. Lo único que sí lanza es `NULLIFIER_SECRET`/`JWT_SECRET` ausentes **y** `NODE_ENV=production` a la vez (`utils/auth.ts:67-78`) — la intersección de dos condiciones, no cada una por separado.

**Rompe algo:** sí, en el escenario de despliegue más probable.

**Coste de arreglo.** Importar `config/env.ts` como primera línea de `index.ts` **y de `app.ts`** (los tests cargan `app.ts` directamente), y hacer que las variables críticas se exijan siempre que `NODE_ENV !== 'test'`, no solo en producción — el fallback de desarrollo debería requerir un `ALLOW_INSECURE_DEV_SECRETS=1` explícito. Sustituir los literales de `utils/auth.ts:56-65` por lecturas de `env`. **~2 horas.**

---

### P1-14 · El job de limpieza de `vote_attempts` marcaría como fallidos votos que sí están en la cadena

**Dónde:** `backend/src/db/postgres.ts:204-260` + `backend/src/index.ts:239-259`

Casos límite, del más grave al menor:

1. **`queryFilter` sin rango de bloques.** `index.ts:246`:
   ```ts
   await contract.queryFilter(contract.filters.VoteCast(null, nullifierHash))
   ```
   Sin `fromBlock`/`toBlock`, ethers usa el rango completo desde el bloque 0. Alchemy e Infura rechazan `eth_getLogs` sobre rangos amplios (Alchemy limita a 10.000 bloques salvo consultas acotadas). La llamada lanza, el `catch` de `index.ts:250-252` devuelve `null`, y el voto se marca `'failed'`. **En Sepolia con Alchemy — la configuración que usa este proyecto — esto va a fallar prácticamente siempre.** El job no recupera nada; solo destruye información.

2. **Cualquier excepción se traduce en "no está en la cadena".** El `catch` no distingue entre "el evento no existe" y "el RPC no responde". Un corte transitorio del proveedor convierte votos confirmados en `'failed'`.

3. **`CONTRACT_ADDRESS` sin definir → `return null` inmediato** (`index.ts:240-241`), así que **todos** los intentos pendientes se marcan `'failed'` sin consultar nada.

4. **`nullifier_hash` nulo → `'failed'` directo** (`postgres.ts:224-228`), sin ningún intento de verificación.

**Consecuencia de marcar `'failed'`:** `acquireVoteLock` permite reintentar (`postgres.ts:146-153`, cláusula `WHERE status = 'failed'`). El usuario vuelve a votar, el contrato rechaza el nullifier duplicado, y `elections.ts:855-860` responde 409 *"Ya has votado"* — pero `nullifier_audit` sigue vacía, así que el voto no aparece en los resultados. **El voto se pierde del recuento aunque esté en la cadena.** No hay doble voto (el nullifier es determinista, `utils/auth.ts:126-137`), pero sí un voto no contado.

5. **Sin límite de filas por ejecución** (`postgres.ts:207-218`) y con `await` secuencial: una acumulación grande bloquea el job durante minutos abriendo un `JsonRpcProvider` nuevo por fila (`index.ts:243`).

6. **El job entero está muerto en el despliegue actual:** `index.ts:234` lo condiciona a `dbClient instanceof PgClient`, y hoy el cliente es SQLite (P0-3). El aviso de `index.ts:74-79` recomienda cambiar a PostgreSQL "por seguridad", lo que activaría un job con estos defectos.

**Rompe algo:** sí, en cuanto se active PostgreSQL.

**Coste de arreglo.** Acotar `queryFilter` con `fromBlock` (guardar el bloque en el que se creó el intento, o partir del bloque de despliegue del contrato); distinguir "no encontrado" de "error de RPC" y **no** marcar `'failed'` en el segundo caso (dejarlo `'pending'` para el siguiente ciclo, con un contador de intentos); saltar la fila si falta `CONTRACT_ADDRESS`; añadir `LIMIT`; reutilizar un único provider. **~4 horas.**

---

### P1-15 · `GET /admin/blockchain-status` expone la URL del RPC y el error crudo

**Dónde:** `backend/src/routes/admin.ts:1494-1540`

Devuelve `rpcUrl` (líneas 1512, 1526, 1537) y `reason: err.message` (línea 1530) a cualquier usuario con `requireAdmin` — es decir, a cualquier admin de dominio, no solo al superadmin.

**Por qué importa.** En este repositorio `RPC_URL` es solo el host (`https://eth-sepolia.g.alchemy.com`) y la clave está en `ALCHEMY_API_KEY` — que, por cierto, **no se lee en ninguna parte del código** (ver P2-29). Pero la forma habitual de configurar Alchemy o Infura es incrustar la clave en la URL (`https://eth-sepolia.g.alchemy.com/v2/<API_KEY>`), y el código está preparado para aceptarla así. En el momento en que alguien configure `RPC_URL` de la manera normal, este endpoint entrega la clave del proveedor a todos los administradores. `err.message` de ethers también suele incluir la URL completa.

**Rompe algo:** no, pero es una filtración de credenciales latente con una probabilidad alta de materializarse.

**Coste de arreglo.** No devolver `rpcUrl` (o enmascararlo a host+dominio), y sustituir `err.message` por un literal. **~15 minutos.**

---

### P1-16 · `POST /registration/request` sin rate limit: oráculo de enumeración y DoS por bcrypt

**Dónde:** `backend/src/routes/registration.ts:13-127`

Ruta pública, sin `rateLimit`, sin validación `zod` (a diferencia del resto de rutas del proyecto), y sin normalización de email.

1. **Oráculo de enumeración.** 409 `"Ese email ya tiene una cuenta activa"` (`:51`) frente a 200 para un email desconocido. Confirma cuentas una a una sin ningún límite. `POST /auth/register` tiene el mismo problema: `app.ts:315` aplica `loginLimiter` únicamente a `POST /auth/login`, así que la ruta de registro también queda sin límite.

2. **DoS por CPU.** Para un email nuevo, la ruta ejecuta `hashPassword` — bcrypt con `saltRounds: 12` (`utils/auth.ts:102`), unos 250 ms de CPU en un solo hilo. Sin límite, unas decenas de peticiones por segundo saturan el proceso de Node y dejan el servidor sin responder. En el plan gratuito de Render, con una sola CPU, basta muy poco tráfico.

3. **Validación débil.** El email se valida con `email.includes("@") && email.includes(".")` (`:34`), frente al `z.string().email()` que usa el resto del proyecto. La contraseña exige 6 caracteres aquí, 8 en `/auth/register` (`auth.ts:37`), 8 en `/auth/reset-password` (`auth.ts:551`) y 6 en `/auth/change-password` (`auth.ts:350`). Cuatro políticas distintas para el mismo dato.

**Rompe algo:** el punto 2 sí, bajo carga o ataque.

**Coste de arreglo.** Aplicar un `rateLimit` por IP y por email (el patrón ya existe en `auth.ts:531-543`, `forgotEmailLimiter`), sustituir la validación manual por un esquema `zod`, y unificar la longitud mínima de contraseña en una constante compartida. **~2 horas.**

---

### P1-17 · Los emails no se normalizan a minúsculas: cuentas creadas que no pueden entrar

**Dónde:** `auth.ts:157` frente a `auth.ts:121`, `auth.ts:286`, `admin.ts:286`, `admin.ts:861`, `registration.ts:76`

El login normaliza:
```ts
auth.ts:157   const normalizedEmail = email.trim().toLowerCase();
auth.ts:171   "SELECT ... FROM users WHERE email = ? AND deleted_at IS NULL", [normalizedEmail]
```

Pero **ninguna** de las cinco rutas que crean usuarios normaliza antes de insertar: `POST /auth/register` (`auth.ts:121-125`), `POST /auth/admin/register` (`auth.ts:286-290`), `POST /admin/users` (`admin.ts:285-290`), el import de votantes (`admin.ts:860-866`) y el auto-approve por whitelist (`registration.ts:75-79`).

**Consecuencia.** Un usuario importado por CSV como `Juan.Perez@uni.edu` se guarda con esa capitalización. Al intentar entrar, el login busca `juan.perez@uni.edu` y no encuentra nada. Recibe *"Email o contraseña incorrectos"* y **no hay ninguna forma de arreglarlo desde la interfaz**. Los CSV exportados desde Excel o desde un sistema académico conservan la capitalización original con mucha frecuencia — esto no es un caso hipotético.

Efecto secundario: `UNIQUE(email)` es sensible a mayúsculas en SQLite, así que `Juan@uni.edu` y `juan@uni.edu` conviven como dos cuentas distintas. En PostgreSQL, `TEXT UNIQUE` se comporta igual.

Curiosamente `email_whitelist` **sí** normaliza (`admin.ts:355`, `registration.ts:69`), lo que confirma que el problema es la falta de un punto único de normalización, no un descuido aislado.

**Rompe algo:** sí, y de forma silenciosa e irrecuperable para el usuario afectado.

**Coste de arreglo.** Normalizar en las cinco rutas de inserción, y una migración de datos que haga `UPDATE users SET email = lower(email)` detectando colisiones antes. **~3 horas** con la migración.

---

### P1-18 · `AdminPanel.jsx` lee claves de localStorage que ya nadie escribe

**Dónde:** `frontend/src/pages/AdminPanel.jsx:26-30`

```jsx
26  // Domain scoping — reads from vtb-user JSON (the only key AuthContext writes)
27  const _vtbUser = (() => { try { return JSON.parse(localStorage.getItem('vtb-user') || '{}'); } catch { return {}; } })();
28  const adminDomain = _vtbUser.adminDomain || '';
29  const userRole = _vtbUser.role || '';
30  const isSuperAdmin = userRole === 'superadmin';
```

El comentario de la línea 26 es de la era anterior a las cookies. `AuthContext.jsx:69` dice explícitamente *"Never touches localStorage"*, y el único código que toca `vtb-user` es `utils/auth.js:12`, que lo **borra**. `AdminPanel.jsx` — 2.271 líneas, el fichero más grande del frontend — **nunca llama a `useAuth()`** (verificado: `grep -n "useAuth" src/pages/AdminPanel.jsx` no devuelve nada).

Así que, de forma permanente: `_vtbUser = {}`, `adminDomain = ''`, `userRole = ''`, `isSuperAdmin = false`.

**Efectos observables:**
- `isSuperAdmin` es siempre `false`, incluso para un superadmin. Toda la interfaz condicionada a esa bandera (`:604`, `:709`, `:926`) se comporta como si no lo fuera.
- Las etiquetas "Gestionando: @dominio" (`:606`, `:711`, `:928`) nunca aparecen. Un admin de dominio no ve en ningún sitio cuál es su alcance.
- `<OnboardingTour userId={_vtbUser.id || _vtbUser.email} />` (`:596`) recibe siempre `undefined`. En `OnboardingTour.jsx:16-19`, `makeTourKey` devuelve `null`, y el `useEffect` sale en la línea 28 con `if (!key) return`. **El tour de onboarding del panel de administración nunca se ejecuta.**

Una nota tranquilizadora: `AdminPanel.jsx:311` usa `adminDomain || '*'` al construir el payload de creación de elección, lo que parecería enviar `'*'` siempre. No tiene consecuencias de seguridad: el backend descarta `target_values` cuando `target_type === 'all'` y usa su propio `getAdminDomain(req)` (`admin.ts:580-583`).

`Dashboard.jsx:194` tiene el mismo patrón pero como *fallback* detrás de `user?.role`, así que allí es inocuo. `UserProfile.jsx:323-331` también lee esas claves, pero solo para limpiar flags del tour.

**Rompe algo:** sí — funcionalidad de UI que existe y no se ve.

**Coste de arreglo.** Sustituir las líneas 27-30 por `const { user } = useAuth()` y derivar de ahí. **~30 minutos**, más una revisión de las ~10 referencias.

---

### P1-19 · Accesibilidad: ningún campo de formulario está asociado a su etiqueta

**Dónde:** todo el frontend. Medición sobre `frontend/src/`:

| Señal | Cuenta |
|---|---|
| `<input>` | 47 |
| `<input>` con `id=` | **0** |
| `<label>` | 47 |
| `<label>` con `htmlFor=` | **2** |
| `aria-live` | **0** |
| `sr-only` | **0** |
| `aria-describedby` | **0** |
| `aria-current` | **0** |
| `aria-modal` | 1 |
| `aria-label` | 8 |
| `role=` | 4 |
| `onKeyDown` | 1 |
| `<img>` / `alt=` | 3 / 3 ✅ |
| `focus-visible` / `focus:ring` | 30 / 50 ✅ |

**1. Etiquetas no asociadas — el problema principal.** Ni un solo `<input>` del proyecto tiene `id`, y solo 2 de 47 `<label>` tienen `htmlFor`. Las etiquetas tampoco envuelven al input (comprobado en `Login.jsx:314-330` y `RegisterRequest.jsx:230-290`: son elementos hermanos). Para un lector de pantalla, **todos** los campos de login, registro, cambio de contraseña y del panel de administración son "cuadro de texto en blanco". Es un incumplimiento de WCAG 2.1 nivel A (criterio 1.3.1 / 4.1.2), no una mejora estética. Para un proyecto de votación institucional, que muy probablemente tenga que cumplir requisitos de accesibilidad del sector público, es un bloqueante.

**2. Sin regiones live.** Cero `aria-live`. Los toasts de `react-hot-toast`, el progreso del voto (`VotingBooth`, con estados "Calculando prueba" → "Enviando" → "Confirmando") y los errores de validación no se anuncian. Un usuario ciego emite un voto y no recibe confirmación auditiva de que se ha registrado.

**3. Modales sin semántica ni trampa de foco.** Un solo `aria-modal` en todo el proyecto, un solo `onKeyDown` (así que no hay cierre con Escape generalizado), cero `autoFocus`, un solo `tabIndex`. `VoteModal`, `DemoLoginModal` y los diálogos de confirmación de `AdminPanel` no capturan el foco: con el teclado se tabula "por detrás" del overlay hacia la página subyacente.

**4. Sin enlace de salto** (`sr-only` = 0). `Navbar.jsx` tiene 431 líneas de navegación que hay que atravesar con Tab en cada página.

**5. Sin `aria-current`.** La navegación no indica la página activa a los lectores de pantalla.

**Lo que sí está bien:** las 3 imágenes tienen `alt`; los estilos de foco están bien cubiertos (30 `focus-visible` + 50 `focus:ring`); no hay ni un solo `onClick` sobre un `<div>` o `<span>` (verificado: 0 coincidencias), así que todo lo interactivo es un elemento nativo enfocable — eso es más de lo que suele encontrarse. El contraste de los tokens de diseño está documentado y verificado en `index.css:22` (`--vtb-muted` a 7,55:1 sobre blanco).

**Rompe algo:** rompe la usabilidad para usuarios de lector de pantalla, que es una parte del público objetivo de un sistema de votación institucional.

**Coste de arreglo.** Los puntos 1 y 5 son mecánicos: añadir `id` a cada input y `htmlFor` a su label (o usar `useId()` de React). Los puntos 2-4 requieren un componente `<Modal>` compartido con trampa de foco y un contenedor `aria-live` global. **~2 días** para dejar los formularios conformes; **~3 días** con modales y regiones live.

---

## P2 — Consistencia, deuda y mejoras

---

### P2-20 · Los mensajes de error de la API mezclan dos idiomas

**Respuesta a la pregunta:** no, no están en un solo idioma. De 172 literales de `error`/`message`/`details` en las rutas, **11 están en inglés** en una API por lo demás en español:

| Fichero:línea | Texto |
|---|---|
| `app.ts:187` | `Too many login attempts. Try again in 15 minutes.` |
| `app.ts:248` | `Error getting org units` |
| `app.ts:285` | `Sync started` |
| `app.ts:341` | `Error fetching schools and degrees` |
| `admin.ts:773` | `Election updated` |
| `admin.ts:796` | `Image uploaded successfully` |
| `admin.ts:1370` | `Org unit ${name} created` |
| `auth.ts:373` | `Password updated successfully` |
| `elections.ts:197` | `Fixed ${n} elections` |
| `elections.ts:684` | `Demo vote registered (synthetic — not on real blockchain)` |
| `registration.ts:105, 121` | `Your account has been automatically approved!…` / `Registration request submitted successfully…` |

Los dos últimos son los más visibles: son las **respuestas que ve un usuario final al registrarse**, en una interfaz que por defecto está en español (`i18n/config.ts:1154`, `fallbackLng: "es"`).

Hay otros cinco en el array `results.errors` del import CSV, que se pintan en el panel de administración: `Skipped row with missing data`, `Domain not allowed: ${email}`, `New user ${email} missing full_name or student_id`, `Error creating ${email}`, `Row missing email` (`admin.ts:337, 348, 838, 850, 858`).

También hay inglés en la interfaz: `RegisterRequest.jsx:261, 271, 282` tiene las etiquetas `School / Faculty`, `Degree / Programme` y `Year` escritas a mano en inglés, mientras los campos vecinos usan `t()`. Y `CookieBanner.jsx` está entero en inglés.

**Coste:** traducir los 16 literales y mover los de `RegisterRequest` a `t()`. **~1 hora.** La decisión de fondo — si la API debe devolver texto legible o códigos que el frontend traduzca — es más importante que el arreglo: hoy hay 172 cadenas fuera del sistema i18n, lo que hace que la API sea intraducible.

---

### P2-21 · Las respuestas de la API no tienen una forma común

**Respuesta a la pregunta:** no. Conviven al menos ocho formas distintas.

**Errores:**
- `{ error }` — mayoritaria
- `{ error, code }` — `MUST_CHANGE_PASSWORD` (`app.ts:131-134`), `CSRF_MISMATCH` (`app.ts:165`), `ACCOUNT_PENDING_APPROVAL` (`auth.ts:181-184`), `ELECTION_NOT_ON_CHAIN` (`elections.ts:838-842`)
- `{ error, details }` — `elections.ts:847, 855, 860`
- `{ error, required: [...] }` — `auth.ts:255-258`, `admin.ts:1394-1397`
- `{ eligible: false, reason }` con **HTTP 200** para "no encontrado" — `elections.ts:353` devuelve 200 donde el resto del proyecto devuelve 404

**Éxitos:**
- `{ success: true, ... }` — mayoritaria
- `{ message, tempPassword }` sin `success` — `admin.ts:1153-1157`
- `{ message }` sin `success` — `registration.ts:104-107, 120-122`
- `{ valid: true, user }` — `auth.ts:229-235`
- **Un array desnudo** — `GET /elections/:id/audit` hace `res.json(auditData)` (`elections.ts:551`); es la única ruta del proyecto que devuelve una colección sin envolverla en un objeto

**Y dos formas de paginación incompatibles:**
```
admin.ts:243-250   { users, pagination: { page, limit, total, totalPages } }
admin.ts:1039-1044 { requests, total, page, pageSize }
```

**Coste:** definir un contrato (`{ data, error, meta }` o similar), un par de helpers `ok()`/`fail()`, y migrar las ~60 rutas. **~2 días**, y hay que tocar el frontend en paralelo. Es la clase de deuda que conviene pagar antes de que la superficie de la API siga creciendo.

---

### P2-22 · 89 usos de `any`, concentrados en dos ficheros

**Respuesta a la pregunta:** quedan **89**, así distribuidos:

| Fichero | `any` |
|---|---|
| `routes/admin.ts` | **37** |
| `app.ts` | **16** |
| `routes/auth.ts` | 8 |
| `services/email/queue.ts` | 3 |
| `scripts/syncElections.ts` | 3 |
| `routes/elections.ts` | 3 |
| `db/sqlite-adapter.ts` | 3 |
| `config/database.ts` | 3 |
| `scripts/seedDatabase.ts` | 2 |
| `routes/registration.ts` | 2 |
| `services/email/client.ts` | 1 |
| `middleware/auth.ts` | 1 |

Los patrones dominantes son `db.run<any>(...)` (~25 casos, evitables declarando la forma de la fila como ya se hace en el resto del proyecto), `catch (err: any)` (~30, sustituibles por `catch (err: unknown)` con un `narrow`), y `(req: any, res: any, next: any)` en los middlewares de `app.ts` (~10, resolubles importando los tipos de Express, que ya están instalados).

El tipado global compila limpio (`tsc --noEmit` sin errores), así que esto es deuda, no un fallo.

**Coste:** ~1 día para bajar de 89 a menos de 15. Los `any` en `catch` son mecánicos.

---

### P2-23 · `admin.ts` sigue sin partir: 1.730 líneas y 30 rutas

**Respuesta a la pregunta:** no, sigue igual. Es el 26 % del backend en un solo fichero. Contiene siete dominios distintos:

| Bloque | Líneas | Rutas |
|---|---|---|
| Helpers y parseo CSV | 48-116 | — |
| Dashboard y estadísticas | 118-205, 963-990, 1542-1620 | 3 |
| Usuarios | 206-497 | 5 |
| Elecciones | 499-923 | 6 |
| Auditoría | 925-961 | 1 |
| Solicitudes de registro | 991-1198 | 2 |
| Censo, dominios, candidatos | 1200-1312 | 3 |
| Unidades organizativas | 1314-1382 | 2 |
| Admins de dominio y dominios | 1384-1492 | 3 |
| Blockchain | 1494-1540 | 1 |
| Notificaciones | 1622-1728 | 2 |

También concentra 37 de los 89 `any` (P2-22) y siete de los diez fallos de aislamiento multi-tenant (P0-6) — la correlación entre tamaño y densidad de defectos no es casual.

**División natural:** `admin/users.ts`, `admin/elections.ts`, `admin/registrations.ts`, `admin/organizations.ts`, `admin/system.ts`, más `admin/helpers.ts` con `isSubDomain`, `parseCSV`, `autoAssignUsersByDomain` y el helper de scoping que hace falta para P0-6.

**Coste:** **~4 horas** de movimiento mecánico. Merece la pena hacerlo **junto con** P0-6, porque el helper de scoping es la pieza que da sentido a la separación.

---

### P2-24 · Código muerto tras el rediseño

**a) `frontend/src/components/VoteModal.jsx` — 239 líneas, importado por nadie.**
Verificado: `grep -rl "from.*VoteModal"` → cero resultados. Es el ejemplo más claro de componente atrapado entre los dos sistemas:
- Diseño antiguo completo: `bg-slate-800`, `bg-slate-900`, `border-emerald-500/30`, `text-white`, cero clases `dark:`
- Llama a `${API_URL}/elections/register-vote` (`:38`) — la ruta real es `/api/elections/register-vote`
- Usa `fetch` sin `credentials: 'include'` y sin cabecera CSRF, saltándose `apiClient`
- Envía `voteHash: user.id` (`:45`), que no pasa el `zod` del backend (`elections.ts:15` exige `/^0x[0-9a-fA-F]{64}$/`)
- Textos en español a pelo, sin `t()`
- Contiene los restos de "credencial anónima" del PARTE 1

Nada de esto llega al bundle (Vite elimina los módulos no importados), así que es deuda pura. **Borrar: 5 minutos.**

**b) Todo el sistema de componentes CSS de `index.css` está sin usar.**
Verificado con `grep` sobre `src/**/*.jsx`, excluyendo la propia definición: **cero usos** de `.vtb-btn-primary`, `.vtb-btn-secondary`, `.vtb-btn-danger`, `.vtb-card`, `.vtb-input`, `.skeleton`, `.animate-fadeIn`, `.animate-slideInRight` y `.animate-pulse-glow`. Son las líneas 63-144 de `index.css` — unas 60 líneas de un sistema de diseño que se definió y nunca se adoptó; los componentes repiten las utilidades de Tailwind a mano.

Las variables CSS `--vtb-primary`, `--vtb-primary-hover`, `--vtb-primary-wash`, `--vtb-ground`, `--vtb-border-warm`, `--vtb-muted`, `--vtb-success` y `--vtb-warning` (`index.css:16-26`) tampoco se referencian: `grep "var(--vtb"` → **0 coincidencias**. Solo `--font-mono-vtb` se usa, y a través de `.font-mono-vtb` (7 usos). `.tabular` sí se usa (8 veces).

En `tailwind.config.js` están huérfanas las paletas `voting` (0 usos) y `blockchain` (2 usos residuales), y los tres gradientes `gradient-vtb`, `gradient-voting` y `gradient-hero` (0 usos cada uno), todos etiquetados como *"kept for backwards compat"*.

**c) 180 de 463 claves i18n sin usar (39 %).**
La paridad EN/ES es perfecta (463 y 463, sin ninguna clave descolgada — eso está bien cuidado). Pero 180 no se referencian desde ningún componente. Los bloques mayores: `landing.about.*` (11 claves), `landing.architecture.*` (15), `landing.useCases.*` (7), `landing.features.*` (9). Son los textos de la landing anterior al rediseño, que quedaron en el fichero cuando la página se reescribió. Multiplicado por dos idiomas, son unos 360 literales que sí llegan al bundle: `i18n/config.ts` son 1.166 líneas dentro del chunk principal.

**d) Dependencias sin usar.**
- **`react-is` (^19.2.5)** — `grep -rl "react-is" frontend/src/` → cero. Es una dependencia transitiva de `recharts` promovida a directa. Y su versión mayor (19) no coincide con React (^18.2.0), lo que puede provocar comportamientos raros en `recharts` si el resolutor la eleva.
- **`html2canvas` (^1.4.1)** — cero usos directos. Llega igualmente por `jspdf` (que la carga de forma diferida), así que declararla como dependencia directa solo la fija a una versión sin motivo.
- **`ethers` (^6.11.1)** en el frontend — un solo uso, en `VotingBooth.jsx`. Vale la pena comprobar si ese uso es imprescindible: es una librería muy grande dentro del chunk principal.

**Coste total del bloque:** borrar `VoteModal.jsx`, limpiar `index.css` y `tailwind.config.js`, purgar las 180 claves i18n y quitar `react-is` y `html2canvas` de `package.json`. **~3 horas**, con poco riesgo si se hace clave a clave verificando el grep.

---

### P2-25 · Tamaño del bundle: 807 kB en el chunk principal y ningún `React.lazy`

**Salida real de `npm run build`:**

```
dist/assets/index-7GxRg5di.js            807,66 kB │ gzip: 253,53 kB   ← principal
dist/assets/recharts-BLy4vIIw.js         538,17 kB │ gzip: 161,68 kB
dist/assets/jspdf.es.min-DPOfrs25.js     390,41 kB │ gzip: 128,66 kB
dist/assets/html2canvas.esm-QH1iLAAe.js  202,38 kB │ gzip:  48,04 kB
dist/assets/index.es-Dwt5J0DM.js         159,36 kB │ gzip:  53,43 kB
dist/assets/framer-motion-CYgILmBc.js    109,53 kB │ gzip:  37,21 kB
dist/assets/purify.es-DP5U8-sc.js         29,17 kB │ gzip:  10,99 kB
dist/assets/index-0tKUdq_N.css            68,71 kB │ gzip:  10,70 kB
```

**Qué lo infla, y un matiz importante sobre `vite.config.js`.**

El comentario de `vite.config.js:10-13` dice que `recharts` y `framer-motion` se sacan del bundle principal *"para que la carga inicial del votante sea más rápida"*. **Eso no es lo que ocurre.** `manualChunks` separa el código en ficheros distintos, pero no lo hace diferido: como `App.jsx:16-27` importa las 13 páginas de forma **estática** y no existe **ni un solo `React.lazy` ni `Suspense`** en el proyecto (verificado: 0 coincidencias), esos chunks son dependencias estáticas del principal y el navegador los descarga igualmente en la carga inicial. Un visitante que solo abre `/landing` se descarga los 538 kB de `recharts`, que solo usan `AdminPanel` y `ElectionResults`.

Total en la primera visita: **≈1,45 MB sin comprimir / ≈460 kB gzip**, más los ~30 kB de la fuente IBM Plex que `index.css:9` trae de Google Fonts.

Lo que sí está bien resuelto: `jspdf` **sí** se importa de forma diferida (`ElectionResults.jsx:104`, `await import('jspdf')`), y por eso sus 390 kB — junto con `html2canvas`, `purify` y el chunk `index.es` — solo se descargan al pulsar "exportar PDF". Esos 780 kB no están en la ruta crítica. Ese patrón es exactamente el que falta en el resto.

Dentro de los 807 kB del chunk principal, los grandes contribuyentes son React + ReactDOM, `react-router-dom`, `ethers` (usado solo en `VotingBooth`), `i18next` + las 1.166 líneas de `config.ts` (39 % de ellas sin usar, P2-24c), `react-joyride` (usado solo en un onboarding que en el panel de administración ni siquiera se ejecuta, P1-18) y `react-qr-code`.

**El propio `index.html:29-31` lo reconoce**, con una pantalla de arranque cuyo comentario dice *"this bundle ships recharts + framer-motion + jsPDF, ~250KB gzip main chunk"*. La solución elegida fue tapar el hueco visual en lugar de reducir el bundle.

**Coste de arreglo.** Convertir las rutas a `React.lazy` + `Suspense` en `App.jsx` — **~2 horas** — bajaría el chunk inicial en torno a un 45-55 %: `recharts`, `ethers` y `react-joyride` desaparecerían de la primera carga. Cargar `i18next` por idioma en lugar de embeber ambos son otras **~2 horas**. Purgar las 180 claves muertas es gratis (P2-24c).

**Sobre errores de consola.** No he podido ejecutar la aplicación en un navegador dentro de esta sesión, así que esta parte de la PARTE 5 queda sin verificar empíricamente. El candidato más probable está identificado: el comentario de `index.html:31` dice que la pantalla de arranque la limpia `main.jsx`, pero `main.jsx` no contiene ningún código que la elimine — funciona porque `createRoot().render()` vacía el contenedor implícitamente, y React 18 emite un aviso en consola cuando el contenedor tiene hijos previos. Los otros dos candidatos son los 403 sin manejar de P0-4 y los errores de red de `Landing.jsx:36` y `Transparency.jsx:14` cuando el backend de Render está dormido.

---

### P2-26 · Modo oscuro a medias: el `<body>` no lo soporta y nueve componentes no tienen ni una clase `dark:`

**Dónde:** `frontend/src/index.css:45-48` y `frontend/src/context/ThemeContext.tsx:17-28`

`ThemeProvider` toma por defecto la preferencia del sistema (`ThemeContext.tsx:25-27`), así que un usuario con el sistema en oscuro **entra directamente en modo oscuro**, sin haberlo elegido. Y en `index.css:45-48`:
```css
body { @apply bg-white text-slate-900 antialiased; }
```
Sin variante `dark:`. `index.css` tiene **cero** ocurrencias de `dark:` en todo el fichero. El fondo del documento es blanco siempre.

Cobertura de `dark:` por fichero:

| Fichero | `dark:` | Líneas |
|---|---|---|
| `AdminPanel.jsx` | 267 | 2.271 |
| `VotingBooth.jsx` | 75 | 1.069 |
| `ElectionResults.jsx` | 60 | 779 |
| `Pricing.jsx` | 46 | 435 |
| `Navbar.jsx` | 44 | 431 |
| `InstitutionPortal.jsx` | 36 | 538 |
| `Landing.jsx` | 35 | 398 |
| `RegisterRequest.jsx` | 23 | 357 |
| `Login.jsx` | 18 | 474 |
| `Transparency.jsx` | 17 | 90 |
| `Dashboard.jsx` | **10** | **451** |
| `ChangePassword.jsx` | 10 | 122 |
| `DemoLoginModal.jsx` | 10 | 154 |
| `LoadingSpinner.jsx` | 4 | 69 |
| **`UserProfile.jsx`** | **0** | **549** |
| **`NotFound.jsx`** | **0** | 39 |
| **`VoteModal.jsx`** | **0** | 239 |
| **`OnboardingTour.jsx`** | **0** | 100 |
| **`ErrorBoundary.jsx`** | **0** | 85 |
| **`CookieBanner.jsx`** | **0** | 104 |
| **`Spinner.jsx`** | **0** | 23 |
| **`DemoModeButton.jsx`** | **0** | 18 |

`UserProfile.jsx` son 549 líneas sin una sola variante oscura: en modo oscuro se renderiza con paleta clara sobre un fondo que otros componentes sí han oscurecido. `Dashboard.jsx` tiene 10 clases `dark:` en 451 líneas, que es cobertura testimonial. `NotFound.jsx` es además la página a la que llegan todos los enlaces de email rotos de P0-2.

**Coste.** Añadir la variante oscura al `body` son 2 minutos y arregla el fallo más visible. Cubrir `UserProfile` y `Dashboard` correctamente, **~1 día**. Alternativa mucho más barata y defendible: **quitar el modo oscuro**. No está terminado, no está probado, y ninguna de las páginas críticas (votación, resultados) depende de él. Eliminar `ThemeProvider`, el toggle de `Navbar` y `darkMode: "class"` es **~2 horas** y suprime de golpe 1.023 clases y una inconsistencia visual entera.

---

### P2-27 · No hay ni una sola transacción en todo el backend

**Dónde:** `backend/src/db/postgres.ts:173-187` (implementación) — `grep -rn "\.transaction(" backend/src/` fuera de `db/` → **cero llamadas**.

`PgClient.transaction()` está bien escrito: `BEGIN`, ejecuta, `COMMIT`, `ROLLBACK` en `catch`, `client.release()` en `finally` (así que **no hay fuga de conexiones** — la respuesta directa a esa pregunta de la PARTE 2 es que la única fuga posible sería un `ROLLBACK` que lanzara, y aun así el `finally` libera). El problema es que **nunca se invoca**.

Las operaciones que deberían ser atómicas y no lo son:

1. **Aprobar una solicitud de registro** (`admin.ts:1105-1155`): `INSERT users` → `UPDATE registration_requests` → N × `INSERT election_voters`. Si falla en el paso 2, el usuario existe pero la solicitud sigue `'pending'`; al reintentar, el `INSERT` choca con `UNIQUE(email)` y la solicitud queda bloqueada para siempre.
2. **Crear una elección** (`admin.ts:568-712`): `INSERT elections` → N × `election_targets` → N × `election_access` → N × `election_voters` → transacción on-chain → `UPDATE election_id_blockchain`. Puede quedar una elección sin censo o sin ID de blockchain.
3. **Rotar el refresh token** (`auth.ts:495-496`): `UPDATE ... revoked = 1` → `setSessionCookies` (que inserta el nuevo). Si falla el segundo, el usuario pierde la sesión con el antiguo ya revocado.
4. **`setSessionCookies`** (`auth.ts:66-87`): `INSERT refresh_tokens` seguido de `res.cookie(...)` × 3. Si el `INSERT` falla, se emiten cookies con un refresh token inexistente.
5. **Auto-approve por whitelist** (`registration.ts:72-102`): `INSERT users` → `UPDATE email_whitelist` → N × `INSERT election_voters`, cada uno con su propio `.catch(() => {})`.

**Y en el patrón general:** el código está lleno de `.catch(() => {})` silenciosos (unos 20) que descartan fallos de escritura sin registrarlos. Combinados con la ausencia de transacciones, un fallo parcial no deja rastro en ninguna parte.

**Coste:** envolver los cinco flujos en `db.transaction(...)` es **~4 horas** — pero **depende de resolver P0-3 primero**, porque `SqliteAdapter.transaction` (`sqlite-adapter.ts:165-169`) es un no-op que ejecuta el callback tal cual: no hay `BEGIN` ni `ROLLBACK`. Hoy la atomicidad es imposible aunque se escribiera el código.

---

### P2-28 · `requireAuth` no consulta la base de datos: un usuario borrado sigue operando 15 minutos

**Dónde:** `backend/src/middleware/auth.ts:33-55`

`requireAuth` valida el JWT y rellena `req.user` desde el propio token. No consulta `users`. `requireAdmin` (`:62-98`) **sí** lo hace y comprueba `deleted_at IS NULL` (`:81`), precisamente para detectar degradaciones de rol a mitad de sesión — el comentario de la línea 60 lo dice explícitamente.

**Consecuencia:** un usuario borrado lógicamente (`DELETE /admin/users/:id` → `admin.ts:483-486` hace `UPDATE users SET deleted_at = ...`) conserva acceso a todo lo protegido con `requireAuth` hasta que su JWT caduque, hasta 15 minutos. Puede votar en ese intervalo: `POST /register-vote` (`elections.ts:635-641`) comprueba `is_eligible` pero **no** `deleted_at`.

Es una ventana pequeña y `requireAdmin` está bien cubierto, así que el riesgo real es acotado — pero en un sistema de votación "el voto de una persona dada de baja se contó" es un problema difícil de explicar.

**Coste:** añadir `AND deleted_at IS NULL` a la consulta de `elections.ts:636` es **5 minutos** y cierra el caso importante. Hacer que `requireAuth` consulte la base de datos es **30 minutos**, a costa de una consulta más por petición (que en la práctica ya se está pagando: el guard de `must_change_password` de `app.ts:126-129` hace exactamente ese `SELECT` en **cada** petición autenticada — dos consultas donde debería haber una).

---

### P2-29 · Variables de entorno: documentadas y no leídas, leídas y no documentadas

**Respuesta directa a la PARTE 4.**

**Leídas en el código y ausentes de todo `.env.example`:**

| Variable | Dónde se lee | Documentada en |
|---|---|---|
| `DB_CLIENT` | `db/index.ts:21`, `index.ts:73` | Solo README (8 menciones) |
| `DATABASE_URL` | `db/index.ts:24` | Solo README (5 menciones) |
| `CSRF_SECRET` | `utils/auth.ts:94` | Solo README (1 mención) |

Las tres faltan tanto en `.env.example` como en `backend/.env.example`. `DB_CLIENT` es la variable que gobierna P0-3, así que su ausencia del ejemplo canónico no es un detalle menor.

**Presentes en el `.env.example` raíz y no leídas por nadie** (verificado con `grep` sobre `backend/src`, `frontend/src` y `blockchain/`):

`JWT_EXPIRATION`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `LOG_LEVEL`, `HARDHAT_NETWORK`, `ENABLE_BLOCKCHAIN_FEED`, `ENABLE_NULLIFIER_AUDIT`.

Los cuatro `SMTP_*` son especialmente engañosos: el servicio de email es Resend desde hace tiempo (`services/email/client.ts`), y ni `RESEND_API_KEY` ni `RESEND_FROM` aparecen en el `.env.example` raíz. Alguien que configure el proyecto siguiendo ese fichero rellenará credenciales SMTP que no se leen y no configurará las que sí.

En `.env` y `backend/.env` (locales, no versionados) hay además `EMAIL_DOMAIN`, `LOG_FORMAT`, `RATE_LIMIT_LOGIN_ATTEMPTS`, `RATE_LIMIT_LOGIN_WINDOW_MS`, `SEPOLIA_RPC_URL` y `ALCHEMY_API_KEY`, **ninguna de las cuales se lee en el código**. `HMAC_SECRET` está en `.env.example` pero solo lo lee `config/env.ts`, que es código muerto (P1-13) — es decir, tampoco se usa.

**Valores por defecto peligrosos que siguen en el código como fallback:**

| Fichero:línea | Fallback | Riesgo |
|---|---|---|
| `utils/auth.ts:58-65` | `"dev-only-nullifier-secret-change-before-prod"`, `"dev-only-jwt-secret-change-before-prod"` | **Alto** — claves de firma públicas si `NODE_ENV ≠ "production"`. Ver P1-13 |
| `db/postgres.ts:115-118` | `ssl: { rejectUnauthorized: false }` en producción | Desactiva la validación del certificado del servidor de base de datos: acepta cualquier certificado, incluido el de un atacante en la ruta |
| `services/email/client.ts:15-16` | `'VoteTrustBlock <onboarding@resend.dev>'` | Remitente compartido de pruebas de Resend, que solo entrega a la primera dirección verificada de la cuenta. El código avisa por consola (`:8-13`) pero arranca igual |
| `elections.ts:32, 37`; `index.ts:243`; `admin.ts:1497` | `RPC_URL` → `'http://localhost:8545'` | En producción intenta hablar con un nodo local inexistente; cada camino falla de forma distinta |
| `.env.example:16-17`; `backend/.env.example` | `CONTRACT_ADDRESS=0x000…0`, `PRIVATE_KEY=0x000…0` | Una clave privada de todo ceros es un valor válido para ethers; produce errores oscuros en lugar de un fallo claro |
| `auth.ts:594`, `admin.ts:882`, `index.ts:101` | `FRONTEND_URL` → `'http://localhost:5173'` | Si falta en producción, **todos los enlaces de los emails apuntan a localhost**. Silencioso |

**Coste.** Sincronizar los dos `.env.example` con la lista real de variables leídas (18 en el backend, 4 en el frontend), borrar las nueve obsoletas, y eliminar los fallbacks de secretos: **~2 horas**, y hay que hacerlo junto con P1-13 para que la validación tenga efecto.

---

### P2-30 · El aviso de cookies afirma algo que ya no es cierto

**Dónde:** `frontend/src/components/CookieBanner.jsx:55`

```
VTB stores your auth token and preferences in browser local storage.
```

Es falso desde la migración a cookies: el token de acceso es una cookie httpOnly y nada relacionado con la autenticación toca `localStorage` (verificado en PARTE 1). Irónicamente, las líneas 29-30 del mismo componente **sí** describen correctamente `vtb_auth` y `vtb_refresh` como cookies httpOnly — el texto del párrafo 55 quedó del sistema anterior.

Un aviso de privacidad que describe mal dónde se guardan los datos del usuario es un problema de cumplimiento, no solo de redacción, en un producto dirigido a instituciones públicas. El componente está además íntegramente en inglés dentro de una interfaz cuyo idioma por defecto es el español, y no usa `t()` en ninguna línea.

**Coste:** reescribir el párrafo y pasar el componente a i18n. **~30 minutos.**

---

## Orden de trabajo sugerido

Si hay que elegir, este es el orden por relación impacto/coste:

**Antes de enseñar el proyecto a nadie:**
1. **P0-1** — comprobar y neutralizar `superadmin@vtb.system` en producción (1 h)
2. **P1-13** — importar `config/env.ts` y eliminar los fallbacks de secretos (2 h)
3. **S19** — quitar los 9 `err.message` (20 min)
4. **P0-5** — validar `role` y `admin_domain` en `POST /admin/users` (30 min)

**Para que el producto funcione de punta a punta:**
5. **P0-2** — páginas de set-password / reset-password y corregir las URLs de email (1 día)
6. **P0-4** — desbloquear `must_change_password` (2 h)
7. **P1-17** — normalizar emails a minúsculas + migración (3 h)
8. **P0-6 + P2-23** — helper de scoping por dominio y partir `admin.ts` a la vez (1,5 días)

**Decisión de arquitectura, antes de invertir más:**
9. **P0-3** — decidir si PostgreSQL es un requisito. Si no lo es, sacarlo del README (1 h) y cerrar de paso P1-14 y buena parte de P2-27. Si lo es, son 3-5 días.

**Presentación y calidad:**
10. **P1-19** — `id` + `htmlFor` en los 47 campos (medio día por sí solo, el resto de a11y aparte)
11. **P2-25** — `React.lazy` en las rutas (2 h, la mejora más visible por hora invertida)
12. **P2-26** — decidir si el modo oscuro se termina o se quita
13. **P2-24** — barrido de código muerto (3 h)

---

## Lo que está bien y no conviene tocar

Para no perder de vista lo que ya funciona: la generación de nullifiers y su determinismo; el esquema de tokens de un solo uso (hash en base de datos, plano solo en el email); la cobertura CSRF por método, con doble validación y comparación en tiempo constante; la validación con `zod` en las rutas donde existe; la **ausencia total de inyección SQL** — todas las interpolaciones que revisé usan nombres de columna fijos o placeholders, y no encontré ninguna concatenación de valores de usuario en ninguna consulta; el filtro de cuentas demo en las estadísticas públicas; la paridad exacta EN/ES de las 463 claves i18n; la carga diferida de `jspdf`; el borrado lógico de usuarios que preserva la integridad referencial; y la ausencia de `onClick` sobre elementos no interactivos en todo el frontend.

---

## Alcance no cubierto

Para que quede explícito qué no he verificado:

- **Errores de consola en el navegador** (PARTE 5): no he ejecutado la aplicación. He identificado los tres candidatos más probables en P2-25, pero no están confirmados empíricamente.
- **Contraste de color medido**: he comprobado que los tokens documentan sus ratios (`index.css:22`), pero no he auditado los ~1.000 pares de color reales de los componentes con una herramienta.
- **El contrato Solidity** (`blockchain/`): fuera del alcance solicitado.
- **Comportamiento real contra PostgreSQL**: las cuatro incompatibilidades de P0-3 están identificadas por lectura del SQL y del esquema de migración, no ejecutando las consultas contra una instancia. Son deterministas y de alta confianza, pero no ejecutadas.

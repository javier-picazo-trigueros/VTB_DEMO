# ESTADO Y SIGUIENTES PASOS — VTB

**Fecha:** 14 de septiembre de 2026
**Rama:** `main`, commit `73da138c` + 38 ficheros modificados y 11 nuevos sin commitear
**Método:** lectura del árbol completo (backend, frontend, blockchain, CI, documentación) y ejecución de `tsc --noEmit`, `vitest run` y `vite build`.
**No se ha modificado ningún fichero de código.**

Este documento no es una auditoría de fallos. [AUDITORIA_2.md](AUDITORIA_2.md) y
[AUDITORIA_BLOCKCHAIN.md](AUDITORIA_BLOCKCHAIN.md) siguen siendo la referencia para
eso. Aquí se responde a otra pregunta: **dónde está el proyecto hoy y qué conviene
hacer a continuación.**

Donde el estado real difiere de lo que se dio por cerrado, lo digo. No es un
reproche: buena parte de ese trabajo está en el árbol sin commitear, así que lo que
hay en el repositorio y lo que corre en producción no son lo mismo.

## Verificación previa

| Comprobación | Resultado |
|---|---|
| `npx tsc --noEmit` (backend) | ✅ Limpio |
| `npx vitest run` (backend) | ✅ 11 ficheros, **73 tests**, todos pasan |
| `npx vite build` (frontend) | ✅ Compila. Chunk principal **810 kB** (254 kB gzip), avisa de >500 kB |
| Tests del contrato Solidity | ❌ No existe `blockchain/test/` |

> **Atención antes de seguir.** `git status` muestra 38 ficheros modificados y 11
> nuevos sin commitear. Todo el trabajo de cierre de AUDITORIA_2 (cola de email con
> estado, `rateLimit.ts`, `errors.ts`, tests de CSRF y rate limit, seed con
> contraseñas por entorno) vive **solo en tu disco**. Lo desplegado en Render y
> Vercel es el commit `73da138c`, que no lo tiene. Esto afecta directamente a lo que
> podéis enseñar: la demo pública no se comporta como vuestra copia local.

---

# PARTE 1 — Qué está hecho y sólido

Lista pensada para enseñar a alguien técnico. Cada punto dice qué mecanismo existe y
qué cubre, no que "está bien".

## Autenticación y sesión

**Sesión en cookies httpOnly, no en localStorage.** Tres cookies con
responsabilidades separadas ([auth.ts:6-8](backend/src/utils/auth.ts#L6-L8)):
`vtb_auth` (JWT de acceso, 15 min, httpOnly), `vtb_refresh` (token opaco, 7 días,
httpOnly) y `vtb_csrf` (legible por JS, 15 min). Un XSS en el frontend no puede leer
el token de sesión, que es la razón entera de este diseño. El frontend no guarda
ningún identificador de sesión en `localStorage`
([AuthContext.jsx](frontend/src/context/AuthContext.jsx)).

**Refresh tokens de un solo uso, guardados hasheados.** `generateRefreshToken()`
devuelve el texto plano (que va a la cookie) y su SHA-256 (que va a la base de datos)
([auth.ts:196-205](backend/src/utils/auth.ts#L196-L205)). Quien lea la base de datos
no puede reconstruir una sesión. El mismo esquema se reutiliza para los tokens de
reset e invitación: en claro solo viajan en el email.

**CSRF con doble validación.** No es solo el patrón double-submit: además de comparar
cookie y cabecera, el servidor recalcula el token esperado a partir de la identidad
del usuario y lo compara en tiempo constante
([app.ts:166-190](backend/src/app.ts#L166-L190),
[auth.ts:232-248](backend/src/utils/auth.ts#L232-L248)). Eso cubre el *cookie
stuffing*: un atacante que consiga fijar su propia cookie CSRF en el navegador de la
víctima sigue sin pasar la segunda comprobación. 13 tests lo cubren
([csrf.test.ts](backend/src/__tests__/csrf.test.ts)).

**Login sin oráculo de enumeración por temporización.** Si el usuario no existe,
`verifyPassword` se ejecuta igualmente contra un hash señuelo
([auth.ts:174-177](backend/src/routes/auth.ts#L174-L177)), de modo que el tiempo de
respuesta no revela si la cuenta existe. La respuesta también es idéntica (401
genérico).

**`requireAdmin` no se fía del JWT.** Relee `role` y `admin_domain` de la base de
datos en cada petición
([middleware/auth.ts:75-80](backend/src/middleware/auth.ts#L75-L80)), así que
degradar a un admin surte efecto inmediato y no a los 15 minutos. También filtra
`deleted_at IS NULL`.

**bcrypt con coste 12** y sin hashes heredados de SHA
([auth.ts:89-92](backend/src/utils/auth.ts#L89-L92)).

## Límites de tasa y cabeceras

**Política de rate limiting unificada en un solo fichero**
([rateLimit.ts](backend/src/middleware/rateLimit.ts)), con criterio explícito por
entorno (sin límite en test, holgado en dev, real en producción). Cubre login por IP,
registro por IP, recuperación de contraseña **con dos cubos encadenados** (por email
para no inundar un buzón concreto, y por IP para que rotar direcciones no sirva de
nada), reset por IP, y voto con dos cubos (3/min por usuario, 500/min por IP — alto a
propósito, porque un campus entero sale por una sola IP tras el NAT). `envLimit()`
rechaza valores no numéricos, porque `express-rate-limit` con `max=NaN` deja de
limitar sin decir nada.

**`trust proxy` en 1 salto, no en `true`**
([app.ts:36-38](backend/src/app.ts#L36-L38)). Con `true`, cualquiera podría falsificar
`X-Forwarded-For` y saltarse los límites por IP. Con 1, `req.ip` es la IP real detrás
de Render.

**helmet con CSP explícita** ([app.ts:44-60](backend/src/app.ts#L44-L60)):
`scriptSrc 'self'`, `frameSrc 'none'`, `objectSrc 'none'`, `connectSrc` limitado a
Alchemy y Etherscan, HSTS con preload solo en producción.

**CORS con lista blanca y `credentials: true`**, rechazando `*` explícitamente
([app.ts:77-99](backend/src/app.ts#L77-L99)).

## Tratamiento de errores

**`formatError()` es una buena pieza de ingeniería y merece enseñarse**
([errors.ts](backend/src/utils/errors.ts)). Los errores de ethers v6 arrastran
`info.payload` (la transacción firmada en crudo), `transaction`, `receipt` y
`info.error.url` — que en Alchemy lleva la API key dentro del path. Volcar uno entero
con `console.error("...", err)` escribe tu credencial de RPC en los logs de Render.
`formatError` reduce cualquier error a `mensaje | code=X | reason=Y`, recorta a 300
caracteres, sustituye toda URL por su origen y redacta los blobs hex de más de 100
caracteres — con el umbral puesto a propósito por encima de los hashes de 32 bytes,
que sí son públicos y útiles para depurar. 7 tests
([errors.test.ts](backend/src/__tests__/errors.test.ts)). El fichero además documenta
*por qué* existe, que es lo que falta en el 90% de los utils.

## Cola de correo

**Máquina de estados en base de datos, no temporizadores en memoria**
([queue.ts](backend/src/services/email/queue.ts)). El diseño anterior tenía dos
mecanismos de reintento compitiendo y un mismo correo podía salir tres veces. El
actual tiene cinco estados (`queued`/`sending`/`sent`/`dead`/`skipped`), backoff
explícito en cinco tramos, `reclaimStuck()` para filas que quedaron en `sending`
porque el proceso murió, y — la parte importante — **una clave de idempotencia
generada en el INSERT y reutilizada en cada intento**, de modo que Resend deduplica
del lado servidor el único caso que no tiene solución local (morir después de enviar
y antes de marcar `sent`). Tope de 100 por ciclo y 250 ms entre envíos, porque el
plan gratuito de Resend corta a ~2 req/s. La cabecera del fichero explica el
razonamiento entero. 6 tests.

## Seed y credenciales

**Ninguna contraseña privilegiada en el código ni en el README.**
`requiredSeedPassword()` aborta nombrando la variable que falta y exige 12 caracteres
mínimo
([seedDatabase.ts:25-37](backend/src/scripts/seedDatabase.ts#L25-L37)). Solo las dos
cuentas de estudiante de un dominio ficticio conservan un valor por defecto, y está
justificado en el propio código. 4 tests
([seed-passwords.test.ts](backend/src/__tests__/seed-passwords.test.ts)). Existe
además `scripts/rotate-weak-admin-passwords.ts` para remediar despliegues sembrados
con las contraseñas antiguas.

**El seed solo crea `vtb.demo` y `vtb.system`**, y es idempotente: nunca toca ni borra
cuentas de dominios reales que ya existan.

## Integración continua

[ci.yml](.github/workflows/ci.yml) con tres trabajos encadenados: **TruffleHog
(`--only-verified`) sobre el historial completo bloquea el merge si detecta un
secreto**, y solo si pasa se ejecutan backend (typecheck + lint + tests en Node 20 y
22) y frontend (lint + build). Concurrencia con cancelación de runs anteriores. Es más
de lo que tienen muchos proyectos con financiación.

## El contrato

Pequeño y sin trampas ([VTB.sol](blockchain/contracts/VTB.sol)): sin reentrancy, sin
`delegatecall`, sin `tx.origin`, no actualizable, y — esto es lo que importa para una
votación — **el owner no puede alterar el recuento**. No existe ninguna función que
escriba en `elections[].totalVotes` fuera de `castVote`. La unicidad del nullifier se
comprueba on-chain
([VTB.sol:188-191](blockchain/contracts/VTB.sol#L188-L191)), así que el
anti-doble-voto no depende de que el backend se porte bien.

## Camino del voto (las comprobaciones que sí existen)

`POST /elections/register-vote` verifica, en este orden
([elections.ts:598-700](backend/src/routes/elections.ts#L598-L700)): esquema con `zod`
incluido el formato del `voteHash`, que la elección exista y esté activa, que estemos
dentro de la ventana temporal, que el usuario tenga `is_eligible`, que esté en el
censo de *esa* elección, y que no haya votado ya. Son las comprobaciones correctas y
están todas.

## Otros

- **Cero inyección SQL.** Todas las consultas usan placeholders; no encontré ni una
  concatenación de valores de usuario.
- **Borrado lógico de usuarios** (`deleted_at`), que preserva la integridad
  referencial del censo histórico.
- **Las estadísticas públicas filtran las cuentas demo**
  ([app.ts:253-259](backend/src/app.ts#L253-L259)), para que la portada no presuma de
  votos ficticios.
- **El banner de cookies enumera las claves reales** que se guardan, una por una, y
  "rechazar" borra de verdad lo opcional
  ([CookieBanner.jsx:33-42](frontend/src/components/CookieBanner.jsx#L33-L42)). Es más
  honesto que el de casi cualquier SaaS.
- **Pantalla de arranque en `index.html`** retirada en el primer frame pintado
  ([main.jsx:23-27](frontend/src/main.jsx#L23-L27)), y aviso de "el backend se está
  despertando" con botón de reintento
  ([App.jsx:69-82](frontend/src/App.jsx#L69-L82)). Dos detalles que evitan que la demo
  parezca rota en el free tier de Render.
- **Sin `onClick` sobre elementos no interactivos** en todo el frontend.

---

# PARTE 2 — Qué está a medias

## 1. Dos bases de datos conviviendo (lo más grave de esta sección)

La migración a PostgreSQL está construida pero no terminada. Hay **dos clientes de
base de datos vivos a la vez**:

| Fichero | Cliente | Motor real |
|---|---|---|
| `routes/elections.ts` | `getDbClient()` | SQLite o Postgres según `DB_CLIENT` |
| `services/email/queue.ts` | `getDbClient()` | SQLite o Postgres |
| `index.ts` (jobs) | `getDbClient()` | SQLite o Postgres |
| `app.ts` (5 usos) | `getDatabase()` | **SQLite siempre** |
| `routes/auth.ts` | `getDatabase()` | **SQLite siempre** |
| `routes/admin.ts` | `getDatabase()` | **SQLite siempre** |
| `routes/registration.ts` | `getDatabase()` | **SQLite siempre** |
| `routes/organizations.ts` | `getDatabase()` | **SQLite siempre** |
| `middleware/auth.ts` | `getDatabase()` | **SQLite siempre** |
| `scripts/seedDatabase.ts` | `getDatabase()` | **SQLite siempre** |

Con `DB_CLIENT=postgres`, los usuarios se crean en SQLite y los votos se escriben en
PostgreSQL. `initializeDatabase()` crea el esquema SQLite en cada arranque pase lo que
pase ([index.ts:46-55](backend/src/index.ts#L46-L55)).

Y no es solo cambiar la llamada: los ficheros no migrados contienen SQL que **no es
válido en PostgreSQL**:

- `substr(email, instr(email,'@')+1)` — `instr` no existe en PG
  ([app.ts:251](backend/src/app.ts#L251),
  [admin.ts:1469](backend/src/routes/admin.ts#L1469))
- `email_domain = "*"` con comillas dobles — en PG eso es un **identificador**, no una
  cadena; la consulta falla ([admin.ts:1129](backend/src/routes/admin.ts#L1129))
- `INSERT OR IGNORE` en 12 sitios de `admin.ts`, `registration.ts` y
  `seedDatabase.ts` (el traductor de `PgClient` solo actúa sobre las rutas que usan el
  cliente nuevo)

**Consecuencia práctica:** todo lo bueno que se construyó para Postgres está
inalcanzable. El cerrojo atómico anti-doble-voto sobre `vote_attempts`, las
transacciones reales y el job de recuperación de votos huérfanos
([index.ts:233](backend/src/index.ts#L233), condicionado a `instanceof PgClient`) no se
ejecutan nunca en el modo que realmente usáis. El propio arranque lo avisa con un
banner de seguridad ([index.ts:72-79](backend/src/index.ts#L72-L79)) que dice,
textualmente, que el anti-doble-voto no está garantizado.

## 2. El circuito de correo no conecta con la aplicación

Los cuatro tipos de enlace que se envían apuntan a rutas que **no existen** en
[App.jsx](frontend/src/App.jsx):

| Email | Enlace que envía | ¿Existe? |
|---|---|---|
| Recuperación de contraseña | `/auth/reset-password?token=…` ([auth.ts:580](backend/src/routes/auth.ts#L580)) | ❌ 404 |
| Invitación al censo | `/auth/set-password?token=…` ([admin.ts:888](backend/src/routes/admin.ts#L888)) | ❌ 404 |
| Apertura de elección | `/elections/:id` ([admin.ts:1667](backend/src/routes/admin.ts#L1667)) | ❌ 404 (la ruta real es `/voting/:id`) |
| Cierre de elección | `/elections/:id/results` ([admin.ts:1723](backend/src/routes/admin.ts#L1723), [index.ts:209](backend/src/index.ts#L209)) | ❌ 404 (la real es `/results/:id`) |

Además **el login no tiene enlace de "he olvidado mi contraseña"**
([Login.jsx](frontend/src/pages/Login.jsx)), así que el endpoint
`POST /auth/forgot-password` — que está bien hecho, con doble rate limit y token
hasheado — no tiene forma de invocarse desde la interfaz.

El servicio de correo está terminado. Lo que falta son dos páginas de frontend y
cuatro cadenas de URL.

## 3. La contraseña temporal encierra al usuario

Tres piezas que no encajan:

- El guard de `must_change_password` devuelve 403 a todo salvo login, `/auth/me` y
  `change-password` ([app.ts:117-155](backend/src/app.ts#L117-L155)) —
  **`POST /auth/logout` no está en la lista**, así que el usuario ni siquiera puede
  salir.
- El frontend **nunca lee el código `MUST_CHANGE_PASSWORD`**: `apiClient.js` solo
  intercepta 401, no 403.
- `AuthContext` guarda `mustChangePassword` al hacer login
  ([AuthContext.jsx:50](frontend/src/context/AuthContext.jsx#L50)) pero **nada
  redirige** a `/change-password`, y `GET /auth/me` no devuelve el campo, así que al
  recargar la página el dato se pierde.

Resultado: quien entre con contraseña temporal aterriza en un dashboard donde todas
las peticiones fallan con un 403 que nadie interpreta.

## 4. La importación de censo crea cuentas a las que nadie puede entrar

`POST /admin/users/import` genera una contraseña temporal aleatoria, la hashea, marca
`must_change_password = 1`… **y no la envía a ninguna parte**
([admin.ts:366-380](backend/src/routes/admin.ts#L366-L380)). No hay llamada a
`sendCensusInvitation` en esa ruta. La ruta hermana
`POST /admin/elections/:id/import-voters` sí genera token e invita
([admin.ts:875-892](backend/src/routes/admin.ts#L875-L892)) — dos caminos para el
mismo objetivo, con comportamiento distinto, y el más obvio es el que no funciona.

## 5. Mayúsculas en el email

`login` normaliza a minúsculas ([auth.ts:157](backend/src/routes/auth.ts#L157)) pero
la creación de usuarios guarda el email tal cual llega
([admin.ts:300](backend/src/routes/admin.ts#L300),
[admin.ts:374](backend/src/routes/admin.ts#L374)). Un CSV con
`Maria.Lopez@universidad.es` crea una cuenta a la que es **imposible** entrar.
Curiosamente la tabla `email_whitelist` sí se guarda en minúsculas
([admin.ts:357](backend/src/routes/admin.ts#L357)), lo que confirma que la decisión se
tomó y solo se aplicó en un sitio.

## 6. El aislamiento entre instituciones está a medio hacer

Hay helpers (`getAdminDomain`, `isSubDomain`, `isSuperAdmin`) y se aplican en
`/dashboard`, `/users`, `/elections` (listado), aprobaciones y solicitudes. Pero:

- `POST /admin/users` valida el dominio del email y bloquea crear superadmins, pero
  **acepta `admin_domain` del cuerpo sin validarlo**
  ([admin.ts:263](backend/src/routes/admin.ts#L263)): un admin de la universidad A
  puede crear `admin@A.es` con `admin_domain = "B.es"`.
- Estas rutas operan sobre cualquier elección **sin comprobar el dominio**:
  `PUT /elections/:id` ([729](backend/src/routes/admin.ts#L729)),
  `PATCH /elections/:id` ([756](backend/src/routes/admin.ts#L756)),
  `POST /elections/:id/image` ([783](backend/src/routes/admin.ts#L783)),
  `POST /elections/:id/voters` ([1242](backend/src/routes/admin.ts#L1242)),
  `POST /elections/:id/candidates` ([1285](backend/src/routes/admin.ts#L1285)),
  `POST /elections/:id/domains` ([1201](backend/src/routes/admin.ts#L1201)),
  `GET /elections/:id/stats` ([1546](backend/src/routes/admin.ts#L1546)),
  `notify-open` ([1634](backend/src/routes/admin.ts#L1634)) y
  `notify-close` ([1685](backend/src/routes/admin.ts#L1685)).

Con una sola institución esto no se nota. Con dos, el admin de una puede cerrar la
elección de la otra.

## 7. El validador de entorno es código muerto

[config/env.ts](backend/src/config/env.ts) está escrito, valida bien y **no lo importa
nadie** (0 referencias en todo `src/`). Lo que gobierna de verdad es
[utils/auth.ts:60-66](backend/src/utils/auth.ts#L60-L66), que sí aborta si faltan
`JWT_SECRET` o `NULLIFIER_SECRET` en producción — pero `HMAC_SECRET`, `CORS_ORIGINS` y
las validaciones cruzadas de `env.ts` no se comprueban nunca.

## 8. Siete sitios siguen devolviendo el mensaje de error crudo al cliente

[admin.ts:776](backend/src/routes/admin.ts#L776),
[auth.ts:375](backend/src/routes/auth.ts#L375),
[auth.ts:403](backend/src/routes/auth.ts#L403),
[auth.ts:452](backend/src/routes/auth.ts#L452),
[elections.ts:857](backend/src/routes/elections.ts#L857) y
[elections.ts:870](backend/src/routes/elections.ts#L870). Los dos últimos son los que
importan: devuelven `blockchainError.message` de ethers al navegador, que es justo el
objeto del que `formatError` existe para protegeros. Se saneó el log y se dejó la
respuesta HTTP.

## 9. La capa blockchain funciona como decorado

No es un fallo nuevo — es el hallazgo central de
[AUDITORIA_BLOCKCHAIN.md](AUDITORIA_BLOCKCHAIN.md), verificado en vivo el 2026-08-27:
**18 elecciones creadas en Sepolia, `totalVotes == 0` en las 18.** Nunca se ha
registrado un voto en la cadena. El código sigue igual:

- Las cuentas `@vtb.demo` toman un atajo sintético **antes** de tocar la cadena
  ([elections.ts:667-687](backend/src/routes/elections.ts#L667-L687)), y son las únicas
  cuentas que el seed crea.
- Si la elección no está en la cadena, hay un fallback que registra el voto fuera de
  ella y responde `"Voto registrado exitosamente"`
  ([elections.ts:822-843](backend/src/routes/elections.ts#L822-L843)).
- Los resultados salen **100% de la base de datos**
  ([elections.ts:449-476](backend/src/routes/elections.ts#L449-L476)); el badge
  `onChainVerified` es un `COUNT(*) > 0` sobre una columna local
  ([elections.ts:479-488](backend/src/routes/elections.ts#L479-L488)), no una lectura
  del contrato.
- `castVote` **no tiene control de acceso**
  ([VTB.sol:181-185](blockchain/contracts/VTB.sol#L181-L185)): cualquiera con gas puede
  inflar el recuento del contrato desplegado.
- `syncElections` mapea IDs **por posición del array**
  ([syncElections.ts:56-66](backend/src/scripts/syncElections.ts#L56-L66)) y sobrescribe
  la ventana temporal real por `now + 30 días`
  ([syncElections.ts:80-81](backend/src/scripts/syncElections.ts#L80-L81)), así que la
  ventana on-chain no es la ventana de la elección.
- El `voteHash` es `keccak(candidato-timestamp-random)` y **el salt se descarta**
  ([VotingBooth.jsx:526-528](frontend/src/pages/VotingBooth.jsx#L526-L528)): no es un
  compromiso criptográfico, nadie podrá abrirlo nunca.
- Cero gestión de nonce, sin `gasLimit`, sin timeout en `tx.wait()`
  ([elections.ts:734-741](backend/src/routes/elections.ts#L734-L741)). Una votación real
  es concurrente por definición; ese código no lo aguanta.
- El contrato **no está verificado en Etherscan**, y `blockchain/test/` no existe.
- `deployment-info.json` todavía apunta a `localhost` y `chainId 31337`.
- `GET /:electionId/vote-feed` devuelve un texto que remite a un WebSocket que no
  existe ([elections.ts:885-908](backend/src/routes/elections.ts#L885-L908)).

## 10. El rediseño se aplicó a la mitad de las pantallas

Los tokens (`brand-*` petrol, `warm-*`, IBM Plex) están definidos y adoptados en
Dashboard, Landing, Navbar, UserProfile y VotingBooth. **No han llegado** a Login (0
usos de `brand-*`, 5 gradientes, paleta azul/esmeralda antigua), AdminPanel (0 usos, 34
emojis), Pricing (0 usos, 18 emojis), RegisterRequest, ChangePassword,
InstitutionPortal ni Transparency.

## 11. Bilingüe a medias

463 claves con paridad EN/ES, pero el uso es muy desigual: VotingBooth 72 llamadas a
`t()`, Dashboard 37, Landing 42… y **AdminPanel 16 en 2.311 líneas**, Pricing 0,
UserProfile 0, NotFound 0, VoteModal 0. Cambiar el idioma en el navbar no cambia casi
nada en el panel de administración ni en precios. Además el bloque español del i18n ha
perdido acentos en varias cadenas visibles ("Democratico", "criptograficamente",
"publicamente", [i18n/config.ts:674-677](frontend/src/i18n/config.ts#L674-L677)) y
quedan 6 restos de mojibake.

## 12. Modo oscuro a medias

El toggle funciona y persiste
([ThemeContext.tsx](frontend/src/context/ThemeContext.tsx)), pero `body` tiene
`@apply bg-white` fijo ([index.css:51](frontend/src/index.css#L51)) y seis componentes
no tienen **ni una** clase `dark:`: UserProfile, NotFound, VoteModal, ErrorBoundary,
OnboardingTour y Spinner. En oscuro, esas pantallas salen rotas.

## 13. Deuda declarada y no pagada

- `admin.ts` sigue en **1.734 líneas y 28 rutas**.
- **Sin `React.lazy` en ninguna ruta** → chunk principal de 810 kB.
- **2 `htmlFor` para 47 `<input>`** en todo el frontend.
- Comentarios con acentos comidos ("eleccin", "transaccin", "auditora") — 19 casos,
  todos en [elections.ts](backend/src/routes/elections.ts).
- Cabeceras que siguen firmando "@author Senior Web3 Architect" y describiendo la
  arquitectura de hace tres migraciones (por ejemplo
  [config/database.ts:8-14](backend/src/config/database.ts#L8-L14), que afirma que la
  base de datos "NO almacena votos").

---

# PARTE 3 — Qué falta para que una universidad pueda usarlo

No "para que sea perfecto". Para que una institución real haga una votación.

## Bloqueante — sin esto no hay votación

### B1. Nadie puede entrar

Es el bloqueo compuesto de los puntos 2, 3, 4 y 5 de la Parte 2. Simulado de punta a
punta, hoy pasa esto:

1. El administrador sube el CSV con 800 estudiantes → se crean 800 cuentas con
   contraseñas aleatorias que nadie conoce.
2. Los que tengan mayúsculas en el email no podrán entrar ni aunque la supieran.
3. Los que la pidan por "he olvidado mi contraseña" no encontrarán el enlace.
4. Si alguien llegara a recibir el correo, el enlace da 404.
5. Si uno consigue entrar con contraseña temporal, queda encerrado y sin poder cerrar
   sesión.

**Esfuerzo:** 2 páginas nuevas de frontend, 4 cadenas de URL, un `toLowerCase()`,
añadir `logout` a una lista y una llamada a `sendCensusInvitation`. Entre 2 y 3 días de
trabajo real. Es, con diferencia, el mejor ratio impacto/coste del proyecto.

### B2. La base de datos no sobrevive a un redespliegue

El README instruye desplegar en Render con `DATABASE_PATH=./vtb.db`. **El sistema de
ficheros de un servicio web de Render es efímero**: cada redespliegue y cada reinicio
del contenedor recrea el disco. Con SQLite en esa ruta, el censo y los votos de una
elección en curso desaparecen. Y como Postgres está a medias (Parte 2.1), hoy no hay
una alternativa que funcione entera.

Hay que decidir: o se termina la migración a PostgreSQL (los 6 ficheros que quedan), o
se monta un disco persistente de Render, o se usa un Postgres gestionado con un cliente
único. Lo que no puede quedarse es como está. **Esto es previo a cualquier piloto con
datos reales.**

### B3. Los resultados son públicos y en vivo durante la votación

`GET /elections/:id/results` no requiere autenticación y devuelve el recuento por
candidato con la elección **activa**
([elections.ts:406](backend/src/routes/elections.ts#L406)). Cualquiera puede ver quién
va ganando a media votación. Eso no altera el conteo, pero **altera el resultado**: es
el efecto *bandwagon* de manual y ningún comité electoral lo aceptaría. Además la
pantalla de voto consulta la participación cada 15 segundos
([VotingBooth.jsx:511-514](frontend/src/pages/VotingBooth.jsx#L511-L514)).

Arreglo: devolver solo participación agregada mientras `status === 'active'`, y
recuento por candidato solo al cierre. Medio día.

### B4. El secreto del voto no existe, y hay que decirlo o arreglarlo

`nullifier_audit` guarda `user_id` y `candidate_id` **en la misma fila**
([config/database.ts](backend/src/config/database.ts); la columna se añadió para poder
contar por candidato). Quien tenga acceso a la base de datos — vosotros dos, y quien
comprometa Render — sabe exactamente qué votó cada persona.

Esto no es un bug: es una decisión de diseño que se tomó para mostrar resultados por
candidato sin depender de la cadena. Pero convierte en falsa la afirmación "Secreta" de
la portada ([i18n/config.ts:708](frontend/src/i18n/config.ts#L708)) y es **la primera
pregunta que hará el delegado de protección de datos** de cualquier universidad.

Dos salidas legítimas, y hay que elegir una antes de hablar con nadie:

- **Arreglarlo:** separar el recuento de la identidad (tabla de recuento sin `user_id`,
  o recuento derivado de la cadena). Es trabajo serio, semanas.
- **Documentarlo:** posicionar VTB como *voto auditable con administrador de
  confianza*, no como voto secreto, y decirlo en la portada, en el panel y en el
  documento que entreguéis a la institución. Es honesto y sigue siendo vendible para
  muchos procesos (delegados, consultas internas, claustros).

Lo que no se puede es seguir prometiendo "Secreta. Auditable. Inmutable." con este
esquema. Si alguien técnico lo mira, se cae la credibilidad entera.

### B5. Decidir qué es la cadena en este piloto

Con `castVote` sin control de acceso, cero gestión de nonce, sin timeout ni gasLimit,
el relayer siendo también el owner del contrato, y cero votos reales registrados nunca,
la capa blockchain **no está lista para sostener una votación concurrente**. Dos
caminos honestos:

- **La cadena es el registro autoritativo** → hay que arreglar nonce, gas, timeout,
  reorg, control de acceso en `castVote` (redespliegue), verificar en Etherscan y
  escribir tests del contrato. Semanas.
- **La cadena es notarización complementaria** → los votos viven en la base de datos, y
  a la cadena va un sello (por ejemplo, la raíz de Merkle del acta al cierre). Mucho
  menos trabajo, sigue siendo defendible, y elimina de golpe nonce, concurrencia y gas
  durante la votación.

Para un primer piloto, la segunda es la razonable. Lo que **sí** es bloqueante en ambos
casos: que ningún camino presente un hash sintético como si fuera una transacción
([elections.ts:667](backend/src/routes/elections.ts#L667),
[elections.ts:822](backend/src/routes/elections.ts#L822)) y que el badge "verificado
on-chain" no se calcule desde la base de datos.

## No bloqueante, pero se notará

- **El aislamiento entre dominios** (Parte 2.6) — no bloqueante para **una** sola
  institución, imprescindible en cuanto haya dos.
- **Contrato verificado en Etherscan.** Sin esto, nadie puede leer qué hace el código
  que decís que protege su voto. Media hora de trabajo y mucha credibilidad.
- **Tests del contrato.** Cero hoy. Es lo primero que mira alguien técnico.
- **Que el votante pueda verificar su propio voto.** Hoy recibe un txHash y nada más:
  no hay herramienta para comprobar que su voto está donde se dice.
- **`GET /elections/:id/audit` es público y sin autenticación**
  ([elections.ts:521](backend/src/routes/elections.ts#L521)) y mezcla hashes sintéticos
  con reales sin distinguirlos.
- **Accesibilidad** (2 etiquetas para 47 campos). Ver abajo: en una universidad pública
  española esto no es del todo opcional.
- **810 kB de bundle** en una facultad con wifi saturado.

## No técnico (y es lo que menos hay)

En el repositorio no existe **ninguno** de estos documentos. Para una institución
pública son tan bloqueantes como el código:

1. **Política de privacidad y aviso legal.** Hay banner de cookies, pero no hay página
   de política a la que enlace. Una universidad no puede mandar a sus estudiantes a un
   servicio sin esto.
2. **Contrato de encargo del tratamiento (art. 28 RGPD).** La universidad es
   responsable del tratamiento y VTB es encargado. Sin ese contrato firmado, el
   servicio jurídico **parará el piloto**. Necesita: finalidades, categorías de datos,
   plazos de conservación, subencargados (Render, Vercel, Resend, Alchemy — los cuatro
   hay que declararlos), medidas de seguridad y procedimiento de devolución/borrado al
   terminar.
3. **Registro de actividades de tratamiento** y política de conservación: cuánto se
   guarda el censo, cuánto las actas, qué se borra al cerrar el piloto.
4. **Documento de seguridad para el comité electoral**, en lenguaje no técnico, que
   diga con precisión **qué garantiza el sistema y qué no**. Este documento es donde se
   resuelve B4: si el administrador puede ver el voto, aquí se dice.
5. **Procedimiento electoral:** quién es administrador y cómo se le nombra, cómo se
   aprueba el censo, qué pasa si un votante dice "no he podido votar", cómo se impugna
   un resultado, quién custodia las claves, qué se hace si el backend cae a media
   votación. Un comité electoral **pedirá esto por escrito**.
6. **Declaración de accesibilidad.** Las universidades públicas españolas están sujetas
   al RD 1112/2018 (WCAG 2.1 AA). Con 2 etiquetas para 47 campos, hoy no se cumple.
   Conviene saberlo antes de que lo descubra su unidad de accesibilidad.
7. **Plan de continuidad mínimo:** copia de seguridad antes de abrir la votación,
   procedimiento de restauración **ensayado al menos una vez**, y a quién se llama si
   algo falla un martes a las 11:00.
8. **Acuerdo de piloto** que deje por escrito si la votación es vinculante o de prueba.
   Para la primera, que no sea vinculante os protege a todos.

---

# PARTE 4 — Diseño y experiencia

Escrito desde la posición de alguien que abre la aplicación sin conocer el código.

## Lo que está bien resuelto

**Dashboard del votante** ([Dashboard.jsx](frontend/src/pages/Dashboard.jsx)). La mejor
pantalla del producto. Filas de tabla en vez de tarjetas gigantes, punto de color en
vez de emoji, cuenta atrás en vivo con cifras tabulares, filtros por estado y búsqueda,
y — el detalle que demuestra criterio — **dos estados vacíos distintos**: "tu
institución no tiene elecciones" y "hay elecciones pero no estás en ningún censo" son
situaciones diferentes para el usuario y se tratan como tales
([elections.ts:78-90](backend/src/routes/elections.ts#L78-L90)).

**Diálogo de confirmación del voto**
([VotingBooth.jsx:246-310](frontend/src/pages/VotingBooth.jsx#L246-L310)). Paso
obligatorio, resumen de elección y candidato, aviso explícito de que es irreversible,
`aria-labelledby` correcto. Es lo que debe ser.

**Honestidad del recibo de voto.** El modal de éxito distingue el hash sintético del
real y dice "This vote was recorded in the demo database. No Sepolia transaction was
created" ([VotingBooth.jsx:153-188](frontend/src/pages/VotingBooth.jsx#L153-L188)).
Poca gente escribe eso en su propia demo; está bien que esté.

**Navbar**, **Landing** y **banner de cookies**: limpios, con los tokens nuevos, sin
emojis de adorno, y el de cookies enumera las claves reales.

**Aviso de backend dormido** con botón de reintento, y mensaje distinto si el backend
es local ("arranca backend con: cd backend && npm run dev"). Convierte el peor momento
del free tier en algo que parece intencionado.

## Lo que sigue flojo

**Panel de administración** ([AdminPanel.jsx](frontend/src/pages/AdminPanel.jsx)) — **la
pantalla más importante y la menos terminada**. 2.311 líneas, 6 pestañas, 34 emojis
usados como iconos, cero tokens de marca, 16 llamadas a `t()` en todo el fichero. Es la
pantalla que verá el secretario del comité electoral, y la que más delata que esto se
hizo deprisa.

**Login** ([Login.jsx](frontend/src/pages/Login.jsx)). Se quedó en el sistema visual
anterior: 5 gradientes, azul y esmeralda, cero tokens. Y el selector "Portal de votante
/ Portal de administrador" es una bifurcación que el usuario **no debería tener que
resolver**: un administrador también es una persona que vota, y nadie sabe en cuál
entrar la primera vez. El rol ya viene en la respuesta del login; la pantalla podría ser
una sola y redirigir sola. Encima hay un *easter egg* de 5 clics en el logo que abre un
panel de desarrollo ([Login.jsx:64-72](frontend/src/pages/Login.jsx#L64-L72)) —
inofensivo porque solo se compila en dev, pero es ruido.

**Página de precios** ([Pricing.jsx](frontend/src/pages/Pricing.jsx)). Íntegramente en
inglés dentro de una aplicación cuyo idioma por defecto es español, con un plan de 299 €
y la frase "Every plan includes real blockchain auditability" — que hoy es literalmente
falsa. Si alguien con criterio la lee, es la frase que os va a citar.

**Página de transparencia**
([Transparency.jsx](frontend/src/pages/Transparency.jsx)). Aquí hay un problema serio de
demo: la tabla se alimenta de `/api/audit/public`, que filtra las cuentas `@vtb.demo`
**y** exige `block_number IS NOT NULL`
([app.ts:283-296](backend/src/app.ts#L283-L296)). Como todos los votos actuales son demo
y ninguno tiene bloque, **la página de auditoría pública está siempre vacía**. La
pantalla que debería ser vuestro argumento principal muestra "no hay registros". Y los
hashes, cuando los haya, no son enlaces a Etherscan.

**Resultados** ([ElectionResults.jsx](frontend/src/pages/ElectionResults.jsx), 779
líneas, 13 emojis) con el badge `onChainVerified` que viene de la base de datos.

**Modo oscuro roto en seis componentes** (Parte 2.12). Si alguien activa el tema oscuro
y entra en su perfil, ve texto negro sobre negro.

**Formularios sin etiquetas.** 47 campos, 2 asociados. Una persona con lector de
pantalla no puede rellenar el registro ni el login. También es requisito legal para
universidades públicas (Parte 3).

## Flujos que un usuario nuevo no entendería a la primera

1. **"Me registro… ¿y ahora qué?"** El registro termina en "Request submitted" (en
   inglés, [RegisterRequest.jsx:180](frontend/src/pages/RegisterRequest.jsx#L180)). No
   dice cuánto tarda la aprobación, quién la hace, ni si recibirá un aviso. No lo
   recibirá: no hay correo de aprobación.
2. **"He importado el censo y no ha pasado nada."** El administrador ve "800 usuarios
   creados" y ningún estudiante recibe nada (Parte 2.4). Nada en la interfaz indica que
   falte un paso de invitación.
3. **"He olvidado mi contraseña."** No hay enlace. Punto final.
4. **"Esta elección aún no está sincronizada en Sepolia."** Es el mensaje que ve el
   votante si el admin no ejecutó la sincronización
   ([elections.ts:846-851](backend/src/routes/elections.ts#L846-L851)). Está escrito
   para vosotros, no para él: le habla de Sepolia y de un administrador que debe
   ejecutar algo. Para el votante debería ser "esta votación aún no está abierta,
   inténtalo más tarde".
5. **"¿En qué orden hago las cosas?"** Un administrador nuevo abre el panel y nada le
   dice la secuencia: crear elección → definir censo → añadir candidatos → sincronizar →
   notificar apertura. No hay asistente, no hay estado "incompleta", no hay aviso de
   "esta elección no tiene candidatos".
6. **El botón "🚀 Demo" de la portada está roto en producción.**
   [DemoLoginModal.jsx:20](frontend/src/components/DemoLoginModal.jsx#L20) tiene la
   contraseña `admin123` escrita a mano, pero el seed ya no la usa: exige
   `SEED_DEMO_ADMIN_PASSWORD` de 12 caracteres. Y peor: el modal comprueba `if (ok)`
   sobre `login()`, que devuelve un **objeto** `{success, user}` — siempre verdadero —
   así que **navega a `/admin` aunque el login haya fallado**
   ([DemoLoginModal.jsx:40-42](frontend/src/components/DemoLoginModal.jsx#L40-L42)). El
   visitante acaba en una pantalla de administración vacía o rebotado al login, sin
   explicación. Es el primer botón que va a pulsar cualquiera a quien enseñéis la URL.

## Dónde falta guía, confirmación o feedback

- Ninguna acción destructiva del panel (borrar usuario, cerrar elección) tiene
  confirmación con el nombre del objeto.
- La sincronización con blockchain responde `"Sincronización iniciada"` y remite a *los
  logs del backend*
  ([AdminPanel.jsx:199](frontend/src/pages/AdminPanel.jsx#L199)). El administrador de
  una universidad no tiene logs.
- No hay estado "elección incompleta": se puede publicar una elección sin candidatos y
  sin censo.
- Los retardos artificiales del voto (800 ms + 250 ms + 600 ms,
  [VotingBooth.jsx:523-539](frontend/src/pages/VotingBooth.jsx#L523-L539)) están bien
  como escenografía, pero son la **única** prueba que el votante ve de que ha pasado
  algo criptográfico. Después del voto no hay nada que le permita comprobar nada por su
  cuenta.

---

# PARTE 5 — Las tres cosas que haría ahora

**Contexto asumido:** el objetivo no es lanzar comercialmente, sino (a) que una
institución haga una votación real de prueba, y (b) tener material para presentar el
proyecto. Dos personas con la carrera encima: cuento con 10-15 h semanales por cabeza,
no más.

---

## 1º — Cerrar el circuito de acceso y fijar la persistencia

**Qué incluye:**
- Páginas `/auth/set-password` y `/auth/reset-password`, y corregir las 4 URLs de los
  correos.
- Enlace "he olvidado mi contraseña" en el login.
- Enviar invitación desde `POST /admin/users/import`.
- `toLowerCase()` al crear usuarios, más una migración para los existentes.
- Desbloquear `must_change_password`: añadir `logout` a la lista permitida, interceptar
  el 403 en `apiClient.js`, redirigir a `/change-password`, y devolver el campo en
  `GET /auth/me`.
- Decidir el motor de base de datos y dejarlo con persistencia real: o terminar los 6
  ficheros que faltan para PostgreSQL, o disco persistente, pero **una sola ruta**.
- Arreglar el botón "Demo" de la portada (contraseña y comprobación de `login()`).

**Por qué primero:** es la diferencia entre "una institución puede probarlo" y "no
puede". Hoy, si mañana la Universidad X dijera que sí, no podríais dar de alta a 300
personas. Y es lo más barato de todo el documento: casi todo son dos páginas de frontend
y cadenas de texto. La parte de base de datos es la única grande, y no es negociable:
sin ella, una votación real puede perder el censo en un redespliegue.

**Estimación:** 2-3 semanas a vuestro ritmo (la mayor parte, la migración de BD).

**Señal de que está hecho:** creáis una elección desde cero, importáis un CSV de 20
correos reales vuestros, los 20 reciben invitación, los 20 entran, cambian contraseña y
votan. Sin tocar la base de datos a mano en ningún momento.

---

## 2º — Una votación que podáis defender: cadena honesta y resultados cerrados

**Qué incluye:**
- **Decidir el papel de la cadena** (B5). Mi recomendación para el piloto: notarización
  al cierre en vez de una transacción por voto. Elimina nonce, concurrencia y gas del
  camino crítico, y sigue siendo criptográficamente defendible.
- **Una elección real de punta a punta en Sepolia** con un dominio que no sea
  `@vtb.demo`, y su transacción visible en Etherscan. Hoy no existe ninguna.
- **Verificar el contrato en Etherscan** y escribir 8-10 tests de Hardhat.
- **Cerrar los resultados durante la votación** (B3): participación agregada sí,
  recuento por candidato solo al cierre.
- **Quitar todo hash sintético presentado como transacción** y que `onChainVerified` se
  calcule leyendo la cadena o desaparezca.
- **Reescribir las afirmaciones públicas** (portada, precios, i18n) para que digan
  exactamente lo que el sistema hace. Incluida la decisión de B4 sobre el secreto del
  voto.

**Por qué segundo:** es lo que hace que esto sea *este* proyecto y no un CRUD de
votaciones. Ahora mismo el diferencial es decorativo — 18 elecciones en Sepolia y cero
votos — y la portada promete tres cosas de las que solo una es cierta. En cuanto lo
presentéis a un grupo capaz de abriros puertas, alguien preguntará "enséñame un voto en
Etherscan" y "¿puede el administrador ver a quién voté?". Necesitáis un sí y una
respuesta honesta, en ese orden.

Va después del punto 1 porque una demo impecable de blockchain sobre un sistema en el
que nadie puede iniciar sesión no sirve de nada.

**Estimación:** 2-3 semanas si elegís notarización; 6-8 si elegís que la cadena sea
autoritativa. Esa decisión es el trabajo más importante de las próximas semanas y
conviene tomarla los dos juntos, por escrito.

**Señal de que está hecho:** podéis abrir un enlace de Etherscan delante de alguien y
señalar el registro de una votación vuestra, y explicar en un minuto qué prueba ese
registro y qué no.

---

## 3º — El paquete institucional: panel de administración + tres documentos

**Qué incluye:**
- **Rehacer el panel de administración como un flujo guiado**: crear elección → censo →
  candidatos → revisión → publicar, con estado "incompleta", avisos de lo que falta, y
  confirmación en las acciones destructivas. Aplicar los tokens de marca y quitar los
  emojis mientras estáis dentro. No hace falta partir `admin.ts` en el backend para
  esto.
- **Tres documentos**, que pesan tanto como el código:
  1. *Cómo funciona VTB y qué garantiza* — para el comité electoral, sin jerga, con la
     respuesta a B4 escrita sin rodeos.
  2. *Tratamiento de datos* — borrador de encargo del tratamiento, subencargados
     (Render, Vercel, Resend, Alchemy), plazos de conservación, procedimiento de
     borrado.
  3. *Procedimiento electoral* — roles, aprobación del censo, incidencias,
     impugnaciones, copia de seguridad previa y a quién se llama si algo falla.

**Por qué tercero:** quien decide en una universidad no es un desarrollador, es un
secretario general o un vicerrectorado, y lo que pide es papel. Pero estos documentos
**no se pueden escribir antes** de los puntos 1 y 2: describirían garantías que todavía
no existen, y un documento que promete de más es peor que no tener documento. Va
tercero, no último: es el que convierte, y es material que podéis ir redactando en los
huecos mientras esperáis respuestas.

**Estimación:** 2 semanas el panel, 1 los documentos. Se pueden solapar: uno escribe
mientras el otro programa.

**Señal de que está hecho:** podéis mandar un correo a una universidad con tres PDF
adjuntos y un enlace, sin tener que explicar nada más por teléfono.

---

## Qué NO haría ahora

Para que la lista de arriba signifique algo, estas cosas están en el documento y **no**
son de las próximas semanas:

- Partir `admin.ts` en sub-routers. Es deuda real, no bloquea nada.
- Terminar el modo oscuro. Alternativa más barata: quitar el toggle hasta que haya
  tiempo. Medio roto es peor que ausente.
- Reducir el bundle de 810 kB.
- Completar la accesibilidad entera. Sí haría las etiquetas de los formularios de login
  y registro, que son 10 campos y media hora.
- Traducir el panel de administración al inglés.
- Cualquier cosa con ZK, pruebas de conocimiento cero o recuento homomórfico. Es la
  tentación evidente de un proyecto así y es lo que impedirá que terminéis los puntos 1
  a 3.

---

## Una última cosa, práctica

Antes de nada: **commitead los 38 ficheros del árbol de trabajo**. Todo el cierre de
AUDITORIA_2 está sin versionar, así que ahora mismo vuestra copia local es la única que
lo tiene y lo que se enseña en la demo pública es código anterior. Un portátil que se
rompa se lleva semanas de trabajo. Es lo único de este documento que se puede hacer hoy
en diez minutos.

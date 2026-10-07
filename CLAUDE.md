# VTB — Contexto del proyecto

Plataforma de votación institucional con registro en blockchain.
Proyecto de Javier Picazo y Jaime Ordovás, Ingeniería Informática (UFV).

---

## Reglas de trabajo

- **No añadas `Co-Authored-By: Claude` ni ninguna referencia a Claude
  Code en los mensajes de commit.**
- No hagas cambios masivos sin explicar antes qué vas a tocar y por qué.
- Prefiere cambios pequeños y verificables a refactors grandes.
- Build y tests después de cada módulo tocado, no al final de todo.
- No inventes dependencias ni servicios: si algo requiere una cuenta o
  una clave, dilo y para.
- Si encuentras un problema que no se te ha pedido, señálalo igualmente.
- Un informe que dice "hecho" no es prueba de nada: verifica con
  `git diff`, con los tests, o usando la aplicación.

---

## Cómo programar aquí

### Primero el test, después el código (TDD)

Para todo cambio de comportamiento —función nueva, arreglo, regla de
negocio— el orden es este, y no se salta:

1. **Escribe el test** que describe lo que debe pasar, en
   `backend/src/__tests__/` (con los helpers de `helpers/fixtures.ts`).
2. **Ejecútalo y comprueba que falla**, y que falla *por la razón
   correcta*. Un test que nunca ha fallado no demuestra nada.
3. **Escribe lo mínimo** para que pase. Nada más.
4. **Vuelve a ejecutar** ese test y después la suite entera, más
   `npx tsc --noEmit`.
5. **Refactoriza** solo con los tests en verde.

Reglas de los tests:

- Un arreglo de bug empieza por un test que reproduce el bug.
- Se prueban **los dos lados**: lo que se deniega y lo que sigue
  pudiendo hacer quien debe. Un guard que deniega a todos deja verde un
  test que solo mira el rechazo.
- Aserciones exactas (`toBe(409)`), no `not.toBe(404)`: un `not` pasa
  también cuando la ruta falla por otro motivo.
- Datos de test con valores propios (dominio, email, elección con
  fechas futuras o pasadas según el caso). Que un test pase porque la
  elección "ya empezó" y la ruta cortó antes de llegar a lo que querías
  probar es un test que no prueba nada.
- Ningún test depende del orden de otros ni de datos que dejó otro.
- Nunca contra Supabase (ver más abajo).

Excepción razonable: texto de interfaz, estilos y documentación no
llevan test previo. Se comprueban con `npm run build` y mirándolo.

### Simplicidad

- **La solución más simple que cumpla el requisito.** Si dudas entre dos,
  la que tiene menos piezas.
- **No construyas para un futuro que nadie ha pedido**: nada de
  parámetros, opciones, capas o abstracciones "por si acaso".
- **No abstraigas hasta la tercera repetición.** Dos copias son
  tolerables; una abstracción prematura cuesta más que duplicar.
- **Reutiliza antes de escribir**: busca en el repo (`shared.ts`,
  `utils/`, `db/`, `helpers/`) si ya existe. No inventes dependencias.
- **Funciones cortas, un solo cometido.** Si necesitas "y" para
  describirla, son dos funciones.
- **Borra el código muerto** que encuentres en lo que tocas; no lo
  comentes ni lo dejes "por si acaso" (para eso está git).
- **Un cambio, un motivo.** No mezcles arreglo, refactor y estilo en el
  mismo commit.

### Errores tontos que ya nos han pasado

- **SQL siempre parametrizado** (`?`). Nunca se interpolan datos del
  usuario; solo nombres de columna fijos escritos en el código.
- **Toda entrada se valida** (zod en el backend): tipo, longitud y
  formato. No guardes `req.body` tal cual.
- **Autorización en el servidor, siempre.** Que el frontend oculte un
  botón no protege nada. Cada ruta con `:id` comprueba que ese recurso
  es del que pregunta; si no lo es, 404 (un 403 confirma que existe).
- **Cualquier guard con `if (x && …)` falla abierto.** Si falta `x`,
  se deniega, no se salta la comprobación.
- **Los errores de ethers y de BD no se vuelcan enteros** a un log ni a
  la respuesta: `formatError`. Contienen transacciones firmadas,
  hosts y ids.
- **Nada de secretos, claves ni URLs con credenciales** en código,
  tests, logs, documentación ni mensajes de commit. Si hace falta uno,
  se pide al usuario y se para.
- **`SELECT *` no se devuelve al cliente.** Se eligen las columnas; si
  no, mañana alguien añade una columna secreta y sale por la API.
- **Lo que termina en una consulta, un fichero o un `data:` URL se
  trata como hostil**: whitelist de tipos MIME, de dominios, de valores.
- **Comprueba la hora en segundos o milisegundos**: la BD guarda
  segundos Unix, `Date.now()` da milisegundos.
- **Si cambias un estado o una regla, busca todos los sitios que la
  repiten** (`grep`) antes de darlo por hecho. Casi todos los fallos de
  este proyecto fueron un sitio que se quedó atrás.
- **Un test que pasa tras tu cambio no prueba que lo cubra**: rompe el
  arreglo a propósito y comprueba que el test falla.

### Estilo y coherencia

Escribe como el código que ya hay alrededor; ante la duda, abre un
fichero vecino.

- **Idioma:** comentarios, mensajes de error al usuario y mensajes de
  commit en **español**. Identificadores de código en inglés o como ya
  estén en el fichero (`election_participations`, `recordConfirmedVote`).
- **Comentarios: el porqué, no el qué.** Si el código se explica solo,
  no lleva comentario. Si hay una decisión no obvia (un `404` en vez de
  `403`, un orden de operaciones), se explica en una o dos líneas.
- **TypeScript:** sin `any` nuevo salvo que no haya alternativa
  razonable; `const` por defecto; `async/await`, no cadenas de `.then`;
  imports con extensión `.js` en el backend, como el resto.
- **Backend:** rutas finas, lógica en `services/` y `db/`; una única
  instancia `getDbClient()`; respuestas de error con `{ error: "…" }` y,
  cuando el frontend deba distinguirlas, un `code` estable
  (`CENSUS_FROZEN`).
- **Frontend:** todo texto visible va por i18n en **es y en**; llamadas
  solo por `apiClient`; sin emojis ni glifos decorativos (iconos de
  `Icons.jsx`); colores y estilos con los del resto de la app.
- **Nombres:** descriptivos y completos (`electionId`, no `eid`); un
  booleano se lee como pregunta (`isActive`, `hasVoted`).
- **Formato:** el que ya tiene el fichero (sangría, comillas, punto y
  coma). No reformatees líneas que no tocas: ensucia el diff.
- **Commits:** un tema por commit, en español y en imperativo o
  descriptivo, con prefijo `fix(…)`, `feat(…)`, `test(…)`, `docs(…)`,
  `chore(…)`, como en el historial. Sin referencias a Claude (ver
  arriba).
- **Antes de dar algo por terminado:** `npm test` y `npx tsc --noEmit`
  en el backend; `npm run build` y `npm run lint` en el frontend; y
  `git diff` para comprobar que solo cambió lo que querías.

---

## Cosas que NO hay que romper

Esto es lo más importante del documento. Todo lo de esta sección se
rompió alguna vez y costó trabajo arreglarlo.

### Nunca afirmar que el voto es anónimo

Desde la migración 016 (SCRUM-17) la participación
(`election_participations`: elección y usuario, sin hora) y el voto
(`nullifier_audit`: sin `user_id`, id aleatorio, hora al minuto) están
en tablas separadas. La frase exacta, la de SEGURIDAD.md, es: "la base
de datos no conserva la correspondencia entre votante y voto una vez
cerrada la elección, pero el operador la conoce en el momento de
procesar el voto".

El voto **sigue sin ser anónimo**: el operador lo conoce al procesarlo
(el servidor calcula el nullifier durante la votación, `vote_attempts`
une usuario y nullifier mientras hay un voto pendiente, y hay copias de
seguridad y registros de plataforma que lo conservan). Antes de la 016
se eliminaron unas cuarenta afirmaciones falsas repartidas por
interfaz, correos, PDFs exportados y los textos en ambos idiomas.

Lo que **sí** se puede decir: registro inmutable, recuento verificable,
y prevención criptográfica del doble voto mediante nullifier.

Cuando Semaphore esté implementado se podrá recuperar la afirmación.
Hasta entonces, no — ni en código, ni en comentarios, ni en textos de
ejemplo.

### Los tests nunca corren contra Supabase

`setup.ts` fuerza SQLite en memoria. No lo toques. Una ejecución contra
Supabase llegó a sobrescribir las contraseñas de administración con
valores que están en el repositorio público.

### `npm run seed` no borra sin `--reset`

Y nunca se pone como comando de arranque en Render: borraría el censo y
los votos en cada despliegue.

Además, `seed` y `seed:reset` exigen `NODE_ENV` distinto de `production`
**y** `ALLOW_SEED_RESET=true` puesta a mano — sin esa variable, no se
ejecutan en ningún caso, tenga o no datos la base. Es una red de
seguridad aparte de mirar si la base está vacía: una base recién
migrada en producción tiene 0 usuarios, y solo con la comprobación
antigua eso bastaba para sembrarla igual.

### Desarrollo no toca la base de producción

Hay **un único proyecto de Supabase para VTB** (`VTB`, Frankfurt, ref
`pxqejrptikoqoaokoqaq`) y es **producción**: Render lo usa y tiene datos
y votos reales. No existe un Supabase de desarrollo.

Para desarrollar se usa una base **local**:

- **SQLite** (`DB_CLIENT=sqlite`, el valor por defecto si no defines la
  variable), o
- **PostgreSQL en Docker** si hace falta el mismo motor que producción
  (comandos en SETUP.md, "Si usas PostgreSQL"; requiere Docker Desktop
  arrancado y `?sslmode=disable` en la URL).

El `.env` local no apunta a la `DATABASE_URL` de producción, ni un
momento para probar algo. Si algún día se crea un proyecto de desarrollo,
tendrá sus propios `JWT_SECRET`, `NULLIFIER_SECRET` y contraseñas del
seed.

Salvaguarda en código: con `DB_CLIENT=postgres`, `seed` y `seed:reset` se
niegan a ejecutarse salvo que `DATABASE_URL` apunte a `localhost`,
`127.0.0.1` o `::1`. `SEED_REMOTE_DB_OK=true` lo salta para un proyecto
remoto **de desarrollo**; nunca se define contra producción. Lo vigila
`seed-env-guard.test.ts`.

**Pendiente, con dueño (Javier):** a 07-10-2026 su `backend/.env` seguía
apuntando al proyecto de producción (comprobado comparando el
identificador, sin leer credenciales). Hay que cambiarlo a SQLite o a un
PostgreSQL en Docker. Hasta entonces, un `npm run dev` con ese fichero
trabaja sobre la base real: no se emiten votos con cuentas reales, no se
aplican migraciones sin copia previa (la 016 es irreversible) y
`ALLOW_SEED_RESET` no se define. `DEMO_LOGIN_ENABLED=true` solo en local:
en Render va desactivado y `/auth/demo-login` responde 404 (comprobado).

### No meter datos personales en la cadena

Solo hashes y compromisos. Es lo que hace defendible el proyecto ante
el RGPD: el derecho de supresión es incompatible con la inmutabilidad
si el dato identificable está on-chain.

### Los ids de elección salen del evento `ElectionCreated`

No se renumeran ni se asumen correlativos con la base de datos. Hubo un
fallo por el que las elecciones de la base se numeraban 1, 2, 3 y se
daba por hecho que eran las mismas del contrato, cuando no lo eran: un
voto real habría quedado registrado en la elección equivocada.

### Crear elección no espera a la confirmación en cadena

La elección y sus candidatos se guardan en una transacción, se responde
al momento en estado pendiente, y el registro en blockchain va por
detrás con reintentos. Si vuelve a bloquear esperando a Sepolia, el
formulario falla por timeout y se crean duplicados.

### `castVote` recibe la POSICIÓN del candidato, no `candidates.id`

`candidates.id` es un autoincremento global de la base; la posición es
el número de orden dentro de esa elección, 0..n-1. El contrato indexa el
recuento por la posición (`votesFor[electionId][candidateId]`) y rechaza
cualquier valor `>= candidateCount`.

`routes/elections.ts` envía `candidato.position`. Mandar el `id` en su
lugar registra el voto a otro candidato, o revierte si se sale de rango.
Es la misma clase de fallo que el de los ids de elección.

### `candidateId` es obligatorio y se valida contra esa elección

No hay voto sin candidato, y se comprueba que el candidato pertenece a
la elección antes de enviar nada a la cadena.

Las posiciones tienen que ser 0..n-1 densas, sin huecos ni repetidos:
`services/candidatesRoot.ts` lanza `ListaDeCandidatosInvalida` si no lo
son. Con posiciones {0, 5} y dos candidatos, el contrato registraría
`candidateCount = 2` y el voto al 5 revertiría en cadena.

### No se inventan hashes: si la elección no está en el contrato, 503

Había dos caminos (BC-21 y BC-22) que, cuando la transacción fallaba,
guardaban un SHA-256 con prefijo `0x` —indistinguible de un hash de
transacción real para quien no consulte la cadena— y respondían que el
voto se había registrado correctamente. Un voto fuera de cadena
presentado como voto en cadena.

Si `chain_status` no es `synced`, es `503 ELECTION_NOT_ON_CHAIN` para
todo el mundo, cuentas de demostración incluidas. Un campo sin
transacción real va a NULL, nunca a un dato con forma de prueba.

### `onChainVerified` significa que los dos recuentos coinciden

No significa que alguna fila tenga `tx_hash`. Antes era eso: con 1.000
votos de los que uno llegó a la cadena, la elección salía verificada — y
ni siquiera se consultaba la cadena, se miraban columnas que la propia
base había rellenado.

Ahora se pide `getTally()` al contrato y se compara candidato a
candidato contra la base, contando solo los votos cuyo `vote_source` es
`chain`. Cuatro estados: coincide, discrepancia, sin-respuesta y
no-aplica. **Sin respuesta no es verificado**: que el nodo no conteste
no dice nada sobre el resultado.

### `queryFilter` siempre con rango desde el bloque de despliegue

Sin rango empieza en el bloque 0, y todos los proveedores limitan
`eth_getLogs`: la consulta fallaba siempre y el job de reconciliación no
funcionó nunca (BC-23).

Se parte de `DEPLOY_BLOCK`, o de `contract.deploymentBlock()` si no está
definida, y se avanza en ventanas de 45.000 bloques.

### Ninguna tabla junta `user_id` con el voto

Ninguna tabla nueva puede tener `user_id` junto a `nullifier_hash`,
`candidate_id` o `tx_hash`. Solo `vote_attempts` está exenta (voto en
curso, caduca). Lo vigila `separacion-participacion.test.ts`, que
recorre el esquema.

### El camino del voto no escribe al usuario en logs ni en `email_log`

Ni `userId` en un `console.*` junto a electionId o txHash, ni correo de
confirmación de voto: la fila de `email_log` (destinatario + fecha) se
cruza con la hora del voto. Lo vigilan `vote-logs-privacy.test.ts` y
`separacion-participacion.test.ts`.

### El owner del contrato nunca en un `.env`

Son dos claves distintas y se custodian por separado (BC-05):

- **relayer**: caliente, vive en el servidor porque firma cada voto. Es
  lo único que hay en `PRIVATE_KEY`.
- **owner**: fría, fuera del servidor. Autoriza o revoca relayers,
  detiene elecciones y traspasa la propiedad.

`scripts/deploy.ts` aborta en una red real si el owner y el relayer son
la misma dirección. El owner no puede borrar ni reescribir votos ya
emitidos, pero **sí podría autorizarse a sí mismo como relayer y emitir
votos nuevos** (`setRelayer`), así que su custodia fría importa. Si el
servidor se ve comprometido, revoca su relayer sin redesplegar el
contrato y sin perder el histórico.

---

## Stack

| Capa | Tecnología | Dónde |
|------|-----------|-------|
| Frontend | React 19 + Vite | Vercel |
| Backend | Express 5 + TypeScript | Render |
| Base de datos | PostgreSQL | Supabase (Frankfurt) |
| Contratos | Solidity 0.8.24 | Ethereum Sepolia |
| Correo | Resend | — |

Migraciones con **node-pg-migrate** (ficheros `.cjs` en
`backend/migrations/`). No confundir con el formato del CLI de
Supabase: son incompatibles.

---

## Arrancar en local

```
# Terminal 1
cd backend
npm run dev

# Terminal 2
cd frontend
npm run dev
```

Abre `http://localhost:3000`. El backend está en `:3001`.

En el log del backend deben salir "Usando PostgreSQL como motor de BD"
(o "Usando SQLite" si `DB_CLIENT` no es `postgres`) y "VTB Backend
iniciado". Sin `DB_CLIENT` arranca en SQLite, que es lo normal en local.
**Si tu `.env` tiene la `DATABASE_URL` de Supabase, estás sobre la base de
producción**: lee "Desarrollo no toca la base de producción" arriba.

Variables imprescindibles en `backend/.env`: `FRONTEND_URL=http://localhost:3000`,
`JWT_SECRET`, `NULLIFIER_SECRET`, `CORS_ORIGINS` (con `http://localhost:3000`)
y los `SEED_*` obligatorios si vas a sembrar. `DB_CLIENT=postgres` y
`DATABASE_URL` solo con un PostgreSQL **local**.

`NODE_ENV` debe ser `development` en local, o las cookies llevan
`Secure` y el navegador las rechaza sobre HTTP.

Ver **SETUP.md** para el detalle completo.

### Mensajes de arranque que confunden y no son errores

- "Blockchain configurado: 0x0000…" si no hay Sepolia configurado
- Un aviso sobre SQLite aunque se esté usando PostgreSQL
- Las elecciones creadas en local sin Sepolia salen como "Pendiente de
  blockchain"

---

## Seguridad: cómo está montado

- JWT en cookies httpOnly con `Secure` y `SameSite`, nunca en
  `localStorage` ni en el body de la respuesta
- CSRF montado globalmente, con exenciones solo en login, registro y
  endpoints sin sesión previa
- Refresh con rotación; logout revoca en servidor
- Todas las llamadas del frontend pasan por `apiClient` con
  `credentials: 'include'`. Ninguna manda cabecera `Authorization`
- Rate limiting del voto por `userId`, no por IP (una universidad
  entera sale por la misma IP pública)
- Los tokens de recuperación e invitación se generan en el momento del
  envío: nunca se guardan en claro en `email_log`
- Ningún `catch` debe volcar el objeto de error completo de ethers:
  contiene la transacción firmada
- `requireAuth` consulta `deleted_at` en cada petición: una cuenta de
  baja pierde la sesión al instante (401), no a los 15 minutos del JWT
- JWT fijado a HS256 al firmar y al verificar
- CORS: los orígenes de `localhost` solo se admiten fuera de producción
- El atajo de voto `@vtb.demo` (fuera de cadena) solo existe con
  `DEMO_LOGIN_ENABLED=true` o en tests; en producción esas cuentas votan
  por el camino normal
- Un admin de dominio solo gestiona lo de su dominio (solicitudes,
  dominios de una elección, votantes). Sin `admin_domain`, no alcanza
  nada; solo el superadmin ve todo
- `ephemeral_salt` no sale del servidor, y no se destruye por ocultar una
  elección (`is_active`), solo al vencer `end_time`
- Lecturas públicas que consultan la cadena (`GET /api/elections/:id` y
  `/:id/results`) llevan límite por IP

---

## Qué falta, por orden

1. **Anonimato criptográfico** con Semaphore. Hasta que esté, VTB no es
   lo que su nombre promete.
2. **Recuento verificable en cadena.** Hecho en el contrato
   `ElectionRegistryV2`: `castVote` lleva el candidato y `getTally()`
   permite recontar desde fuera. El procedimiento para un tercero está
   en `RECUENTO_INDEPENDIENTE.md`.
   Estado en Sepolia, leído de la cadena el 07-10-2026: el contrato v2
   (`0x124759Cc…F607`, bloque 11724119, registrado en
   `blockchain/deployments/sepolia.json`) tiene el relayer
   `0x5D73…D572` **autorizado** (`isRelayer` = true), el owner es otra
   dirección (`0x8780…9d6b`) y `getElectionCount()` es 0: todavía no se
   ha creado ninguna elección en el v2.
   Pendiente: comprobar que Render usa `CONTRACT_ADDRESS` y
   `DEPLOY_BLOCK` del v2 (el `.env` local sigue en el v1 `0x9211…`), crear
   la primera elección en el v2 y recontarla con `RECUENTO_INDEPENDIENTE.md`,
   y el corte de las elecciones que siguen en el contrato anterior.
3. **Salir de Sepolia.** Es una red de pruebas sin garantías. La opción
   natural es Alastria.
4. **Documentación legal.** Política de privacidad, registro de
   tratamientos, contratos de encargado del tratamiento con los
   proveedores, declaración de accesibilidad. Las páginas existen en
   `frontend/src/pages/legal/` pero tienen unos 29 `[RELLENAR]`, y faltan
   el registro de tratamientos y los contratos de encargado. Es lo que
   va a parar un piloto en el servicio jurídico de una universidad, no
   el código.

---

## Documentación

Raíz:

- **SETUP.md** — puesta en marcha en local y variables de entorno.
- **SEGURIDAD.md** — qué garantiza el sistema y qué no, escrito para
  un comité electoral. Lo lee `seguridad-claims.test.ts`.
- **ARCHITECTURE.md** — arquitectura, modelo de datos y flujo del voto.
  Lo lee `architecture-claims.test.ts`.
- **RECUENTO_INDEPENDIENTE.md** — cómo recuenta una elección alguien
  de fuera, sin credenciales nuestras. Es el entregable que sostiene
  la tesis del proyecto.

`docs/`:

- **DESARROLLO.md** — flujo de ramas, todos los scripts, cadena local de
  Hardhat y problemas frecuentes.
- **DESPLIEGUE.md** — Render, Vercel, Supabase, contrato y cómo verificar
  un despliegue.
- **API.md** — referencia de endpoints.
- **CAMBIOS_VERANO_2026.md** — el paso al contrato v2 y lo que
  arrastra: base de datos, camino del voto y resultados.
- **PROGRESO_PLAN.md** — estado frente al plan de trabajo de julio.
- **historico/** — auditorías pasadas, solo para trazar sus hallazgos
  (el código las cita por id: P1-xx, BC-xx, C-1, M-1…). No describen el
  estado actual.

Regla: **un hecho se documenta en un solo sitio** y los demás documentos
enlazan a él. Los informes "foto de una fecha" (estado, inventarios,
cierres de sprint) no se guardan en el repositorio: caducan a la semana
y acaban contradiciendo al código. Si cambias una ruta, un script o una
variable, busca con `grep` el documento que la menciona y corrígelo en
el mismo commit.

No hay una base de Supabase por desarrollador: la única es producción
(ver "Desarrollo no toca la base de producción"). Cada uno desarrolla en
su SQLite o en su PostgreSQL local.

---

## Estado y traspaso (actualizar en cada sprint)

Lo que ya está en las reglas de arriba no se repite aquí.

### SCRUM-17 (opción A), hecho en la rama JavierPicazo

- **Dos tablas:** `election_participations (election_id, user_id)` y
  `nullifier_audit` sin `user_id` (migración 016).
- **`recordConfirmedVote`** (`backend/src/db/voteRecord.ts`) es el único
  punto de escritura de las dos: voto normal, voto de demo y
  reconciliación pasan por él, en una transacción.
- **Se quitó:** el correo de confirmación de voto (y sus filas
  históricas de `email_log`), `userId` en los logs del camino del voto,
  la columna `vote_choice`, y los scripts `db:migrate` / `db:rollback`.
- **Lo vigilan:** `separacion-participacion.test.ts`,
  `vote-logs-privacy.test.ts`, `receipt-not-persisted.test.ts` y
  `seguridad-claims.test.ts`.
- **Frontend en producción:** la API es siempre `/backend`, aunque
  `VITE_API_URL` esté definida (solo se respeta en desarrollo). Lo
  vigila `frontend-api-base.test.ts`.

### Decisiones abiertas, para revisar juntos

- Plazos de `vote_attempts`: 24 h los fallidos, 72 h los colgados.
- El comprobante (hash de la transacción) solo se ve una vez, al votar.
- El panel de participación no muestra fecha ni hora.

### Despliegue

- El *start command* de Render vive en el panel, no en el repo, y aplica
  las migraciones solo: `npm run migrate && node dist/index.js`, con
  autoDeploy en cada commit a `main` (comprobado con la API de Render el
  29-09-2026).
- Copia de seguridad ANTES de fusionar. La 016 es irreversible (su
  `down` lanza un error). Orden: 015 → 016.
- La 015 (`registration_email_verification`) entra en `main` solo como
  fichero. El código de ese registro con confirmación por correo
  (SCRUM-123, rama `JaimeOrdovas`) sigue sin fusionar hasta que Resend
  funcione en producción.

### Pendiente, con dueño

- Resend y dominio: Javier.
- `[RELLENAR]` de la Política de Privacidad: los dos.
- Health check path en Render (`/health`, que ya devuelve 503 si la base
  no responde): Javier.
- Borrar la copia de seguridad previa a la 016 a los 30 días: Javier.
- Plazo de conservación de `nullifier_audit`: decidir juntos.
- `docker-compose.yml` y `frontend/nginx.conf` están rotos (`nginx.conf` es
  un script de PowerShell y no hay proxy a `/backend`). Decidir si se
  arreglan o se borran: los dos.

### Cómo comprobar en local que todo va

```
# Backend: tests y typecheck
cd backend
npm test
npx tsc --noEmit

# Frontend: build
cd ../frontend
npm run build

# Migración 016 en un PostgreSQL local de Docker (nunca Supabase)
docker run -d --name vtb-pg -e POSTGRES_PASSWORD=local -e POSTGRES_DB=vtb -p 55432:5432 postgres:17
cd ../backend
export DATABASE_URL="postgresql://postgres:local@localhost:55432/vtb?sslmode=disable"
npm run migrate
VTB_SCHEMA_TEST_PG_URL="postgresql://postgres:local@localhost:55432/vtb"   npx vitest run src/__tests__/separacion-participacion.test.ts
docker rm -f vtb-pg
```

- `npm run migrate` ejecuta `node-pg-migrate up --reject-unauthorized`, y ese
  flag obliga a usar SSL: contra un Docker local sin SSL falla con "The server
  does not support SSL connections". Por eso la URL lleva `?sslmode=disable`
  (comprobado).
- `VTB_SCHEMA_TEST_PG_URL` solo acepta un host local.
- Para probar la 016 con datos, deja la base en la 015, inserta votos `chain`,
  `demo` y `legacy`, y aplica el resto. `up N` aplica **N migraciones**, no "hasta
  la N": hay 15 ficheros anteriores a la 016 en `backend/migrations`, así que
  para dejar una base vacía en la 015 es `npm run migrate -- 15` (lo que va
  detrás de `--` se pasa a `node-pg-migrate`). Después, `npm run migrate` aplica
  la 016.

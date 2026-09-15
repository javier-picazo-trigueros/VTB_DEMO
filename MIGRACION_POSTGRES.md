# Migración a PostgreSQL — estado y pasos pendientes

**Fecha:** 14 de septiembre de 2026
**Alcance:** PASOS 1 a 4 completos. El PASO 3 se ejecutó contra un PostgreSQL 16
real en Docker, no simulado. El despliegue (PASO 4) está en
[DESPLIEGUE_RENDER.md](DESPLIEGUE_RENDER.md).

El inventario previo está en [INVENTARIO_SQLITE.md](INVENTARIO_SQLITE.md), con el
detalle de las 194 consultas en
[INVENTARIO_SQLITE_tablas.md](INVENTARIO_SQLITE_tablas.md).

---

## Estado de verificación

| Comprobación | Resultado |
|---|---|
| `npx tsc --noEmit` | ✅ Limpio |
| `npm run build` | ✅ Compila |
| `npx vitest run` | ✅ **110 tests** (73 originales + 37 nuevos), todos pasan |
| `npm run lint` | ⚠️ 77 errores — **ya fallaba antes** (79 en HEAD). Ver nota al final |
| Ninguna importación del cliente SQLite fuera de la capa de compatibilidad | ✅ Verificado |
| Prueba manual contra PostgreSQL 16 | ✅ **Hecha** — ver PASO 3 abajo. Encontró 1 bug real |

Los 73 tests originales siguen pasando porque `getDbClient()` cae a SQLite cuando
`DB_CLIENT` no es `postgres`, que es como corren los tests. Eso es la red de
seguridad de la sustitución, pero **no prueba nada sobre PostgreSQL**: todas las
incompatibilidades de motor son invisibles desde ahí. De ahí el PASO 3 — que
efectivamente encontró un fallo que ninguno de los 110 tests veía.

---

## PASO 2 — Qué se ha cambiado

### Módulo 0 — Bloqueantes previos (no era solo cambiar de cliente)

Tres cosas impedían que el backend funcionase sobre PostgreSQL aunque se migrasen
todas las llamadas.

**Migración nueva** `20260914000005_refresh_tokens_and_election_image.cjs`:

- Crea `refresh_tokens`, que **no existía en PostgreSQL**. La escribe
  `setSessionCookies()` en cada login correcto, así que sin ella no se podía ni
  iniciar sesión. Con `revoked BOOLEAN` y `expires_at TIMESTAMPTZ`, no los tipos
  numéricos/texto de SQLite.
- Añade `elections.image_url`, que tampoco existía. Sin ella, subir la imagen de una
  elección fallaba y las existentes desaparecían de la interfaz.

**`db/postgres.ts`** — `normalizeSql()` añadía `RETURNING id` a todos los INSERT,
incluidos los de `election_voters`, que tiene clave primaria compuesta y ninguna
columna `id`. Eran 13 llamadas y justo las de asignar personas al censo. Ahora hay
una lista explícita `TABLES_WITHOUT_ID` y el RETURNING se omite en esas tablas.

**`db/client.ts`** — nuevo `isUniqueViolation(err)`. Seis sitios detectaban
violaciones de unicidad con `err.message.includes('UNIQUE')`, que es el texto de
SQLite. En PostgreSQL el error es `23505` / `duplicate key value…`, así que esos
seis `409` se habrían convertido en `500`.

**`src/__tests__/pg-sql.test.ts`** — 12 tests nuevos sobre la traducción
SQLite→PostgreSQL. Existen precisamente porque no hay PostgreSQL con el que probar:
es lo único de la capa de compatibilidad que sí se puede verificar sin base de
datos. Cubren la numeración de placeholders (incluido el caso de los `WHERE`
montados por concatenación, que es donde se desalinearían los parámetros), la
traducción de `INSERT OR IGNORE`, y la regresión del `RETURNING id`.

### Módulo 1 — auth

`routes/auth.ts` (22 llamadas) y `middleware/auth.ts` (1) pasan a `getDbClient()`.

- `VALUES (…, 0, 1)` → `VALUES (…, FALSE, TRUE)` y `revoked = 1` → `revoked = TRUE`
  (5 sitios). `TRUE`/`FALSE` funciona en los dos motores: SQLite 3.52 los acepta y
  los almacena como 1/0.
- Tipos ampliados a `boolean | number` y `string | Date` donde el valor cambia de
  forma según el motor (`is_approved`, `revoked`, `expires_at`, `used_at`). Las
  comparaciones ya funcionaban en ambos; lo que estaba mal era el tipo, que decía
  que llegaba un número cuando en producción llegará un booleano.

### Módulo 2 — registration

`routes/registration.ts` (9 llamadas). Booleanos, y el `includes('UNIQUE')` del
alta auto-aprobada sustituido por `isUniqueViolation`.

### Módulo 3 — admin

`routes/admin.ts` (89 llamadas), el más grande.

- 10 comparaciones booleanas numéricas.
- 5 detecciones de unicidad.
- `email_domain = "*"` → `email_domain = '*'`. En PostgreSQL las comillas dobles
  son un identificador, así que esa consulta fallaba con `column "*" does not exist`.
- `strftime('%s','now')` → el epoch se calcula en JS y se pasa como parámetro.
- `substr(email, instr(email,'@')+1)` → el dominio se extrae en JS. `instr` no
  existe en PostgreSQL y `split_part` no existe en SQLite, así que no había una
  forma portable de hacerlo en SQL.
- `date('now', '-7 days')` → el corte se calcula en JS. La forma de dos argumentos
  es exclusiva de SQLite. El formato que se pasa es `'YYYY-MM-DD HH:MM:SS'`, que
  vale en ambos: en SQLite la comparación es lexicográfica y ordena bien, y
  PostgreSQL lo interpreta como timestamp. Un ISO-8601 con la `T` habría roto la
  comparación en SQLite **sin dar ningún error**.

### Módulo 4 — app.ts

`app.ts` (9) y `routes/organizations.ts` (1).

- `COUNT(DISTINCT substr(...))` de instituciones activas → se cuentan dominios
  distintos en JS.
- El recorte del nullifier de la página pública de auditoría
  (`substr(h,1,10) || '...' || substr(h,-4)`) → se hace en JS. En SQLite
  `substr(x,-4)` cuenta desde el final; en PostgreSQL un offset negativo significa
  otra cosa y el resultado habría salido **mal en silencio**, que en una pantalla de
  auditoría pública es peor que un error.

### Módulo 5 — seed y syncElections

`scripts/seedDatabase.ts` (53) y `scripts/syncElections.ts` (2). Sin esto,
`npm run seed` habría seguido sembrando en SQLite con la base PostgreSQL vacía.

Ambos llamaban a `db.initialize()`, que solo existe en la clase SQLite. Se sustituye
por **`ensureSchema()`** (nuevo en `db/index.ts`): en SQLite crea las tablas como
hasta ahora; en PostgreSQL no hace nada, porque el esquema lo crean las migraciones.

### Corrección posterior: booleanos posicionales (16 casos)

El primer barrido buscaba `columna = 1` y **no cazó los literales posicionales
dentro de un `VALUES`**, que es la forma más común en este código:

```sql
INSERT INTO users (…, is_approved, approved_by, approved_at, is_eligible, must_change_password)
VALUES (?, ?, ?, ?, 'student', 1, ?, CURRENT_TIMESTAMP, 1, 1)
```

Eran **16 literales en 9 INSERT** (7 en `admin.ts`, 2 en `seedDatabase.ts`), más dos
parámetros booleanos que se pasaban como número (`tempPassword ? 1 : 0` en la
aprobación de solicitudes, y `is_active ? 1 : 0` en `PATCH /elections/:id`). En
PostgreSQL todos fallan con `column … is of type boolean but expression is of type
integer`. Afectaban a: crear usuario desde el panel, importar censo por CSV, crear
elección, aprobar una solicitud, crear admin de dominio y el seed entero.

Para que no vuelva a pasar hay dos tests estáticos en `pg-sql.test.ts` que recorren
el código fuente y fallan si reaparece un `0`/`1` sobre una columna booleana, sea
como comparación o como parámetro. Es un guard, no un test de comportamiento: sin
PostgreSQL delante no hay otra forma de detectarlo, porque SQLite acepta las dos
formas y los tests pasan igual.

### Atomicidad: `withTransaction`

`DbClient.transaction()` existía pero en SQLite era `return fn(this)` — un no-op
con el comentario "las operaciones son atómicas de facto". No lo eran. Ahora:

- **SQLite**: `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK` reales. Como node-sqlite3
  usa una sola conexión y SQLite no admite `BEGIN` anidado, las transacciones se
  serializan con una cola de promesas; una transacción dentro de otra reutiliza
  la de fuera en vez de abrir una nueva.
- **PostgreSQL**: ya era correcto — conexión dedicada del pool, y el
  `PgTransactionClient` que recibe el callback usa esa conexión en todos sus
  métodos.

**La regla**: dentro del callback hay que usar `tx`, nunca `db`. En PostgreSQL
una consulta contra el cliente general coge otra conexión del pool, queda fuera
del `BEGIN` y **el ROLLBACK no la deshace**. Compila, pasa los tests sobre SQLite
(una sola conexión, da igual) y solo se ve en producción como datos a medias — es
exactamente el fallo que tiene hoy `scripts/migrate-sqlite-to-pg.ts`.

Como eso no se puede garantizar por tipos, hay un **test estático** que recorre el
código, extrae el cuerpo de cada callback de transacción y falla si encuentra una
llamada al cliente general.

Bloques hechos transaccionales:

| Dónde | Qué protege |
|---|---|
| `auth.ts` /refresh | Rotación: revocar el viejo y emitir el nuevo. Al revés quedarían dos tokens válidos |
| `auth.ts` /forgot-password | Invalidar enlaces anteriores + emitir el nuevo |
| `auth.ts` /reset-password | Cambiar contraseña + quemar el token. **Sin esto, el enlace de recuperación seguía siendo reutilizable si fallaba el segundo UPDATE** |
| `registration.ts` alta auto-aprobada | Crear cuenta + quemar whitelist + asignar censos |
| `admin.ts` POST /users | Crear cuenta + asignar a sus elecciones por dominio |
| `admin.ts` users/import | CSV completo, en tres fases |
| `admin.ts` import-voters | CSV completo, en tres fases |
| `admin.ts` POST /elections | Elección + targets + acceso + censo (la llamada a blockchain queda fuera) |
| `admin.ts` aprobar solicitud | Crear cuenta + marcar solicitud + asignar censos |
| `seedDatabase.ts` | Toda la creación de datos demo |

### Importación de censo: tres fases

Los dos CSV (`users/import` e `import-voters`) pasaron de "salta la fila rota y
sigue" a "o entra el fichero entero, o no entra nada":

1. **Validar** el CSV completo sin escribir. Devuelve *todos* los errores con su
   número de línea, no solo el primero.
2. **Escribir** dentro de `withTransaction`. Los tokens de invitación se acumulan
   en memoria.
3. **Enviar** los correos, ya con la transacción confirmada.

La fase 3 es lo que obliga a separar: un correo no se puede deshacer. Enviarlo
dentro de la transacción significaría que un ROLLBACK deja a 700 personas con un
enlace de "establece tu contraseña" apuntando a una cuenta que ya no existe.

Es un **cambio de contrato de la API**: antes un CSV con 3 filas malas de 800
importaba 797 y devolvía 200; ahora devuelve 400 y no importa nada. `csv.test.ts`
se reescribió para reflejarlo.

### Fuera de módulo

- **`index.ts`** usa `ensureSchema()`. Antes creaba el esquema SQLite en cada
  arranque pasara lo que pasara, así que en modo PostgreSQL dejaba además un
  `vtb.db` vacío en el disco que despistaba al diagnosticar.
- **`routes/elections.ts:611` e `index.ts:116`** tenían `is_active = 1` pese a usar
  ya el cliente nuevo: eran la ruta de registrar voto y el job de notificación de
  apertura, y habrían fallado en PostgreSQL. Corregidos.
- **`db/index.ts`** valida que `DATABASE_URL` empiece por `postgresql://`. Tu
  `backend/.env` tiene hoy `DATABASE_URL=./vtb.db`; sin esta comprobación, activar
  `DB_CLIENT=postgres` con esa variable heredada daba un error de red incomprensible.
- **`scripts/migrate-sqlite-to-pg.ts`**: ahora copia `image_url` también a la fila de
  la elección. Solo lo metía en `election_images`, que ningún código lee, así que
  migrar los datos habría borrado todas las imágenes de la interfaz.
- **`__tests__/seed-passwords.test.ts`**: timeout explícito de 30 s en el test que
  hace 12 verificaciones bcrypt. Tenía el límite por defecto de 5 s y pasaba por los
  pelos; al añadir un fichero de tests más se quedaba sin CPU y fallaba por tiempo,
  no por la aserción. No se ha tocado ninguna comprobación.

**No se ha eliminado nada de SQLite**, como pediste. `config/database.ts`,
`sqlite-adapter.ts` y la dependencia `sqlite3` siguen en su sitio, y `DB_CLIENT`
sin valor sigue arrancando en SQLite exactamente igual que antes.

---

## PASO 3 — Verificación manual (pendiente, te toca)

Necesitas un PostgreSQL. La forma más rápida, con Docker Desktop arrancado:

```bash
docker run -d --name vtb-pg -p 5432:5432 \
  -e POSTGRES_PASSWORD=vtb -e POSTGRES_USER=vtb -e POSTGRES_DB=vtb \
  postgres:16
```

Luego, desde `backend/`:

```bash
# 1. Crear el esquema (las 7 migraciones)
DATABASE_URL=postgresql://vtb:vtb@localhost:5432/vtb npm run migrate

# 2. Sembrar datos de demo en PostgreSQL. SOLO con la base vacía: si ya hay
#    algún usuario, `npm run seed` aborta sin tocar nada. Para borrar y volver
#    a sembrar: `npm run seed:reset`.
DB_CLIENT=postgres DATABASE_URL=postgresql://vtb:vtb@localhost:5432/vtb \
SEED_SUPERADMIN_PASSWORD=... SEED_DEMO_ADMIN_PASSWORD=... SEED_DEMO_SUPERADMIN_PASSWORD=... \
npm run seed

# 3. Arrancar el backend en modo PostgreSQL
DB_CLIENT=postgres DATABASE_URL=postgresql://vtb:vtb@localhost:5432/vtb npm run dev
```

En el arranque deberías ver `✅ Usando PostgreSQL como motor de BD` y
`ℹ️ PostgreSQL: el esquema lo gestionan las migraciones`. Si ves
`✅ Base de datos SQLite inicializada`, `DB_CLIENT` no ha llegado al proceso.

### Qué probar, y qué se rompía antes en cada caso

Cada línea corresponde a un fallo concreto que esta migración arregla. Si algo va
mal, el sitio donde mirar está en la última columna.

| # | Prueba | Qué verificaba |
|---|---|---|
| 1 | **Login** con `student@vtb.demo` | `refresh_tokens` — sin la migración nueva, el login fallaba entero |
| 2 | Recargar la página estando dentro | `/auth/me` y el refresco de sesión |
| 3 | **Logout** y volver a entrar | `revoked = TRUE` sobre columna BOOLEAN |
| 4 | **Registro** en `/register-request` con un email nuevo | INSERT con `FALSE/TRUE` en vez de `0/1` |
| 5 | Repetir el registro con el **mismo email** → debe dar 409, no 500 | `isUniqueViolation` |
| 6 | Entrar como `admin@vtb.demo` y abrir el **panel** | Dashboard: el epoch en JS y el filtro por dominio |
| 7 | Pestaña de **solicitudes** | La consulta de tendencia con `date('now','-7 days')` |
| 8 | **Aprobar** una solicitud | `is_approved = TRUE` + asignación al censo |
| 9 | **Importar un CSV** de censo | `INSERT OR IGNORE INTO election_voters` — el caso del `RETURNING id` |
| 10 | Crear una **elección** con candidatos y censo | Varias tablas y el `email_domain = '*'` |
| 11 | Subir una **imagen** a la elección | `elections.image_url` |
| 12 | **Votar** con una cuenta del censo | Ruta de voto: `is_active = TRUE` y el cerrojo `vote_attempts` |
| 13 | Intentar votar **dos veces** | Cerrojo atómico real (esto es lo que SQLite no garantizaba) |
| 14 | Ver **resultados** de la elección | Recuento por candidato |
| 15 | Abrir `/transparency` sin sesión | El recorte del nullifier hecho en JS |
| 16 | `GET /api/stats` | El recuento de dominios distintos en JS |

Las 13 y la 9 son las que más me interesan: son las dos que estaban rotas de formas
que no dan error evidente.

Para limpiar y repetir:

```bash
docker rm -f vtb-pg
```

---

## PASO 4 — Qué hace falta en Render

### Antes de nada: qué datos hay realmente que preservar

Conviene decirlo claro porque cambia el plan. El backend corre hoy con
`DATABASE_PATH=./vtb.db` sobre el sistema de ficheros de un servicio web de Render,
que es **efímero**: se recrea en cada redespliegue y en cada reinicio del contenedor.
Es decir, los datos que hay ahora mismo en producción son, como mucho, los
acumulados desde el último despliegue — y se habrían perdido igualmente al siguiente.

Además, en el plan gratuito de Render **no hay acceso por shell**, así que no hay una
forma cómoda de sacar ese `vtb.db` del contenedor antes de desplegar.

Dos caminos:

- **Asumir la pérdida** (lo que recomiendo, salvo que haya datos reales): desplegar,
  y volver a sembrar y reimportar el censo. Es lo razonable si lo que hay son cuentas
  demo y pruebas.
- **Conservarlos**: hace falta sacar el fichero antes de tocar nada. Sin shell, eso
  significa añadir un endpoint temporal de exportación protegido por superadmin,
  desplegarlo, descargar, y luego seguir. Es trabajo añadido y solo merece la pena si
  hay datos que no se pueden reconstruir. Dímelo y lo preparo.

### Variables de entorno en Render

| Variable | Valor | Nota |
|---|---|---|
| `DB_CLIENT` | `postgres` | Sin esto no cambia nada: el arranque sigue en SQLite |
| `DATABASE_URL` | *Internal Database URL* de la base de Render | La interna, no la externa: no sale a internet y no consume ancho de banda |
| `DATABASE_PATH` | **eliminar** | Solo se usa en modo SQLite; dejarla solo confunde |
| `NODE_ENV` | `production` | Ya está. Activa el SSL del pool de `pg` |

Las demás (`JWT_SECRET`, `NULLIFIER_SECRET`, `CORS_ORIGINS`, `RPC_URL`,
`CONTRACT_ADDRESS`, `PRIVATE_KEY`, `EXPLORER_URL`, `RESEND_*`, `FRONTEND_URL`) no
cambian.

> **Antes de crear la base**, comprueba en el panel de Render la política de
> retención del plan gratuito de PostgreSQL: históricamente las bases gratuitas
> caducan a los 30 días. Para un piloto con una universidad eso es determinante, así
> que confírmalo tú en su panel en vez de fiarte de esta nota.

### Orden del despliegue

El orden importa porque **el esquema tiene que existir antes de que arranque el
backend**, y el build de Render no ejecuta migraciones.

1. **Crear la instancia de PostgreSQL** en Render. Apunta las dos URLs que te da:
   la *Internal* (para el servicio) y la *External* (para ejecutar las migraciones
   desde tu portátil).

2. **Ejecutar las migraciones desde local** contra la URL externa:

   ```bash
   cd backend
   DATABASE_URL="postgresql://…@…render.com/vtb?sslmode=require" npm run migrate
   ```

   La URL externa exige SSL; de ahí el `?sslmode=require`. Comprueba que terminan
   las 7 migraciones con `SELECT id, name FROM pgmigrations ORDER BY id;`
   (node-pg-migrate 7 no tiene comando `status`).

3. **(Solo si vas a conservar datos)** Migrar el contenido del SQLite que hayas
   extraído:

   ```bash
   DATABASE_URL="postgresql://…?sslmode=require" DATABASE_PATH=./vtb.db npm run db:migrate
   ```

   ⚠️ **Aviso sobre este script.** Abre una transacción con `BEGIN`/`COMMIT` sobre una
   conexión, pero todos los INSERT van por el *pool*, es decir, por conexiones
   distintas. En la práctica **no hay transacción**: si falla a la mitad, el
   `ROLLBACK` no deshace nada y te quedas con datos a medias. No lo he arreglado
   porque queda fuera de lo que me pediste, pero opéralo en consecuencia: ejecútalo
   solo contra una base recién migrada y vacía, y si falla, borra el esquema
   (`npm run migrate:down` hasta el fondo, o recrea la base) y empieza de cero en vez
   de reintentar encima.

4. **Poner las variables** de la tabla de arriba en el servicio de Render y guardar.

5. **Desplegar** (el guardado de variables ya suele disparar un redespliegue).

6. **Mirar los logs del arranque.** Tiene que aparecer:

   ```
   ✅ Usando PostgreSQL como motor de BD
   ℹ️  PostgreSQL: el esquema lo gestionan las migraciones (npm run migrate)
   ```

   Y **debe haber desaparecido** el bloque de aviso
   `⚠️ AVISO DE SEGURIDAD: DB_CLIENT != postgres`. Si sigue ahí, `DB_CLIENT` no ha
   llegado al proceso y estás en SQLite.

7. **Sembrar SOLO si la base está vacía**, una vez, desde tu máquina contra la URL
   externa, y **nunca** en el *start command* de Render.

   ⚠️ Corrección (15-sep-2026): una versión anterior de este punto proponía
   `npm run seed && node dist/index.js`. Entonces `npm run seed` **borraba
   usuarios, elecciones, candidatos, censo y votos** si ya existía algún usuario,
   así que ese arranque vaciaba la base en cada despliegue. Ya no: ahora aborta
   con código 1 si hay datos, y borrar exige `npm run seed:reset`. Detalle en
   [DESPLIEGUE_RENDER.md](DESPLIEGUE_RENDER.md), paso 6.

8. **Probar contra producción** los puntos 1, 6, 9, 12 y 13 de la tabla del PASO 3.

### Lo que esto arregla y lo que no

Arregla el problema por el que empezamos: en PostgreSQL el censo y los votos
sobreviven a un redespliegue. Y activa, ahora sí, el **cerrojo atómico anti-doble-voto**
sobre `vote_attempts` y el job de recuperación de votos huérfanos, que estaban
escritos pero eran inalcanzables porque nunca se ejecutaba el camino de PostgreSQL.

No arregla nada de lo demás que hay en [ESTADO.md](ESTADO.md). En particular, siguen
igual los enlaces de email que dan 404, la importación de censo que no envía
contraseñas y el bloqueo por `must_change_password`.

---

## PASO 3 — Verificación contra PostgreSQL real

Ejecutado contra `postgres:16` en Docker, con las 5 migraciones aplicadas, el seed
completo y el backend arrancado con `DB_CLIENT=postgres`.

### El bug que solo apareció aquí: BIGINT llega como cadena

`node-postgres` devuelve `BIGINT` (int8) y `NUMERIC` como **cadenas**, a propósito,
para no perder precisión por encima de 2^53. Todas las claves primarias del esquema
son `BIGINT GENERATED ALWAYS AS IDENTITY`, y `COUNT(*)` y `MAX()` también devuelven
int8. Con SQLite todo eso llegaba como `number`, y el código lo trata como `number`.

Medido en vivo, antes del arreglo:

| Consulta | Devolvía | Tipo |
|---|---|---|
| `SELECT id FROM users` | `"1"` | string |
| `SELECT COUNT(*)` | `"6"` | string |
| `SELECT MAX(election_id_blockchain)` | `"19"` | string |
| `INSERT … RETURNING id` | `"3"` | string |
| `SELECT start_time` | `"1789317460"` | string |

La consecuencia concreta, en `POST /admin/elections`:

```js
const election_id_blockchain = (lastElection?.id || 0) + 1;
// "19" + 1 === "191"   ← concatenación de cadenas, no suma
```

La elección creada se quedaba con `election_id_blockchain = 191`. También salían
cadenas en los `id` de las respuestas JSON (`"electionId":"6"`) y en los recuentos
del panel.

No lo detectaba nada: ni el typecheck (el valor viene de `res.rows`, tipado por el
genérico que escribe el llamante), ni los 110 tests (corren sobre SQLite, donde todo
llega ya como número), ni los guards estáticos (no es un problema de SQL).

**Arreglo**: registrar los parsers de tipo en `db/postgres.ts`.

```ts
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));
```

Es seguro aquí porque los valores de VTB están varios órdenes de magnitud por debajo
del límite: ids de fila, recuentos de censo, epoch en segundos (~1,8e9) y números de
bloque de Ethereum (~2e7), frente a un techo de 9e15. Y restaura la paridad exacta
con SQLite, que es lo que toda la capa `DbClient` promete. Cubierto por 4 tests que
no necesitan base de datos (comprueban que los parsers están registrados).

### Lo que se probó y pasó

| Flujo | Resultado |
|---|---|
| Login, `/auth/me`, contraseña incorrecta → 401 | ✅ |
| Rotación de refresh + logout + sesión muerta → 401 | ✅ (la tabla `refresh_tokens` nueva) |
| Registro de usuario nuevo; duplicado → 409 | ✅ (`isUniqueViolation` con código 23505) |
| Panel: dashboard, users, elections, requests, audit, domains, org-units, stats | ✅ 8/8 |
| Aprobar solicitud (transacción) | ✅ |
| Crear elección + candidato | ✅ |
| Importar CSV correcto | ✅ `created:2, added:2, invited:2` |
| Importar CSV con filas malas → 400 | ✅ y con el número de línea de cada una |
| Importar CSV que falla **dentro** de la transacción → 500 | ✅ y **rollback verificado en la base** |
| Votar; segundo voto → 409; resultados | ✅ |
| Borrar usuario | ✅ |
| Endpoints públicos (stats, audit, org-units, schools, health) | ✅ 5/5 |

El error de validación que devuelve dice exactamente qué fila falló:

```
Línea 3: fila sin email
Línea 4: csvbad3-…@vtb.demo es una cuenta nueva y le falta full_name o student_id
```

Y el rollback de fase 2, comprobado consultando PostgreSQL después:

```
 usuarios mid-*   (deben ser 0) |     0    ← insertados y revertidos
 usuarios csvbad-*(deben ser 0) |     0    ← rechazados en validación
 usuarios csvok-* (deben ser 2) |     2    ← importación correcta, confirmada
 tokens invitacion huerfanos    |     0
```

En el log del backend, el fallo de fase 2 aparece saneado por `formatError`:

```
Error importing voters CSV: duplicate key value violates unique
constraint "users_student_id_key" | code=23505
```

### Detalle menor sin arreglar

`syncElections.ts` imprime `SQLite elections: 5` en el arranque sea cual sea el
motor. Es un literal en el mensaje, no afecta a nada, pero despista al diagnosticar.

---

## Una cosa que conviene que sepas

`npm run lint` **falla en `main` desde antes de esta migración**: 79 errores en HEAD
(casi todos `no-explicit-any`, la deuda documentada como P2-22 en AUDITORIA_2).
Después de estos cambios son 77, así que no hay regresión — pero significa que el
trabajo de `backend` en [ci.yml](.github/workflows/ci.yml) está en rojo, y por tanto
la CI que creéis que os protege no está pasando. No lo he tocado porque no es parte
de esta migración, pero merece una decisión aparte: o se arreglan los `any`, o se
baja esa regla a `warn` para que la CI vuelva a ser una señal útil.

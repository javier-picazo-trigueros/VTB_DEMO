# PASO 1 — Inventario de usos directos del cliente SQLite

**Fecha:** 14 de septiembre de 2026
**Alcance:** todo `backend/src`. No se ha modificado ningún fichero.
**Método:** extracción estática de todas las llamadas `db.get` / `db.run` / `db.exec`
en los ficheros que importan `getDatabase()`, más comparación columna a columna del
esquema SQLite (`config/database.ts` + sus `ALTER TABLE`) contra las 4 migraciones de
PostgreSQL.

## Resumen

**194 llamadas** repartidas así:

| Fichero | Llamadas | Módulo del PASO 2 |
|---|---:|---|
| `src/routes/auth.ts` | 22 | 1 — auth |
| `src/middleware/auth.ts` | 1 | 1 — auth (va con él) |
| `src/routes/registration.ts` | 9 | 2 — registration |
| `src/routes/admin.ts` | 89 | 3 — admin |
| `src/app.ts` | 9 | 4 — app.ts |
| `src/routes/organizations.ts` | 1 | 4 — app.ts (va con él) |
| `src/scripts/seedDatabase.ts` | 53 | **no estaba en tu lista** |
| `src/scripts/syncElections.ts` | 2 | **no estaba en tu lista** |
| `src/index.ts` | 8 | ya usa `getDbClient()`, pero ver abajo |

El detalle línea a línea, con la consulta completa de cada llamada, está en
[INVENTARIO_SQLITE_tablas.md](INVENTARIO_SQLITE_tablas.md).

---

## Lo que cambia el alcance: esto no es solo cambiar el cliente

Antes de tocar nada, cuatro cosas que no son "sustituir `getDatabase()` por
`getDbClient()`". Las tres primeras hacen que el backend **no arranque a funcionar**
sobre Postgres aunque se migren todas las llamadas.

### A. `refresh_tokens` no existe en PostgreSQL — rompe el login entero

La tabla está en el esquema SQLite
([config/database.ts:200-208](backend/src/config/database.ts#L200-L208)) y **en
ninguna de las 4 migraciones**. La usan 4 sitios:

| Fichero | Línea | Consulta |
|---|---|---|
| `routes/auth.ts` | 66 | `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)` |
| `routes/auth.ts` | 472 | `SELECT user_id, expires_at, revoked FROM refresh_tokens WHERE token_hash = ?` |
| `routes/auth.ts` | 495 | `UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?` |
| `routes/auth.ts` | 513 | `UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?` |

El de la línea 66 está dentro de `setSessionCookies()`, que se ejecuta **en cada
login correcto**. O sea: sobre Postgres, hoy, nadie puede iniciar sesión.

Hace falta una migración nueva (`refresh_tokens` con `revoked BOOLEAN`, `expires_at
TIMESTAMPTZ`, índice por `user_id` y `UNIQUE` en `token_hash`).

### B. `elections.image_url` no existe en PostgreSQL

SQLite la añade por `ALTER TABLE`
([config/database.ts:186](backend/src/config/database.ts#L186)). PostgreSQL, en su
lugar, tiene una tabla `election_images` (id, election_id, mime_type, data) que **no
usa ni una línea de código**. Efectos sobre Postgres:

- `admin.ts:795` `UPDATE elections SET image_url = ? …` → error, la columna no existe.
- `elections.ts:53` hace `SELECT e.*` y lee `e.image_url`: no da error, simplemente la
  imagen desaparece de todas las elecciones.

Hay que elegir: añadir la columna a Postgres (mecánico, el código no cambia) o
reescribir la subida de imágenes contra `election_images` (es el diseño que se quiso,
pero es trabajo aparte). **Mi recomendación: añadir la columna ahora** y dejar
`election_images` para cuando se toque el tema de imágenes, para que esta migración
siga siendo una sustitución de cliente y nada más.

### C. `PgClient` añade `RETURNING id` a tablas que no tienen `id` — 13 llamadas rotas

`normalizeSql()` ([postgres.ts:26-33](backend/src/db/postgres.ts#L26-L33)) añade
`RETURNING id` a **todo** `INSERT`. Pero `election_voters` tiene clave primaria
compuesta y **ninguna columna `id`**
([migración:152-159](backend/migrations/20260808000001_initial_schema.cjs#L152-L159)):

```sql
CREATE TABLE election_voters (
  election_id BIGINT NOT NULL REFERENCES elections(id),
  user_id     BIGINT NOT NULL REFERENCES users(id),
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (election_id, user_id)
);
```

Cada `INSERT OR IGNORE INTO election_voters` se convierte en
`… ON CONFLICT DO NOTHING RETURNING id` → `ERROR: column "id" does not exist`. Son 13
llamadas (10 en `admin.ts`, 1 en `registration.ts`, 2 en `seedDatabase.ts`), y son
justo las de asignar gente al censo.

Esto es un fallo en la propia DAL, compartida con `elections.ts`, que ya la usa. Hay
que arreglarlo en `normalizeSql` antes de migrar nada.

### D. Los ficheros "ya migrados" también tienen SQL de SQLite

No basta con mirar los que usan `getDatabase()`. Estos dos ya usan `getDbClient()` y
fallarían igual sobre Postgres:

| Fichero | Línea | Problema |
|---|---|---|
| `routes/elections.ts` | 611 | `WHERE id = ? AND is_active = 1` → `operator does not exist: boolean = integer` |
| `index.ts` | 115 | `WHERE start_time <= ? AND is_active = 1` → mismo error |

Es la ruta de registrar voto y el job de notificación de apertura.

---

## Incompatibilidades de motor encontradas, por tipo

Recuento sobre las 194 llamadas:

| Tipo | Casos | Qué hay que hacer |
|---|---:|---|
| `BOOL-NUM` — booleano comparado o asignado con 0/1 | 18 | `is_active = 1` → `is_active = TRUE`; `must_change_password = 0` → `FALSE` |
| `OR-IGNORE` — `INSERT OR IGNORE` | 18 | Ya lo traduce `PgClient`; verificar que el `ON CONFLICT` implícito es el correcto en cada tabla |
| `RETURNING-SIN-ID` | 13 | Bloqueante C |
| `INTERPOLADO` — SQL con plantilla JS | 13 | Revisados uno a uno: todos mantienen el orden de los `?`, así que `toPositional` los convierte bien. Sin cambios |
| `FN-SQLITE` — función inexistente en PG | 4 | Ver tabla siguiente |
| `DINAMICO` — SQL en variable | 4 | Revisados a mano: `app.ts:327`, `admin.ts:138`, `admin.ts:952`, `admin.ts:1034`. Todos construyen el `WHERE` con `?` en orden. Sin cambios |
| `TABLA-NO-PG` | 4 | Bloqueante A |
| `COL-NO-PG` | 1 | Bloqueante B |
| `DQUOTE-STR` | 1 | `admin.ts:1129` |

### Funciones específicas de SQLite (4 casos)

| Fichero | Línea | Actual | Equivalente en PostgreSQL |
|---|---|---|---|
| `app.ts` | 250 | `substr(email, instr(email,'@')+1)` | `split_part(email, '@', 2)` |
| `app.ts` | 283 | `substr(h,1,10) \|\| '...' \|\| substr(h,-4)` | `left(h,10) \|\| '...' \|\| right(h,4)` |
| `admin.ts` | 148 | `strftime('%s','now')` | `EXTRACT(EPOCH FROM NOW())::bigint` |
| `admin.ts` | 1469 | `substr(email, instr(email,'@')+1)` | `split_part(email, '@', 2)` |

Nota: `substr(x, -4)` cuenta desde el final en SQLite; en PostgreSQL `substr` con
offset negativo **no hace lo mismo**. Por eso la traducción es `right()`, no `substr`.

### Comillas dobles usadas como cadena (1 caso)

`admin.ts:1129`:

```sql
SELECT election_id FROM election_access WHERE email_domain = ? OR email_domain = "*"
```

En PostgreSQL `"*"` es un **identificador de columna**, no la cadena `*`. Falla con
`column "*" does not exist`. Tiene que ser `'*'`.

### Lo que NO hay que tocar

Revisado y compatible con los dos motores, no lo voy a cambiar:

- `CURRENT_TIMESTAMP` (23 usos) — estándar SQL, válido en ambos.
- `||` como concatenación de cadenas (`'%@' || ?`) — estándar, válido en ambos.
- `COALESCE`, `LIKE`, `DISTINCT`, `LIMIT`/`OFFSET`, `GROUP BY` — sin cambios.
- Los placeholders `?`: no hay que tocarlos en el código. `toPositional()` los
  convierte a `$1, $2…` en tiempo de ejecución, y todos los sitios mantienen el orden
  entre el SQL y el array de parámetros (lo he verificado en los 13 interpolados y los
  4 dinámicos, que eran el riesgo real).

### Fechas

Menos grave de lo que parece. Los `DATETIME` de SQLite son texto `'YYYY-MM-DD HH:MM:SS'`
y en PG serán `TIMESTAMPTZ`. El código los trata así:

- `expires_at` de tokens: se guarda con `.toISOString()` y se compara en JS, no en SQL
  ([auth.ts:571](backend/src/routes/auth.ts#L571), [auth.ts:478](backend/src/routes/auth.ts#L478)).
  El driver `pg` devolverá un `Date` en vez de un `string`, así que hay que revisar las
  comparaciones — es el punto donde más fácil se cuela un fallo silencioso.
- `generated_at`, `created_at`: solo se muestran o se ordenan. Sin problema.
- `start_time` / `end_time` de elecciones son `BIGINT` (epoch), no fechas. Sin problema.

---

## Diferencias de esquema completas (SQLite vs PostgreSQL)

| Tabla | Estado |
|---|---|
| `users` | ✅ compatible (`org_unit_domain` solo existe en SQLite, pero **ningún código la usa**) |
| `elections` | ⚠️ falta `image_url` en PG (bloqueante B) |
| `candidates`, `election_access`, `election_targets`, `election_voters` | ✅ |
| `nullifier_audit`, `registration_requests` | ✅ (`approved_password` solo en SQLite; sin usos en el código) |
| `org_units`, `schools_and_degrees`, `email_whitelist` | ✅ |
| `email_log`, `password_reset_tokens` | ✅ (migraciones 2, 3 y 4) |
| `refresh_tokens` | ❌ **no existe en PG** (bloqueante A) |
| `vote_attempts`, `election_images` | solo en PG — `vote_attempts` es intencionado (cerrojo TOCTOU); `election_images` está huérfana |

---

## Dos cosas más que he encontrado de paso

**`backend/.env` tiene `DATABASE_URL=./vtb.db`.** Esa variable debe contener una cadena
de conexión de PostgreSQL. Tal como está, poner `DB_CLIENT=postgres` pasaría `./vtb.db`
al `Pool` de `pg` y el error resultante no se parecerá en nada a la causa.

**`index.ts:49` crea el esquema SQLite en cada arranque**, pase lo que pase el valor de
`DB_CLIENT`. Sobre Postgres eso deja un `vtb.db` vacío en el disco y confunde al
diagnosticar. Habrá que condicionarlo (sin borrar el código, como pediste).

---

## Qué protege esta migración durante el trabajo

Los 73 tests siguen siendo red de seguridad: `getDbClient()` cae a
`SqliteAdapter(getDatabase())` cuando `DB_CLIENT` no es `postgres`
([db/index.ts:20-33](backend/src/db/index.ts#L20-L33)), y los tests no definen esa
variable. Es decir, al sustituir `getDatabase()` por `getDbClient()` en las rutas, los
tests siguen ejecutándose sobre SQLite en memoria exactamente igual que ahora. Si algo
se rompe en la sustitución, los tests lo detectan aunque no haya un Postgres delante.

Lo que los tests **no** pueden detectar es cualquiera de las incompatibilidades de
motor de este documento, porque todas se manifiestan solo contra PostgreSQL de verdad.

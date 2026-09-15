# PASO 4 — Despliegue en Render con PostgreSQL

**Fecha:** 14 de septiembre de 2026
**Precondición:** el PASO 3 está hecho y pasado. Ver
[MIGRACION_POSTGRES.md](MIGRACION_POSTGRES.md) para qué se verificó y qué falló.

---

## 0. Antes de nada: qué datos hay realmente que preservar

Conviene decirlo claro porque cambia todo el plan.

El backend corre hoy con `DATABASE_PATH=./vtb.db` sobre el sistema de ficheros de
un servicio web de Render, que es **efímero**: se recrea en cada redespliegue y en
cada reinicio del contenedor. Los datos que hay ahora mismo en producción son, como
mucho, los acumulados desde el último despliegue — y se habrían perdido igualmente
en el siguiente, con migración o sin ella.

Además, en el plan gratuito **no hay acceso por shell**, así que no hay forma cómoda
de sacar ese `vtb.db` del contenedor.

**Recomendación: asumir la pérdida.** Si lo que hay son cuentas demo y pruebas, se
vuelve a sembrar y listo. Si hubiera datos reales que no se puedan reconstruir,
hace falta un endpoint temporal de exportación protegido por superadmin: dilo y lo
preparo, pero es trabajo aparte y solo merece la pena si existen esos datos.

> **Comprueba la política del plan gratuito de PostgreSQL en Render** antes de
> crear la base. Históricamente esas bases caducan a los 30 días. Para un piloto
> con una universidad eso es determinante, así que confírmalo en su panel en vez de
> fiarte de esta nota.

---

## 1. Variables de entorno

### Las que hay que añadir o cambiar

| Variable | Valor | Por qué |
|---|---|---|
| `DB_CLIENT` | `postgres` | **Sin esto no cambia nada.** El valor por defecto es `sqlite` y el backend arrancaría igual que hoy |
| `DATABASE_URL` | *Internal Database URL* de la base de Render | La interna: no sale a internet y no consume ancho de banda. Debe empezar por `postgresql://` |

### La que hay que borrar

| Variable | Por qué |
|---|---|
| `DATABASE_PATH` | Solo se usa en modo SQLite. Dejarla puesta no rompe nada, pero hace creer que el fichero sigue importando |

### Las que no cambian

`NODE_ENV=production`, `JWT_SECRET`, `NULLIFIER_SECRET`, `CORS_ORIGINS`, `RPC_URL`,
`CONTRACT_ADDRESS`, `PRIVATE_KEY`, `EXPLORER_URL`, `RESEND_API_KEY`, `RESEND_FROM`,
`FRONTEND_URL`, `RATE_LIMIT_MAX`.

Las tres `SEED_*` solo hacen falta si vas a ejecutar el seed (paso 6).

> **Ojo con una trampa concreta.** Tu `backend/.env` local tiene hoy
> `DATABASE_URL=./vtb.db`, heredado del modo SQLite. Si esa variable llegara a
> Render con `DB_CLIENT=postgres`, el pool de `pg` la aceptaría y fallaría mucho
> después con un error de red incomprensible. Ahora el arranque lo detecta y aborta
> nombrando el problema:
>
> ```
> DB_CLIENT=postgres pero DATABASE_URL no es una cadena de conexión de
> PostgreSQL (recibido: "./vtb.db"). Debe empezar por postgresql://
> ```

---

## 2. Orden del despliegue

El orden importa porque **el esquema tiene que existir antes de que arranque el
backend**, y el build de Render no ejecuta migraciones.

### Paso 1 — Crear la instancia de PostgreSQL

En el panel de Render. Apunta las **dos** URLs que da:

- **Internal Database URL** → para el servicio web (paso 4).
- **External Database URL** → para ejecutar las migraciones desde tu portátil
  (paso 2). Exige SSL.

### Paso 2 — Migraciones, desde local y contra la URL externa

```bash
cd backend
DATABASE_URL="postgresql://…@…render.com/vtb?sslmode=require" npm run migrate
```

Debe terminar con `Migrations complete!` y aplicar **7** migraciones. Compruébalo
con una consulta en la base (node-pg-migrate 7 no tiene comando `status`):

```sql
SELECT id, name FROM pgmigrations ORDER BY id;
```

Las 7 son:

```
20260808000001_initial_schema
20260808000002_email_tables
20260808000003_email_body_election_notify
20260826000004_email_queue_state
20260914000005_refresh_tokens_and_election_image   ← nueva
20260914000006_enable_rls_deny_by_default          ← nueva
20260915000007_email_log_without_tokens            ← nueva
```

**La quinta no es opcional.** Crea `refresh_tokens`, que no existía en el esquema
de PostgreSQL. Esa tabla la escribe `setSessionCookies()` en cada login correcto,
así que sin ella **nadie puede iniciar sesión**, ni siquiera tú.

**La sexta** activa RLS, sin políticas, en todas las tablas. En Render no cambia
nada. En Supabase es imprescindible: sin ella, la API REST pública de Supabase
expone las tablas (usuarios con sus hashes, votos, tokens) a cualquiera con la
*anon key*, que es pública por diseño.

**La séptima** (P1-7) añade `email_log.template_data` y limpia lo que la cola
guardaba antes: anula los tokens de recuperación e invitación que aparecían en
claro en los cuerpos de los correos, descarta los correos pendientes que los
llevaban y vacía los cuerpos ya enviados. Sin la columna, el backend no puede
encolar invitaciones ni correos de recuperación. Efecto visible: un enlace de
invitación o de recuperación enviado **antes** de aplicarla deja de funcionar, y
hay que pedir otro o volver a invitar.

### Paso 3 — (Solo si conservas datos) migrar el contenido

```bash
DATABASE_URL="postgresql://…?sslmode=require" DATABASE_PATH=./vtb.db npm run db:migrate
```

⚠️ **Aviso sobre este script.** Abre `BEGIN`/`COMMIT` sobre una conexión, pero todos
los INSERT van por el *pool*, es decir, por conexiones distintas. En la práctica
**no hay transacción**: si falla a la mitad, el `ROLLBACK` no deshace nada y te
quedas con datos parciales. No lo he arreglado porque queda fuera del encargo, pero
opéralo en consecuencia: ejecútalo solo contra una base recién migrada y vacía, y si
falla, recrea la base y empieza de cero en vez de reintentar encima.

### Paso 4 — Configurar las variables en el servicio web

Las de la sección 1. Guardar dispara un redespliegue.

### Paso 5 — Verificar el arranque (sección 3, abajo)

### Paso 6 — Sembrar, SOLO si la base está vacía

> ⚠️ **Corrección (15-sep-2026).** Una versión anterior de este paso decía que el
> seed era idempotente y proponía `npm run seed && node dist/index.js` como
> *start command*. **Es falso y peligroso.**
>
> Hasta el arreglo, `npm run seed` ejecutaba `runSeedScript` (hoy sustituido por
> `runSeed()` en seedDatabase.ts), que,
> **en cuanto la tabla `users` tenía una sola fila**, borraba antes de sembrar:
> `nullifier_audit`, `election_voters`, `election_access`, `candidates`,
> `elections` y `users`. Con aquel *start command*, **cada reinicio o despliegue
> borraría el censo y todos los votos**.
>
> No es teórico: pasó en la base de Supabase del proyecto al volver a sembrarla.
> Tampoco `seedDemoData()` —la que usan los tests— es de solo inserción: reescribe
> las contraseñas de las cuentas demo y borra votos (los de las cuentas demo y los
> que no tienen número de bloque, de cualquier usuario).

Ejecútalo **una sola vez**, contra una base recién migrada y **sin usuarios**, y
**nunca** como parte del arranque. Antes de lanzarlo, confirma que está vacía (en el
editor SQL de tu proveedor, o con `psql` si lo tienes):

```sql
SELECT count(*) FROM users;   -- tiene que ser 0
```

Desde tu máquina, contra la URL externa y con las tres `SEED_*` definidas:

```bash
cd backend
DB_CLIENT=postgres DATABASE_URL="postgresql://…?sslmode=require" npm run seed
```

No lo pongas en el *start command* de Render, ni siquiera "un ciclo".

**Comportamiento actual.** `npm run seed` **aborta con código 1** si la base ya
tiene algún usuario, sin tocar nada. Borrar y volver a sembrar exige pedirlo
explícitamente con `npm run seed:reset` (equivale a `npm run seed -- --reset`).
Una consecuencia útil: si alguien vuelve a poner `npm run seed && node dist/index.js`
como arranque con la base ya poblada, el seed falla, el `&&` corta y el servidor no
arranca. El despliegue se ve roto en vez de vaciar la base en silencio.

### Paso 7 — Probar contra producción

Como mínimo: login, crear elección, importar un CSV de censo (uno bueno y uno con
una fila mala), y votar.

---

## 3. Cómo verificar que está usando PostgreSQL y no ha caído a SQLite

Esto es lo que preguntabas y tiene respuesta exacta. Hay **cuatro señales**, en
orden de fiabilidad.

### Señal 1 — El log de arranque (la más rápida)

En los logs de Render, tras un despliegue correcto, tiene que aparecer:

```
✅ Usando PostgreSQL como motor de BD
ℹ️  PostgreSQL: el esquema lo gestionan las migraciones (npm run migrate)
```

Si en su lugar ves esto, **estás en SQLite**:

```
✅ Usando SQLite como motor de BD (legacy)
✅ Base de datos SQLite inicializada
```

### Señal 2 — La ausencia del aviso de seguridad (la más difícil de confundir)

Con SQLite, el arranque imprime un bloque imposible de pasar por alto:

```
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
⚠️  AVISO DE SEGURIDAD: DB_CLIENT != postgres
   El cerrojo anti-doble-voto (TOCTOU) NO está garantizado
   en modo SQLite. Un usuario podría votar dos veces bajo
   carga concurrente. Usa DB_CLIENT=postgres en producción.
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
```

**Si ese bloque aparece, `DB_CLIENT` no ha llegado al proceso.** Su ausencia es la
confirmación. Es más fiable que buscar el mensaje positivo porque no depende de
leer bien una línea entre cien.

### Señal 3 — El job que solo existe en PostgreSQL

```
✅ Job de limpieza de votos huérfanos activo (cada 30 min)
```

Esta línea se imprime dentro de un `if (dbClient instanceof PgClient)`
([index.ts:233](backend/src/index.ts#L233)). No puede aparecer en modo SQLite bajo
ninguna circunstancia, así que es una comprobación estructural, no un mensaje que
alguien pueda haber dejado mal.

### Señal 4 — Desde fuera, sin acceso a los logs

Los `id` de las respuestas de la API. Con la base recién migrada y sembrada:

```bash
curl -s https://tu-backend.onrender.com/api/stats
```

No distingue el motor por sí solo, pero **sí** sirve como prueba de vida del
esquema: si `totalElections` es 0 después de haber sembrado, la base que está
usando no es la que sembraste.

La comprobación definitiva sin logs es crear algo por la API y buscarlo en
PostgreSQL:

```bash
# desde local, contra la URL externa
psql "postgresql://…?sslmode=require" -c "SELECT count(*) FROM users;"
```

Si el número sube al dar de alta a alguien desde el panel, está escribiendo en
PostgreSQL. Si no se mueve, está escribiendo en un `vtb.db` que desaparecerá en el
próximo despliegue.

### Por qué no hay "fallback silencioso" que temer

Merece la pena decirlo: **el código no tiene fallback automático**. `getDbClient()`
lee `DB_CLIENT` y, si vale `postgres`, exige `DATABASE_URL` y **lanza** si falta o
si no parece una cadena de conexión de PostgreSQL. No hay ninguna rama que, al
fallar la conexión, vuelva a SQLite por su cuenta.

El único modo de acabar en SQLite sin querer es que `DB_CLIENT` no llegue al
proceso — una errata en el nombre de la variable, o haberla puesto en el servicio
equivocado. Por eso las señales 2 y 3 son las que valen: distinguen exactamente ese
caso.

---

## 4. Qué arregla este despliegue y qué no

**Arregla** el problema por el que empezamos: el censo y los votos sobreviven a un
redespliegue. Y activa, ahora sí, el **cerrojo atómico anti-doble-voto** sobre
`vote_attempts` y el job de recuperación de votos huérfanos, que estaban escritos
pero eran inalcanzables porque nunca se ejecutaba el camino de PostgreSQL.

**No arregla** nada de lo demás de [ESTADO.md](ESTADO.md). Siguen igual:

- Los enlaces de los correos que dan 404 (`/auth/reset-password`, `/auth/set-password`).
- `POST /admin/users/import` sigue sin enviar invitación, así que crea cuentas con
  una contraseña temporal que no conoce nadie.
- El bloqueo por `must_change_password`.
- Los resultados públicos y en vivo durante la votación.
- El secreto del voto (`user_id` y `candidate_id` en la misma fila).

---

## 5. Si algo va mal

| Síntoma | Causa probable |
|---|---|
| `relation "refresh_tokens" does not exist` en el login | Falta la migración 5. Ejecuta `npm run migrate` |
| `DATABASE_URL no es una cadena de conexión de PostgreSQL` | Quedó el valor `./vtb.db` heredado del modo SQLite |
| Aparece el bloque `⚠️ AVISO DE SEGURIDAD` | `DB_CLIENT` no llegó al proceso |
| `password authentication failed` | Estás usando la URL externa sin `?sslmode=require`, o la interna desde fuera de Render |
| El panel carga vacío pero sin errores | La base está migrada pero sin sembrar (paso 6) |
| `column "id" does not exist` | Estás en una versión anterior al arreglo de `normalizeSql` para `election_voters` |

Para volver atrás: quita `DB_CLIENT` y vuelve a poner `DATABASE_PATH`. El código de
SQLite sigue entero y el backend arranca como antes. Los datos que se hubieran
escrito en PostgreSQL se quedan ahí, intactos, para cuando vuelvas.

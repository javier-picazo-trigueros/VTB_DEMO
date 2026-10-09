# SETUP — levantar VTB en local

Para clonar el repositorio (o ponerlo al día) y tener la aplicación funcionando en
tu máquina. Tiempo estimado: 10–15 minutos. No hace falta blockchain, Supabase ni
Resend para tener la app funcionando con las cuentas de demo.

Otros documentos: [`README.md`](README.md) (visión general),
[`docs/DESARROLLO.md`](docs/DESARROLLO.md) (flujo de trabajo y comandos),
[`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md) (producción) y
[`CLAUDE.md`](CLAUDE.md) (reglas del proyecto).

---

## Lo que conviene saber antes de empezar

- El backend funciona con **SQLite** (por defecto) o **PostgreSQL**
  (`DB_CLIENT=postgres`). En local no tienes que cambiar nada: es SQLite.
- **`npm run seed` no borra datos.** Si la base tiene algún usuario, aborta con
  código 1 sin tocar nada. Para borrar y volver a sembrar: `npm run seed:reset`.
- El botón **«Demo»** entra por `POST /auth/demo-login`, que usa las contraseñas del
  seed de tu `backend/.env`. Ese endpoint **está deshabilitado salvo que pongas
  `DEMO_LOGIN_ENABLED=true`** en `backend/.env`: concede una sesión sin que el
  cliente aporte credencial alguna, así que en cualquier despliegue público va
  apagado. En local lo quieres encendido.
- Los correos de invitación y recuperación **no guardan el enlace** en `email_log`:
  el token se genera al enviar.
- `frontend/.env.production` no está en git. En local no se usa; en Vercel, las
  `VITE_*` están en el panel del proyecto.
- Hay **16 migraciones** de PostgreSQL. Solo te afectan si usas PostgreSQL.
- **Crear una elección no espera a la blockchain.** Se guarda con sus candidatos y se
  registra en el contrato en segundo plano. Sin blockchain configurada (lo normal en
  local), el panel la muestra como «Pendiente de blockchain»: es lo esperado. Mientras
  esté así, **votar devuelve `503 ELECTION_NOT_ON_CHAIN` a todo el mundo, cuentas demo
  incluidas**: sin una cadena (Hardhat local o Sepolia) se puede entrar y navegar, pero
  no votar. Ver [`docs/DESARROLLO.md`](docs/DESARROLLO.md), sección 4.

---

## Qué base de datos usar

**Para desarrollar, ninguna de las dos: una base local.** SQLite por defecto, o un PostgreSQL en Docker si necesitas el mismo motor que producción.

| Opción | Cuándo usarla | Por qué |
|---|---|---|
| **SQLite local** (`backend/vtb.db`) | Siempre, para el día a día | Cero configuración. La base es solo tuya: puedes hacer `seed:reset`, importar CSVs y votar sin afectar a nadie |
| **PostgreSQL local en Docker** | Si necesitas probar algo específico de PostgreSQL, o las migraciones | Mismo motor que producción, gratis y sin cuenta. Ver [Si usas PostgreSQL](#si-usas-postgresql) |
| **Supabase del proyecto** (`pxqejrptikoqoaokoqaq`) | **Nunca para desarrollar. Es PRODUCCIÓN.** | Es la base real del despliegue, con datos y votos reales. Ni se consulta "para verificar algo" sin avisar antes en el equipo |

**No hay un segundo proyecto de Supabase "de desarrollo".** El único Supabase del proyecto es producción, y el `.env` local no apunta a su `DATABASE_URL` bajo ningún concepto, ni siquiera un momento para probar algo. Si algún día se crea un proyecto de desarrollo, tendrá sus propios secretos (`JWT_SECRET`, `NULLIFIER_SECRET`, contraseñas del seed) — nunca los de producción.

Como red de seguridad adicional (no como sustituto de lo anterior), `npm run seed` y `npm run seed:reset` se niegan a ejecutarse salvo que se cumplan **las tres** condiciones a la vez:
- `NODE_ENV` no sea `production`.
- `ALLOW_SEED_RESET=true` esté puesto explícitamente en el `.env` de ese entorno. No tiene valor por defecto: sin ella, el seed no se ejecuta en ningún caso, tenga o no datos la base.
- Con `DB_CLIENT=postgres`, que `DATABASE_URL` apunte a `localhost`, `127.0.0.1` o `::1`. Una base remota solo se siembra con `SEED_REMOTE_DB_OK=true`, pensada para un proyecto remoto de desarrollo; **nunca la pongas contra el Supabase de producción**.

Reglas si alguna vez hace falta tocar la base de producción directamente (no vía seed):

- La `DATABASE_URL` se pasa por un canal privado. Nunca en git, en un issue ni en un chat público.
- **Nunca** `npm run seed`, `npm run seed:reset` ni `npm run migrate:down` contra ella.
- Las migraciones las aplica una sola persona, avisando.
- `npm test` es seguro: los tests usan siempre SQLite en memoria, aunque tu `.env`
  apunte a PostgreSQL.

---

## Pasos

Los comandos valen para PowerShell y bash salvo donde se indica. Si PowerShell
bloquea `npm`, usa `npm.cmd` o ejecuta
`Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned`.

### 1. Traer el código

Si no lo tienes:

```bash
git clone https://github.com/javier-picazo-trigueros/VTB_DEMO.git
cd VTB_DEMO
```

Si ya lo tienes, ponte al día con `main` y crea o actualiza tu rama de trabajo (ver
[`docs/DESARROLLO.md`](docs/DESARROLLO.md), sección 1):

```bash
git fetch origin
git checkout main && git pull origin main
```

### 2. Instalar dependencias

Requisito: Node.js 24 (el `package.json` del frontend lo exige en `engines`; el CI prueba el backend con 20 y 22).

```bash
cd backend
npm ci
cd ../frontend
npm ci
cd ..
```

`blockchain/` solo hace falta si vas a levantar una cadena Hardhat local.

### 3. Crear `backend/.env`

Si **no** tienes uno:

```bash
# bash
cp backend/.env.example backend/.env
```
```powershell
# PowerShell
Copy-Item backend\.env.example backend\.env
```

Si **ya** tienes uno, ábrelo junto a `backend/.env.example` y añade lo que te falte.
Lo más probable: `FRONTEND_URL`, `DB_CLIENT` y las tres `SEED_*` obligatorias.

Rellena los valores:

```bash
# JWT_SECRET y NULLIFIER_SECRET (uno distinto para cada una)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# SEED_SUPERADMIN_PASSWORD, SEED_DEMO_ADMIN_PASSWORD, SEED_DEMO_SUPERADMIN_PASSWORD
node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))"
```

Tus contraseñas del seed son tuyas: no tienen que coincidir con las de nadie. Son
las que usarás para entrar como `admin@vtb.demo`, `superadmin@vtb.demo` y
`superadmin@vtb.system` en tu base local.

Comprueba que tienes `DB_CLIENT=sqlite` (o que la línea no existe) y
`NODE_ENV=development`.

### 4. Crear `frontend/.env`

```bash
# bash
cp frontend/.env.example frontend/.env
```
```powershell
# PowerShell
Copy-Item frontend\.env.example frontend\.env
```

Con los valores de ejemplo basta (`VITE_API_URL=http://localhost:3001`).

### 5. Sembrar la base local

```bash
cd backend
npm run seed
```

- Debe terminar sin error y crear `backend/vtb.db` con las cuentas y elecciones de demo.
- Si responde **«⛔ La base de datos ya tiene datos»**, ya tenías un `vtb.db` de
  antes. Comprueba que `DB_CLIENT` es `sqlite` y ejecuta `npm run seed:reset`. Ese
  comando **borra** usuarios, elecciones, censo y votos de la base a la que apunta
  tu `.env`.

### 6. Arrancar

Terminal 1:

```bash
cd backend
npm run dev
```

Debe mostrar `✅ Usando SQLite como motor de BD (legacy)` y `🚀 VTB Backend iniciado`.

Terminal 2:

```bash
cd frontend
npm run dev
```

Abre **http://localhost:3000** (Vite está fijado a ese puerto en `frontend/vite.config.js`).

### 7. Comprobar que funciona

1. http://localhost:3001/health responde `{"status":"OK","database":"ok",…}`.
2. En la portada, botón **«Demo»** → **«Entrar como Votante»** → llegas a `/dashboard`.
3. Otra vez **«Demo»** → **«Entrar como Administrador»** → llegas a `/admin`.
4. Tests del backend:

   ```bash
   cd backend
   npm test
   ```

   Resultado esperado: todos los ficheros en verde (74 ficheros y 524 tests el
   07-10-2026, uno de ellos saltado a propósito). El número crece con cada
   módulo: lo que importa es que no haya ninguno en rojo.

---

## Variables de entorno

Los valores secretos no están aquí: cada uno genera los suyos (paso 3). Las
marcadas con 🔒 son secretas y no se comparten ni se suben a git.

### `backend/.env`

| Variable | ¿Hace falta en local? | Para qué sirve |
|---|---|---|
| `PORT` | No (por defecto `3001`) | Puerto del backend |
| `NODE_ENV` | **Sí:** `development` | Con `production`, las cookies llevan `Secure` y sobre `http://localhost` el login parece ir bien pero todo lo demás da 401 |
| `JWT_SECRET` 🔒 | Recomendada (hay un valor inseguro por defecto) | Firma las sesiones. Obligatoria en producción; cambiarla cierra todas las sesiones |
| `NULLIFIER_SECRET` 🔒 | Recomendada (hay un valor inseguro por defecto) | Clave HMAC de los nullifiers de voto. Obligatoria en producción y **no se cambia nunca** después del primer voto |
| `CSRF_SECRET` 🔒 | No | Firma el token CSRF. Si falta, se deriva de `JWT_SECRET` |
| `DB_CLIENT` | No (por defecto `sqlite`) | Motor: `sqlite` o `postgres` |
| `DATABASE_PATH` | No (por defecto `vtb.db`) | Fichero SQLite. Se ignora con `postgres` |
| `DATABASE_URL` 🔒 | Solo con `DB_CLIENT=postgres` | Cadena de conexión de PostgreSQL. También la usa `npm run migrate` |
| `CORS_ORIGINS` | **Sí** | Orígenes del frontend permitidos, separados por comas. Debe incluir `http://localhost:3000` |
| `FRONTEND_URL` | Recomendada: `http://localhost:3000` | Base de los enlaces de los correos. Por defecto es `http://localhost:5173`, que no es el puerto de Vite en este repo |
| `SEED_SUPERADMIN_PASSWORD` 🔒 | **Sí** | Contraseña de `superadmin@vtb.system`. Sin ella el seed aborta |
| `SEED_DEMO_ADMIN_PASSWORD` 🔒 | **Sí** | Contraseña de `admin@vtb.demo`. La usan el seed y el botón «Entrar como Administrador» |
| `SEED_DEMO_SUPERADMIN_PASSWORD` 🔒 | **Sí** | Contraseña de `superadmin@vtb.demo` |
| `SEED_DEMO_STUDENT_PASSWORD` 🔒 | **Sí** para el botón «Entrar como Votante» | Contraseña de `student@vtb.demo` y `student2@vtb.demo`. El seed aún siembra `demo123` si la dejas vacía, pero `demo-login` ya no tiene ese valor por defecto |
| `ALLOW_SEED_RESET` | **Sí**, para poder sembrar: `true` | Sin ella (o con `NODE_ENV=production`), `npm run seed` y `npm run seed:reset` se niegan a tocar nada, tenga o no datos la base. Nunca la pongas en el `.env` de producción |
| `SEED_REMOTE_DB_OK` | No | Solo si siembras una base PostgreSQL **remota de desarrollo**. Sin ella, el seed se niega contra cualquier host que no sea local. Nunca contra el Supabase de producción |
| `DEMO_LOGIN_ENABLED` | Solo en local: `true` | Habilita `POST /auth/demo-login`. **Sin ella la ruta devuelve 404.** Concede sesión sin credenciales del cliente: nunca la definas en un despliegue público |
| `RPC_URL` | No para cuentas demo | Nodo Ethereum (Sepolia vía Alchemy/Infura, o Hardhat local) |
| `CONTRACT_ADDRESS` | No para cuentas demo | Dirección del contrato `ElectionRegistryV2` (la actual está en `blockchain/deployments/sepolia.json`) |
| `DEPLOY_BLOCK` | No para cuentas demo | Bloque de despliegue de ese contrato. Desde ahí se leen los eventos (`queryFilter`); sin ella se pregunta al contrato con `deploymentBlock()` |
| `PRIVATE_KEY` 🔒 | No para cuentas demo | Clave del wallet *relayer* que firma los votos reales. Necesita Sepolia ETH |
| `EXPLORER_URL` | No | Base de los enlaces al explorador de bloques |
| `EMAIL_PROVIDER` | No | `resend`, `brevo` o `console`. Sin ella: `resend` si hay `RESEND_API_KEY` o si `NODE_ENV=production`, `console` si no. Un valor desconocido impide arrancar. Ver [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md), "Correo" |
| `EMAIL_FROM` | Con `resend` en producción y **siempre** con `brevo` | Remitente, `Nombre <correo@dominio>`. Debe estar verificado en el proveedor. `RESEND_FROM` se sigue aceptando si falta |
| `RESEND_API_KEY` 🔒 | Con `EMAIL_PROVIDER=resend` | Clave de Resend |
| `BREVO_API_KEY` 🔒 | Con `EMAIL_PROVIDER=brevo` | Clave de la API v3 de Brevo. Sin la clave del proveedor elegido el backend arranca, pero cada correo queda fallido en `email_log` con el error `<VARIABLE> no está definida` |
| `RATE_LIMIT_MAX` | No | Intentos de login por ventana de 15 min. Solo se aplica en producción (en local: 100) |
| `HEALTH_DB_TIMEOUT_MS` | No (por defecto `3000`) | Tiempo máximo de la consulta de `/health` |
| `EMAIL_SEND_INTERVAL_MS` | No (por defecto `250`) | Pausa entre envíos de la cola de correo |

`RPC_URL`, `CONTRACT_ADDRESS` y `PRIVATE_KEY` hacen falta para poder **votar**: sin
ellos las elecciones quedan pendientes de blockchain y votar devuelve `503` a todo el
mundo. Si la elección sí está registrada, una cuenta `@vtb.demo` guarda un voto de
demostración sin hash de transacción (`vote_source = 'demo'`, `tx_hash` a NULL) y no
toca la cadena; ese atajo solo existe con `DEMO_LOGIN_ENABLED=true`, y en producción
esas cuentas votan por el camino normal. Cómo montar una cadena local:
[`docs/DESARROLLO.md`](docs/DESARROLLO.md), sección 4.

**Variables que puedes ver en algún `.env` pero el backend no lee:** `HMAC_SECRET`,
`SEPOLIA_RPC_URL` y `ALCHEMY_API_KEY` (estas dos las usa `blockchain/.env` para
desplegar el contrato), `NEXT_PUBLIC_SUPABASE_*`, y las del `.env.example` de la
raíz que no aparecen en esta tabla (`JWT_EXPIRATION`, `SMTP_*`, `LOG_LEVEL`,
`ENABLE_*`). Sobran; no hace falta copiarlas.

### `frontend/.env`

| Variable | ¿Hace falta en local? | Para qué sirve |
|---|---|---|
| `VITE_API_URL` | **Sí:** `http://localhost:3001` | URL del backend |
| `VITE_EXPLORER_URL` | No | Enlaces al explorador de bloques en comprobantes y auditoría |
| `VITE_RPC_URL` | No | Nodo Ethereum para lecturas directas desde el navegador |
| `VITE_CONTRACT_ADDRESS` | No | Dirección del contrato para esas lecturas |

Todo lo que empieza por `VITE_` acaba dentro del JavaScript público que descarga el
navegador. **Nunca pongas un secreto en `frontend/.env`.**

---

## Si usas PostgreSQL

Con un contenedor de Docker (lo recomendado) o con tu propio proyecto de Supabase.
No con la base del proyecto (ver arriba).

1. **Consigue la cadena de conexión.**
   - Docker (requiere Docker Desktop arrancado):
     ```bash
     docker run --name vtb-pg -e POSTGRES_USER=vtb -e POSTGRES_PASSWORD=vtb -e POSTGRES_DB=vtb -p 5432:5432 -d postgres:17
     ```
     Cadena: `postgresql://vtb:vtb@localhost:5432/vtb?sslmode=disable`. El
     `?sslmode=disable` hace falta: `npm run migrate` obliga a usar SSL y, sin él,
     falla con «The server does not support SSL connections».
   - Supabase propio (un proyecto que no sea el de producción): *Connect → Session
     pooler* (puerto **5432**). No uses el host directo `db.<ref>.supabase.co`, que
     solo resuelve por IPv6 y falla en muchas redes.
2. En `backend/.env`:
   ```env
   DB_CLIENT=postgres
   DATABASE_URL=postgresql://…
   ```
3. Crea el esquema:
   ```bash
   cd backend
   npm run migrate
   ```
   Debe terminar con `Migrations complete!`. Para comprobar cuáles están aplicadas,
   ejecuta en el SQL Editor de Supabase o con `psql` (`node-pg-migrate` tampoco
   tiene comando `status` en v9 — solo `up`, `down`, `create` y `redo`):
   ```sql
   SELECT id, name FROM pgmigrations ORDER BY id;
   ```
   Deben salir 16 filas, la última `20260929000016_separate_participation_from_votes`.
4. Siembra (solo sobre la base recién migrada, vacía): `npm run seed`. Con una base
   remota, el seed se niega salvo `SEED_REMOTE_DB_OK=true` (ver arriba).
5. `npm run dev` debe mostrar `✅ Usando PostgreSQL como motor de BD`.

---

## Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| `npm run seed` dice «⛔ La base de datos ya tiene datos» | Ya había usuarios. En local con SQLite: `npm run seed:reset`. Nunca contra una base compartida |
| El login parece funcionar pero todo da 401 | `NODE_ENV=production` en tu `.env` local. Pon `development` |
| Error de CORS en la consola del navegador | Falta `http://localhost:3000` en `CORS_ORIGINS` |
| «El acceso de demostración no está habilitado en este despliegue» | Falta `DEMO_LOGIN_ENABLED=true` en `backend/.env`. Es lo esperado en producción |
| «El acceso de demostración no está disponible en este despliegue» | Falta `SEED_DEMO_ADMIN_PASSWORD` (o `SEED_DEMO_STUDENT_PASSWORD`) en `backend/.env` |
| «La cuenta de demostración no está disponible. Ejecuta el seed.» | La contraseña del `.env` no es la que se sembró (la cambiaste después). En local: `npm run seed:reset` |
| `Port 3001 is already in use` | Ya hay un backend corriendo. Ciérralo o cambia `PORT` y `VITE_API_URL` |
| Los enlaces de los correos apuntan a `localhost:5173` | Falta `FRONTEND_URL=http://localhost:3000` |

---

## Rotación de credenciales (VTB-101)

Barrido completo del historial de Git el 2026-09-15 (`git log --all -S` sobre
`PRIVATE_KEY=0x`, `JWT_SECRET=`, `RESEND_API_KEY=re_`, `DATABASE_URL=postgres`,
`supabase.co` y el patrón de URL de Alchemy). Resultado:

| Credencial | Estado | Nota |
|---|---|---|
| Clave de Alchemy en `frontend/.env.production` | 🟢 **Rotada** (confirmado por Javier el 07-10-2026) | Estuvo filtrada desde `dfc78c5a` y untrackeada en `1d0d041b`. Sigue en el historial público, pero la clave antigua ya no vale |
| `PRIVATE_KEY=0xac0974be…` en varios commits | 🟢 Sin acción | Es la clave pública de test #0 de Hardhat (misma que sigue en el README, sección *Local Hardhat chain*). No es un secreto: es conocida por cualquiera que use Hardhat |
| `JWT_SECRET`, `NULLIFIER_SECRET`, `HMAC_SECRET` en `.env.example` / commits antiguos | 🟢 Sin acción | Todos son placeholders (`cambia_esto_en_produccion...`, `super-secret-...-change-in-production`), nunca valores reales |
| `RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx` | 🟢 Sin acción | Placeholder literal, no una clave real |
| `DATABASE_URL` / hosts de Supabase en `SETUP.md` y `docs/` | 🟢 Sin acción | Solo aparecen `<ref>`, `USUARIO:CONTRASEÑA` o el usuario `vtb:vtb` de Docker local |

**Hecho (ya no hay pasos pendientes):** la key de Alchemy está regenerada y
`VITE_RPC_URL` (Vercel) y `RPC_URL` (Render) llevan la nueva. Si alguna vez hay
que repetirlo, el orden es: Alchemy → regenerar la key, Vercel → `VITE_RPC_URL`,
Render → `RPC_URL`, y anotarlo en la tabla de arriba con fecha.

**Job de vigilancia:** [`.github/workflows/secret-scan-history.yml`](.github/workflows/secret-scan-history.yml)
escanea el historial completo cada lunes (y bajo demanda, `workflow_dispatch`),
a diferencia del `secret-scan` de `ci.yml`, que solo mira el diff de cada PR —
así fue como esta clave pasó desapercibida varios commits.

---

## Antes de fusionar a `main`

`main` despliega solo (Vercel y Render). La lista de comprobaciones previas
(tests, migraciones con copia de seguridad, variables nuevas) está en
[`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md), sección 5.

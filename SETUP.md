# SETUP — levantar VTB después del pull

Para quien ya tiene el repo clonado y trae los cambios de septiembre de 2026
(PostgreSQL, seed que no borra, correos sin tokens en la base). Si clonas desde
cero, sigue los mismos pasos saltándote el 1 y usando `git clone`.

Tiempo estimado: 10–15 minutos. No hace falta blockchain, Supabase ni Resend
para tener la app funcionando con las cuentas de demo.

---

## Qué cambia para ti

- El backend funciona con **SQLite** (por defecto) o **PostgreSQL**
  (`DB_CLIENT=postgres`). En local no tienes que cambiar nada: sigue siendo SQLite.
- **`npm run seed` ya no borra datos.** Si la base tiene algún usuario, aborta con
  código 1 sin tocar nada. Para borrar y volver a sembrar: `npm run seed:reset`.
- El botón **«Demo»** ya no lleva contraseñas en el frontend: entra por
  `POST /auth/demo-login`, que usa las contraseñas del seed de tu `backend/.env`.
- Hay páginas nuevas de **recuperación de contraseña** y **activación de cuenta**
  (`/forgot-password`, `/auth/reset-password`, `/auth/set-password`).
- Los correos de invitación y recuperación **ya no guardan el enlace** en
  `email_log`: el token se genera al enviar (P1-7).
- **`frontend/.env.production` ya no está en git.** Al hacer el merge desaparece de
  tu carpeta. En local no se usa; en Vercel, las `VITE_*` tienen que estar en el
  panel del proyecto (ver [Antes de mergear a `main`](#antes-de-mergear-a-main)).
- Hay **8 migraciones** de PostgreSQL. Solo te afectan si usas PostgreSQL.
- **Crear una elección ya no espera a la blockchain.** Se guarda con sus candidatos
  y se registra en el contrato en segundo plano. Sin blockchain configurada (lo
  normal en local), el panel la muestra como «⏳ Pendiente de blockchain»: es lo
  esperado, y las cuentas `@vtb.demo` votan igual.

---

## ¿Base de Supabase compartida o propia?

**Para desarrollar, ninguna de las dos: SQLite local.** Es lo que hacen estos pasos.

| Opción | Cuándo usarla | Por qué |
|---|---|---|
| **SQLite local** (`backend/vtb.db`) | Siempre, para el día a día | Cero configuración. La base es solo tuya: puedes hacer `seed:reset`, importar CSVs y votar sin afectar a nadie |
| **Supabase del proyecto** (`pxqejrptikoqoaokoqaq`) | **No para desarrollar.** Solo para verificar algo concreto, avisando antes | Es la base del despliegue. Lo que hagas ahí (un `seed:reset`, una importación, un voto) lo ve todo el mundo, y exige compartir la contraseña de la base |
| **Tu propio PostgreSQL** (un proyecto gratuito de Supabase o Docker) | Si necesitas probar algo específico de PostgreSQL | Mismo motor que producción, sin riesgo para datos compartidos. Ver [Si usas PostgreSQL](#si-usas-postgresql) |

Reglas si alguna vez usas la base compartida:

- La `DATABASE_URL` se pasa por un canal privado. Nunca en git, en un issue ni en un chat público.
- **Nunca** `npm run seed:reset` ni `npm run migrate:down` contra ella.
- Las migraciones las aplica una sola persona, avisando. Las 8 actuales ya están
  aplicadas (16-sep-2026).
- `npm test` es seguro: los tests usan siempre SQLite en memoria, aunque tu `.env`
  apunte a PostgreSQL.

---

## Pasos, desde el pull hasta la app corriendo

Los comandos valen para PowerShell y bash salvo donde se indica. Si PowerShell
bloquea `npm`, usa `npm.cmd` o ejecuta
`Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned`.

### 1. Traer los cambios

```bash
git fetch origin
git checkout JaimeOrdovas
git merge origin/JavierPicazo
```

Tu rama estaba en `5b31b46f`, que ya forma parte de `JavierPicazo`, así que el
merge es un *fast-forward* si no tienes commits propios sin subir. Si prefieres
esperar a que llegue a `main` por pull request, cambia la última línea por
`git merge origin/main` cuando esté mergeado.

### 2. Instalar dependencias

Requisito: Node.js 20 LTS (también funciona con 22).

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

   Resultado esperado: 18 ficheros, 142 tests en verde.

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
| `SEED_DEMO_STUDENT_PASSWORD` 🔒 | No (por defecto `demo123`) | Contraseña de `student@vtb.demo` y `student2@vtb.demo` |
| `RPC_URL` | No para cuentas demo | Nodo Ethereum (Sepolia vía Alchemy/Infura, o Hardhat local) |
| `CONTRACT_ADDRESS` | No para cuentas demo | Dirección del contrato `ElectionRegistry` |
| `PRIVATE_KEY` 🔒 | No para cuentas demo | Clave del wallet *relayer* que firma los votos reales. Necesita Sepolia ETH |
| `EXPLORER_URL` | No | Base de los enlaces al explorador de bloques |
| `RESEND_API_KEY` 🔒 | No | Clave de Resend. Sin ella los correos quedan en `email_log` como `skipped` y no se envían |
| `RESEND_FROM` | Solo con `RESEND_API_KEY` | Remitente; su dominio debe estar verificado en Resend |
| `RATE_LIMIT_MAX` | No | Intentos de login por ventana de 15 min. Solo se aplica en producción (en local: 100) |
| `HEALTH_DB_TIMEOUT_MS` | No (por defecto `3000`) | Tiempo máximo de la consulta de `/health` |
| `EMAIL_SEND_INTERVAL_MS` | No (por defecto `250`) | Pausa entre envíos de la cola de correo |

Las cuentas `@vtb.demo` votan con un hash sintético y no tocan la blockchain, así
que `RPC_URL`, `CONTRACT_ADDRESS` y `PRIVATE_KEY` solo hacen falta para votos reales
en Sepolia (ver *Start The App → Mode A* en el README).

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

Con tu propio proyecto de Supabase o un contenedor de Docker. No con la base del
proyecto (ver arriba).

1. **Consigue la cadena de conexión.**
   - Supabase: *Connect → Session pooler* (puerto **5432**). No uses el host directo
     `db.<ref>.supabase.co`, que solo resuelve por IPv6 y falla en muchas redes.
   - Docker:
     ```bash
     docker run --name vtb-pg -e POSTGRES_USER=vtb -e POSTGRES_PASSWORD=vtb -e POSTGRES_DB=vtb -p 5432:5432 -d postgres:17
     ```
     Cadena: `postgresql://vtb:vtb@localhost:5432/vtb`
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
   ejecuta en el SQL Editor de Supabase o con `psql` (node-pg-migrate 7 no tiene
   comando `status`):
   ```sql
   SELECT id, name FROM pgmigrations ORDER BY id;
   ```
   Deben salir 8 filas, la última `20260916000008_election_chain_sync`.
4. Siembra (solo sobre la base recién migrada, vacía): `npm run seed`.
5. `npm run dev` debe mostrar `✅ Usando PostgreSQL como motor de BD`.

---

## Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| `npm run seed` dice «⛔ La base de datos ya tiene datos» | Ya había usuarios. En local con SQLite: `npm run seed:reset`. Nunca contra una base compartida |
| El login parece funcionar pero todo da 401 | `NODE_ENV=production` en tu `.env` local. Pon `development` |
| Error de CORS en la consola del navegador | Falta `http://localhost:3000` en `CORS_ORIGINS` |
| «El acceso de demostración no está disponible en este despliegue» | Falta `SEED_DEMO_ADMIN_PASSWORD` en `backend/.env` |
| «La cuenta de demostración no está disponible. Ejecuta el seed.» | La contraseña del `.env` no es la que se sembró (la cambiaste después). En local: `npm run seed:reset` |
| `Port 3001 is already in use` | Ya hay un backend corriendo. Ciérralo o cambia `PORT` y `VITE_API_URL` |
| Los enlaces de los correos apuntan a `localhost:5173` | Falta `FRONTEND_URL=http://localhost:3000` |

---

## Antes de mergear a `main`

`main` despliega solo (Vercel y Render). Antes del pull request:

1. **Vercel:** comprueba que `VITE_API_URL`, `VITE_EXPLORER_URL` y
   `VITE_CONTRACT_ADDRESS` están en *Settings → Environment Variables*. Hasta ahora
   podían venir de `frontend/.env.production`, que ya no está en el repo; si Vercel
   dependía de ese fichero, el frontend desplegado perdería la URL del backend.
2. **Render:** el despliegue con PostgreSQL está descrito en `DESPLIEGUE_RENDER.md`.
   La migración 007 ya está aplicada en Supabase.
3. Ejecuta `npm run build` y `npm test` en `backend/` y `npm run build` en `frontend/`.

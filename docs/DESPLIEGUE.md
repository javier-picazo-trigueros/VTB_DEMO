# Despliegue

Cómo está desplegado VTB y qué hacer antes y después de fusionar a `main`.
Para levantar el proyecto en tu máquina, ver [`SETUP.md`](../SETUP.md).

| Pieza | Dónde | Cómo se despliega |
|---|---|---|
| Frontend | Vercel (`vtb-frontend-three.vercel.app`) | Automático en cada push a `main` |
| Backend | Render (`vtb-backend-4emv.onrender.com`, servicio `VTB_backend`) | Automático en cada commit a `main` (*autoDeploy*) |
| Base de datos | Supabase, proyecto `VTB` (Frankfurt) | Las migraciones se aplican solas al arrancar el backend |
| Contrato | Ethereum Sepolia | Manual, con `blockchain/scripts/deploy.ts` |

`main` despliega solo: solo debe recibir código revisado y con el CI en verde.

---

## 1. Backend en Render

- **Root directory:** `backend`
- **Build command:** `npm ci && npm run build`
- **Start command:** `npm run migrate && node dist/index.js`

> **El start command vive en el panel de Render, no en el repositorio.** Nada del
> código lo fija ni lo protege, y quien lo cambie en el panel no deja rastro en git.
> Comprobado con la API de Render el 29-09-2026. Consecuencias:
>
> - Fusionar a `main` despliega y aplica todas las migraciones que falten. Si una
>   falla, el servicio no arranca (y Render mantiene la versión anterior).
> - Las migraciones irreversibles, como la 016 (SCRUM-17), se aplican sin preguntar:
>   **la copia de seguridad se hace ANTES de fusionar.**
> - El seed **nunca** va en el start command: `npm run seed` aborta si hay usuarios,
>   pero `seed:reset` borraría el censo y los votos en cada despliegue.

### Variables de entorno de producción

Referencia completa y qué hace cada una: [`SETUP.md`](../SETUP.md), "Variables de entorno".

| Variable | Valor en producción |
|---|---|
| `NODE_ENV` | `production` (sin esto las cookies no llevan `Secure` y se admiten los orígenes de `localhost` en CORS) |
| `DB_CLIENT` | `postgres`. Sin ella el backend arranca en SQLite y pierde los datos en cada despliegue |
| `DATABASE_URL` | *Session pooler* de Supabase, puerto **5432**. Debe empezar por `postgresql://` |
| `DATABASE_CA_CERT` | Certificado raíz de Supabase (ver "Conexión segura a la base de datos") |
| `JWT_SECRET`, `NULLIFIER_SECRET` | Aleatorios y propios de producción. **`NULLIFIER_SECRET` no se cambia nunca** después del primer voto |
| `CORS_ORIGINS` | Solo el origen del frontend desplegado. En producción los orígenes de `localhost` no se admiten |
| `RPC_URL`, `CONTRACT_ADDRESS`, `DEPLOY_BLOCK`, `EXPLORER_URL` | Nodo y contrato (ver sección 4) |
| `PRIVATE_KEY` | Clave del **relayer**, caliente. La del *owner* nunca va aquí |
| `EMAIL_PROVIDER`, `EMAIL_FROM`, `RESEND_API_KEY` o `BREVO_API_KEY`, `FRONTEND_URL` | Correo (ver abajo) y enlaces de los correos |

### Correo: elegir y cambiar de proveedor

Render gratis **bloquea el SMTP saliente**: solo valen proveedores con API HTTP. El
envío está detrás de una interfaz (`backend/src/services/email/providers.ts`); la cola
de `email_log`, los reintentos y la idempotencia no cambian con el proveedor.

| `EMAIL_PROVIDER` | Variables | Notas |
|---|---|---|
| `resend` | `RESEND_API_KEY`, `EMAIL_FROM` | El actual. Con `onboarding@resend.dev` solo entrega a la dirección de tu cuenta de Resend; para el resto hace falta dominio propio verificado |
| `brevo` | `BREVO_API_KEY`, `EMAIL_FROM` | API HTTP v3. El remitente de `EMAIL_FROM` debe estar verificado en Brevo (*Senders, Domains & Dedicated IPs*) |
| `console` | — | No envía: en el log solo salen el destinatario enmascarado (`a***@dominio.es`) y el asunto. Para desarrollo y tests; las filas quedan `skipped` |

Para cambiar de proveedor: en el panel de Render, *Environment*, define
`EMAIL_PROVIDER`, `EMAIL_FROM` y la clave del nuevo, y redespliega. No hace falta
tocar la base de datos. Los correos que estuvieran `queued` se envían con el proveedor
nuevo en el siguiente ciclo.

Si falta la clave del proveedor elegido, el backend **arranca** (avisa en el log), pero
cada correo queda como fallido en `email_log` con el error claro (`last_error`),
se reintenta con espera creciente y, agotados los 5 intentos, pasa a `dead`. Al definir
la clave, lo que siga en `queued` sale solo.

**Con un remitente `@gmail.com`** los correos pueden ir a spam o ser rechazados: Gmail
y Yahoo exigen que SPF/DKIM/DMARC estén alineados con el dominio del remitente, y un
proveedor no puede firmar en nombre de `gmail.com`. Es aceptable para pruebas;
para el piloto hace falta un dominio propio verificado en el proveedor.

### Conexión segura a la base de datos

**El problema.** El pooler de Supabase presenta una cadena firmada por *Supabase Root 2021 CA*,
una CA privada que Node no trae. Por eso la `DATABASE_URL` de producción lleva
`?sslmode=no-verify`: conecta cifrado pero **sin comprobar con quién habla**. Y ese `sslmode`
tiene prioridad sobre el `ssl` que pone el código, así que el `rejectUnauthorized: true` que había en
`db/postgres.ts` no tenía efecto (lo demuestra `db-ssl.test.ts`).

**Qué hace el código.** Con `DATABASE_CA_CERT` definida, el pool usa
`ssl: { ca, rejectUnauthorized: true }` y quita de la URL los parámetros `sslmode`/`sslrootcert`
para que no puedan anularlo; `npm run migrate` (que pasa por `backend/scripts/migrate.ts`) hace lo
mismo con `sslmode=verify-full`. Sin la variable, todo funciona como antes y el log muestra un
aviso `DATABASE_CA_CERT no definida` (en producción).

**Qué tienes que hacer tú, en este orden:**

1. **Supabase.** *Project Settings → Database → SSL Configuration → Download certificate*. Se baja
   `prod-ca-2021.crt` (la CA raíz; es un certificado público, no un secreto). Comprueba que es el
   correcto: `openssl x509 -in prod-ca-2021.crt -noout -subject -enddate` debe decir
   `CN=Supabase Root 2021 CA` y caducidad abril de 2031. La copia que se probó el 9-oct-2026
   tiene SHA-256 `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`; si el de tu
   descarga es otro, Supabase la ha renovado y conviene mirar su documentación antes de seguir.
2. **Render.** En *Environment* del servicio del backend, una de dos:
   - variable `DATABASE_CA_CERT` con **el contenido** del `.crt` (de `-----BEGIN CERTIFICATE-----` a
     `-----END CERTIFICATE-----`; vale pegarlo en varias líneas o en una con `
`), o
   - un *Secret File* con el `.crt` y `DATABASE_CA_CERT=/etc/secrets/prod-ca-2021.crt`.
3. **No hace falta tocar `DATABASE_URL`.** Con la CA el código ignora su `sslmode`; puedes quitarle
   `?sslmode=no-verify` cuando hayas comprobado que funciona.
4. **Redespliega** (el *start command* corre `npm run migrate` y luego arranca; ambos verifican ahora).
5. **Comprueba:** en el log ya no sale `DATABASE_CA_CERT no definida`, `/health` responde `database: ok`
   y la migración termina sin `self-signed certificate`.

**Si falla** con `self-signed certificate in certificate chain`, la CA pegada no es la que firma la
conexión (por ejemplo, otra región o una conexión directa con otra CA): comprueba con
`openssl s_client -starttls postgres -connect <host>:5432 -CAfile prod-ca-2021.crt`. Para volver atrás,
borra `DATABASE_CA_CERT` y redespliega: queda el comportamiento anterior. La CA caduca en 2031: anótalo.

**No se definen en producción:** `DEMO_LOGIN_ENABLED` (sin ella `/auth/demo-login`
responde 404), `ALLOW_SEED_RESET` y `SEED_REMOTE_DB_OK`.

---

## 2. Frontend en Vercel

- **Root directory:** `frontend`; framework **Vite**.
- `frontend/vercel.json` fija el build, instala con `--legacy-peer-deps` y reescribe
  `/backend/:path*` hacia el backend de Render: así el navegador ve la API como
  *same-origin* y las cookies son de primer origen.
- En producción la API es siempre `/backend`, aunque `VITE_API_URL` esté definida
  (solo se respeta en desarrollo). Lo vigila `frontend-api-base.test.ts`.
- Variables en *Settings → Environment Variables*: `VITE_EXPLORER_URL`,
  `VITE_CONTRACT_ADDRESS` y, si se usan, `VITE_RPC_URL`. **Todo lo que empieza por
  `VITE_` acaba en el JavaScript público**: nunca un secreto.
- `npm run check:bundle` comprueba que ninguna variable de entorno se ha colado en
  el bundle.

---

## 3. Base de datos en Supabase

- Un único proyecto (`VTB`, ref `pxqejrptikoqoaokoqaq`) y es **producción**. No se
  usa para desarrollar (ver `CLAUDE.md`).
- Las migraciones son ficheros `.cjs` de `node-pg-migrate` en `backend/migrations/`
  (16 a 07-10-2026). **No son compatibles con el CLI de Supabase.**
- La migración 006 activa RLS sin políticas en todas las tablas. Es imprescindible
  en Supabase: sin ella, su API REST pública expone las tablas a cualquiera con la
  *anon key*, que es pública por diseño.
- La 015 (`registration_email_verification`) está como fichero; el código que la usa
  (registro con confirmación por correo, rama `JaimeOrdovas`) no se fusiona hasta que
  Resend funcione en producción.
- La 016 es **irreversible** (su `down` lanza un error a propósito).
- Copias de seguridad automáticas y prueba de restauración: **pendiente** (ver
  [`PROGRESO_PLAN.md`](PROGRESO_PLAN.md)).

---

## 4. Contrato en Sepolia

Estado a 07-10-2026 (detalle en [`CAMBIOS_VERANO_2026.md`](CAMBIOS_VERANO_2026.md)):
el v2 está desplegado y su relayer autorizado, pero producción sigue apuntando al
contrato anterior.

Para pasar producción al v2:

1. En Render: `CONTRACT_ADDRESS=0x124759Cc8bb31AAD866930dCd3caE6f148e4F607` y
   `DEPLOY_BLOCK=11724119` (los valores salen de
   `blockchain/deployments/sepolia.json`).
2. Comprobar en la cadena que el relayer de `PRIVATE_KEY` figura como autorizado
   (`isRelayer`). Si no, el *owner* lo autoriza con `setRelayer`
   (`blockchain/scripts/set-relayer.ts`).
3. Las elecciones que siguen en el contrato anterior no se migran solas: tienen un
   id que en el v2 significaría otra cosa. Crear las nuevas en el v2.
4. Recontar la primera elección con
   [`RECUENTO_INDEPENDIENTE.md`](../RECUENTO_INDEPENDIENTE.md).

El *owner* y el *relayer* son claves distintas y `deploy.ts` aborta en una red real
si coinciden.

---

## 5. Antes de fusionar a `main`

1. `npm test` y `npx tsc --noEmit` en `backend/`; `npm run build` y `npm run lint`
   en `frontend/`; el CI en verde.
2. Si hay migraciones nuevas: **copia de seguridad de la base** y leer si alguna es
   irreversible.
3. Si hay variables de entorno nuevas: añadirlas en Render o Vercel **antes** de
   fusionar, o el despliegue arranca sin ellas.
4. Si el cambio toca el camino del voto: revisar las reglas de `CLAUDE.md`
   ("Cosas que NO hay que romper").

---

## 6. Cómo verificar un despliegue

| Comprobación | Resultado esperado |
|---|---|
| `GET /health` | `200` con `"database":"ok"`. Con la base caída responde `503` (Render lo usa para decidir si el despliegue está sano) |
| Log de arranque | `✅ Usando PostgreSQL como motor de BD` y `🚀 VTB Backend iniciado` |
| Ausencia del bloque `⚠️ AVISO DE SEGURIDAD: DB_CLIENT != postgres` | Si aparece, `DB_CLIENT` no llegó al proceso y se está usando SQLite |
| Log: `✅ Job de limpieza de votos huérfanos activo (cada 30 min)` | Solo se imprime con PostgreSQL |
| `GET /auth/config` | `{"demoLoginEnabled":false}` |
| `POST /auth/demo-login` | `404` |
| Cabeceras | `strict-transport-security`, `content-security-policy` y `x-content-type-options: nosniff` presentes |
| CORS desde `http://localhost:3000` | No debe devolver `access-control-allow-origin` |

No hay *fallback* silencioso a SQLite: con `DB_CLIENT=postgres`, `getDbClient()`
exige una `DATABASE_URL` válida y **lanza** si falta. La única forma de acabar en
SQLite sin querer es que `DB_CLIENT` no llegue al proceso (errata en el nombre,
servicio equivocado), y las dos señales de arriba distinguen justo ese caso.

---

## 7. Si algo va mal

| Síntoma | Causa probable |
|---|---|
| El despliegue no arranca tras fusionar | Una migración falló al arrancar. Mirar el log de Render; el servicio anterior sigue sirviendo |
| `relation "…" does not exist` | Falta una migración. `npm run migrate` con la `DATABASE_URL` correcta |
| `DATABASE_URL no es una cadena de conexión de PostgreSQL` | Valor heredado del modo SQLite (`./vtb.db`) |
| `password authentication failed` | URL equivocada: el *pooler* y la conexión directa tienen usuarios distintos |
| `503 ELECTION_NOT_ON_CHAIN` al votar | La elección no está registrada en el contrato configurado. El job de sincronización lo reintenta cada 5 minutos |
| El voto "no sale en Etherscan" | Solo las transacciones de Sepolia se ven allí. Comprobar `RPC_URL`, `CONTRACT_ADDRESS` y que el relayer tiene ETH de Sepolia |
| Login correcto pero todo da 401 | `NODE_ENV=production` en un entorno local sobre HTTP: el navegador rechaza la cookie `Secure`. En local debe ser `development` |
| Primera petición muy lenta | El plan gratuito de Render duerme tras 15 min de inactividad: 30–40 s al despertar |

**Volver atrás:** redesplegar el commit anterior desde el panel de Render. Una
migración ya aplicada no se deshace sola: por eso la copia de seguridad va antes.

# VTB - Vote Through Blockchain

VTB es una aplicacion de votacion anonima que combina una capa Web2 para identidad, censo y administracion con una capa Web3 para registrar votos auditables en Ethereum Sepolia.

El contrato actual `ElectionRegistry` esta desplegado en Sepolia en:

```text
0xF6909eaF37D33b51333a282c4b3750981Bc768a4
```

El backend actua como relayer: valida al usuario contra SQLite, genera un nullifier anonimo y firma la transaccion `castVote` con una wallet de servidor. El frontend nunca necesita una private key.

## Estado Actual

- Frontend: React 18, Vite, Tailwind CSS, React Router, ethers.js.
- Backend: Express, TypeScript, SQLite, JWT, bcrypt, ethers.js.
- Blockchain: Solidity 0.8.24, Hardhat, Sepolia testnet via Alchemy.
- Base de datos: SQLite local en `backend/vtb.db`.
- Contrato: `ElectionRegistry` con `createElection`, `castVote`, `getElection`, `getElectionCount`.
- Votos: cada voto se registra on-chain como `nullifier + voteHash` y se audita localmente con `tx_hash`.

## Arquitectura

```text
Frontend React/Vite
  - Login, registro, dashboard, cabina de voto, resultados, admin
  - Lee VITE_API_URL para hablar con backend
  - Escucha eventos VoteCast usando VITE_RPC_URL

Backend Express/TypeScript
  - Autenticacion JWT y aprobacion de usuarios
  - SQLite para usuarios, censo, elecciones, candidatos y auditoria
  - Genera nullifiers HMAC en tiempo de voto
  - Firma transacciones con PRIVATE_KEY del relayer

SQLite
  - users
  - elections
  - candidates
  - election_voters
  - election_access
  - registration_requests
  - nullifier_audit
  - org_units
  - email_whitelist

Sepolia / ElectionRegistry
  - Guarda elecciones on-chain
  - Previene doble voto por nullifier
  - Emite VoteCast para auditoria publica
```

## Requisitos

- Node.js 20 o superior.
- npm.
- Git.
- Una URL RPC de Sepolia, por ejemplo Alchemy.
- Una wallet Sepolia con test ETH para el backend relayer.
- Opcional: Docker si vas a probar contenedores.

## Variables De Entorno

No subas archivos `.env` reales a GitHub. Estan ignorados por `.gitignore` y deben vivir solo en local o en el panel de variables del hosting.

### Backend

Crea `backend/.env` desde `backend/.env.example` y reemplaza los valores sensibles:

```env
PORT=3001
NODE_ENV=development

JWT_SECRET=<random-long-secret>
NULLIFIER_SECRET=<different-random-long-secret>
HMAC_SECRET=<optional-legacy-secret>

CORS_ORIGINS=http://localhost:3000,http://localhost:5173

RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<ALCHEMY_KEY>
CONTRACT_ADDRESS=0xF6909eaF37D33b51333a282c4b3750981Bc768a4
PRIVATE_KEY=0x<SEPOLIA_RELAYER_PRIVATE_KEY_WITH_TEST_ETH>
EXPLORER_URL=https://sepolia.etherscan.io
```

Notas importantes:

- `PRIVATE_KEY` nunca va en el frontend.
- La wallet de `PRIVATE_KEY` paga el gas de cada voto.
- Si esa wallet no tiene Sepolia ETH, votar fallara con `INSUFFICIENT_FUNDS`.
- El codigo actual usa SQLite en `backend/vtb.db`; `DATABASE_URL` puede existir en ejemplos, pero no cambia la ruta mientras no se modifique `backend/src/config/database.ts`.

### Frontend

Crea `frontend/.env` o `frontend/.env.local`:

```env
VITE_API_URL=http://localhost:3001
VITE_RPC_URL=wss://eth-sepolia.g.alchemy.com/v2/<ALCHEMY_KEY>
VITE_CONTRACT_ADDRESS=0xF6909eaF37D33b51333a282c4b3750981Bc768a4
VITE_EXPLORER_URL=https://sepolia.etherscan.io
```

Todo lo que empieza por `VITE_` se empaqueta en el frontend y es publico. No pongas secretos ahi. Para Alchemy en frontend, usa restricciones de dominio y limites de cuota desde el dashboard de Alchemy.

### Blockchain

Solo hace falta si vas a compilar, desplegar o crear elecciones on-chain:

```env
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<ALCHEMY_KEY>
ALCHEMY_API_KEY=<ALCHEMY_KEY>
DEPLOYER_PRIVATE_KEY=0x<OWNER_OR_DEPLOYER_PRIVATE_KEY>
ETHERSCAN_API_KEY=<optional>
```

## Instalacion Local

Desde la raiz del proyecto:

```bash
cd backend
npm install

cd ../frontend
npm install

cd ../blockchain
npm install
```

En PowerShell tambien puedes usar `npm.cmd install` si tu politica de ejecucion bloquea scripts.

## Arrancar La Aplicacion

### Terminal 1: Backend

```bash
cd backend
npm start
```

El backend queda en:

```text
http://localhost:3001
```

Al arrancar, inicializa SQLite y ejecuta `seedDemoData()`. Si la base esta vacia, crea usuarios, elecciones, candidatos, censos y votos demo. Si ya hay usuarios, no borra datos automaticamente.

### Terminal 2: Frontend

```bash
cd frontend
npm run dev
```

El frontend esta configurado para usar:

```text
http://localhost:3000
```

Si ese puerto esta ocupado, Vite mostrara otro puerto en consola.

### Opcional: Hardhat Local

La app actual esta pensada para Sepolia. Solo necesitas Hardhat local si quieres probar una red local:

```bash
cd blockchain
npm run node
```

En otra terminal:

```bash
cd blockchain
npm run deploy:local
```

Despues copia el `CONTRACT_ADDRESS` local a `backend/.env` y `frontend/.env`.

## Cuentas Demo

Estas cuentas salen del seed actual de `backend/src/scripts/seedDatabase.ts`.

| Rol | Email | Contrasena | Uso recomendado |
| --- | --- | --- | --- |
| Superadmin | `superadmin@vtb.system` | `superadmin123` | Acceso total al panel admin |
| Admin UFV | `admin@ufv.es` | `admin123` | Gestion del dominio `ufv.es` |
| Admin EDU | `admin@universidad.edu` | `admin123` | Gestion del dominio `universidad.edu` |
| Admin Highland | `admin@highland.edu` | `admin123` | Gestion del dominio `highland.edu` |
| Admin EPS | `admin@eps.ufv.es` | `admin123` | Gestion del dominio `eps.ufv.es` |
| Estudiante UFV | `carlos@ufv.es` | `demo123` | Demo rapida desde login |
| Estudiante UFV | `miguel@ufv.es` | `demo123` | Buen usuario para probar votos pendientes |
| Estudiante UFV | `student8@ufv.es` | `demo123` | Usuario demo adicional |
| Estudiante EDU | `juan@universidad.edu` | `demo123` | Demo rapida desde login |
| Estudiante EDU | `elena@universidad.edu` | `demo123` | Buen usuario para probar votos pendientes |
| Estudiante Highland | `student5@highland.edu` | `demo123` | Demo del dominio Highland |

Importante: documentos antiguos y algunos scripts de inicio pueden mencionar `password123`. La contrasena real de los estudiantes seed actuales es `demo123`.

## Flujo De Login

1. El usuario entra en `/login`.
2. El frontend envia `POST /auth/login` con `email` y `password`.
3. El backend busca el usuario en SQLite.
4. Si `is_approved = 0`, responde `ACCOUNT_PENDING_APPROVAL`.
5. Si la password bcrypt coincide, devuelve un JWT de 24 horas.
6. El frontend guarda token y datos de usuario en `localStorage`.
7. Si el rol es `admin` o `superadmin`, redirige a `/admin`; si no, a `/dashboard`.

El JWT no contiene nullifier. El nullifier se genera solo cuando se vota.

## Flujo De Registro De Usuarios

La ruta publica es:

```text
/register-request
```

El usuario envia nombre, email, student ID y contrasena.

- Si el email esta en `email_whitelist`, se aprueba automaticamente y puede iniciar sesion al momento.
- Si no esta en whitelist, queda en `registration_requests` con estado `pending`.
- Un admin revisa la solicitud desde el panel de administracion.
- Al aprobar, se crea el usuario como estudiante aprobado.
- Si la solicitud ya traia password, el usuario inicia sesion con la password que eligio.
- Si es una solicitud legacy sin password, el backend genera una temporal tipo `VTB_<student_id>_temp`.

## Flujo De Voto

1. El usuario entra al dashboard.
2. `GET /api/elections` devuelve solo elecciones donde esta en `election_voters`.
3. Al entrar en `/voting/:id`, el frontend consulta `GET /api/elections/:id/eligibility`.
4. El backend valida:
   - la eleccion existe,
   - esta activa y dentro del horario,
   - el usuario esta en el censo,
   - el usuario no ha votado ya.
5. El usuario selecciona candidato.
6. El frontend calcula un `voteHash`.
7. El backend genera `nullifier = HMAC(userId, electionId, NULLIFIER_SECRET)`.
8. El backend llama al contrato:

```solidity
castVote(election_id_blockchain, nullifier, voteHash)
```

9. El contrato guarda el voto, rechaza nullifiers duplicados y emite `VoteCast`.
10. El backend guarda `tx_hash`, `block_number`, `candidate_id` y `nullifier_hash` en `nullifier_audit`.
11. El frontend muestra el `txHash` y enlace a Sepolia Etherscan.

## Base De Datos

SQLite vive en:

```text
backend/vtb.db
```

Al arrancar el backend:

- crea tablas si faltan,
- aplica migraciones aditivas con `ALTER TABLE ... ADD COLUMN`,
- aprueba admins y superadmins existentes,
- ejecuta seed si no hay usuarios.

Para resetear la demo local:

```bash
cd backend
npm run seed
```

Ese comando borra las tablas demo principales y las vuelve a sembrar. No lo uses contra datos reales.

Tambien puedes parar el backend, guardar una copia de `backend/vtb.db` y arrancar de nuevo con una base limpia.

## Sincronizacion SQLite / Blockchain

Hay dos IDs distintos:

- `elections.id`: ID local de SQLite.
- `elections.election_id_blockchain`: ID que debe existir en el contrato.

El voto usa `election_id_blockchain`, no el ID local. Si no coincide con Sepolia, el contrato revierte con:

```text
ERR: election does not exist
```

Comprueba el estado:

```bash
curl http://localhost:3001/api/elections/blockchain-sync-status
```

En desarrollo puedes corregir la secuencia local:

```bash
curl -X PATCH http://localhost:3001/api/elections/fix-blockchain-ids
```

En produccion ese endpoint exige JWT de admin:

```bash
curl -X PATCH http://localhost:3001/api/elections/fix-blockchain-ids \
  -H "Authorization: Bearer <ADMIN_JWT>"
```

Usalo solo si sabes que las elecciones locales deben mapearse secuencialmente a las elecciones on-chain.

## Panel Admin

Ruta:

```text
/admin
```

Funciones principales:

- Dashboard con usuarios, solicitudes, elecciones activas y votos.
- Estado blockchain con chainId, blockNumber y electionCount.
- Gestion de usuarios.
- Importacion CSV de usuarios.
- Creacion de elecciones locales y registro best-effort on-chain.
- Gestion de candidatos.
- Gestion de dominios permitidos por eleccion.
- Gestion granular de votantes por eleccion.
- Solicitudes de registro pendientes, aprobadas y rechazadas.
- Auditoria de votos.
- Estadisticas por eleccion.

Los admins de dominio solo gestionan su dominio. El superadmin ve todo.

## Crear Elecciones

Desde el panel admin, `POST /admin/elections` crea la eleccion en SQLite. Si `CONTRACT_ADDRESS` y `PRIVATE_KEY` estan configurados, el backend tambien intenta crearla on-chain.

Detalles importantes:

- El contrato exige que `startTime` este en el futuro.
- El backend ajusta el start on-chain con margen si hace falta.
- Si la transaccion on-chain falla, la eleccion local puede existir igualmente.
- Revisa `/admin/blockchain-status` o `/api/elections/blockchain-sync-status` despues de crear elecciones.

## Endpoints Principales

Publicos:

| Metodo | Endpoint | Descripcion |
| --- | --- | --- |
| GET | `/health` | Health check |
| GET | `/api/health` | Health check alternativo |
| POST | `/auth/login` | Login |
| POST | `/auth/register` | Registro directo pendiente de aprobacion |
| POST | `/registration/request` | Solicitud publica de acceso |
| GET | `/api/elections/:id/audit` | Auditoria publica de una eleccion |

Protegidos:

| Metodo | Endpoint | Descripcion |
| --- | --- | --- |
| GET | `/auth/verify` | Verificar JWT |
| GET | `/api/elections` | Elecciones asignadas al usuario |
| GET | `/api/elections/:id` | Detalle de eleccion y candidatos |
| GET | `/api/elections/:id/eligibility` | Elegibilidad del usuario |
| GET | `/api/elections/:id/results` | Resultados y participacion |
| POST | `/api/elections/register-vote` | Registrar voto on-chain |
| GET | `/api/elections/blockchain-sync-status` | Estado de mapeo SQLite/on-chain |

Admin:

| Metodo | Endpoint | Descripcion |
| --- | --- | --- |
| GET | `/admin/dashboard` | KPIs del panel admin |
| GET | `/admin/blockchain-status` | Estado del nodo y contrato |
| GET | `/admin/users` | Listar usuarios |
| POST | `/admin/users` | Crear usuario aprobado |
| POST | `/admin/users/import` | Importar usuarios CSV |
| GET | `/admin/elections` | Listar elecciones administrables |
| POST | `/admin/elections` | Crear eleccion |
| POST | `/admin/elections/:id/domains` | Permitir dominio |
| POST | `/admin/elections/:id/voters` | Agregar votante concreto |
| POST | `/admin/elections/:id/candidates` | Agregar candidato |
| GET | `/admin/registration-requests` | Ver solicitudes |
| PATCH | `/admin/registration-requests/:id` | Aprobar o rechazar solicitud |
| GET | `/admin/stats/voters` | Estadisticas globales |
| GET | `/admin/elections/:id/stats` | Estadisticas detalladas |

## Validacion Antes De Subir Cambios

Backend:

```bash
cd backend
npx tsc --noEmit
```

Frontend:

```bash
cd frontend
npm run build
```

Blockchain:

```bash
cd blockchain
npm run compile
```

## Hosting Online Sin Filtrar Secretos

Separacion recomendada:

- Frontend en Vercel, Netlify, Cloudflare Pages o similar.
- Backend en Render, Railway, Fly.io, VPS o similar.
- SQLite en disco persistente o migrar a PostgreSQL si el hosting no mantiene archivos.
- Sepolia via Alchemy o Infura.

En el frontend solo configuras variables publicas:

```env
VITE_API_URL=https://tu-backend.example.com
VITE_RPC_URL=wss://eth-sepolia.g.alchemy.com/v2/<PUBLIC_BROWSER_KEY>
VITE_CONTRACT_ADDRESS=0xF6909eaF37D33b51333a282c4b3750981Bc768a4
VITE_EXPLORER_URL=https://sepolia.etherscan.io
```

En el backend configuras secretos en el panel del proveedor:

```env
JWT_SECRET=<secret>
NULLIFIER_SECRET=<secret>
RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<SERVER_KEY>
CONTRACT_ADDRESS=0xF6909eaF37D33b51333a282c4b3750981Bc768a4
PRIVATE_KEY=0x<RELAYER_PRIVATE_KEY>
CORS_ORIGINS=https://tu-frontend.example.com
EXPLORER_URL=https://sepolia.etherscan.io
NODE_ENV=production
```

Checklist de seguridad:

- No commitear `.env`.
- No poner `PRIVATE_KEY` en variables `VITE_*`.
- Rotar cualquier API key que haya aparecido en GitHub.
- Restringir la key de Alchemy del frontend por dominio.
- Usar una wallet relayer solo para demo/testnet, con fondos limitados.
- Activar HTTPS.
- Configurar `CORS_ORIGINS` con el dominio real.
- Usar disco persistente para `vtb.db` o una base gestionada.

## Troubleshooting

### `insufficient funds for intrinsic transaction cost`

La wallet del backend no tiene Sepolia ETH suficiente para pagar gas. Revisa que `PRIVATE_KEY` pertenece a la wallet correcta y fondeala con test ETH.

### `ERR: election does not exist`

`election_id_blockchain` no existe on-chain. Ejecuta:

```bash
curl http://localhost:3001/api/elections/blockchain-sync-status
```

Si corresponde, corrige con `PATCH /api/elections/fix-blockchain-ids`.

### `Blockchain node unavailable`

Suele significar RPC caido, `CONTRACT_ADDRESS` vacio, `PRIVATE_KEY` vacio o URL RPC incorrecta. Revisa `backend/.env` y `/admin/blockchain-status`.

### `You have already voted in this election`

El usuario ya tiene registro en `nullifier_audit` para esa eleccion. Usa otra cuenta demo o resetea la base local con `npm run seed`.

### `This election is not currently active`

La eleccion esta fuera de su ventana `start_time` / `end_time` o `is_active = 0`.

### `You are not in the voter census`

El usuario no esta en `election_voters`. Un admin puede agregar el dominio de la eleccion o agregar al usuario concreto desde el panel.

### Login falla con cuentas demo

Usa las cuentas de este README. En particular, estudiantes usan `demo123`, no `password123`.

### CORS en produccion

Agrega el dominio exacto del frontend:

```env
CORS_ORIGINS=https://tu-frontend.example.com
```

En produccion, las peticiones sin `Origin` pueden rechazarse.

### Frontend apunta al backend antiguo

Las variables `VITE_*` se leen al compilar. Cambia `frontend/.env` y vuelve a ejecutar:

```bash
cd frontend
npm run build
```

### La base de datos desaparece al desplegar

Muchos hostings tienen filesystem efimero. Usa disco persistente, volumen montado o migra a PostgreSQL.

## Estructura Del Repo

```text
VTB_DEMO/
  backend/
    src/
      config/database.ts
      routes/auth.ts
      routes/elections.ts
      routes/admin.ts
      routes/registration.ts
      scripts/seedDatabase.ts
      utils/auth.ts
    package.json
    Dockerfile

  frontend/
    src/
      App.jsx
      context/
      pages/
      components/
      i18n/
    package.json
    vite.config.js
    Dockerfile

  blockchain/
    contracts/VTB.sol
    scripts/deploy.ts
    scripts/createElections.ts
    hardhat.config.ts
    package.json

  README.md
  docker-compose.yml
```

## Notas De Produccion

Este proyecto esta preparado como demo avanzada. Antes de usarlo con usuarios reales:

- rota secretos y claves que hayan estado en desarrollo,
- revisa persistencia de base de datos,
- configura logs y backups,
- anade monitorizacion del saldo de la wallet relayer,
- limita permisos del admin,
- revisa proteccion CSRF/CORS segun despliegue final,
- considera mover SQLite a una base gestionada,
- haz pruebas de carga y de doble voto.


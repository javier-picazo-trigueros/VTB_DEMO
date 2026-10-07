# Desarrollo

Flujo de trabajo, comandos y cómo probar el voto en cadena. Para instalar y
arrancar por primera vez, ver [`SETUP.md`](../SETUP.md); para las reglas de código,
[`CLAUDE.md`](../CLAUDE.md).

---

## 1. Flujo de trabajo con git

`main` es la rama estable: Vercel y Render redespliegan solos con cada push, así que
solo recibe código revisado y con el CI en verde.

- Se trabaja en **ramas por tema** con el formato `tipo/descripcion`
  (`fix/cabina-votacion`, `feat/registro-confirmacion-email`, `chore/lint-frontend`).
- Un tema por rama y un tema por commit, con mensajes en español y prefijo
  `fix(…)`, `feat(…)`, `test(…)`, `docs(…)` o `chore(…)`, como en el historial.
- Para publicar: pull request de la rama a `main`. Antes, lo de la sección 3.
- Mantén tu rama al día con `main` (`git merge origin/main` o *rebase*) para que no
  se aleje: los conflictos más probables están en `VotingBooth.jsx` y `i18n/config.ts`.
- Dependabot abre PRs semanales agrupados: los de versiones mayores van juntos en
  un solo PR y no se fusionan "de paso".

---

## 2. Comandos

### Backend (`backend/`)

| Comando | Para qué |
|---|---|
| `npm run dev` | Arranca con *nodemon* |
| `npm start` | Arranca una vez con `tsx` |
| `npm run build` | Compila TypeScript |
| `npm run typecheck` | Comprueba tipos sin generar ficheros (`npx tsc --noEmit` es lo mismo) |
| `npm test` / `npm run test:watch` | Tests con Vitest. **Siempre sobre SQLite en memoria** |
| `npm run lint` / `lint:fix` / `format` | ESLint y Prettier |
| `npm run seed` | Siembra los datos de demo en una base **vacía**; aborta si hay usuarios |
| `npm run seed:reset` | **Borra** usuarios, elecciones, censo y votos y vuelve a sembrar |
| `npm run migrate` / `migrate:down` / `migrate:create` | Migraciones de PostgreSQL (`node-pg-migrate`) |
| `npm run sync-blockchain` | Registra en el contrato las elecciones pendientes |
| `npm run resolve-stuck-nonce` | Desatasca una transacción del relayer |
| `npm run rotate-admin-passwords` | Rota contraseñas de administración débiles (solo SQLite) |

`seed` y `seed:reset` exigen `NODE_ENV` distinto de `production` **y**
`ALLOW_SEED_RESET=true`, y con PostgreSQL solo se ejecutan contra una base local
(ver `SETUP.md`).

### Frontend (`frontend/`)

| Comando | Para qué |
|---|---|
| `npm run dev` | Servidor de Vite en `http://localhost:3000` |
| `npm run build` | Build de producción |
| `npm run preview` | Sirve el build |
| `npm run check:bundle` | Comprueba que no se cuela ninguna variable de entorno en el bundle |
| `npm run lint` / `lint:fix` / `format` | ESLint y Prettier |

### Blockchain (`blockchain/`)

| Comando | Para qué |
|---|---|
| `npm run compile` | Compila los contratos |
| `npm test` | Tests de los contratos |
| `npm run node` | Nodo local de Hardhat |
| `npm run deploy:local` / `deploy:sepolia` | Despliega `ElectionRegistryV2` |
| `npm run verify:sepolia` | Verifica el contrato en Etherscan |
| `npm run recount` | Recuento independiente de una elección (ver [`RECUENTO_INDEPENDIENTE.md`](../RECUENTO_INDEPENDIENTE.md)) |

### URLs locales

| Recurso | URL |
|---|---|
| Aplicación | http://localhost:3000 (landing, `/login`, `/dashboard`, `/admin`, `/transparency`) |
| Salud del backend | http://localhost:3001/health |
| Estadísticas públicas | http://localhost:3001/api/stats |

---

## 3. Antes de abrir un pull request

```bash
cd backend  && npm test && npx tsc --noEmit
cd frontend && npm run build && npm run lint
cd blockchain && npm run compile      # solo si has tocado contratos
```

Luego `git diff` para comprobar que solo cambió lo que querías. Si hay migraciones o
variables de entorno nuevas, ver [`DESPLIEGUE.md`](DESPLIEGUE.md), sección 5.

---

## 4. Probar el voto en cadena

Con las cuentas `@vtb.demo` y `DEMO_LOGIN_ENABLED=true` el voto se guarda sin tocar
la cadena (es un voto de demostración, sin hash de transacción). Para probar el
camino real hay dos opciones.

### A. Cadena local de Hardhat

Las transacciones son reales para esa cadena, pero no se ven en Etherscan.

```bash
# Terminal 1
cd blockchain && npm run node

# Terminal 2
cd blockchain && npm run deploy:local
```

`deploy:local` escribe `blockchain/deployments/localhost.json` con la dirección del
contrato y autoriza como relayer la **cuenta #1** de Hardhat (el *owner* es la #0).

En `backend/.env`:

```env
RPC_URL=http://localhost:8545
CONTRACT_ADDRESS=<dirección de deployments/localhost.json>
DEPLOY_BLOCK=<deployBlock de ese fichero>
PRIVATE_KEY=<clave privada de la cuenta #1 que imprime `npm run node`>
EXPLORER_URL=http://localhost:8545
```

La clave es la de la **#1**, no la de la #0: si usas la #0, `castVote` revierte con
`ERR: not authorized relayer`. Son claves públicas de pruebas de Hardhat; nunca las
uses en una red real.

Después, `npm run dev` en `backend/` y en `frontend/`, y crea una elección desde el
panel de administración. Se registra en el contrato en segundo plano; mientras no
esté sincronizada (`chain_status` distinto de `synced`) votar devuelve
`503 ELECTION_NOT_ON_CHAIN`. Para forzarlo: `npm run sync-blockchain` o el botón
*Sync Elections* del panel.

### B. Sepolia

Solo si necesitas ver el voto en Etherscan. Necesitas un nodo (Alchemy o similar), el
contrato desplegado y una clave de **relayer** con ETH de Sepolia, autorizada en el
contrato (`isRelayer`). Las variables son las mismas de arriba con los valores de
`blockchain/deployments/sepolia.json`.

**Cuidado con la base de datos:** si tu `backend/.env` tiene `DB_CLIENT=postgres`, las
elecciones y votos se escribirán en esa base. En local debe ser una base local, nunca
la de producción.

---

## 5. Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| `Port 3001 is already in use` | Ya hay un backend corriendo. Ciérralo (`Get-NetTCPConnection -LocalPort 3001` en PowerShell, `lsof -i :3001` en Linux/macOS) o cambia `PORT` y `VITE_API_URL` |
| PowerShell bloquea `npm` o `npx` | Usa `npm.cmd`/`npx.cmd`, o `Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned` |
| `npm ci` falla con `EPERM` en la caché | `npm.cmd ci --cache .npm-cache` (la carpeta es desechable y no se versiona) |
| Hardhat falla en Windows con un error de `%APPDATA%` | Define `APPDATA` y `LOCALAPPDATA` apuntando a carpetas dentro de `blockchain/` antes de compilar |
| Votar devuelve `503 ELECTION_NOT_ON_CHAIN` | La elección aún no está registrada en el contrato configurado. Ejecuta `npm run sync-blockchain` |
| Votar revierte con `not authorized relayer` | La clave de `PRIVATE_KEY` no es la autorizada en ese contrato (ver sección 4.A) |
| Un voto real no aparece en Etherscan | Solo las transacciones de Sepolia salen allí. Comprueba `RPC_URL`, `CONTRACT_ADDRESS`, `EXPLORER_URL` y el saldo del relayer |
| Una cuenta demo no muestra enlace a Etherscan | Es lo esperado: su voto no tiene transacción |

Para errores de CORS, de login con `401` o del seed, ver los *Problemas frecuentes* de
[`SETUP.md`](../SETUP.md).

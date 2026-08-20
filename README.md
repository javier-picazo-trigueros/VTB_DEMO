# VTB - Vote Through Blockchain

> Institutional voting where audit is public and identity stays private.

VTB is a hybrid Web2 + Web3 voting platform for universities and schools.
Administrators manage users and elections through a web panel. Students vote
through the browser — no wallet required.

Each vote generates a **nullifier** (HMAC of userId + electionId) that the
backend posts to a Solidity smart contract on Ethereum Sepolia as the relayer.
The blockchain stores `(nullifier, voteHash)` — enough to prove "someone voted
once" without storing who that someone is.

Demo accounts under `@vtb.demo` use synthetic hashes for quick testing. Real
institutional accounts such as `@ufv.es` and `@highlands.edu` are expected to
vote through the configured Ethereum network and receive a real transaction hash.

## Architecture

```mermaid
flowchart LR
    subgraph Client
        B[Browser\nReact / Vite]
    end

    subgraph Render["Render (backend)"]
        E[Express API\nNode.js 20]
        DB[(SQLite / Postgres)]
    end

    subgraph Chain["Ethereum Sepolia"]
        SC[ElectionRegistry\nSmart Contract]
    end

    B -- "httpOnly cookie\n(vtb_auth JWT)" --> E
    E -- "SQL queries" --> DB
    E -- "castVote(electionId, nullifier, voteHash)" --> SC
    B -.-> SC
```

**Auth flow** — three cookies set by the backend:

| Cookie | httpOnly | TTL | Purpose |
|---|---|---|---|
| `vtb_auth` | ✓ | 15 min | Access JWT — bearer of identity |
| `vtb_refresh` | ✓ | 7 days | Refresh token — rotates `vtb_auth` |
| `vtb_csrf` | ✗ | 15 min | CSRF token — JS reads it and sends as `X-CSRF-Token` header |

**Vote flow** — nullifier protects double-vote:
1. User clicks "Vote" → frontend computes `voteHash = SHA256(choice + random_salt)`
2. Backend reads JWT from cookie → `userId`
3. Backend computes `nullifier = HMAC(userId + electionId)` with server secret
4. Backend calls `contract.castVote(electionId, nullifier, voteHash)` and records the txHash
5. Blockchain rejects any second call with the same nullifier

```
Stack: React 18 · Vite 6 · Tailwind CSS 3 · framer-motion
       Express 4.22 · TypeScript · SQLite (dev/test) · PostgreSQL (prod)
       ethers.js 6 · Hardhat · Solidity 0.8 · Sepolia testnet
```

## Live Demo

| Service | URL |
|---|---|
| Frontend | https://vtb-frontend-git-main-javier-picazo-trigueros-projects.vercel.app |
| Backend | https://vtb-backend-4emv.onrender.com |
| Sepolia contract | https://sepolia.etherscan.io/address/0x92110ea2a133567a0d6237e8991Fff336cd70778 |

Render free-tier backends can sleep after inactivity. The first request after a
sleep may take 30-40 seconds.

## Demo Accounts

### Synthetic demo accounts

These accounts are local/demo only. They produce a synthetic hash and do not
create an Etherscan transaction.

| Account | Password | Role |
|---|---|---|
| `student@vtb.demo` | `demo123` | Voter |
| `student2@vtb.demo` | `demo123` | Voter |
| `admin@vtb.demo` | `admin123` | Admin |
| `superadmin@vtb.demo` | `superadmin123` | Super admin |

### Real blockchain demo accounts

These accounts must use the configured blockchain relayer. With Sepolia env
values they receive a real tx hash visible on Etherscan.

| Account | Password | Role |
|---|---|---|
| `carlos@ufv.es` | `demo123` | Voter |
| `laura@ufv.es` | `demo123` | Voter |
| `miguel@ufv.es` | `demo123` | Voter |
| `sofia@ufv.es` | `demo123` | Voter |
| `julio@ufv.es` | `profesor123` | Voter |
| `admin@ufv.es` | `admin123` | Admin |
| `susana@eps.ufv.es` | `director123` | Admin |
| `olga@eps.ufv.es` | `director123` | Admin |
| `admin@eps.ufv.es` | `admin123` | Admin |
| `student5@highlands.edu` | `demo123` | Voter |
| `student6@highlands.edu` | `demo123` | Voter |
| `student7@highlands.edu` | `demo123` | Voter |
| `julio@highlands.edu` | `profesor123` | Voter |
| `admin@highlands.edu` | `admin123` | Admin |
| `superadmin@vtb.system` | `superadmin123` | Super admin |

## Requirements

- Git
- Node.js 20.x LTS
- npm 10+ (comes with current Node 20 installers)

Check versions:

```bash
node -v
npm -v
git --version
```

If Node is missing, install Node.js 20 LTS from https://nodejs.org.

Windows PowerShell note: if `npm` or `npx` is blocked by execution policy, use
`npm.cmd` / `npx.cmd`, or run this once in the current PowerShell window:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
```

## Fresh Install

Clone the repo:

```bash
git clone https://github.com/javier-picazo-trigueros/VTB_DEMO.git
cd VTB_DEMO
```

Install dependencies. The repo has separate apps, so install each folder:

```bash
cd backend
npm ci
cd ../frontend
npm ci
cd ../blockchain
npm ci
cd ..
```

If `npm ci` fails because a lockfile is out of date, use `npm install` in the
same folder and commit the updated lockfile.

If Windows reports `EPERM` while writing to the npm cache, either fix the
permissions on `%LOCALAPPDATA%\npm-cache` or use a local cache for that install:

```powershell
npm.cmd ci --cache .npm-cache
```

## Environment Files

macOS/Linux:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
cp blockchain/.env.example blockchain/.env
```

Windows PowerShell:

```powershell
Copy-Item backend\.env.example backend\.env
Copy-Item frontend\.env.example frontend\.env
Copy-Item blockchain\.env.example blockchain\.env
```

Generate secrets for `backend/.env`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Minimum `backend/.env` for local development (SQLite mode):

```env
PORT=3001
NODE_ENV=development
JWT_SECRET=REPLACE_WITH_RANDOM_64_CHAR_HEX
NULLIFIER_SECRET=REPLACE_WITH_RANDOM_64_CHAR_HEX
DATABASE_PATH=./vtb.db
CORS_ORIGINS=http://localhost:3000,http://localhost:5173,http://localhost:4173
RPC_URL=http://localhost:8545
CONTRACT_ADDRESS=0x0000000000000000000000000000000000000000
PRIVATE_KEY=0x0000000000000000000000000000000000000000000000000000000000000000
EXPLORER_URL=http://localhost:8545
RATE_LIMIT_MAX=100
```

> **Cookie note**: `NODE_ENV=development` is required for local HTTP.
> In production the backend sets `Secure; SameSite=None` cookies so they cross
> the Vercel→Render domain boundary. Over plain `http://localhost` the browser
> would block `Secure` cookies, so in development mode the backend uses
> `SameSite=Lax` (no `Secure`). If you accidentally set `NODE_ENV=production`
> in your local `.env`, login will appear to succeed but every subsequent
> request will return 401 because the browser never stores the auth cookie.

**Backend `.env` variable reference**:

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `PORT` | — | `3001` | TCP port the Express server listens on |
| `NODE_ENV` | — | — | `development` for local HTTP; `production` for Render |
| `JWT_SECRET` | ✓ prod | dev fallback | Signs access JWTs; rotate to invalidate all sessions |
| `NULLIFIER_SECRET` | ✓ prod | dev fallback | HMAC key for generating nullifiers; **never rotate** in prod |
| `CSRF_SECRET` | — | derived from JWT_SECRET | CSRF token signing; separate secret adds defence-in-depth |
| `DATABASE_PATH` | — | `./vtb.db` | Path to SQLite file; ignored when `DB_CLIENT=postgres` |
| `DB_CLIENT` | — | `sqlite` | `postgres` to switch to PostgreSQL |
| `DATABASE_URL` | ✓ if postgres | — | `postgresql://user:pass@host:5432/vtb` |
| `CORS_ORIGINS` | — | — | Comma-separated list of allowed frontend origins |
| `RPC_URL` | — | `http://localhost:8545` | Ethereum JSON-RPC endpoint (Alchemy/Infura for Sepolia) |
| `CONTRACT_ADDRESS` | — | — | Deployed `ElectionRegistry` address |
| `PRIVATE_KEY` | — | — | Relayer wallet private key (must have Sepolia ETH) |
| `EXPLORER_URL` | — | — | Base URL for block explorer links in emails |
| `RATE_LIMIT_MAX` | — | `10` (prod) / `100` (dev) | Max login attempts per 15 min window |
| `RESEND_API_KEY` | — | — | Resend.com API key; emails are silently skipped if absent |
| `RESEND_FROM` | — | — | "From" address; domain must be verified in Resend |
| `FRONTEND_URL` | — | — | Public frontend URL; used in email links |

To use PostgreSQL instead of SQLite, add these vars:

```env
DB_CLIENT=postgres
DATABASE_URL=postgresql://user:password@host:5432/vtb
```

`DB_CLIENT` defaults to `sqlite` when omitted. `DATABASE_PATH` is only used in
SQLite mode. `DATABASE_URL` is required when `DB_CLIENT=postgres`.

Minimum `frontend/.env`:

```env
VITE_API_URL=http://localhost:3001
VITE_EXPLORER_URL=https://sepolia.etherscan.io
VITE_RPC_URL=http://localhost:8545
VITE_CONTRACT_ADDRESS=0x0000000000000000000000000000000000000000
```

For Sepolia voting, set `backend/.env` to your real relayer values:

```env
RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
CONTRACT_ADDRESS=0x92110ea2a133567a0d6237e8991Fff336cd70778
PRIVATE_KEY=0xYOUR_SEPOLIA_RELAYER_PRIVATE_KEY
EXPLORER_URL=https://sepolia.etherscan.io
```

The relayer wallet must own or be allowed to use the contract and must have
Sepolia ETH for gas.

## Start The App

Choose one mode.

### Mode A: Sepolia real voting

Use this when you want `@ufv.es` and `@highlands.edu` votes to appear on
Etherscan.

1. Configure `backend/.env` with Sepolia `RPC_URL`, `CONTRACT_ADDRESS`,
   `PRIVATE_KEY`, and `EXPLORER_URL=https://sepolia.etherscan.io`.
2. Start backend:

```bash
cd backend
npm run dev
```

3. Start frontend in another terminal:

```bash
cd frontend
npm run dev
```

4. Open http://localhost:3000.

On backend startup, VTB initializes the database schema and starts election
sync in the background. To populate demo data on a fresh database, run seed
manually after starting:

```bash
cd backend
npm run seed
```

To trigger blockchain sync manually:

```bash
cd backend
npm run sync-blockchain
```

Or from the Admin Panel: Dashboard -> Sync Elections.

### Mode B: Local Hardhat chain

Use this when you want fully local blockchain transactions. These tx hashes are
real for the local chain but are not visible on public Etherscan.

Terminal 1:

```bash
cd blockchain
npm run node
```

Terminal 2:

```bash
cd blockchain
npm run deploy:local
```

After deploy, copy the generated contract address from
`blockchain/deployment-info.json` into:

`backend/.env`

```env
RPC_URL=http://localhost:8545
CONTRACT_ADDRESS=PASTE_DEPLOYED_ADDRESS
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
EXPLORER_URL=http://localhost:8545
```

`frontend/.env`

```env
VITE_RPC_URL=http://localhost:8545
VITE_CONTRACT_ADDRESS=PASTE_DEPLOYED_ADDRESS
VITE_EXPLORER_URL=http://localhost:8545
```

Terminal 3:

```bash
cd backend
npm run dev
```

Terminal 4:

```bash
cd frontend
npm run dev
```

Open http://localhost:3000.

## Deploy

### Backend → Render

1. Create a new **Web Service** in [Render](https://render.com).
2. Root directory: `backend`
3. Build command: `npm ci && npm run build`
4. Start command: `node dist/index.js`
5. Set environment variables (Environment tab):

   ```
   NODE_ENV=production
   JWT_SECRET=<random 64-char hex>
   NULLIFIER_SECRET=<random 64-char hex — NEVER change after first vote>
   DATABASE_PATH=./vtb.db           # or remove if using PostgreSQL
   CORS_ORIGINS=https://your-frontend.vercel.app
   RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<YOUR_KEY>
   CONTRACT_ADDRESS=0x92110ea2a133567a0d6237e8991Fff336cd70778
   PRIVATE_KEY=0x<RELAYER_PRIVATE_KEY>
   EXPLORER_URL=https://sepolia.etherscan.io
   ```

6. (Optional) Add a PostgreSQL instance in Render and set:
   ```
   DB_CLIENT=postgres
   DATABASE_URL=<internal connection string from Render PG>
   ```

### Frontend → Vercel

1. Import the repo in [Vercel](https://vercel.com).
2. Framework preset: **Vite**.
3. Root directory: `frontend`.
4. Environment variables:

   ```
   VITE_API_URL=https://<your-render-backend>.onrender.com
   VITE_EXPLORER_URL=https://sepolia.etherscan.io
   VITE_CONTRACT_ADDRESS=0x92110ea2a133567a0d6237e8991Fff336cd70778
   ```

5. Deploy. Vercel will rebuild on every push to `main`.

> Free-tier Render backends sleep after 15 minutes of inactivity. The first
> request after a sleep can take 30–40 seconds. Upgrade to a paid plan or use
> a keep-alive ping service to avoid this.

## Verification Commands

Run these before pushing changes:

```bash
cd backend
npm run build
npm test
```

```bash
cd frontend
npm run build
```

```bash
cd blockchain
npm run compile
```

Windows PowerShell alternatives if scripts are blocked:

```powershell
cd backend
npm.cmd run build
npm.cmd test
```

```powershell
cd frontend
npm.cmd run build
```

```powershell
cd blockchain
npm.cmd run compile
```

If Hardhat fails on Windows with an `%APPDATA%` folder error, run it with local
app-data folders:

```powershell
cd blockchain
$env:APPDATA=(Join-Path (Get-Location) '.hardhat-appdata')
$env:LOCALAPPDATA=(Join-Path (Get-Location) '.hardhat-localappdata')
npm.cmd run compile
```

## Useful Scripts

Backend:

| Command | Purpose |
|---|---|
| `npm run dev` | Start backend with nodemon |
| `npm start` | Start backend once with tsx |
| `npm run build` | TypeScript compile |
| `npm run typecheck` | Type-check without emitting files |
| `npm run lint` | Run ESLint (errors = CI failure) |
| `npm run lint:fix` | Auto-fix ESLint issues |
| `npm run format` | Format with Prettier |
| `npm test` | Run Vitest backend tests |
| `npm run seed` | Seed demo data into the current database |
| `npm run sync-blockchain` | Sync elections to configured chain |
| `npm run migrate` | Apply pending PG migrations (requires `DB_CLIENT=postgres`) |
| `npm run migrate:down` | Roll back the last PG migration |
| `npm run migrate:status` | Show applied/pending PG migrations |
| `npm run db:migrate` | Copy data from SQLite to PostgreSQL |
| `npm run db:rollback` | Copy data from PostgreSQL back to SQLite |

Frontend:

| Command | Purpose |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview built frontend |

Blockchain:

| Command | Purpose |
|---|---|
| `npm run node` | Start local Hardhat node |
| `npm run compile` | Compile Solidity contracts |
| `npm run deploy:local` | Deploy to local Hardhat node |
| `npm run deploy:sepolia` | Deploy to Sepolia |

## Local URLs

| Resource | URL |
|---|---|
| Landing | http://localhost:3000/landing |
| Login | http://localhost:3000/login |
| Dashboard | http://localhost:3000/dashboard |
| Admin panel | http://localhost:3000/admin |
| Public audit | http://localhost:3000/transparency |
| Backend health | http://localhost:3001/health |
| Public stats API | http://localhost:3001/api/stats |

## Troubleshooting

### Port 3001 is already in use

Windows PowerShell:

```powershell
Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue |
  Select-Object LocalAddress,LocalPort,State,OwningProcess
Stop-Process -Id <PID> -Force
```

macOS/Linux:

```bash
lsof -i :3001
kill -9 <PID>
```

You can also use another backend port by changing `PORT` in `backend/.env` and
`VITE_API_URL` in `frontend/.env`.

### Frontend port

This repo pins Vite to `http://localhost:3000` in `frontend/vite.config.js`.
Make sure `CORS_ORIGINS` in `backend/.env` includes `http://localhost:3000`.
`http://localhost:5173` is also allowed for compatibility with Vite defaults in
other setups.

### PowerShell blocks npm or npx

Use `npm.cmd` / `npx.cmd`, or run:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
```

### npm install fails with EPERM in AppData cache

Use a project-local npm cache:

```powershell
npm.cmd ci --cache .npm-cache
```

The `.npm-cache` folder is disposable and should not be committed.

### Real account vote says election is not synchronized

Run:

```bash
cd backend
npm run sync-blockchain
```

Or click Sync Elections in the Admin Panel Dashboard. This registers missing
SQLite elections on the configured blockchain.

### Real account vote does not show on Etherscan

Only Sepolia transactions are visible on Etherscan. Check:

- `backend/.env` uses a Sepolia `RPC_URL`
- `CONTRACT_ADDRESS=0x92110ea2a133567a0d6237e8991Fff336cd70778`
- `EXPLORER_URL=https://sepolia.etherscan.io`
- the relayer `PRIVATE_KEY` has Sepolia ETH
- the account is not `@vtb.demo`

### Demo account shows no Etherscan link

That is expected. Only `@vtb.demo` accounts use synthetic hashes.

## PostgreSQL Setup

To run with PostgreSQL instead of SQLite:

1. Provision a PostgreSQL database and get the connection string.
2. Add to `backend/.env`:
   ```env
   DB_CLIENT=postgres
   DATABASE_URL=postgresql://user:password@host:5432/vtb
   ```
3. Apply the schema migrations:
   ```bash
   cd backend
   npm run migrate
   ```
4. (Optional) Seed demo data:
   ```bash
   npm run seed
   ```
5. (Optional) Migrate existing SQLite data to PostgreSQL:
   ```bash
   DATABASE_PATH=./vtb.db npm run db:migrate
   ```
   To revert: `npm run db:rollback`.

## Notes

- SQLite lives at `backend/vtb.db` by default (`DATABASE_PATH` env var).
- Demo data is **not** seeded automatically; run `npm run seed` on a fresh install.
- Results are computed from the audit data in the active database.
- The relayer private key signs blockchain transactions; use a dedicated wallet.

## Known Technical Debt

### Rate limiter not tested in CI

The per-user vote rate limiter (`voteUserLimiter`, max 3 votes/min in production)
is bypassed in the test environment by setting `max` to 1 000 000 when
`NODE_ENV === 'test'`. This means the limiter itself is never exercised by the
automated suite. A future integration test should spin up the app with the real
limit and verify that the 4th vote attempt within a minute returns 429.

### 2 high-severity vulnerabilities in `glob` (via `node-pg-migrate@7.x`)

`npm audit` reports two high-severity `glob` CVEs introduced transitively through
`node-pg-migrate@7.9.x`. The fix is to upgrade to `node-pg-migrate@9`, but v9
introduces breaking API changes to the migration file format that would require
migrating all existing migration files. This is tracked as a separate task.
Until then, the vulnerability is a known accepted risk — `glob` is only called
by the migration CLI tool, not by any request-handling code path.

### Cryptographic voter anonymity pending Semaphore

The current implementation provides **operational** anonymity — the blockchain
stores only `(nullifier, voteHash)`, not the voter's identity. However, the
backend database does record the mapping between `user_id` and `election_id`
in `nullifier_audit` for double-vote prevention. A fully anonymous system would
use a zero-knowledge circuit (e.g. [Semaphore](https://semaphore.pse.dev/)) so
that even the backend cannot learn who voted for whom. Implementing Semaphore
requires replacing the relayer model with client-side ZK proof generation — a
significant architectural change planned for a future milestone.

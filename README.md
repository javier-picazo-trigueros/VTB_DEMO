# VTB - Vote Through Blockchain

> Anonymous. Verifiable. Democratic.

VTB is a hybrid Web2 + Web3 institutional voting platform. Demo-only accounts
under `@vtb.demo` use synthetic hashes for quick testing. Real institutional
accounts such as `@ufv.es` and `@highlands.edu` are expected to vote through the
configured Ethereum network and receive a real transaction hash.

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
| `admin@vtb.demo` | `demo123` | Admin |
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

Minimum `backend/.env` for local development:

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

On backend startup, VTB seeds SQLite and then starts election sync in the
background. You can also trigger it manually:

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
| `npm test` | Run Vitest backend tests |
| `npm run seed` | Seed SQLite manually |
| `npm run sync-blockchain` | Sync SQLite elections to configured chain |

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

## Notes

- SQLite lives at `backend/vtb.db` by default.
- The backend seeds demo data automatically on startup.
- Results are computed from SQLite audit data.
- The relayer private key signs blockchain transactions; use a dedicated wallet.

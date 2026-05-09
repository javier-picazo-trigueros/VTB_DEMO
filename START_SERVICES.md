# VTB — Quick Start

This file covers the minimum steps to run VTB locally. For a full guide see [README.md](./README.md).

## Live Demo (no local setup required)

The app is deployed and ready to use:

```
https://vtb-frontend-git-main-javier-picazo-trigueros-projects.vercel.app
```

> **Cold start:** The Render backend (free tier) sleeps after 15 minutes of inactivity.
> The first request after sleep takes 30–40 seconds. A banner appears in the UI while waiting.

**Quick demo accounts (work instantly — synthetic blockchain):**

| Role          | Email                | Password  |
|---------------|----------------------|-----------|
| Voter         | student@vtb.demo     | demo123   |
| Administrator | admin@vtb.demo       | demo123   |

These accounts bypass the real Ethereum blockchain. Votes are recorded in the database
with a synthetic SHA-256 hash — no Hardhat or Sepolia needed.

---

## Local Setup (2 terminals minimum)

### Prerequisites

- Node.js 20+
- `backend/.env` configured (copy from `backend/.env.example`)
- `frontend/.env` configured (copy from `frontend/.env.example`, set `VITE_API_URL=http://localhost:3001`)

### Terminal 1 — Backend

```bash
cd backend
npm install      # first time only
npm run dev      # seeds database automatically on first run
```

Verify:
```
http://localhost:3001/health  →  {"status":"OK"}
```

### Terminal 2 — Frontend

```bash
cd frontend
npm install      # first time only
npm run dev
```

Open:
```
http://localhost:5173
```

---

## Terminal 3 — Blockchain (optional)

Only needed for real on-chain votes with `@ufv.es`, `@highland.edu`, etc. accounts.
The `@vtb.demo` accounts always work without this.

```bash
cd blockchain
npm install      # first time only
npx hardhat node
```

In a fourth terminal, deploy the contract:

```bash
cd blockchain
npx hardhat run scripts/deploy.ts --network localhost
```

Copy the deployed contract address to `backend/.env`:
```env
CONTRACT_ADDRESS=0x<address from deploy output>
RPC_URL=http://localhost:8545
```

Restart the backend after updating `.env`.

---

## Demo Accounts

### Quick Demo (vtb.demo — synthetic blockchain, always works)

| Role          | Email                | Password  |
|---------------|----------------------|-----------|
| Voter         | student@vtb.demo     | demo123   |
| Administrator | admin@vtb.demo       | demo123   |

### Full Demo (real blockchain — requires Hardhat or Sepolia)

**UFV — Universidad Francisco de Vitoria**

| Email               | Password    | Role                |
|---------------------|-------------|---------------------|
| carlos@ufv.es       | demo123     | Voter               |
| laura@ufv.es        | demo123     | Voter               |
| miguel@ufv.es       | demo123     | Voter               |
| sofia@ufv.es        | demo123     | Voter               |
| julio@ufv.es        | profesor123 | Voter (professor)   |
| admin@ufv.es        | admin123    | Admin (ufv.es)      |
| susana@eps.ufv.es   | director123 | Admin (eps.ufv.es)  |
| olga@eps.ufv.es     | director123 | Admin (eps.ufv.es)  |
| admin@eps.ufv.es    | admin123    | Admin (eps.ufv.es)  |

**Highlands School**

| Email                 | Password    | Role                  |
|-----------------------|-------------|-----------------------|
| student5@highland.edu | demo123     | Voter                 |
| student6@highland.edu | demo123     | Voter                 |
| julio@highland.edu    | profesor123 | Voter (professor)     |
| admin@highland.edu    | admin123    | Admin (highland.edu)  |

**System**

| Email                  | Password       | Role        |
|------------------------|----------------|-------------|
| superadmin@vtb.system  | superadmin123  | Super Admin |

---

## Ports

| Service   | URL                       | Port |
|-----------|---------------------------|------|
| Frontend  | http://localhost:5173     | 5173 |
| Backend   | http://localhost:3001     | 3001 |
| Hardhat   | http://localhost:8545     | 8545 |

---

## Startup Scripts (alternative)

The repo includes platform-specific launch scripts. These open services in separate
windows or tabs. If any script fails, use the manual two-terminal method above.

| Script          | Platform          | Notes                           |
|-----------------|-------------------|---------------------------------|
| `start.bat`     | Windows CMD       | Opens services in new windows   |
| `start.ps1`     | Windows PowerShell| May need execution policy set   |
| `start.sh`      | Linux / macOS     | Requires bash                   |

PowerShell execution policy (if blocked):
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

---

## Troubleshooting

### Port 3001 already in use

Check if a VTB backend is already running:
```bash
curl http://localhost:3001/health
```

Windows — find and kill the process:
```powershell
Get-NetTCPConnection -LocalPort 3001 | Select-Object LocalAddress,LocalPort,State,OwningProcess
Stop-Process -Id <PID>
```

### Vote fails with blockchain error

For `@vtb.demo` accounts, the blockchain is bypassed — this should never fail.
For real accounts, verify `RPC_URL`, `CONTRACT_ADDRESS`, and `PRIVATE_KEY` in `backend/.env`.

### SQLite resets on Render after deploy

Expected behavior on Render free tier — the filesystem is ephemeral.
Add a Render Persistent Disk ($5/month) to persist `vtb.db` between deploys.

### Node.js not found

Install Node.js 20 from: https://nodejs.org/

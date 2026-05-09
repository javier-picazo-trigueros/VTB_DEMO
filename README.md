# VTB — Vote Through Blockchain

> Anonymous. Verifiable. Democratic.

VTB is a hybrid Web2+Web3 institutional voting platform. Every vote is
cryptographically secured with HMAC-SHA256 nullifiers and recorded immutably
on Ethereum Sepolia. Anyone can verify the vote count on Etherscan without
a login or account.

## Live Demo

| Service   | URL                                                                            |
|-----------|--------------------------------------------------------------------------------|
| Frontend  | https://vtb-frontend-git-main-javier-picazo-trigueros-projects.vercel.app      |
| Backend   | https://vtb-backend-4emv.onrender.com                                          |
| Contract  | https://sepolia.etherscan.io/address/0xF6909eaF37D33b5133a282c4b3750981Bc768a4 |

> **Note:** The Render backend runs on the free tier and sleeps after 15 minutes
> of inactivity. The first request may take 30–40 seconds to wake it up.
> Subsequent requests are instant.

## Demo Accounts

### Quick Demo (no Hardhat required — synthetic blockchain)

These accounts work instantly on the live Vercel deployment.
Votes are recorded in the database but NOT on the real Ethereum blockchain.
A synthetic SHA-256 hash is shown in place of a real `txHash`.

| Account              | Password  | Role          |
|----------------------|-----------|---------------|
| student@vtb.demo     | demo123   | Voter         |
| admin@vtb.demo       | demo123   | Administrator |

### Full Demo (requires local backend + Hardhat running)

These accounts go through the real blockchain flow.
Votes are recorded on Ethereum Sepolia with a real `txHash` viewable on Etherscan.

**UFV — Universidad Francisco de Vitoria**

| Account             | Password    | Role                                              |
|---------------------|-------------|---------------------------------------------------|
| carlos@ufv.es       | demo123     | Voter (student)                                   |
| laura@ufv.es        | demo123     | Voter (student)                                   |
| miguel@ufv.es       | demo123     | Voter (student)                                   |
| sofia@ufv.es        | demo123     | Voter (student)                                   |
| julio@ufv.es        | profesor123 | Voter (professor — can vote, cannot admin)        |
| admin@ufv.es        | admin123    | Admin (ufv.es domain)                             |
| susana@eps.ufv.es   | director123 | Admin (eps.ufv.es — EPS Director)                 |
| olga@eps.ufv.es     | director123 | Admin (eps.ufv.es — EPS Director)                 |
| admin@eps.ufv.es    | admin123    | Admin (eps.ufv.es)                                |

**Highlands School**

| Account               | Password    | Role                      |
|-----------------------|-------------|---------------------------|
| student5@highland.edu | demo123     | Voter (student)           |
| student6@highland.edu | demo123     | Voter (student)           |
| julio@highland.edu    | profesor123 | Voter (no admin access)   |
| admin@highland.edu    | admin123    | Admin (highland.edu)      |

**System**

| Account                | Password       | Role                       |
|------------------------|----------------|----------------------------|
| superadmin@vtb.system  | superadmin123  | Super Admin (all domains)  |

> **Account hierarchy note:**
> `susana@eps.ufv.es` and `olga@eps.ufv.es` are directors of EPS (Escuela Politécnica
> Superior). They can create elections targeting the `eps.ufv.es` domain, which includes
> `julio@ufv.es` as a voter. `julio@ufv.es` has `role: student` — he can vote but cannot
> access the admin panel.

## Stack

| Layer      | Technology                                           |
|------------|------------------------------------------------------|
| Frontend   | React 18 + Vite + Tailwind CSS + Framer Motion       |
| Backend    | Express + TypeScript + SQLite3                       |
| Blockchain | Solidity (ElectionRegistry.sol) on Ethereum Sepolia  |
| Auth       | JWT + bcrypt + HMAC-SHA256 nullifiers                |
| Deploy     | Vercel (frontend) + Render (backend)                 |
| Testing    | Vitest + Supertest                                   |

## Local Setup

### Prerequisites

- Node.js 20+
- Git

### 1. Clone the repository

```bash
git clone https://github.com/javier-picazo-trigueros/VTB_DEMO.git
cd VTB_DEMO
```

### 2. Install dependencies

```bash
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
cd blockchain && npm install && cd ..
```

### 3. Configure environment variables

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
cp blockchain/.env.example blockchain/.env
```

Edit `backend/.env` with your values. The minimum required fields are:

```env
PORT=3001
NODE_ENV=development
JWT_SECRET=<random 64-char hex>
NULLIFIER_SECRET=<random 64-char hex>
DATABASE_PATH=./vtb.db
CORS_ORIGINS=http://localhost:5173
RPC_URL=http://localhost:8545
CONTRACT_ADDRESS=0x0000000000000000000000000000000000000000
PRIVATE_KEY=0x0000000000000000000000000000000000000000000000000000000000000000
EXPLORER_URL=http://localhost:8545
```

Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

For real Sepolia votes, set:

```env
RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
CONTRACT_ADDRESS=0xF6909eaF37D33b5133a282c4b3750981Bc768a4
PRIVATE_KEY=0xYOUR_SEPOLIA_RELAYER_PRIVATE_KEY
EXPLORER_URL=https://sepolia.etherscan.io
```

### 4. Start services (2–3 terminals)

**Terminal 1 — Backend:**

```bash
cd backend
npm run dev
# Database seeds automatically on first run
```

**Terminal 2 — Frontend:**

```bash
cd frontend
npm run dev
# Open http://localhost:5173
```

**Terminal 3 — Blockchain (optional, only for real on-chain votes):**

```bash
cd blockchain
npx hardhat node
# In a 4th terminal: npx hardhat run scripts/deploy.ts --network localhost
```

### 5. Run tests

```bash
cd backend && npx vitest run
cd frontend && npm run build
```

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for full architecture documentation.

## API Documentation

See [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) for all endpoints.

## Key Features

- **Multi-tenant:** supports multiple institutions with isolated data per domain
- **Anonymous voting:** HMAC-SHA256 nullifiers prevent double voting without revealing identity
- **Public auditability:** `/transparency` page requires no login — anyone can verify vote counts
- **Two-tier demo:** vtb.demo accounts use synthetic hashes; real accounts use Ethereum Sepolia
- **QR code sharing:** admins generate QR codes linking directly to elections (`/voting/:id`)
- **PDF export:** download election results with full blockchain audit trail (jsPDF)
- **Guided onboarding:** react-joyride tour on first login, persisted per-user in localStorage
- **i18n:** full English and Spanish support (i18next)
- **Dark mode:** system preference + manual toggle

## Security Notes

- JWT stored in localStorage (planned migration to httpOnly cookies)
- SQLite resets on Render free tier deploys — add a persistent disk for production
- Results are computed from SQLite, not from per-candidate blockchain commitments
- The relayer private key signs all blockchain transactions; use a dedicated demo wallet
- See [ARCHITECTURE.md](./ARCHITECTURE.md) Known Limitations section for full details

## Local URLs

| Resource           | URL                                 |
|--------------------|-------------------------------------|
| Landing            | http://localhost:5173/landing       |
| Login              | http://localhost:5173/login         |
| Dashboard          | http://localhost:5173/dashboard     |
| Admin panel        | http://localhost:5173/admin         |
| Public audit       | http://localhost:5173/transparency  |
| Backend health     | http://localhost:3001/health        |
| Public stats API   | http://localhost:3001/api/stats     |

## Troubleshooting

### Frontend runs on port 5173, not 3000

Vite defaults to port 5173. Make sure `CORS_ORIGINS` in `backend/.env` includes `http://localhost:5173`.

### Vote fails with blockchain error

For `@vtb.demo` accounts, the blockchain is bypassed automatically — votes always succeed with a synthetic hash.
For real accounts, you need a valid `RPC_URL`, `CONTRACT_ADDRESS`, and a `PRIVATE_KEY` with Sepolia ETH.

### The onboarding tour reappears

The tour is saved in `localStorage` with a per-user key. Clearing browser storage, switching browsers, or using incognito mode will reset it. You can also reset it manually from the profile page.

### Backend cold start on Render

The Render free tier hibernates after 15 minutes of inactivity. The first request after sleep can take 30–40 seconds. A banner appears in the frontend while waiting.

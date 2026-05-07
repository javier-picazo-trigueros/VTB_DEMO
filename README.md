# VTB - Vote Through Blockchain

VTB is a hybrid Web2 + Web3 voting platform for institutional elections.

- Frontend: React 18 + Vite + Tailwind CSS
- Backend: Express + TypeScript + SQLite3
- Blockchain: Solidity + Hardhat + Ethereum Sepolia
- Auth/privacy: JWT + bcrypt + HMAC-SHA256 nullifiers
- Hosting model: frontend on Vercel, backend on Render free tier

This repository is intended to run locally for development and demos. No deployment is required for local work.

## Production Hosting Notes

| Service | Platform | Notes |
| --- | --- | --- |
| Frontend | Vercel | Static Vite build. Configure `VITE_API_URL` to point to the backend. |
| Backend | Render free tier | The service can sleep after inactivity. First request may take 30-60 seconds. |
| Database | SQLite | On Render free tier the database is not persistent unless a persistent disk is added. |
| Blockchain | Ethereum Sepolia | Votes are relayed by the backend wallet. |

For production, set the backend URL in Vercel:

```env
VITE_API_URL=https://your-render-service.onrender.com
```

## Requirements

- Node.js 20.x
- npm
- Git
- A Sepolia RPC URL, for example Alchemy or Infura
- A Sepolia wallet private key with test ETH if you want to cast real testnet votes

The repo does not have a root `package.json`, so install dependencies inside each app folder.

## 1. Install Dependencies

From the repo root:

```bash
cd backend
npm install

cd ../frontend
npm install

cd ../blockchain
npm install
```

## 2. Configure Environment Files

### Backend

Create `backend/.env`:

```env
PORT=3001
NODE_ENV=development

JWT_SECRET=REPLACE_WITH_RANDOM_64_CHAR_HEX
NULLIFIER_SECRET=REPLACE_WITH_RANDOM_64_CHAR_HEX
HMAC_SECRET=REPLACE_WITH_RANDOM_64_CHAR_HEX

CORS_ORIGINS=http://localhost:3000

RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
CONTRACT_ADDRESS=YOUR_DEPLOYED_CONTRACT_ADDRESS
PRIVATE_KEY=0xYOUR_SEPOLIA_RELAYER_PRIVATE_KEY
EXPLORER_URL=https://sepolia.etherscan.io
```

Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Important: the backend now fails fast if `JWT_SECRET` or `NULLIFIER_SECRET` are missing.

### Frontend

Create `frontend/.env.local`:

```env
VITE_API_URL=http://localhost:3001
VITE_EXPLORER_URL=https://sepolia.etherscan.io
```

Do not put private keys in frontend variables. Anything starting with `VITE_` is public in the browser.

### Blockchain

Create `blockchain/.env` if you deploy contracts:

```env
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
DEPLOYER_PRIVATE_KEY=0xYOUR_SEPOLIA_PRIVATE_KEY
ETHERSCAN_API_KEY=optional
```

## 3. Run Locally

Open two terminals.

Terminal 1, backend:

```bash
cd backend
npm start
```

Check it:

```bash
curl http://localhost:3001/health
```

Terminal 2, frontend:

```bash
cd frontend
npm run dev
```

Open:

```text
http://localhost:3000
```

The backend initializes SQLite and seeds demo data on startup.

## 4. Optional Local Blockchain

If you want a local Hardhat chain:

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

Copy the deployed contract address into `backend/.env` as `CONTRACT_ADDRESS`.

For Sepolia deployment:

```bash
cd blockchain
npm run deploy:sepolia
```

## 5. Demo Accounts

Use the login page demo account dropdowns, or these seed accounts. The `vtb.demo` accounts are intended for clean local demos and are reset on backend startup so they do not appear as already voted.

| Role | Email | Password |
| --- | --- | --- |
| Student demo | `student@vtb.demo` | `demo123` |
| Student demo | `student2@vtb.demo` | `demo123` |
| Student UFV | `demo.ufv@ufv.es` | `demo123` |
| Student EPS UFV | `demo.eps@ufv.es` | `demo123` |
| Student Highlands | `demo.highland@highland.edu` | `demo123` |
| Student Universidad | `demo.universidad@universidad.edu` | `demo123` |
| Admin demo | `admin@vtb.demo` | `admin123` |
| Admin UFV | `admin.demo@ufv.es` | `admin123` |
| Admin Highlands | `admin.demo@highland.edu` | `admin123` |
| Admin Universidad | `admin.demo@universidad.edu` | `admin123` |
| Super admin demo | `superadmin@vtb.demo` | `superadmin123` |
| Legacy student with sample votes | `carlos@ufv.es` | `demo123` |
| Admin | `admin@ufv.es` | `admin123` |
| Super admin | `superadmin@vtb.system` | `superadmin123` |

## 6. Useful URLs

| Page/API | URL |
| --- | --- |
| Landing | `http://localhost:3000/landing` |
| Login | `http://localhost:3000/login` |
| Public audit | `http://localhost:3000/transparency` |
| Backend health | `http://localhost:3001/health` |
| Public stats API | `http://localhost:3001/api/stats` |
| Public audit API | `http://localhost:3001/api/audit/public` |

## 7. Validation Commands

Backend:

```bash
cd backend
npx vitest run
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

## Troubleshooting

### Login gets stuck or keeps loading

Most common causes:

- Backend is not running at `VITE_API_URL`.
- Render free tier backend is sleeping.
- `backend/.env` is missing `JWT_SECRET` or `NULLIFIER_SECRET`, so the backend crashed on startup.
- CORS does not include `http://localhost:3000`.
- The account is pending approval or the password is wrong.

The login page now has a 15 second timeout and shows a specific message when the backend cannot be reached.

### `FATAL: JWT_SECRET environment variable is not set`

Create `backend/.env` and add `JWT_SECRET` and `NULLIFIER_SECRET`.

### `insufficient funds for intrinsic transaction cost`

The relayer wallet in `PRIVATE_KEY` has no Sepolia ETH. Use a Sepolia faucet and restart the backend.

### `Cannot GET /api/elections`

Use authenticated routes with a JWT. Public checks are:

```bash
curl http://localhost:3001/health
curl http://localhost:3001/api/stats
```

### Theme or language does not persist

Theme is stored in `localStorage` as `vtb-theme`. Language is stored by i18next as `i18nextLng`.
Clear those keys if you want to reset browser preferences.

## Documentation Map

- `ARCHITECTURE.md`: current architecture overview.
- `API_DOCUMENTATION.md`: API reference.
- `START_SERVICES.md`: older helper-script notes. Prefer this README for current local setup.

## Security Notes

- Never commit `.env`, `.env.local`, database files, or private keys.
- Never expose `PRIVATE_KEY` through `VITE_*` frontend variables.
- Use long random values for JWT/nullifier secrets.
- Render free tier SQLite data is not durable unless a persistent disk is configured.

# VTB — Architecture

VTB is a hybrid Web2+Web3 application for anonymous, auditable institutional voting.

## System Overview

```
Browser (React 18 / Vite)
       │
       │ HTTPS/JSON  (JWT in Authorization header)
       ▼
Express backend  (TypeScript / Node.js 20)
       │                    │
       │ SQLite3             │ ethers.js
       ▼                    ▼
  vtb.db             ElectionRegistry.sol
                     (Ethereum Sepolia)
```

## Frontend

**Path:** `frontend/src/`

| File / folder              | Purpose                                              |
|----------------------------|------------------------------------------------------|
| `pages/Landing.jsx`        | Public landing with live stats                       |
| `pages/Login.jsx`          | JWT auth, demo account selector                      |
| `pages/Dashboard.jsx`      | Voter's election list with eligibility badges        |
| `pages/VotingBooth.jsx`    | Candidate selection, nullifier generation, vote send |
| `pages/ElectionResults.jsx`| Results chart, blockchain audit tab, PDF/QR export   |
| `pages/AdminPanel.jsx`     | Full admin: users, elections, inbox, stats, audit    |
| `pages/UserProfile.jsx`    | Profile editing, academic data, password change      |
| `pages/Transparency.jsx`   | Public audit — no login required                     |
| `pages/InstitutionPortal.jsx` | Per-domain branded portal                        |
| `pages/Pricing.jsx`        | Pricing / plans page                                 |
| `pages/ChangePassword.jsx` | Standalone password change (post-approval flow)      |
| `context/AuthContext.jsx`  | JWT persistence, user state, backend-sleeping detect |
| `context/ThemeContext.tsx` | Dark/light mode toggle with system preference        |
| `components/Navbar.jsx`    | Responsive nav with role-aware links                 |
| `components/OnboardingTour.jsx` | react-joyride tour, per-user localStorage key  |
| `components/DemoModeButton.jsx` | Demo login modal trigger on landing/login      |
| `i18n/config.ts`           | i18next setup — EN + ES translations                 |

**Key dependencies:**

| Package           | Use                                           |
|-------------------|-----------------------------------------------|
| React 18 + Vite   | UI framework + dev server                     |
| Tailwind CSS      | Utility-first styling                         |
| Framer Motion     | Animated transitions                          |
| react-i18next     | EN/ES translations                            |
| axios             | HTTP client                                   |
| ethers.js         | voteHash generation in VotingBooth            |
| react-hot-toast   | Non-blocking toast notifications              |
| jsPDF             | Client-side PDF export of election results    |
| react-qr-code     | QR code generation for election deep links    |
| recharts          | Charts in ElectionResults and AdminPanel      |

## Backend

**Path:** `backend/src/`

| File                        | Purpose                                              |
|-----------------------------|------------------------------------------------------|
| `index.ts`                  | Express server entry point, port binding             |
| `app.ts`                    | Middleware setup, route mounting, error handler      |
| `config/database.ts`        | SQLite3 wrapper, schema init, idempotent migrations  |
| `routes/auth.ts`            | Login, register, JWT verify, profile CRUD            |
| `routes/elections.ts`       | Election listing, eligibility, register-vote, audit  |
| `routes/admin.ts`           | Full admin CRUD, dashboard KPIs, CSV import          |
| `routes/registration.ts`    | Registration request flow                            |
| `routes/organizations.ts`   | Domain branding lookup                               |
| `utils/auth.ts`             | JWT sign/verify, bcrypt helpers, verifyToken()       |
| `scripts/seedDatabase.ts`   | Idempotent seed — runs on every startup              |
| `__tests__/`                | Vitest test suite (auth, nullifier, roles)           |

**Key dependencies:**

| Package     | Use                                             |
|-------------|--------------------------------------------------|
| Express     | HTTP server                                      |
| TypeScript  | Type safety                                      |
| sqlite3     | Embedded relational DB                           |
| bcrypt      | Password hashing                                 |
| jsonwebtoken| JWT sign + verify                                |
| ethers.js   | Blockchain relayer (castVote calls)              |
| multer      | CSV file upload handling                         |
| csv-parse   | CSV parsing for bulk imports                     |
| express-rate-limit | Login rate limiting                       |

## Blockchain

**Path:** `blockchain/`

Single Solidity contract: `contracts/VTB.sol`

**`ElectionRegistry` stores per election:**
- Election metadata (id, start, end, active flag)
- Mapping `nullifier → bool` (prevents double-vote)
- Mapping `nullifier → voteHash` (public proof of vote)

**Does NOT store:**
- Email, name, student ID, role
- Candidate selection in cleartext

The backend acts as a relayer: it holds the private key, verifies the JWT, generates the nullifier on-chain, and calls `castVote(electionId, nullifier, voteHash)`.

## Vote Flow

```
1. User selects candidate in VotingBooth
2. Frontend generates voteHash = keccak256(candidateId + salt)
3. POST /api/elections/register-vote { electionId, candidateId, voteHash }
4. Backend verifies JWT → userId, email, role
5. Backend checks eligibility (census + not already voted)
6. Backend generates nullifier = HMAC-SHA256(userId:electionId, NULLIFIER_SECRET)
7a. vtb.demo accounts → synthetic txHash returned (no blockchain call)
7b. Real accounts → backend calls ElectionRegistry.castVote() on Sepolia
8. Contract rejects duplicate nullifiers (on-chain dedup)
9. Backend writes nullifier_audit row (txHash, blockNumber, candidateId)
10. Frontend shows VoteSuccessModal with txHash
    - Demo badge shown for vtb.demo accounts
    - Etherscan link shown for real blockchain votes
```

## Two-Tier Demo System

| Tier | Accounts | Blockchain | txHash |
|------|----------|-----------|--------|
| A — Demo | `*@vtb.demo` | Bypassed | Synthetic SHA-256 (not on Sepolia) |
| B — Real | `*@ufv.es`, `*@highland.edu`, etc. | Full Sepolia flow | Real Etherscan txHash |

The bypass is implemented in `routes/elections.ts` after eligibility checks:
if `decoded.email.endsWith('@vtb.demo')` → generate synthetic hash → insert audit row → return early.

## Data Model

**SQLite tables (key ones):**

| Table              | Contents                                          |
|--------------------|---------------------------------------------------|
| `users`            | email, name, student_id, role, admin_domain, etc. |
| `elections`        | id, blockchain_id, name, start/end_time, domains  |
| `candidates`       | election_id, name, description, vote_count        |
| `election_voters`  | election_id, user_id (census)                     |
| `nullifier_audit`  | user_id, election_id, nullifier_hash, tx_hash, block_number, candidate_id, generated_at |
| `registration_requests` | email, full_name, student_id, status, reviewed_at |
| `org_units`        | domain, unit_name                                 |

## Roles

| Role        | Permissions                                              |
|-------------|----------------------------------------------------------|
| `student`   | View assigned elections, vote, view results              |
| `admin`     | Manage users/elections/requests in their `admin_domain`  |
| `superadmin`| Global access — all domains, all elections               |

Domain scoping: admin routes filter by `req.user.adminDomain` unless role is `superadmin`.

## Seeding

`scripts/seedDatabase.ts` runs on every backend startup via `criticalAccounts` upsert.
It is idempotent — safe to run multiple times. It creates demo users, elections, candidates,
and census assignments. Never edit this file for one-time fixes.

## Deployment

| Layer      | Platform                                  |
|------------|-------------------------------------------|
| Frontend   | Vercel (automatic deploys from main)      |
| Backend    | Render (free tier — sleeps after 15 min)  |
| Blockchain | Ethereum Sepolia (persistent)             |
| Database   | SQLite embedded in backend process        |

**Cold start:** Render free tier sleeps after 15 minutes of inactivity. The frontend's
`AuthContext` detects a sleeping backend and shows a banner with a retry button.

**SQLite persistence:** On Render free tier, the filesystem is ephemeral — the database
resets on each new deploy. Add a persistent disk ($5/month) to retain data between deploys.

## QR Deep-Link Flow

```
Admin generates QR → URL: /voting/:id
User scans QR (not logged in) → redirected to /login?redirect=/voting/:id
User logs in → Dashboard reads ?redirect= param → navigates to /voting/:id
User votes normally
```

## Known Limitations

- **SQLite:** Not ideal for high-concurrency production. Suitable for demo and academic use.
- **Ephemeral storage:** Render free tier resets the database on deploy without a persistent disk.
- **Relayer custody:** The backend holds the Sepolia private key. A production system would use a hardware wallet or MPC.
- **Candidate privacy:** Candidate ID is stored in `nullifier_audit` (SQLite, not on-chain). Results come from SQLite counts, not blockchain state.
- **JWT in localStorage:** Vulnerable to XSS. Production should use httpOnly cookies.
- **Demo bypass:** vtb.demo accounts never touch the real blockchain — intended for live presentations without Hardhat dependency.

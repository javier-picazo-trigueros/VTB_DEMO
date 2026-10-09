# VTB — Architecture

VTB (Vote Through Blockchain) is a hybrid Web2+Web3 platform for institutional voting with verifiable on-chain tallying on Ethereum.

## System Overview

```
Browser (React 19 / Vite)
       │
       │ Same-origin proxy (/backend/* via Vite in dev, Vercel rewrite in prod)
       │ Cookies: httpOnly, SameSite=Lax (access_token, refresh_token) + CSRF header
       ▼
Express 5 backend (TypeScript / Node.js)
       │                                     │
       │ PostgreSQL (Supabase, production)    │ ethers.js (Relayer Queue + Sequential Nonces)
       │ SQLite or local Postgres in dev      ▼
       │ and SQLite in-memory in tests   ElectionRegistryV2.sol
       ▼                                 (Ethereum Sepolia)
  Database
```

## Frontend

**Path:** `frontend/src/`

| File / folder              | Purpose                                              |
|----------------------------|------------------------------------------------------|
| `pages/Landing.jsx`        | Public landing with live stats                       |
| `pages/Login.jsx`          | httpOnly cookie auth, demo account selector          |
| `pages/Dashboard.jsx`      | Voter's election list with eligibility badges        |
| `pages/VotingBooth.jsx`    | Candidate selection, direct vote submission to backend |
| `pages/ElectionResults.jsx`| Results chart, blockchain audit tab, verifiable PDF export |
| `pages/AdminPanel.jsx`     | Full admin: users, elections, inbox, stats, audit    |
| `pages/UserProfile.jsx`    | Profile editing, academic data, password change      |
| `pages/Transparency.jsx`   | Public audit — no login required                     |
| `pages/InstitutionPortal.jsx` | Per-domain branded portal                        |
| `pages/Pricing.jsx`        | Pricing / plans page                                 |
| `pages/ChangePassword.jsx` | Standalone password change (post-approval flow)      |
| `context/AuthContext.jsx`  | Session state, csrfToken handling, backend status   |
| `context/ThemeContext.tsx` | Dark/light mode toggle with system preference        |
| `components/Navbar.jsx`    | Responsive nav with role-aware links                 |
| `components/OnboardingTour.jsx` | react-joyride tour, per-user localStorage key  |
| `components/DemoModeButton.jsx` | Demo login modal trigger on landing/login      |
| `i18n/config.ts`           | i18next setup — EN + ES translations                 |

**Key dependencies:**

| Package           | Use                                           |
|-------------------|-----------------------------------------------|
| React 19 + Vite   | UI framework + dev server                     |
| Tailwind CSS      | Utility-first styling                         |
| Framer Motion     | Animated transitions                          |
| react-i18next     | EN/ES translations                            |
| axios             | HTTP client (configured with same-origin `/backend` baseURL) |
| ethers.js         | Blockchain provider for client-side event logs |
| react-hot-toast   | Non-blocking toast notifications              |
| jsPDF             | Client-side PDF export of election results    |
| react-qr-code     | QR code generation for election deep links    |
| recharts          | Charts in ElectionResults and AdminPanel      |

## Backend

**Path:** `backend/src/`

| File                        | Purpose                                              |
|-----------------------------|------------------------------------------------------|
| `index.ts`                  | Express 5 server entry point, port binding           |
| `app.ts`                    | Middleware setup, route mounting, error handler      |
| `db/index.ts`, `db/client.ts` | Picks the engine from `DB_CLIENT`: `PgClient` (PostgreSQL, production) or `SqliteAdapter` (default, local and tests) behind one interface |
| `db/voteRecord.ts`          | `recordConfirmedVote`: the only writer of participation and vote, in one transaction |
| `config/database.ts`        | SQLite schema (mirrors the PostgreSQL migrations)    |
| `routes/auth.ts`            | Login, logout, refresh, password reset, profile CRUD |
| `routes/elections.ts`       | Election listing, eligibility, register-vote, results, audit |
| `routes/admin/`             | Admin API split by area: `elections`, `election-census`, `users`, `org`, `action-log`; `shared.ts` holds the domain-scope helpers |
| `routes/registration.ts`    | Registration request flow                            |
| `routes/organizations.ts`   | Domain branding lookup                               |
| `middleware/`               | `auth` (JWT + `deleted_at` check, admin roles), `rateLimit`, `adminActionLog` |
| `services/voteChain.ts`     | Chain port: relayer queue with sequential nonces and speedup, `getTally`, `findVote`, windowed `queryFilter` |
| `services/candidatesRoot.ts`, `electionSalt.ts`, `retention.ts` | Candidate-list commitment, ephemeral nullifier salt, data-retention jobs |
| `utils/auth.ts`             | JWT generation, cookie setters, bcrypt helpers, nullifier |
| `scripts/seedDatabase.ts`   | Demo seed; refuses to run in production, without `ALLOW_SEED_RESET`, or against a non-local PostgreSQL |
| `__tests__/`                | Vitest test suite (auth, nullifier, roles, chain)    |

**Key dependencies:**

| Package     | Use                                             |
|-------------|--------------------------------------------------|
| Express 5   | HTTP server                                      |
| TypeScript  | Type safety                                      |
| pg          | PostgreSQL client with connection pooling (`Pool`) |
| sqlite3     | SQLite driver: default engine in local development and the only one the tests use |
| bcrypt      | Password hashing                                 |
| jsonwebtoken| JWT sign + verify                                |
| cookie-parser | Parse incoming cookie headers                  |
| ethers.js   | Blockchain relayer (`castVote` contract calls)   |
| multer      | CSV file upload handling                         |
| csv-parse   | CSV parsing for bulk imports                     |
| express-rate-limit | Endpoint rate limiting (IP + email keys) |

## Authentication & Same-Origin Session Architecture

- **Session Tokens:**
  - `access_token`: Short-lived (15 minutes), stored in an `httpOnly`, `SameSite=Lax`, `Secure` (in prod) cookie.
  - `refresh_token`: Long-lived (7 days), stored in an `httpOnly`, `SameSite=Lax`, `Secure` cookie, rotated on reuse and revoked on password reset/change.
  - `csrf_token`: Non-httpOnly cookie readable by JavaScript, validated via Double Submit Cookie pattern on mutating requests (`POST`, `PUT`, `DELETE`).
- **Same-Origin Proxy:**
  - In development, Vite proxies requests from `/backend/*` to Render or local backend.
  - In production, Vercel rewrites `/backend/:path*` to the Render backend service.
  - This guarantees that cookies are treated as first-party, preventing silent cookie drops from browser third-party cookie restrictions.

## Blockchain Architecture

**Contract:** `blockchain/contracts/ElectionRegistryV2.sol` deployed on Ethereum Sepolia.

**`ElectionRegistryV2` features:**
- Stores election metadata (`name`, `startTime`, `endTime`, `candidateCount`, `candidatesRoot`, `censusRoot`, `halted`, `totalVotes`).
- Mapping `hasVoted[electionId][nullifier] → bool` (on-chain double-vote prevention; the nullifier is a `uint256`).
- Mapping `votesFor[electionId][candidateId] → uint256` (on-chain tally per candidate), readable in one call with `getTally(electionId)`.
- Emits `VoteCast(uint256 indexed electionId, uint256 indexed nullifier, uint256 indexed candidateId, uint256 timestamp)`.
- Method: `castVote(uint256 electionId, uint256 nullifier, uint256 candidateId)` restricted to authorized relayers (`onlyRelayer`, backed by `mapping(address => bool) isRelayer`). `candidateId` is the candidate's **position** (0..n-1), not the database id.
- Two keys: the **owner** (cold, outside the server) authorizes or revokes relayers, halts elections and transfers ownership; the **relayer** (hot, on the server) signs every vote. The owner can also authorize itself as a relayer, so its custody matters.

## Relayer Queue & Sequential Nonces

To prevent transaction collisions, nonce gaps, and stuck transactions when multiple votes occur concurrently:
1. All contract write operations pass through a serialized **relayer queue** with sequential nonces.
2. The relayer manages the expected nonce using the blockchain state and the pending local queue.
3. If a transaction remains unconfirmed longer than a configurable timeout, a **speedup** transaction is submitted with higher gas fees (`maxFeePerGas`, `maxPriorityFeePerGas` increased by >= 15%) retaining the same nonce. Automatic cancellations (`0 ETH` replacements) are strictly disabled to prevent discarding legitimate votes.
4. A background reconciliation job monitors pending transactions and confirms them upon block inclusion.

## Vote Flow

```
1. Voter selects candidate in VotingBooth
2. Frontend sends POST /backend/api/elections/register-vote { electionId, candidateId }
3. Backend validates CSRF token and verifies access_token cookie
4. Backend checks eligibility (census, election active, user status approved)
5. Backend acquires atomic vote lock (row-level lock / unique constraint)
6. Backend computes nullifier = HMAC-SHA256(userId:electionId, NULLIFIER_SECRET)
7. If election.chain_status !== 'synced', returns 503 immediately for ALL accounts
8. Relayer queue submits castVote(electionId, nullifier, candidateId) to Sepolia
9. On mining: releases lock as 'confirmed', writes nullifier_audit row, returns txHash
   On timeout: marks as 'pending_confirmation', background reconciler confirms once mined
10. Frontend displays VoteSuccessModal with verified Etherscan link or pending status
```

## Demo Accounts

- If an election is not synchronized (`chain_status !== 'synced'`), the system fails closed with HTTP 503 `ELECTION_NOT_ON_CHAIN` for **all** users, demo accounts included.
- Real accounts always submit real transactions to the Ethereum Sepolia smart contract.
- `@vtb.demo` accounts have a shortcut that exists **only** where demo accounts are enabled (`DEMO_LOGIN_ENABLED=true`, or the test suite): the vote is stored with `vote_source = 'demo'` and a NULL `tx_hash`, never a made-up hash, and it is not verifiable from outside. In production that flag is off, `/auth/demo-login` returns 404, and these accounts vote through the normal path.

## Data Model (PostgreSQL / Supabase)

| Table              | Contents                                          |
|--------------------|---------------------------------------------------|
| `users`            | email, name, student_id, role, admin_domain, is_approved, is_eligible, must_change_password, deleted_at, password_hash |
| `elections`        | id, election_id_blockchain (from the `ElectionCreated` event), chain_status, chain_contract_address, name, start/end_time, is_active, ephemeral_salt |
| `candidates`       | id, election_id, name, description, position      |
| `election_voters`  | election_id, user_id (census)                     |
| `election_access`  | election_id, email_domain (which domains may vote; also the admin's scope) |
| `election_participations` | election_id, user_id (quién ha votado; sin hora, sin id, sin nullifier) |
| `nullifier_audit`  | id (UUID aleatorio), election_id, nullifier_hash, tx_hash, block_number, candidate_id, generated_at (al minuto), vote_source. Sin user_id (migración 016) |
| `vote_attempts`    | user_id, election_id, nullifier_hash, tx_hash, status, error_detail. Se borra al confirmar el voto; caduca a las 24 h (fallidos) y 72 h (colgados) |
| `refresh_tokens`   | id, user_id, token_hash, expires_at, revoked      |
| `registration_requests` | email, full_name, student_id, status, reviewed_at |
| `org_units`        | domain, unit_name                                 |

## Known System Boundaries

- **Pseudonymization:** On-chain nullifiers prevent duplicate voting and pseudonymize voters. However, because the candidate selection is registered in cleartext on-chain and timestamps correlate with block times, the operator or parties with access to server logs can correlate voters with votes. The system is designed for **non-secret institutional consultations**, transparent polls, and participatory budgeting.
- **Relayer Trust:** While anyone can independently tally what the smart contract accepted, verifying the legitimacy of submitted ballots requires trusting the relayer and backend to accurately submit ballots and not invent nullifiers.

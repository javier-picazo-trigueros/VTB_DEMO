# VTB — API Documentation

**Base URL (local):** `http://localhost:3001`
**Base URL (production):** `https://vtb-backend-4emv.onrender.com`

The API is organized into four prefixes:

| Prefix          | Scope                                    |
|-----------------|------------------------------------------|
| `/health`       | Server liveness probe                    |
| `/auth`         | Authentication and user profile          |
| `/api`          | Public + authenticated election data     |
| `/admin`        | Admin-only management endpoints          |
| `/registration` | Registration request flow                |

Protected endpoints require:

```http
Authorization: Bearer <JWT>
```

---

## Health

### GET `/health`

Liveness probe. No auth required.

**Response:**
```json
{
  "status": "OK",
  "service": "VTB Backend",
  "timestamp": "2026-05-08T00:00:00.000Z",
  "uptime": 123
}
```

### GET `/api/health`

Alias — same response.

---

## Authentication

### POST `/auth/login`

Authenticates with email + password. Returns JWT and user data.

**Request:**
```json
{
  "email": "student@vtb.demo",
  "password": "demo123"
}
```

**Response:**
```json
{
  "success": true,
  "token": "<JWT>",
  "user": {
    "id": 1,
    "email": "student@vtb.demo",
    "name": "Demo Student",
    "student_id": "DEMO-STU-001",
    "role": "student",
    "adminDomain": null
  }
}
```

**Error codes:**

| Code | Reason                          |
|------|---------------------------------|
| 400  | Missing email or password       |
| 401  | Wrong credentials               |
| 403  | Account pending approval        |
| 429  | Too many attempts (rate limited)|

### POST `/auth/register`

Creates a user account directly (used by admin-flow registration). Returns JWT on success.

### GET `/auth/me`

Returns the current user from the JWT. Used for session persistence on page reload.

### GET `/auth/verify`

Validates whether the current token is still valid.

**Response:**
```json
{ "valid": true, "user": { ... } }
```

### PATCH `/auth/change-password`

Changes the authenticated user's password.

**Request:**
```json
{
  "currentPassword": "demo123",
  "newPassword": "newsecure456"
}
```

### GET `/auth/me/profile`

Returns the full profile of the authenticated user including academic data.

### PATCH `/auth/me/profile`

Updates editable profile fields.

**Request (partial):**
```json
{
  "name": "New Name",
  "school": "Escuela Politécnica Superior",
  "degree": "Ingeniería Informática",
  "year": 3
}
```

---

## Registration Requests

### POST `/registration/request`

Submits an access request. If the email domain is whitelisted, it may be auto-approved.

**Request:**
```json
{
  "full_name": "New Student",
  "email": "nuevo@ufv.es",
  "student_id": "UFV-2026-001",
  "password": "demo123",
  "school": "Escuela Politécnica Superior",
  "degree": "Ingeniería Informática",
  "year": 2,
  "study_group": "A"
}
```

---

## Public / Organization Data

### GET `/api/stats`

Public. Returns aggregate statistics for the landing page and transparency page.

**Response:**
```json
{
  "totalElections": 12,
  "totalVotes": 347,
  "institutions": 3,
  "onChainVerified": true
}
```

### GET `/api/audit/public`

Public. Returns recent nullifier audit entries (no personal identity exposed).

**Response:**
```json
[
  {
    "nullifier": "0x...",
    "txHash": "0x...",
    "blockNumber": 12345678,
    "timestamp": "2026-05-08 10:00:00",
    "explorerLink": "https://sepolia.etherscan.io/tx/0x...",
    "onChain": true
  }
]
```

### GET `/api/organizations/:domain`

Returns branding data for an institution.

**Examples:**
```
GET /api/organizations/ufv.es
GET /api/organizations/highland.edu
GET /api/organizations/vtb.demo
```

### GET `/api/org-units`

Lists organizational units. Accepts optional `?domain=ufv.es` filter.

### GET `/api/schools-degrees`

Lists school + degree combinations. Accepts optional `?domain=ufv.es` filter.

---

## Elections (Authenticated)

### GET `/api/elections`

Lists elections assigned to the authenticated user (census-filtered).

**Response:**
```json
{
  "elections": [
    {
      "id": 1,
      "blockchainId": 1,
      "name": "Demo Election",
      "description": "Election description",
      "startTime": 1713000000,
      "endTime": 1718000000,
      "isActive": true,
      "status": "active",
      "imageUrl": null,
      "bannerColor": "#1E3A5F",
      "voterRole": "student"
    }
  ]
}
```

### GET `/api/elections/:id`

Returns election detail + candidate list.

### GET `/api/elections/:id/eligibility`

Checks whether the authenticated user can vote in this election.

**Response (eligible):**
```json
{ "eligible": true }
```

**Response (ineligible):**
```json
{ "eligible": false, "reason": "already_voted" }
```

**Reason values:** `not_found`, `not_active`, `not_eligible`, `already_voted`

### POST `/api/elections/register-vote`

Registers a vote. The backend generates the nullifier.

**Request:**
```json
{
  "electionId": 1,
  "candidateId": 2,
  "voteHash": "0xabc123..."
}
```

**Response (real blockchain):**
```json
{
  "success": true,
  "txHash": "0xdeadbeef...",
  "blockNumber": 12345678,
  "isDemo": false
}
```

**Response (vtb.demo account — synthetic hash):**
```json
{
  "success": true,
  "txHash": "0xSYNTHETIC_SHA256_HASH...",
  "blockNumber": null,
  "isDemo": true,
  "message": "Demo vote registered (synthetic — not on real blockchain)"
}
```

**Error codes:**

| Code | Reason                               |
|------|--------------------------------------|
| 409  | User already voted in this election  |
| 403  | User not eligible / not in census    |
| 500  | Blockchain connection error          |

### GET `/api/elections/:id/results`

Returns vote counts and participation. Public for active/closed elections.

**Response:**
```json
{
  "election": {
    "id": 1,
    "name": "Demo Election",
    "status": "active",
    "startDate": "2026-05-08T10:00:00.000Z",
    "endDate": "2026-05-09T10:00:00.000Z",
    "totalVoters": 20
  },
  "candidates": [
    { "id": 1, "name": "Candidate A", "votes": 4, "percentage": 66.7 },
    { "id": 2, "name": "Candidate B", "votes": 2, "percentage": 33.3 }
  ],
  "totalVotes": 6,
  "participationRate": 30,
  "onChainVerified": true
}
```

### GET `/api/elections/:id/audit`

Public. Returns nullifier audit records for an election without personal data.

**Response:**
```json
[
  {
    "nullifier": "0x...",
    "txHash": "0x...",
    "blockNumber": 12345678,
    "timestamp": "2026-05-08 10:00:00",
    "explorerLink": "https://sepolia.etherscan.io/tx/0x...",
    "onChain": true
  }
]
```

### GET `/api/elections/blockchain-sync-status`

Checks whether local election IDs match the on-chain contract state.

### PATCH `/api/elections/fix-blockchain-ids`

Developer utility — corrects local blockchain IDs. Admin-only in production.

---

## Admin Endpoints

All require role `admin` or `superadmin`. Domain-scoped admins only see their own domain's data.

### Dashboard

| Method | Endpoint               | Description                        |
|--------|------------------------|------------------------------------|
| GET    | `/admin/dashboard`     | KPI cards, charts, recent votes    |
| GET    | `/admin/blockchain-status` | RPC + contract connectivity    |

### Users

| Method | Endpoint                    | Description                              |
|--------|-----------------------------|------------------------------------------|
| GET    | `/admin/users`              | List all users (domain-filtered)         |
| POST   | `/admin/users`              | Create an approved user                  |
| PATCH  | `/admin/users/:id/approval` | Approve or update user status            |
| DELETE | `/admin/users/:id`          | Delete a user                            |
| POST   | `/admin/users/import`       | Bulk import users from CSV               |

**CSV import format for `/admin/users/import`:**
```csv
email,full_name,student_id,send_email,role
student@ufv.es,New Student,UFV-001,true,student
```

### Registration Requests (Inbox)

| Method | Endpoint                              | Description             |
|--------|---------------------------------------|-------------------------|
| GET    | `/admin/registration-requests`        | List requests (`?status=pending\|all`) |
| PATCH  | `/admin/registration-requests/:id`    | Approve or reject       |

**Approve request:**
```json
{ "action": "approve" }
```

**Reject request:**
```json
{ "action": "reject", "reason": "Not enrolled in this institution" }
```

### Elections

| Method | Endpoint                              | Description                           |
|--------|---------------------------------------|---------------------------------------|
| GET    | `/admin/elections`                    | List manageable elections             |
| POST   | `/admin/elections`                    | Create election                       |
| PUT    | `/admin/elections/:id`                | Toggle active status / full edit      |
| PATCH  | `/admin/elections/:id`                | Partial edit (name, description, end_time) |
| POST   | `/admin/elections/:id/image`          | Upload election banner image          |
| POST   | `/admin/elections/:id/voters`         | Add voter to election census          |
| POST   | `/admin/elections/:id/domains`        | Add domain to election census         |
| POST   | `/admin/elections/:id/candidates`     | Add candidate                         |
| POST   | `/admin/elections/:id/import-voters`  | Bulk import voters from CSV           |
| GET    | `/admin/elections/:id/stats`          | Participation stats + drill-down      |

**CSV import format for `/admin/elections/:id/import-voters`:**
```csv
email,full_name,student_id,send_email
student@ufv.es,Student Name,UFV-001,true
```

### Audit & Stats

| Method | Endpoint               | Description                         |
|--------|------------------------|-------------------------------------|
| GET    | `/admin/audit`         | Full nullifier audit log (filtered) |
| GET    | `/admin/stats/voters`  | Per-election participation stats    |

### Org Units & Domains

| Method | Endpoint               | Description                         |
|--------|------------------------|-------------------------------------|
| GET    | `/admin/org-units`     | List organizational units           |
| POST   | `/admin/org-units`     | Create organizational unit          |
| GET    | `/admin/domains`       | List available domains              |
| GET    | `/admin/domain-admins` | List domain administrators          |
| POST   | `/admin/domain-admins` | Assign domain admin role            |

---

## HTTP Status Codes

| Code | Meaning                                   |
|------|-------------------------------------------|
| 200  | OK                                        |
| 201  | Created                                   |
| 400  | Bad request (missing or invalid fields)   |
| 401  | Missing or invalid JWT                    |
| 403  | Insufficient permissions                  |
| 404  | Not found                                 |
| 409  | Conflict (e.g. duplicate vote)            |
| 429  | Rate limited                              |
| 500  | Internal server error                     |

---

## cURL Examples

**Login:**
```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"student@vtb.demo","password":"demo123"}'
```

**Health check:**
```bash
curl http://localhost:3001/health
```

**Public stats:**
```bash
curl http://localhost:3001/api/stats
```

**My elections (authenticated):**
```bash
curl http://localhost:3001/api/elections \
  -H "Authorization: Bearer <JWT>"
```

**Vote:**
```bash
curl -X POST http://localhost:3001/api/elections/register-vote \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"electionId":1,"candidateId":2,"voteHash":"0xabc123"}'
```

---

## Required Environment Variables

**Backend `.env` minimum:**
```env
PORT=3001
JWT_SECRET=<64-char random hex>
NULLIFIER_SECRET=<64-char random hex>
DATABASE_PATH=./vtb.db
RPC_URL=http://localhost:8545
CONTRACT_ADDRESS=0x0000000000000000000000000000000000000000
PRIVATE_KEY=0x0000000000000000000000000000000000000000000000000000000000000000
```

**Frontend `.env` minimum:**
```env
VITE_API_URL=http://localhost:3001
VITE_EXPLORER_URL=https://sepolia.etherscan.io
```

# VTB - Vote Through Blockchain
## Architecture Overview

VTB is a hybrid Web2+Web3 anonymous voting platform.

### Stack
- Frontend: React 18 + Vite + Tailwind CSS + Framer Motion
- Backend: Express + TypeScript + SQLite3
- Blockchain: Solidity on Ethereum Sepolia (ElectionRegistry.sol)
- Auth: JWT + bcrypt + HMAC-SHA256 nullifiers
- Deploy: Vercel (frontend) + Render (backend)

### Vote Flow
1. User authenticates -> receives JWT
2. User selects candidate -> frontend computes voteHash = keccak256(candidateId + salt)
3. Backend verifies JWT, generates nullifier = HMAC-SHA256(userId:electionId)
4. Backend relayer calls castVote(electionId, nullifier, voteHash) on-chain
5. Smart contract stores nullifier -> prevents double voting
6. TxHash returned to user for independent verification on Etherscan

### Privacy Model
- Blockchain stores: nullifier (anonymous), voteHash (encrypted commitment)
- Database stores: userId -> nullifier mapping (for audit trail)
- Neither reveals: who voted for what
- Results computed from SQLite candidate_id column (not decoded from voteHash)

### Known Limitations
- SQLite resets on Render free tier deploys (persistent disk needed for prod)
- Results not verified per-candidate on-chain (SQLite is source of truth)
- JWT stored in localStorage (XSS risk; httpOnly cookies planned)
- WebSocket live feed not yet implemented (polling-based fallback used)

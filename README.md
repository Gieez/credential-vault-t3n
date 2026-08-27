# Confidential Credential Vault Agent

> **Terminal 3 Enterprise Agent Challenge — Bounty Submission**
> 
> An enterprise AI agent that manages API keys inside T3N's Trusted Execution Environment (TEE). Users store credentials in hardware-encrypted storage; the agent uses them to call external services without ever exposing the raw keys.

## Table of Contents

- [Problem & Solution](#problem--solution)
- [Architecture](#architecture)
- [Security Model](#security-model)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Contract Functions](#contract-functions)
- [API Endpoints](#api-endpoints)
- [Test Results](#test-results)
- [Known Limitations](#known-limitations)
- [Screenshots](#screenshots)
- [Maintenance & Handover](#maintenance--handover)
- [License](#license)

---

## Problem & Solution

Enterprise teams store API keys in `.env` files, password managers, or shared documents. When AI agents need to use these keys to call external services, the keys must be exposed to the agent runtime — creating a massive attack surface.

**Our solution:** The API key lives inside a TEE. The contract reads it, uses it to authenticate an HTTP call, and returns only the result. The key never exists outside the confidential computing enclave.

| Enterprise Problem | Our Solution |
|-------------------|-------------|
| API keys scattered in insecure storage | Keys stored in TEE-encrypted KV maps |
| Agents need raw keys to call APIs | Agent reads key inside TEE, uses for HTTP auth, never returns it |
| No audit trail for credential usage | Activity log with SHA-256 hashed recipient emails |
| Blanket trust for credential access | Per-function, per-host, per-credential delegation |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Browser (SPA)                                          │
│  Dashboard · Add Key · Send Email · Activity Log        │
├─────────────────────────────────────────────────────────┤
│  Express Server (TypeScript)                            │
│  API routes → T3N SDK → TEE contract                   │
├─────────────────────────────────────────────────────────┤
│  T3N TEE (Trusted Execution Environment)               │
│  ┌───────────────────────────────────────────────┐      │
│  │  credential-vault WASM contract (Rust)        │      │
│  │  • store-credential  → write key to KV        │      │
│  │  • list-credentials  → names only, never keys │      │
│  │  • send-email        → read key, call SendGrid│      │
│  │  • get-activity-log  → hashed audit trail     │      │
│  └───────────────────────────────────────────────┘      │
│  KV Maps (encrypted at rest):                           │
│  • z:<tid>:credentials   (API keys, contract-only ACL)  │
│  • z:<tid>:activity-log  (hashed audit trail)           │
└─────────────────────────────────────────────────────────┘
```

### What Runs Inside vs Outside TEE

| Outside TEE (TypeScript/HTML) | Inside TEE (Rust WASM) |
|------------------------------|----------------------|
| Dashboard UI | Credential storage (KV) |
| User authentication | Email sending (HTTP to SendGrid) |
| Activity log display | Access control enforcement |
| Session management | Activity logging (hashed) |

**Data visible outside:** Credential names, send status, activity logs
**Never visible outside:** API keys, auth tokens, raw secrets

---

## Security Model

| Threat | Mitigation |
|--------|-----------|
| API key exposure to agent runtime | Key stored in TEE-encrypted KV; contract reads inside enclave, uses for HTTP auth, never returns it |
| Agent uses key beyond scope | User delegation grant: which functions, which hosts, which credentials |
| Frontend extracts API key | Frontend never receives the key; list-credentials returns names only |
| Log leakage | Recipient emails stored as SHA-256 hashes, never plaintext |
| KV unauthorized access | Map ACL restricts read/write to the contract only |
| Replay attacks | Each call is a fresh T3N transaction; user can revoke anytime |

---

## Quick Start

### Prerequisites

- Node.js 18+
- Rust toolchain with `wasm32-wasip2` target
- Terminal 3 API key ([claim here](https://docs.terminal3.io/developers/adk/get-started/prerequisites/request-test-tokens))

### Setup

```bash
# 1. Clone and enter the project
git clone <repo-url>
cd terminal3-bounty

# 2. Set your T3N API key
echo "T3N_API_KEY=your_key_here" > .env

# 3. Install dependencies
npm install

# 4. Build the TEE contract
cd credential-vault
cargo +stable-x86_64-pc-windows-gnu build --target wasm32-wasip2 --release
cd ..

# 5. Register the contract on T3N
npx tsx integration-test.ts

# 6. Start the server
npx tsx server.ts

# 7. Open http://localhost:3000
```

### Running Tests

```bash
# Unit tests (Rust contract) — 15 tests
cd credential-vault && cargo test

# Integration tests (T3N registration + KV setup)
npx tsx integration-test.ts

# End-to-end tests (all API flows) — 19 tests
npx tsx e2e-test.ts
```

---

## Project Structure

```
terminal3-bounty/
├── README.md                     # This file
├── .gitignore                    # Excludes secrets, build artifacts
├── .env                          # T3N_API_KEY (NOT committed)
│
├── server.ts                     # Express server + API routes
├── public/
│   └── index.html                # SPA frontend
│
├── quickstart.ts                 # T3N auth + TenantClient setup
├── integration-test.ts           # Contract registration + KV setup
├── e2e-test.ts                   # End-to-end test suite
│
├── credential-vault/             # TEE Contract (Rust → WASM)
│   ├── Cargo.toml
│   ├── wit/world.wit             # 4 exported functions
│   └── src/
│       ├── lib.rs                # Dispatch
│       ├── store.rs              # store-credential
│       ├── list.rs               # list-credentials
│       ├── send.rs               # send-email (SendGrid)
│       └── log.rs                # get-activity-log
│
├── architecture.md               # Technical architecture
└── agent-proposals.md            # Agent ideas + scoring
```

---

## Contract Functions

### store-credential
Save an API key into TEE-encrypted KV map.
```json
Input:  { "name": "sendgrid-prod", "api_key": "SG.xxx", "service": "sendgrid", "host": "api.sendgrid.com" }
Output: { "ok": true }
```

### list-credentials
List stored credential names. **NEVER returns raw API keys.**
```json
Input:  {}
Output: { "credentials": [{ "name": "sendgrid-prod", "service": "sendgrid" }] }
```

### send-email
Send email via SendGrid using a stored credential. Key stays inside TEE.
```json
Input:  { "credential_name": "sendgrid-prod", "to": "user@example.com", "subject": "Hello", "body": "World" }
Output: { "sent": true, "message_id": "vault-...", "timestamp": "..." }
```

### get-activity-log
Retrieve hashed audit trail.
```json
Input:  { "limit": 10 }
Output: { "entries": [{ "action": "send-email", "credential": "sendgrid-prod", "recipient_hash": "a1b2c3...", "status": "sent" }] }
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/credentials` | List stored credentials (names only) |
| POST | `/api/credentials` | Store a new credential |
| POST | `/api/send` | Send email via SendGrid |
| GET | `/api/log?limit=N` | Get activity log entries |

---

## Test Results

### Unit Tests — Rust Contract: 15/15 PASSED ✓
```
store_credential: input validation, service restriction, wasm-only guard
list_credentials: wasm-only guard
send_email: input validation, email format, wasm-only guard
get_activity_log: input parsing, wasm-only guard
contract_version: semver check
```

### Integration Tests — T3N Registration: ALL PASSED ✓
```
Contract registered: z:...:credential-vault (id: 761)
KV maps created: credentials + activity-log (contract-only ACL)
Self-grant authorized: all 4 functions
```

### End-to-End Tests — Express + Contract: 19/19 PASSED ✓
```
Frontend:  serves correct HTML, no Next.js artifacts
API:       list credentials (no api_key leak), store, send, log
Security:  no raw keys in any response, no secrets in HTML
Errors:    rejects empty fields, invalid email, unsupported services
```

---

## Known Limitations

1. **T3N testnet quota** — Testnet has per-minute fuel limits. Rapid testing may hit `quota exceeded`. Production will have higher limits.

2. **SendGrid-only MVP** — Architecture supports adding more services. To add Stripe/AWS: edit `store.rs` (validation) + `send.rs` (HTTP call), rebuild, re-register.

3. **Static timestamps** — Activity log uses placeholder timestamps. Production would use `host:interfaces/clock`.

4. **Single-tenant** — Current implementation serves one tenant. Multi-tenant requires separate T3N sessions.

5. **No HTTPS in dev** — Express runs on HTTP locally. Production deployment should use HTTPS.

---

## Screenshots

For bounty submission, capture:

| # | Screenshot | What to Show |
|---|-----------|-------------|
| 1 | Dashboard | Credential list, stats cards, "T3N TEE" badge |
| 2 | Add Credential | Form with name + API key input, "Save to TEE" button |
| 3 | Add Credential (success) | "Credential saved to TEE" confirmation |
| 4 | Send Email | Credential selector, email form, "Send via TEE" button |
| 5 | Send Email (success) | "Email Sent" confirmation with message ID |
| 6 | Activity Log | Audit trail with hashed recipient emails |
| 7 | Terminal: contract registration | `registered z:...:credential-vault as contract id 761` |
| 8 | Terminal: E2E tests | `RESULTS: 19 passed, 0 failed` |

---

## Maintenance & Handover

### Adding a New Service (e.g., Stripe)
1. Edit `credential-vault/src/store.rs`: add `"stripe"` to service validation
2. Edit `credential-vault/src/send.rs`: add Stripe API call logic
3. Rebuild: `cargo +stable-x86_64-pc-windows-gnu build --target wasm32-wasip2 --release`
4. Bump `CONTRACT_VERSION` in `lib.rs`
5. Update version in `integration-test.ts`, re-run registration

### Updating the Frontend
- Edit `public/index.html` (single-file SPA, no build step)
- API routes in `server.ts`
- Tailwind CSS via CDN (no local build)

### Contract Updates
1. Edit Rust code in `credential-vault/src/`
2. Bump `CONTRACT_VERSION` in `lib.rs`
3. Rebuild WASM
4. Update `integration-test.ts` with new version
5. Re-run `npx tsx integration-test.ts`

### Environment Variables
```
T3N_API_KEY=0x...        # Required: Terminal 3 API key
PORT=3000                # Optional: server port (default 3000)
```

---

## License

MIT

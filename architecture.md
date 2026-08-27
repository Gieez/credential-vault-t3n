========================================================================
  CONFIDENTIAL CREDENTIAL VAULT AGENT
  MVP Architecture & Implementation Plan
  Terminal 3 Enterprise Agent Challenge
========================================================================


1. PROBLEM STATEMENT
========================================================================

Enterprise teams store API keys (Stripe, Resend, AWS, etc.) in .env
files, password managers, or shared docs. When AI agents need to USE
these keys to call external services, the keys must be exposed to the
agent runtime — creating a massive attack surface.

Current options:
  a) .env files → keys visible to anyone with server access
  b) Vault (HashiCorp) → requires ops infrastructure
  c) Agent reads key directly → key in plaintext in agent memory/logs

T3N solves this: the key lives inside a TEE. The contract reads it,
uses it to call the API, and returns only the result. The key never
exists outside the confidential computing enclave.


2. WHAT RUNS INSIDE vs OUTSIDE TEE
========================================================================

┌─────────────────────────────────────────────────────────────────────┐
│  OUTSIDE TEE (TypeScript / Next.js)                                │
│                                                                     │
│  • Frontend dashboard (React/Next.js)                               │
│  • User authentication (wallet-based)                               │
│  • Agent registration + identity management                         │
│  • Delegation UI (user grants agent access)                         │
│  • Activity log display (results only, no secrets)                  │
│  • Session management                                               │
│                                                                     │
│  Data visible here:                                                 │
│  ✓ Credential names ("resend-prod")                               │
│  ✓ Send status (sent/failed)                                        │
│  ✓ Activity logs (who sent what, when)                              │
│  ✗ NEVER: API keys, raw secrets, auth tokens                        │
├─────────────────────────────────────────────────────────────────────┤
│  INSIDE TEE (Rust WASM Contract)                                   │
│                                                                     │
│  • Credential storage (KV map: z:<tid>:credentials)                 │
│  • Credential usage (read key from KV → call Resend)              │
│  • Access control enforcement (only delegated agents)               │
│  • Activity logging (to KV, not exposed)                            │
│                                                                     │
│  Data visible here:                                                 │
│  ✓ API keys (read from KV, used for HTTP auth)                     │
│  ✓ Resend request/response bodies                                 │
│  ✓ User profile data (via placeholders)                             │
│  ✗ NEVER leaves TEE: API keys, auth tokens                          │
└─────────────────────────────────────────────────────────────────────┘


3. CONTRACT FUNCTIONS
========================================================================

Contract name: credential-vault
WIT imports: host:interfaces/http, host:interfaces/kv-store,
             host:interfaces/logging, host:tenant/tenant-context


FUNCTION 1: store-credential
  Purpose: Save an API key into the TEE-encrypted KV map
  Input:
    {
      name:       "resend-prod",     // human-readable label
      api_key:    "your-api-key...",         // the raw API key
      service:    "resend",          // service identifier (for MVP: always "resend")
      host:       "api.resend.com"   // allowed egress host
    }
  Output:
    { ok: true }
  Side effects:
    - Writes to z:<tid>:credentials map (contract's own map, ACL-restricted)
    - Key is encrypted at rest inside TEE
  Security:
    - Only the contract itself can read/write this map
    - Frontend never sees the api_key value
    - Contract stores name + service + host, key is the value


FUNCTION 2: list-credentials
  Purpose: List stored credential names (NEVER the keys themselves)
  Input: (none)
  Output:
    {
      credentials: [
        { name: "resend-prod", service: "resend", created_at: "..." }
      ]
    }
  Side effects: none
  Security:
    - Returns ONLY metadata (name, service, timestamp)
    - API key value is never included in output
    - Frontend displays this list to the user


FUNCTION 3: send-email
  Purpose: Send an email via Resend using the stored credential
  Input:
    {
      credential_name:  "resend-prod",   // which credential to use
      to:               "{{profile.email}}", // recipient (PII placeholder)
      subject:          "Hello from T3N",
      body:             "This email was sent by your Confidential Credential Vault Agent."
    }
  Output:
    { sent: true, message_id: "xxx", timestamp: "..." }
  Side effects:
    - Reads API key from z:<tid>:credentials KV map (inside TEE)
    - Calls api.resend.com/v3/mail/send (inside TEE, using http interface)
    - Returns only success/failure + message ID
  Security:
    - API key read from KV inside TEE, used for Authorization header
    - Key is NEVER included in the response
    - If using http-with-placeholders: recipient email resolved host-side
    - If using http: recipient email passed in body (still inside TEE)
    - Egress limited to api.resend.com (user's delegation grant)


FUNCTION 4: get-activity-log
  Purpose: Retrieve recent activity (who did what, when)
  Input: { limit: 10 }
  Output:
    {
      entries: [
        { action: "send-email", credential: "resend-prod",
          recipient_hash: "a1b2c3...", // hashed, not plaintext
          status: "sent", timestamp: "..." }
      ]
    }
  Side effects: none
  Security:
    - Recipient email is HASHED before storage (never stored plaintext)
    - Only action type, credential name, status, and timestamp stored
    - Agent cannot reconstruct the original email from the hash


4. KV MAPS
========================================================================

Map 1: z:<tid>:credentials
  visibility: private
  writers:   { only: [contract_id] }
  readers:   { only: [contract_id] }
  contents:
    key: "resend-prod"
    value: { api_key: "your-api-key...", service: "resend", host: "api.resend.com" }

Map 2: z:<tid>:activity-log
  visibility: private
  writers:   { only: [contract_id] }
  readers:   { only: [contract_id] }
  contents:
    key: "log:<timestamp>"
    value: { action, credential, recipient_hash, status }


5. AUTHORIZATION FLOW
========================================================================

Step 1: User stores credential
  User → frontend → tenant.contracts.execute("store-credential", ...)
  (User is the data owner — direct call, no agent involved)

Step 2: User grants agent access
  User → frontend → tee:user/contracts "agent-auth-update"
  {
    agentDid: "did:t3n:<agent>",
    scripts: [{
      scriptName: "z:<tid>:credential-vault",
      versionReq: "0.1.0",
      functions: ["send-email", "list-credentials"],
      allowedHosts: ["api.resend.com"]
    }]
  }

Step 3: Agent sends email
  Agent → credential-vault "send-email"
  Contract reads key from KV → calls Resend → returns result
  Agent never sees the key.

Step 4: User can revoke access
  User → tee:user/contracts "agent-auth-update" (remove agent from list)


6. FRONTEND FLOW (Next.js)
========================================================================

Page 1: Dashboard
  ┌──────────────────────────────────────────────┐
  │  Credential Vault                            │
  │                                               │
  │  Stored Credentials:                          │
  │  ┌─────────────────┬──────────┬──────────┐   │
  │  │ Name            │ Service  │ Status   │   │
  │  ├─────────────────┼──────────┼──────────┤   │
  │  │ resend-prod   │ Resend │ Active   │   │
  │  └─────────────────┴──────────┴──────────┘   │
  │                                               │
  │  [Add Credential]  [Send Email]               │
  └──────────────────────────────────────────────┘

Page 2: Add Credential (modal)
  ┌──────────────────────────────────────────────┐
  │  Add Resend Credential                      │
  │                                               │
  │  Name:    [resend-prod          ]           │
  │  API Key: [••••••••••••••••••••  ] (masked)  │
  │                                               │
  │  [Save to TEE]                                │
  │  Key will be encrypted inside TEE hardware.   │
  │  You will never see it again after saving.    │
  └──────────────────────────────────────────────┘

Page 3: Send Email (modal)
  ┌──────────────────────────────────────────────┐
  │  Send Email via Resend                      │
  │                                               │
  │  Credential: [resend-prod ▾]                │
  │  To:         [user@example.com]               │
  │  Subject:    [Hello from T3N      ]           │
  │  Body:       [____________________]           │
  │                                               │
  │  [Send]                                       │
  │  The API key is used inside TEE — never       │
  │  exposed to the browser or server.            │
  └──────────────────────────────────────────────┘

Page 4: Activity Log
  ┌──────────────────────────────────────────────┐
  │  Activity Log                                 │
  │                                               │
  │  [2026-08-28 10:30] send-email via resend   │
  │    → Sent (message_id: xxx)                   │
  │  [2026-08-28 10:15] store-credential          │
  │    → Saved "resend-prod"                    │
  └──────────────────────────────────────────────┘


7. SECURITY MODEL
========================================================================

THREAT 1: API key exposure to agent runtime
  PREVENTION: Key stored in TEE-encrypted KV. Contract reads it
  inside the enclave, uses it for HTTP auth, returns only the result.
  The key bytes never exist outside the TEE.

THREAT 2: Agent uses key beyond authorized scope
  PREVENTION: User's delegation grant specifies:
    - Which functions the agent can call ("send-email" only)
    - Which hosts it can reach ("api.resend.com" only)
    - Which credential it can use (by name)
  Any deviation → contract denies the operation.

THREAT 3: Frontend extracts API key
  PREVENTION: Frontend never receives the key. store-credential
  takes the key as input (over encrypted channel), contract stores
  it in KV. list-credentials returns only names. send-email returns
  only success/failure. No API surface exposes the raw key.

THREAT 4: Log leakage
  PREVENTION: Activity log stores recipient email as a HASH, not
  plaintext. Agent/developer cannot reconstruct the original email.
  Only action type, credential name, status, and timestamp stored.

THREAT 5: KV map unauthorized access
  PREVENTION: Map ACL restricts read/write to the contract only
  (contract_id). No other contract, agent, or user can directly
  read the credentials map. The owner can always write via
  control plane (for setup), but contract reads are gated.

THREAT 6: Replay attack (re-use stored credentials)
  PREVENTION: Each send-email call is a fresh T3N transaction with
  its own attestation. The agent must have an active delegation grant.
  User can revoke at any time. Contract can add rate limiting via
  KV-stamped counters.


8. MINIMAL VIABLE DELIVERABLES
========================================================================

Files to create/modify:
  ├── credential-vault/           (new directory)
  │   ├── src/
  │   │   ├── lib.rs              ← Contract entry + dispatch
  │   │   ├── store.rs            ← store-credential function
  │   │   ├── list.rs             ← list-credentials function
  │   │   ├── send.rs             ← send-email function (calls Resend)
  │   │   └── log.rs              ← get-activity-log function
  │   ├── wit/
  │   │   ├── world.wit           ← Contract interface + host imports
  │   │   └── deps/               ← Vendored host interfaces
  │   └── Cargo.toml
  │
  ├── terminal3-bounty/           (existing, frontend)
  │   ├── quickstart.ts           ← Auth + TenantClient (existing)
  │   ├── vault-server.ts         ← NEW: API routes for frontend
  │   ├── public/
  │   │   └── index.html          ← NEW: Dashboard UI
  │   └── .env
  │
  └── README.md                   ← Bounty submission doc

Rust contract scope: ~200-300 lines total (4 functions)
Frontend scope: ~300-400 lines (dashboard + 3 modals)


9. BUILD ORDER (5 DAYS)
========================================================================

DAY 1: Contract skeleton
  [ ] Design world.wit (4 exported functions)
  [ ] Set up Cargo.toml with dependencies
  [ ] Implement lib.rs dispatch
  [ ] Implement store.rs (write to KV)
  [ ] Implement list.rs (read KV keys, return metadata only)
  [ ] Build + test locally

DAY 2: Contract completion
  [ ] Implement send.rs (read key from KV, call Resend via http)
  [ ] Implement log.rs (write/read activity log with hashed emails)
  [ ] Build final WASM artifact
  [ ] Test with mock data (no real Resend key yet)

DAY 3: TypeScript integration
  [ ] Register contract on T3N
  [ ] Create KV maps (credentials + activity-log)
  [ ] Build vault-server.ts (API layer between frontend and TEE)
  [ ] Test contract calls from TypeScript

DAY 4: Frontend
  [ ] Build dashboard HTML/JS (credential list, add, send, log)
  [ ] Implement agent registration flow
  [ ] Implement delegation UI
  [ ] End-to-end test with dummy key

DAY 5: Demo + polish
  [ ] Get free Resend API key (test mode)
  [ ] Seed key into vault
  [ ] Send real email via agent
  [ ] Record demo
  [ ] Write bounty submission README


10. RESEND INTEGRATION DETAILS
========================================================================

MVP uses Resend v3 API:
  POST https://api.resend.com/v3/mail/send
  Headers:
    Authorization: Bearer <stored_api_key>
    Content-Type: application/json
  Body:
    {
      "personalizations": [{ "to": [{"email": "recipient@example.com"}] }],
      "from": { "email": "sender@example.com" },
      "subject": "Hello from T3N",
      "content": [{ "type": "text/plain", "value": "..." }]
    }

Contract sends this request inside TEE using host:interfaces/http.
The api_key is read from z:<tid>:credentials KV map at runtime.
The response (status 202 + message-id header) is returned to caller.

Test mode: Resend free tier allows 100 emails/day.
Get key at: https://signup.resend.com/ (free account)


========================================================================
END OF ARCHITECTURE DOCUMENT
========================================================================

# VaultGate

Hardware-Sealed Confidential AI Agent API Proxy and Remote MCP Server on Terminal 3 Intel TDX Enclaves.

Built for the **Terminal 3 Build+Scale Agent Micro Grant** on DoraHacks.

- **Live Production Web App:** https://vaultgate-one.vercel.app
- **Remote MCP Endpoint:** https://vaultgate-one.vercel.app/api/mcp
- **Live Traction Telemetry:** https://vaultgate-one.vercel.app/traction
- **Technical Documentation:** https://vaultgate-one.vercel.app/docs
- **Contract Testnet ID:** `z:1ac7888746320bff5fb4e9b65cf211632fcf15f4:credential-vault` (v0.4.2, On-Chain ID: `1125`)
- **Deployer Tenant DID:** `did:t3n:1ac7888746320bff5fb4e9b65cf211632fcf15f4`
- **TEE Target:** `wasm32-wasip2` (Intel TDX Confidential Computing, T3N Testnet)

---

## Executive Summary

AI coding agents (Claude Code, Cursor, OpenClaw, Hermes) and autonomous background workers require API keys to invoke LLM providers, send alerts, query databases, or trigger webhooks. Storing raw API keys in local `.env` files, shell profiles, or process memory exposes them to disk dumps, prompt injection leaks, accidental git commits, and supply chain attacks.

**VaultGate solves this by moving credentials into hardware-isolated Intel TDX enclaves on the Terminal 3 Network (T3N):**

1. Developers store third-party credentials (OpenAI, Gemini, Anthropic, Resend, Telegram, GitHub, Custom Webhooks) directly into T3N enclave KV maps.
2. Secrets are scoped strictly to the caller's unique `did:t3n:...` identity via `host:tenant/tenant-context@2.0.0`.
3. AI agents never receive raw keys. They reference a credential alias (such as `openai-prod` or `gemini-flash`).
4. Outbound HTTPS requests are constructed inside enclave RAM. The enclave injects the required authorization header, validates the destination host against member delegation allowlists, dispatches the request, and redacts sensitive tokens from response logs.
5. All operations are accessible through a Streamable-HTTP Remote MCP Server (`/api/mcp`), enabling standard AI assistants to execute authenticated tools without holding local secrets.

---

## Architecture

```
[ AI Agent / IDE ]           [ User Web Browser ]
(Claude, Cursor, Hermes)     (Swiss Hardware Deck)
         |                           |
         +-------------+-------------+
                       |
               HTTPS (JSON-RPC 2.0 / REST)
                       |
                       v
         [ Next.js 16 Multi-Route App ]
          • /api/mcp      Remote MCP Handler
          • /api/vault    Credential Management
          • /api/wire     Enclave Wire Tester
          • /api/agents   Delegation Management
          • /api/audit    Signed Activity Log
          • /traction     Public Metric Counter
                       |
               @terminal3/t3n-sdk v5.39
               @terminal3/t3n-client v0.4
                       |
               RPC / Action Execute
                       |
                       v
     =========================================
     ||        T3N Intel TDX Enclave        ||
     ||-------------------------------------||
     || credential-vault.wasm (v0.4.2)      ||
     ||                                     ||
     || 1. Resolve caller via tenant-context||
     || 2. Verify Member Delegation Grant   ||
     || 3. Read raw key from isolated KV RAM||
     || 4. Format Bearer / Header auth      ||
     || 5. Dispatch outbound HTTPS request  ||
     || 6. Redact secrets from error logs   ||
     || 7. Write cluster audit log entry    ||
     =========================================
             |                       |
             v                       v
     [ Encrypted KV Maps ]    [ External APIs ]
     • u:<owner_hex>:<alias>   • api.openai.com
     • activity-log ledger     • api.anthropic.com
                               • api.resend.com
                               • generativelanguage.googleapis.com
                               • api.telegram.org
                               • api.github.com
```

### Trust Boundary and Security Model

| Component | Execution Context | Trust Level & Data Isolation |
| :--- | :--- | :--- |
| **Next.js Frontend & MCP Route** | Public Cloud (Vercel) | Stateless proxy. Handles session tokens and JSON-RPC dispatch. Never inspects or stores plaintext API keys. |
| **Client Secrets (OpenAI, Gemini, etc.)** | T3N Intel TDX Enclave | Stored in hardware-encrypted KV storage with contract-exclusive ACL. Plaintext exists only in enclave RAM during outbound call execution. |
| **Identity & Access Control** | T3N Testnet Node | Managed via cryptographic DIDs (`did:t3n:...`). Keys are namespaced by owner hex (`u:<owner_hex>:<name>`). |
| **Agent Delegation** | T3N Chain ACL | Scoped with `updateMemberDelegation` and `BoundGrant`. Restricts agent DIDs to explicit contract functions and allowed outbound hostnames. |
| **Egress Filter** | Rust WASM Enclave | Enforces strict host validation. Rejects loopback, private RFC-1918, link-local, and cloud metadata IP ranges (`169.254.169.254`). |

---

## Remote MCP Server Guide (`/api/mcp`)

VaultGate provides a Remote Model Context Protocol (MCP) server endpoint compliant with JSON-RPC 2.0 Streamable HTTP transport.

### 1. Adding VaultGate to Claude Code / Claude Desktop

Add the following to your `claude_desktop_config.json` or `.mcp.json`:

```json
{
  "mcpServers": {
    "vaultgate": {
      "url": "https://vaultgate-one.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_T3N_PRIVATE_KEY>"
      }
    }
  }
}
```

### 2. Adding VaultGate to Cursor

In Cursor **Settings > Features > MCP**, click **Add New MCP Server**:
- **Name:** `vaultgate`
- **Type:** `sse` or `streamable-http`
- **Server URL:** `https://vaultgate-one.vercel.app/api/mcp`
- **Headers:** `{"Authorization": "Bearer <YOUR_T3N_PRIVATE_KEY>"}`

### 3. Exposed MCP Tools

The endpoint exposes four tools to the connected agent:

| Tool Name | Parameters | Description |
| :--- | :--- | :--- |
| `vault_whoami` | `{}` | Returns authenticated caller DID, tenant context, and active T3N testnet contract version. |
| `vault_list_aliases` | `{}` | Lists all stored secret aliases owned by the caller. Returns metadata only (zero raw keys exposed). |
| `vault_proxy_call` | `credential_name`, `method`, `path`, `body`, `custom_headers` | Dispatches an HTTP request to the provider registered under `credential_name`. Enclave injects the raw secret and returns the sanitized response. |
| `vault_audit_recent` | `limit` | Fetches the caller's signed audit log entries directly from the TEE cluster ledger. |

---

## Contract ABI and WIT Specification

The contract is compiled to WebAssembly component model targeting `wasm32-wasip2`, vendoring `host:interfaces@2.2.0` and `host:tenant@2.0.0`.

```wit
package z:credential-vault@0.4.2;

world credential-vault {
    import host:tenant/tenant-context@2.0.0;
    import host:interfaces/kv@2.2.0;
    import host:interfaces/http@2.2.0;
    import host:interfaces/http-with-placeholders@2.2.0;
    import host:interfaces/crypto@2.2.0;
    import host:interfaces/clock@2.2.0;

    export store-credential: func(input: string) -> string;
    export revoke-credential: func(input: string) -> string;
    export list-credentials: func(input: string) -> string;
    export proxy-call: func(input: string) -> string;
    export send-email: func(input: string) -> string;
    export get-activity-log: func(input: string) -> string;
}
```

### Contract Functions

#### `store-credential`
Stores an API key into the enclave KV map under `u:<owner_hex>:<name>`.
- **Input:** `{"name": "openai-dev", "provider": "openai", "api_key": "sk-...", "host": "api.openai.com", "auth_scheme": "bearer"}`
- **Output:** `{"ok": true, "name": "openai-dev", "provider": "openai", "host": "api.openai.com", "auth_scheme": "bearer"}`

#### `proxy-call`
Executes an outbound HTTPS call with enclave RAM key injection.
- **Input:** `{"credential_name": "openai-dev", "method": "POST", "path": "/v1/chat/completions", "body": "{\"model\":\"gpt-4o-mini\",\"messages\":[{\"role\":\"user\",\"content\":\"ping\"}]}"}`
- **Output:** `{"status_code": 200, "headers": {...}, "body": "...", "owner_did": "did:t3n:...", "actor_did": "did:t3n:...", "delegated": false}`

#### `revoke-credential`
Deletes a stored key from the enclave KV map and records a revocation event.
- **Input:** `{"name": "openai-dev"}`
- **Output:** `{"revoked": true, "name": "openai-dev"}`

#### `list-credentials`
Scans keys prefixed by `u:<owner_hex>:`.
- **Input:** `{}`
- **Output:** `{"owner_did": "did:t3n:...", "credentials": [{"name": "openai-dev", "provider": "openai", "host": "api.openai.com", "auth_scheme": "bearer", "created_at": 1794503007}]}`

#### `get-activity-log`
Returns owner-scoped audit log entries stamped with cluster sequence numbers and timestamps.
- **Input:** `{"limit": 20}`
- **Output:** `{"owner_did": "did:t3n:...", "entries": [{"seq_no": 364949, "action": "proxy-call", "credential": "openai-dev", "status": "executed", "http_code": 200, "timestamp_secs": 1794503008}]}`

---

## Web Application Routes

Built with Next.js 16 (Turbopack) using the Swiss Hardware Manual and Carbon Enclave Deck design specification (Dark Mode default).

- **`/` (Public Overview):** Protocol introduction, live hardware boundary architecture diagram, live unique DID counter, and feature highlights.
- **`/docs` (Technical Reference):** Interactive documentation with real-time scroll-spy sidebar tracking enclave architecture, delegation model, Remote MCP integration, and Rust WASM ABI.
- **`/traction` (Public Telemetry):** Live leaderboard showing total unique DIDs, cluster transactions, recent execution ledger, and raw CSV export.
- **`/login` (Authentication):** Dual authentication supporting Terminal 3 Email OTP (via `createEmailOtpAuthInput`) and local T3N Private Key auth (via `createEthAuthInput`).
- **`/app` (Workspace Hub):** Enclave status indicators, quick stats, and deployment checklist.
- **`/app/vault` (Credential Manager):** Modal to store and revoke secrets with preset configurations for OpenAI, Gemini, Anthropic, Resend, Telegram, GitHub, and Webhooks.
- **`/app/agents` (Agent Delegation):** Interface to mint delegated Agent DIDs and configure granular function-level access with hostname allowlists.
- **`/app/wire` (Enclave Wire Tester):** 3-layer live console to test and verify outbound HTTPS proxy calls with automatic secret redaction.
- **`/app/connect` (MCP Config Generator):** Interactive code snippet generator for Claude Code, Cursor, Hermes Agent, and raw cURL.
- **`/app/audit` (Audit Trail):** Real-time cluster activity log viewer with filter controls and audit export.

---

## Verification and Test Suite

All layers are verified with deterministic automated test suites.

### 1. Rust Contract Tests (12 unit tests + 1 doc test)
```bash
cd credential-vault
cargo test
```
Result:
```
test context::tests::normalizes_did_and_raw_hex ... ok
test context::tests::parses_dynamic_context_owner_and_actor ... ok
test list::tests::list_credentials_non_wasm_returns_err ... ok
test log::tests::rejects_invalid_json ... ok
test proxy::tests::rejects_bad_method ... ok
test proxy::tests::validates_paths_and_redacts_secret ... ok
test revoke::tests::revoke_rejects_empty_name ... ok
test send::tests::send_email_validation ... ok
test store::tests::accepts_valid_providers_and_rejects_unknown ... ok
test store::tests::blocks_private_and_loopback_hosts ... ok
test store::tests::rejects_invalid_name_or_unsupported_provider ... ok
test tests::contract_version_is_v0_4_2 ... ok
test src\lib.rs - __export_credential_vault_impl (line 18) ... ok

test result: ok. 13 passed; 0 failed
```

### 2. Frontend Build
```bash
cd frontend
npm run build
```
Result: Next.js 16.3.3 compiles all 27 static and dynamic routes cleanly.

### 3. End-to-End Suite (`e2e-test.ts`)
```bash
npx tsx e2e-test.ts
```
Result against local development and production Vercel deployment:
```
=== VaultGate v2 E2E (https://vaultgate-one.vercel.app) ===
  PASS  GET / returns 200 + expected marker & dark default
  PASS  GET /docs returns 200 + expected marker & dark default
  PASS  GET /traction returns 200 + expected marker & dark default
  PASS  GET /login returns 200 + expected marker & dark default
  PASS  GET /app returns 200 + expected marker & dark default
  PASS  GET /app/vault returns 200 + expected marker & dark default
  PASS  GET /app/agents returns 200 + expected marker & dark default
  PASS  GET /app/wire returns 200 + expected marker & dark default
  PASS  GET /app/connect returns 200 + expected marker & dark default
  PASS  GET /app/audit returns 200 + expected marker & dark default
  PASS  GET /api/health returns active contract v0.4.2
  PASS  GET /api/traction returns uniqueDidsCount & ledger structure
  PASS  Auth guard blocks unauthenticated /api/vault, /api/agents, /api/wire, /api/audit
  PASS  GET /api/mcp returns MCP metadata & 4 tools
  PASS  POST /api/mcp initialize & tools/list follow JSON-RPC 2.0
  PASS  POST /api/mcp tools/call requires Bearer or X-T3N-Api-Key

RESULTS: 16 passed, 0 failed
```

---

## Project Structure

```
terminal3-bounty/
├── DESIGN.md                     # Swiss Hardware & Carbon Enclave design system
├── README.md                     # Comprehensive project documentation
├── package.json                  # Root runner & dependency config
├── integration-test.ts           # On-chain registration & smoke test suite
├── e2e-test.ts                   # 16-point production HTTP & MCP verification
│
├── credential-vault/             # Rust WASM TEE Contract (v0.4.2)
│   ├── Cargo.toml                # wasm32-wasip2 target config
│   ├── wit/
│   │   ├── world.wit             # WIT interface definition
│   │   └── deps/
│   │       ├── host-interfaces-2.2.0/
│   │       └── host-tenant-2.0.0/
│   └── src/
│       ├── lib.rs                # Component exports & entrypoints
│       ├── context.rs            # DynamicContext & caller DID extraction
│       ├── store.rs              # store-credential logic & SSRF validator
│       ├── proxy.rs              # proxy-call multi-provider outbound dispatcher
│       ├── revoke.rs             # revoke-credential deletion handler
│       ├── list.rs               # list-credentials owner scanning
│       ├── send.rs               # Backwards-compatible Resend sender
│       └── log.rs                # Activity log parser & validator
│
└── frontend/                     # Next.js 16 Multi-Route Production Web App
    ├── package.json              # @terminal3/t3n-sdk v5.39.1, lucide-react
    ├── next.config.ts            # Server external packages configuration
    ├── src/
    │   ├── app/
    │   │   ├── layout.tsx        # Root layout with dark mode default
    │   │   ├── globals.css       # Carbon Enclave tokens & hairline grid styling
    │   │   ├── icon.svg          # Custom hardware enclosure favicon (SVG)
    │   │   ├── favicon.ico       # Crisp 32x32 hardware enclosure favicon (ICO)
    │   │   ├── page.tsx          # Public Landing page
    │   │   ├── docs/page.tsx     # Technical documentation with scroll-spy
    │   │   ├── traction/page.tsx # Real-time public telemetry dashboard
    │   │   ├── login/page.tsx    # Dual-path DID authentication
    │   │   ├── app/              # Authenticated workspace routes
    │   │   │   ├── page.tsx      # Workspace overview & status
    │   │   │   ├── vault/        # Secret vault management
    │   │   │   ├── agents/       # Agent DID delegation manager
    │   │   │   ├── wire/         # Enclave wire request tester
    │   │   │   ├── connect/      # MCP client configuration generator
    │   │   │   └── audit/        # Cluster audit trail browser
    │   │   └── api/              # Secure API route handlers
    │   │       ├── health/       # Public health & contract version checker
    │   │       ├── traction/     # Public telemetry aggregator
    │   │       ├── auth/         # Email OTP & Private Key session handlers
    │   │       ├── vault/        # Contract store/list/revoke proxy
    │   │       ├── wire/         # Contract proxy-call dispatcher
    │   │       ├── agents/       # Member delegation & grant manager
    │   │       ├── audit/        # Signed audit log reader & CSV exporter
    │   │       └── mcp/          # Remote MCP Server (JSON-RPC 2.0 Streamable HTTP)
    │   ├── components/
    │   │   ├── VaultGateMark.tsx # Custom hardware enclosure logo mark
    │   │   ├── PublicNav.tsx     # Public sticky header
    │   │   ├── PublicFooter.tsx  # Public technical footer
    │   │   ├── ThemeToggle.tsx   # Dark / Light theme switcher
    │   │   ├── AppShell.tsx      # Authenticated sidebar & breadcrumb navigation
    │   │   └── StoreSecretModal  # Key storage modal with provider presets
    │   └── lib/
    │       ├── t3n-config.ts     # T3N network & contract version resolver
    │       ├── t3n-sessions.ts   # Session auth & delegation manager
    │       └── providers.ts      # Provider presets & validation rules
```

---

## Environment Variables

For local development or deployment to Vercel, configure:

```ini
# Network Environment (testnet, sandbox, or production)
T3N_ENV=testnet

# Deployed Contract ID on T3N
T3N_CONTRACT_ID=z:1ac7888746320bff5fb4e9b65cf211632fcf15f4:credential-vault

# Active Contract Version
T3N_CONTRACT_VERSION=0.4.2

# Terminal 3 API Key (0x... secp256k1 key from claim-page)
T3N_API_KEY=0x...
```

---

## License

MIT

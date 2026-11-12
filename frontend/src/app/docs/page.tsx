import Link from "next/link";
import { PublicNav } from "@/components/PublicNav";
import { PublicFooter } from "@/components/PublicFooter";

export default function DocsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink">
      <PublicNav />

      <div className="flex-1 w-full max-w-[1440px] mx-auto px-5 lg:px-8 py-10 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <aside className="lg:col-span-3">
          <div className="bg-panel border hairline p-4 sticky top-24 space-y-3">
            <p className="font-mono text-[11px] uppercase text-muted">Documentation</p>
            <ul className="space-y-2 font-mono text-xs">
              <li>
                <a href="#arch" className="block text-ink hover:text-seal">
                  01. Enclave Architecture
                </a>
              </li>
              <li>
                <a href="#delegation" className="block text-muted hover:text-ink">
                  02. Multi-DID &amp; Delegation
                </a>
              </li>
              <li>
                <a href="#mcp" className="block text-muted hover:text-ink">
                  03. Remote MCP Server
                </a>
              </li>
              <li>
                <a href="#abi" className="block text-muted hover:text-ink">
                  04. Rust WASM Contract ABI
                </a>
              </li>
            </ul>
          </div>
        </aside>

        <article className="lg:col-span-9 space-y-6 max-w-4xl">
          <div className="border-b hairline pb-6">
            <p className="font-mono text-[11px] uppercase text-seal">Technical Reference</p>
            <h1 className="font-display text-3xl font-bold tracking-tight mt-1">
              VaultGate Architecture &amp; MCP Guide
            </h1>
            <p className="text-sm text-muted mt-2">
              How VaultGate isolates third-party API keys inside Terminal 3 Trusted Execution Environments using @terminal3/t3n-sdk v5.39 and host-tenant@2.0.0.
            </p>
          </div>

          <section id="arch" className="bg-panel border hairline p-6 space-y-3">
            <h2 className="font-display text-xl font-bold">01. Enclave Architecture</h2>
            <p className="text-sm text-muted leading-relaxed">
              The VaultGate WASM component (wasm32-wasip2) runs inside Intel TDX enclaves on T3N. Secrets are stored in private KV maps with ACL restricted exclusively to the registered contract ID. Each entry is namespaced by u:&lt;owner_hex&gt;:&lt;alias&gt; resolved from host:tenant/tenant-context@2.0.0 calling-user-did.
            </p>
            <pre className="font-mono text-xs bg-elevated border hairline p-4 overflow-x-auto text-ink">
{`MCP Client / Web UI  --[alias + path + payload]-->  /api/mcp or T3N Node
                                                          |
                                               TDX Enclave Boundary
                                                          |
                                             credential-vault.wasm v0.4.2
                                             1. Resolve owner via calling-user-did
                                             2. Verify host in member-delegation
                                             3. Read key in enclave RAM (never returned)
                                             4. Inject auth header & call HTTPS upstream`}
            </pre>
          </section>

          <section id="delegation" className="bg-panel border hairline p-6 space-y-3">
            <h2 className="font-display text-xl font-bold">02. Multi-DID &amp; Delegation</h2>
            <p className="text-sm text-muted leading-relaxed">
              Every user signs in with Terminal 3 Email OTP or their own secp256k1 key to authenticate as a unique did:t3n principal. From /app/agents, users mint dedicated Agent DIDs via createDelegatedAgent and grant one BoundGrant row per contract function with explicit allowed_hosts via updateMemberDelegation.
            </p>
          </section>

          <section id="mcp" className="bg-panel border hairline p-6 space-y-3">
            <h2 className="font-display text-xl font-bold">03. Remote MCP Server (/api/mcp)</h2>
            <p className="text-sm text-muted leading-relaxed">
              VaultGate exposes a Streamable-HTTP JSON-RPC 2.0 MCP endpoint at /api/mcp backed by @terminal3/t3n-client stateless invoke(). Clients authenticate using Authorization: Bearer &lt;token&gt; or X-T3N-Api-Key without storing any OpenAI, Gemini, or Resend key locally.
            </p>
            <div className="pt-1">
              <Link
                href="/app/connect"
                className="inline-block px-4 py-2 bg-seal text-white font-mono text-xs uppercase"
              >
                Open Config Generator
              </Link>
            </div>
          </section>

          <section id="abi" className="bg-panel border hairline p-6 space-y-3">
            <h2 className="font-display text-xl font-bold">04. Rust WASM Contract ABI (v0.4.2)</h2>
            <ul className="space-y-2 font-mono text-xs text-muted">
              <li>
                <span className="text-ink font-semibold">store-credential</span>: Save provider preset, host, auth_scheme, and api_key under u:&lt;owner_hex&gt;:&lt;name&gt;.
              </li>
              <li>
                <span className="text-ink font-semibold">list-credentials</span>: Scan owner prefix and return metadata only (zero raw keys).
              </li>
              <li>
                <span className="text-ink font-semibold">revoke-credential</span>: Remove secret key from enclave KV and write audit log entry.
              </li>
              <li>
                <span className="text-ink font-semibold">proxy-call</span>: Execute outbound HTTP or http-with-placeholders request with secret header injection and output redaction.
              </li>
              <li>
                <span className="text-ink font-semibold">send-email</span>: Backwards-compatible Resend endpoint with SHA-256 recipient hashing.
              </li>
              <li>
                <span className="text-ink font-semibold">get-activity-log</span>: Return owner-scoped audit entries stamped with cluster seq_no and timestamp_secs.
              </li>
            </ul>
          </section>
        </article>
      </div>

      <PublicFooter />
    </div>
  );
}

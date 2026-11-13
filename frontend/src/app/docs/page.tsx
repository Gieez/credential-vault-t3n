"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PublicNav } from "@/components/PublicNav";
import { PublicFooter } from "@/components/PublicFooter";

const DOC_SECTIONS = [
  { id: "arch", num: "01", title: "Enclave Architecture" },
  { id: "delegation", num: "02", title: "Multi-DID & Delegation" },
  { id: "mcp", num: "03", title: "Remote MCP Server" },
  { id: "abi", num: "04", title: "Rust WASM Contract ABI" },
] as const;

type SectionId = (typeof DOC_SECTIONS)[number]["id"];

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState<SectionId>("arch");

  useEffect(() => {
    // Initial hash check
    const hash = window.location.hash.replace("#", "") as SectionId;
    if (DOC_SECTIONS.some((s) => s.id === hash)) {
      setActiveSection(hash);
    }

    // Scroll spy with IntersectionObserver
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((e) => e.isIntersecting);
        if (visible && visible.target.id) {
          setActiveSection(visible.target.id as SectionId);
        }
      },
      {
        rootMargin: "-80px 0px -60% 0px",
        threshold: 0,
      }
    );

    DOC_SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });

    const onHashChange = () => {
      const current = window.location.hash.replace("#", "") as SectionId;
      if (DOC_SECTIONS.some((s) => s.id === current)) {
        setActiveSection(current);
      }
    };
    window.addEventListener("hashchange", onHashChange);

    return () => {
      observer.disconnect();
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);

  const handleNavClick = (id: SectionId) => {
    setActiveSection(id);
  };

  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink">
      <PublicNav />

      <div className="flex-1 w-full max-w-[1440px] mx-auto px-5 lg:px-8 py-10 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <aside className="lg:col-span-3">
          <div className="bg-panel border hairline p-4 sticky top-24 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[11px] uppercase text-muted tracking-wider">
                Documentation
              </p>
              <span className="font-mono text-[10px] text-seal">v0.4.2</span>
            </div>
            <ul className="space-y-1 font-mono text-xs">
              {DOC_SECTIONS.map((sec) => {
                const isActive = activeSection === sec.id;
                return (
                  <li key={sec.id}>
                    <a
                      href={`#${sec.id}`}
                      onClick={() => handleNavClick(sec.id)}
                      className={`block py-1.5 px-2.5 transition-all border-l-2 ${
                        isActive
                          ? "border-seal bg-elevated text-ink font-semibold"
                          : "border-transparent text-muted hover:text-ink hover:bg-elevated/40"
                      }`}
                    >
                      <span className={isActive ? "text-seal" : "text-muted"}>
                        {sec.num}.
                      </span>{" "}
                      {sec.title}
                    </a>
                  </li>
                );
              })}
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

          <section id="arch" className="bg-panel border hairline p-6 space-y-3 scroll-mt-24">
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

          <section id="delegation" className="bg-panel border hairline p-6 space-y-3 scroll-mt-24">
            <h2 className="font-display text-xl font-bold">02. Multi-DID &amp; Delegation</h2>
            <p className="text-sm text-muted leading-relaxed">
              Every user signs in with Terminal 3 Email OTP or their own secp256k1 key to authenticate as a unique did:t3n principal. From /app/agents, users mint dedicated Agent DIDs via createDelegatedAgent and grant one BoundGrant row per contract function with explicit allowed_hosts via updateMemberDelegation.
            </p>
          </section>

          <section id="mcp" className="bg-panel border hairline p-6 space-y-3 scroll-mt-24">
            <h2 className="font-display text-xl font-bold">03. Remote MCP Server (/api/mcp)</h2>
            <p className="text-sm text-muted leading-relaxed">
              VaultGate exposes a Streamable-HTTP JSON-RPC 2.0 MCP endpoint at /api/mcp backed by @terminal3/t3n-client stateless invoke(). Clients authenticate using Authorization: Bearer *** or X-T3N-Api-Key without storing any OpenAI, Gemini, or Resend key locally.
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

          <section id="abi" className="bg-panel border hairline p-6 space-y-3 scroll-mt-24">
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

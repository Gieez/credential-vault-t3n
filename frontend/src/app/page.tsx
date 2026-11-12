"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PublicNav } from "@/components/PublicNav";
import { PublicFooter } from "@/components/PublicFooter";

const TRACE_SAMPLES = [
  {
    alias: "openai-prod",
    method: "POST /v1/responses",
    host: "api.openai.com",
    seq: 364351,
  },
  {
    alias: "gemini-flash",
    method: "POST /v1beta/models/gemini-2.5-flash:generateContent",
    host: "generativelanguage.googleapis.com",
    seq: 364352,
  },
  {
    alias: "resend-prod",
    method: "POST /emails",
    host: "api.resend.com",
    seq: 364353,
  },
  {
    alias: "tg-alerts",
    method: "GET /getMe",
    host: "api.telegram.org",
    seq: 364354,
  },
];

export default function HomePage() {
  const [traceIdx, setTraceIdx] = useState(0);
  const [metrics, setMetrics] = useState({ uniqueDidsCount: 1, totalCallsScanned: 0 });

  useEffect(() => {
    fetch("/api/traction")
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.uniqueDidsCount === "number") {
          setMetrics({
            uniqueDidsCount: d.uniqueDidsCount,
            totalCallsScanned: d.totalCallsScanned ?? 0,
          });
        }
      })
      .catch(() => {});
  }, []);

  const current = TRACE_SAMPLES[traceIdx];

  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink">
      <PublicNav />

      {/* Hero Band */}
      <section className="w-full border-b hairline bg-panel">
        <div className="max-w-[1440px] mx-auto px-5 lg:px-8 py-14 lg:py-20 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          <div className="lg:col-span-6 space-y-6">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 border hairline bg-paper font-mono text-[11px] uppercase tracking-wider text-muted">
              <span className="w-1.5 h-1.5 bg-seal" />
              Hardware-Sealed API Proxy &amp; MCP Server
            </div>

            <h1 className="font-display text-4xl sm:text-5xl lg:text-[56px] font-bold tracking-tight leading-[1.06]">
              Run AI agents on real APIs without exposing keys.
            </h1>

            <p className="text-base sm:text-lg text-muted max-w-[54ch] leading-relaxed">
              Store OpenAI, Gemini, Anthropic, Resend, and Telegram secrets inside a Terminal 3 TDX enclave. Agents execute requests using scoped DID delegations while raw keys remain locked in hardware memory.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link
                href="/login"
                className="px-5 py-3 bg-seal text-white hover:opacity-90 transition-opacity font-mono text-xs font-semibold uppercase tracking-wide"
              >
                Create Your DID Vault
              </Link>
              <Link
                href="/app"
                className="px-5 py-3 border hairline-strong bg-paper hover:bg-elevated transition-colors font-mono text-xs font-semibold uppercase tracking-wide"
              >
                Open Workspace
              </Link>
              <Link
                href="/docs"
                className="px-3 py-3 font-mono text-xs uppercase text-muted hover:text-ink underline underline-offset-4"
              >
                MCP Quickstart
              </Link>
            </div>

            <div className="pt-4 border-t hairline grid grid-cols-3 gap-4 max-w-lg font-mono">
              <div>
                <p className="text-[11px] text-muted uppercase">Unique DIDs</p>
                <p className="text-xl font-bold tabular mt-0.5">{metrics.uniqueDidsCount}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted uppercase">Ledger Events</p>
                <p className="text-xl font-bold tabular mt-0.5">{metrics.totalCallsScanned}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted uppercase">Key Exposure</p>
                <p className="text-xl font-bold tabular text-led mt-0.5">0 Bytes</p>
              </div>
            </div>
          </div>

          {/* Interactive Enclave Boundary Schematic */}
          <div className="lg:col-span-6 bg-paper border hairline-strong p-5 lg:p-6 wire-grid space-y-4">
            <div className="flex items-center justify-between pb-3 border-b hairline">
              <span className="font-mono text-xs font-semibold uppercase">
                Live Execution Boundary
              </span>
              <button
                type="button"
                onClick={() => setTraceIdx((i) => (i + 1) % TRACE_SAMPLES.length)}
                className="font-mono text-[11px] px-2.5 py-1 bg-elevated border hairline-strong hover:border-seal transition-colors cursor-pointer"
              >
                Cycle Provider
              </button>
            </div>

            <div className="bg-panel border hairline p-3.5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-[11px] uppercase text-muted">
                  1. Agent Sends Alias Only
                </span>
                <span className="font-mono text-[10px] px-1.5 py-0.5 border hairline text-ink">
                  Claude / Cursor / Hermes
                </span>
              </div>
              <pre className="font-mono text-xs text-ink overflow-x-auto">
                {`POST /api/mcp -> proxy-call(alias: "${current.alias}", "${current.method}")`}
              </pre>
            </div>

            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-seal" />
              <span className="px-2.5 py-0.5 bg-seal text-white font-mono text-[10px] font-semibold uppercase">
                TDX Enclave Seal
              </span>
              <div className="h-px flex-1 bg-seal" />
            </div>

            <div className="bg-elevated border hairline-strong p-3.5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-[11px] uppercase text-muted">
                  2. Egress Check + Key Injection
                </span>
                <span className="font-mono text-[10px] text-led">VERIFIED</span>
              </div>
              <pre className="font-mono text-xs text-ink overflow-x-auto">
                {`grant(actor) -> host "${current.host}" ALLOWED -> inject key in enclave RAM`}
              </pre>
            </div>

            <div className="bg-panel border hairline p-3.5 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-mono text-[11px] uppercase text-muted">3. Cluster Audit Proof</p>
                <p className="font-mono text-xs text-ink mt-1 truncate">
                  HTTP 200 OK | seq_no #{current.seq} | owner-scoped KV
                </p>
              </div>
              <Link href="/traction" className="font-mono text-[11px] text-seal underline shrink-0">
                View Ledger
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Architectural Guarantees */}
      <section className="w-full border-b hairline bg-paper">
        <div className="max-w-[1440px] mx-auto px-5 lg:px-8 py-14 grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-5 space-y-3">
            <p className="font-mono text-[11px] uppercase tracking-wider text-muted">
              Why VaultGate Exists
            </p>
            <h2 className="font-display text-3xl font-bold tracking-tight">
              Stop pasting production keys into local MCP configs.
            </h2>
            <p className="text-sm text-muted leading-relaxed">
              Local config files and .env variables sit on disk in plaintext. Prompt injection or verbose debug traces expose every key in seconds. VaultGate isolates secret storage and outbound HTTP signing inside Intel TDX enclaves on Terminal 3.
            </p>
          </div>

          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-panel border hairline p-5 space-y-2">
              <p className="font-mono text-xs font-semibold uppercase text-seal">
                01 / Per-Host Egress Lock
              </p>
              <p className="text-sm text-ink font-medium">User grants restrict destinations</p>
              <p className="text-xs text-muted leading-relaxed">
                If an agent attempts to send a credential to an unauthorized domain, the T3N host drops the request with egress_denied before any packet leaves.
              </p>
            </div>

            <div className="bg-panel border hairline p-5 space-y-2">
              <p className="font-mono text-xs font-semibold uppercase text-seal">
                02 / Multi-Provider Proxy
              </p>
              <p className="text-sm text-ink font-medium">One vault for AI, email, and bots</p>
              <p className="text-xs text-muted leading-relaxed">
                Built-in presets for OpenAI, Google Gemini, Anthropic, Resend, Telegram Bot API, GitHub, and custom allowlisted HTTPS webhooks.
              </p>
            </div>

            <div className="bg-panel border hairline p-5 space-y-2">
              <p className="font-mono text-xs font-semibold uppercase text-seal">
                03 / Scoped Agent DIDs
              </p>
              <p className="text-sm text-ink font-medium">Per-function delegation and revoke</p>
              <p className="text-xs text-muted leading-relaxed">
                Mint a dedicated did:t3n identity per agent client via createDelegatedAgent and authorize specific functions through updateMemberDelegation.
              </p>
            </div>

            <div className="bg-panel border hairline p-5 space-y-2">
              <p className="font-mono text-xs font-semibold uppercase text-seal">
                04 / Tamper-Evident Ledger
              </p>
              <p className="text-sm text-ink font-medium">Cluster activity log and CSV export</p>
              <p className="text-xs text-muted leading-relaxed">
                Every enclave call records actor DID, on_behalf_of owner DID, and seq_no to T3N cluster storage via getActivityLog.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom Onboarding Band */}
      <section className="w-full bg-panel">
        <div className="max-w-[1440px] mx-auto px-5 lg:px-8 py-14 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div className="space-y-2 max-w-2xl">
            <p className="font-mono text-[11px] uppercase tracking-wider text-muted">
              3-Minute Onboarding
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
              Sign in with Email OTP, seal your first key, copy one MCP config.
            </h2>
            <p className="text-sm text-muted">
              Every user receives a dedicated did:t3n identity and owner-isolated KV namespace inside contract v0.4.2.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 shrink-0">
            <Link
              href="/login"
              className="px-5 py-3 bg-seal text-white hover:opacity-90 font-mono text-xs font-semibold uppercase"
            >
              Get Started
            </Link>
            <Link
              href="/traction"
              className="px-5 py-3 border hairline-strong bg-paper hover:bg-elevated font-mono text-xs font-semibold uppercase"
            >
              View Public Metrics
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}

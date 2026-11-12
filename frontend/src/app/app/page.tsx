"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell, type SessionUser } from "@/components/AppShell";

function OverviewContent({
  user,
  openStoreModal,
}: {
  user: SessionUser;
  openStoreModal: () => void;
}) {
  const [credCount, setCredCount] = useState<number | null>(null);
  const [agentCount, setAgentCount] = useState<number | null>(null);
  const [logCount, setLogCount] = useState<number | null>(null);
  const [apiWarning, setApiWarning] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/vault").then((r) => r.json()),
      fetch("/api/agents").then((r) => r.json()),
      fetch("/api/audit?limit=50").then((r) => r.json()),
    ])
      .then(([v, a, l]) => {
        if (v.error) setApiWarning(v.error);
        setCredCount(Array.isArray(v.credentials) ? v.credentials.length : 0);
        setAgentCount(
          Array.isArray(a.agents)
            ? a.agents.filter((ag: { revokedAtSecs?: number }) => !ag.revokedAtSecs).length
            : 0
        );
        setLogCount(Array.isArray(l.clusterEntries) ? l.clusterEntries.length : 0);
      })
      .catch(() => {});
  }, [user]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b hairline pb-4">
        <div>
          <p className="font-mono text-[11px] uppercase text-muted">Workspace Overview</p>
          <h1 className="font-display text-2xl font-bold tracking-tight mt-0.5">
            Enclave Control Center
          </h1>
        </div>
        <Link
          href="/app/wire"
          className="px-4 py-2 bg-elevated border hairline-strong hover:border-seal font-mono text-xs uppercase"
        >
          Open Wire Tester
        </Link>
      </div>

      {(user.balance.creditExhausted || user.balance.availableRaw === 0 || apiWarning) && (
        <div className="p-4 border border-seal bg-panel font-mono text-xs space-y-1">
          <p className="text-seal font-semibold uppercase">Credit / Node Notice</p>
          <p className="text-muted">
            {apiWarning ||
              `Account ${user.did} has ${user.balance.availableFormatted} test credits available.`}
          </p>
          <p className="text-muted">
            Request grant credits in TG @terminal3developer or claim a fresh developer key at
            terminal3.io/claim-page.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <div className="md:col-span-5 bg-elevated p-5 border hairline-strong">
          <p className="font-mono text-[11px] uppercase text-muted">Sealed Secrets</p>
          <p className="font-display text-4xl font-bold mt-2 tabular">
            {credCount === null ? "-" : credCount}
          </p>
          <p className="font-mono text-xs text-muted mt-2">
            Scoped to {user.did.slice(0, 18)}...
          </p>
        </div>

        <div className="md:col-span-7 bg-panel p-5 border hairline grid grid-cols-2 gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase text-muted">Active Agents</p>
            <p className="font-display text-3xl font-bold mt-1.5 tabular">
              {agentCount === null ? "-" : agentCount}
            </p>
            <p className="font-mono text-[11px] text-led mt-1">Delegated DIDs</p>
          </div>
          <div className="border-l hairline pl-4">
            <p className="font-mono text-[11px] uppercase text-muted">Audit Events</p>
            <p className="font-display text-3xl font-bold mt-1.5 tabular">
              {logCount === null ? "-" : logCount}
            </p>
            <p className="font-mono text-[11px] text-muted mt-1">Cluster Ledger</p>
          </div>
        </div>
      </div>

      <div className="bg-panel border hairline p-6 space-y-4">
        <h2 className="font-display text-lg font-bold">Quickstart Checklist</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
          <button
            type="button"
            onClick={openStoreModal}
            className="text-left p-4 border hairline bg-paper hover:border-[var(--border-strong)] cursor-pointer"
          >
            <span className={credCount && credCount > 0 ? "text-led font-semibold" : "text-seal font-semibold"}>
              {credCount && credCount > 0 ? "[DONE] STEP 1" : "[TODO] STEP 1"}
            </span>
            <p className="font-sans font-semibold text-sm text-ink mt-1">Seal an API Key</p>
            <p className="font-sans text-xs text-muted mt-1">
              Store OpenAI, Gemini, or Resend key into owner-scoped TEE KV.
            </p>
          </button>

          <Link
            href="/app/agents"
            className="text-left p-4 border hairline bg-paper hover:border-[var(--border-strong)]"
          >
            <span className={agentCount && agentCount > 0 ? "text-led font-semibold" : "text-seal font-semibold"}>
              {agentCount && agentCount > 0 ? "[DONE] STEP 2" : "[TODO] STEP 2"}
            </span>
            <p className="font-sans font-semibold text-sm text-ink mt-1">Mint Agent DID</p>
            <p className="font-sans text-xs text-muted mt-1">
              Delegate contract functions and destination hosts per agent.
            </p>
          </Link>

          <Link
            href="/app/connect"
            className="text-left p-4 border hairline-strong bg-paper hover:border-seal"
          >
            <span className="text-seal font-semibold">[NEXT] STEP 3</span>
            <p className="font-sans font-semibold text-sm text-ink mt-1">Connect MCP Client</p>
            <p className="font-sans text-xs text-muted mt-1">
              Paste generated config into Claude Desktop, Cursor, or Hermes.
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function AppOverviewPage() {
  return (
    <AppShell>
      {({ user, openStoreModal }) => (
        <OverviewContent user={user} openStoreModal={openStoreModal} />
      )}
    </AppShell>
  );
}

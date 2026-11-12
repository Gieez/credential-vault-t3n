"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { DEFAULT_ALLOWED_HOSTS } from "@/lib/providers";

interface AgentRecord {
  agentDid: string;
  name: string;
  createdSecs: number;
  revokedAtSecs?: number;
  kind: string;
}

interface GrantRecord {
  grantee: string;
  function: string;
  allowed_hosts?: string[];
}

function AgentsContent() {
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [grants, setGrants] = useState<GrantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [selectedHosts, setSelectedHosts] = useState<string[]>(DEFAULT_ALLOWED_HOSTS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/agents", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to load agents");
      setAgents(data.agents || []);
      setGrants(data.grants || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agents");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function toggleHost(host: string) {
    setSelectedHosts((prev) =>
      prev.includes(host) ? prev.filter((h) => h !== host) : [...prev, host]
    );
  }

  async function handleMint(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          allowed_hosts: selectedHosts,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to mint agent");
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mint agent");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(agentDid: string) {
    setError("");
    try {
      const res = await fetch("/api/agents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentDid }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to revoke");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke agent");
    }
  }

  return (
    <div className="space-y-6">
      <div className="border-b hairline pb-4">
        <p className="font-mono text-[11px] uppercase text-muted">02 / Member Delegation</p>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Authorized Agent DIDs
        </h1>
      </div>

      {error && (
        <div className="p-3 border border-seal bg-panel font-mono text-xs text-seal">{error}</div>
      )}

      {/* Mint Agent Form */}
      <form onSubmit={handleMint} className="bg-panel border hairline p-5 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Agent name (e.g. cursor-mcp-local)"
            required
            className="flex-1 bg-paper border hairline px-3.5 py-2 font-mono text-xs text-ink"
          />
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-seal text-white font-mono text-xs font-semibold uppercase disabled:opacity-50 cursor-pointer shrink-0"
          >
            {submitting ? "Minting DID..." : "+ Mint Agent DID"}
          </button>
        </div>

        <div>
          <p className="font-mono text-[11px] uppercase text-muted mb-2">
            Allowed Destination Hosts (Egress Policy)
          </p>
          <div className="flex flex-wrap gap-2">
            {DEFAULT_ALLOWED_HOSTS.map((h) => {
              const checked = selectedHosts.includes(h);
              return (
                <button
                  key={h}
                  type="button"
                  onClick={() => toggleHost(h)}
                  className={`px-2.5 py-1 border font-mono text-[11px] cursor-pointer ${
                    checked
                      ? "border-seal bg-elevated text-ink"
                      : "border-[var(--border-rule)] bg-paper text-muted"
                  }`}
                >
                  {checked ? "[x] " : "[ ] "}
                  {h}
                </button>
              );
            })}
          </div>
        </div>
      </form>

      {/* Agents Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading ? (
          <div className="bg-panel border hairline p-5 font-mono text-xs text-muted">
            Loading delegated agents...
          </div>
        ) : agents.length === 0 ? (
          <div className="bg-panel border hairline p-5 font-mono text-xs text-muted">
            No delegated agents minted yet. Create one above to bind scoped hosts.
          </div>
        ) : (
          agents.map((a) => {
            const agentGrants = grants.filter((g) => g.grantee === a.agentDid);
            const hosts = Array.from(
              new Set(agentGrants.flatMap((g) => g.allowed_hosts || []))
            );
            const revoked = Boolean(a.revokedAtSecs);

            return (
              <div key={a.agentDid} className="bg-panel border hairline p-4 flex flex-col justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-semibold truncate">{a.name}</span>
                    <span
                      className={`font-mono text-[10px] px-1.5 py-0.5 border ${
                        revoked ? "border-seal text-seal" : "border-led text-led"
                      }`}
                    >
                      {revoked ? "REVOKED" : "ACTIVE"}
                    </span>
                  </div>
                  <p className="font-mono text-xs text-muted break-all">{a.agentDid}</p>
                  <p className="font-mono text-[11px] text-muted pt-1">
                    Hosts: {hosts.length ? hosts.join(", ") : "default policy"}
                  </p>
                </div>

                {!revoked && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleRevoke(a.agentDid)}
                      className="font-mono text-xs px-3 py-1 border hairline-strong hover:border-seal text-seal cursor-pointer"
                    >
                      Revoke Agent
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function AppAgentsPage() {
  return <AppShell>{() => <AgentsContent />}</AppShell>;
}

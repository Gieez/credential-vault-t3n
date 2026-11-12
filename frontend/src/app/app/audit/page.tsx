"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";

interface ClusterEntry {
  seq_no: number;
  actor: string;
  on_behalf_of: string;
  contract: string;
  function: string;
  outcome: string;
  timestamp_ms: number;
}

interface EnclaveEntry {
  seq_no: number;
  action: string;
  credential: string;
  provider: string;
  host: string;
  status: string;
  http_code: number;
}

function AuditContent() {
  const [clusterEntries, setClusterEntries] = useState<ClusterEntry[]>([]);
  const [enclaveEntries, setEnclaveEntries] = useState<EnclaveEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/audit?limit=40", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to load audit logs");
      setClusterEntries(data.clusterEntries || []);
      setEnclaveEntries(data.enclaveEntries || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b hairline pb-4">
        <div>
          <p className="font-mono text-[11px] uppercase text-muted">05 / Organization Ledger</p>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Tamper-Evident Audit Log
          </h1>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={load}
            className="px-3 py-2 border hairline bg-panel font-mono text-xs uppercase cursor-pointer"
          >
            Refresh
          </button>
          <a
            href="/api/audit/export"
            className="px-4 py-2 border hairline-strong bg-elevated hover:border-seal font-mono text-xs uppercase"
          >
            Export Cluster CSV
          </a>
        </div>
      </div>

      {error && (
        <div className="p-3 border border-seal bg-panel font-mono text-xs text-seal">{error}</div>
      )}

      {/* Cluster Audit Log */}
      <div className="bg-panel border hairline overflow-x-auto">
        <div className="px-4 py-3 border-b hairline flex items-center justify-between">
          <span className="font-mono text-xs font-semibold uppercase">
            Cluster Activity Ledger (client.getActivityLog)
          </span>
          <span className="font-mono text-[11px] text-muted">{clusterEntries.length} rows</span>
        </div>
        <table className="w-full text-left border-collapse font-mono text-xs tabular">
          <thead>
            <tr className="border-b hairline text-[11px] uppercase text-muted bg-paper">
              <th className="py-2.5 px-4">Seq</th>
              <th className="py-2.5 px-4">Actor DID</th>
              <th className="py-2.5 px-4">Contract</th>
              <th className="py-2.5 px-4">Function</th>
              <th className="py-2.5 px-4">Outcome</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-rule)]">
            {loading ? (
              <tr>
                <td colSpan={5} className="py-6 px-4 text-center text-muted">
                  Reading cluster audit ledger...
                </td>
              </tr>
            ) : clusterEntries.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 px-4 text-center text-muted">
                  No cluster entries returned.
                </td>
              </tr>
            ) : (
              clusterEntries.map((r) => (
                <tr key={`${r.seq_no}-${r.function}`}>
                  <td className="py-2.5 px-4 font-medium">#{r.seq_no}</td>
                  <td className="py-2.5 px-4">{r.actor.slice(0, 18)}...</td>
                  <td className="py-2.5 px-4 text-muted">{r.contract.split(":").pop()}</td>
                  <td className="py-2.5 px-4">{r.function}</td>
                  <td className="py-2.5 px-4">
                    <span
                      className={`px-1.5 py-0.5 border text-[10px] uppercase ${
                        r.outcome === "success"
                          ? "border-led text-led"
                          : "border-seal text-seal"
                      }`}
                    >
                      {r.outcome}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Owner Enclave KV Log */}
      <div className="bg-panel border hairline overflow-x-auto">
        <div className="px-4 py-3 border-b hairline flex items-center justify-between">
          <span className="font-mono text-xs font-semibold uppercase">
            Enclave Contract KV Log (get-activity-log)
          </span>
          <span className="font-mono text-[11px] text-muted">{enclaveEntries.length} rows</span>
        </div>
        <table className="w-full text-left border-collapse font-mono text-xs tabular">
          <thead>
            <tr className="border-b hairline text-[11px] uppercase text-muted bg-paper">
              <th className="py-2.5 px-4">Seq</th>
              <th className="py-2.5 px-4">Action</th>
              <th className="py-2.5 px-4">Alias</th>
              <th className="py-2.5 px-4">Host</th>
              <th className="py-2.5 px-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-rule)]">
            {enclaveEntries.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 px-4 text-center text-muted">
                  No owner-scoped enclave KV log entries yet.
                </td>
              </tr>
            ) : (
              enclaveEntries.map((e, i) => (
                <tr key={`${e.seq_no}-${i}`}>
                  <td className="py-2.5 px-4">#{e.seq_no}</td>
                  <td className="py-2.5 px-4">{e.action}</td>
                  <td className="py-2.5 px-4 font-medium">{e.credential}</td>
                  <td className="py-2.5 px-4 text-muted">{e.host}</td>
                  <td className="py-2.5 px-4">
                    {e.status} ({e.http_code})
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AppAuditPage() {
  return <AppShell>{() => <AuditContent />}</AppShell>;
}

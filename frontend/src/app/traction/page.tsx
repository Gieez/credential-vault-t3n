"use client";

import { useEffect, useState } from "react";
import { PublicNav } from "@/components/PublicNav";
import { PublicFooter } from "@/components/PublicFooter";

interface TractionEntry {
  seq_no: number;
  actor: string;
  on_behalf_of: string;
  contract: string;
  function: string;
  outcome: string;
  timestamp_ms: number;
}

interface TractionResponse {
  uniqueDidsCount: number;
  totalCallsScanned: number;
  contractId: string;
  entries: TractionEntry[];
  source: string;
}

export default function TractionPage() {
  const [data, setData] = useState<TractionResponse | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/traction", { cache: "no-store" });
      const json = (await res.json()) as TractionResponse;
      setData(json);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function exportCsv() {
    if (!data) return;
    const header = "seq_no,actor,on_behalf_of,contract,function,outcome,timestamp_ms\n";
    const rows = data.entries
      .map(
        (e) =>
          `${e.seq_no},${e.actor},${e.on_behalf_of},${e.contract},${e.function},${e.outcome},${e.timestamp_ms}`
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "vaultgate-public-traction.csv";
    a.click();
  }

  const entries = data?.entries ?? [];
  const successCount = entries.filter((e) => e.outcome === "success").length;
  const successRate =
    entries.length > 0 ? `${((successCount / entries.length) * 100).toFixed(1)}%` : "N/A";

  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink">
      <PublicNav />

      <main className="flex-1 w-full max-w-[1440px] mx-auto px-5 lg:px-8 py-10 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b hairline pb-5">
          <div>
            <p className="font-mono text-[11px] uppercase text-seal">Public Verifiable Metrics</p>
            <h1 className="font-display text-3xl font-bold tracking-tight mt-1">
              T3N Traction &amp; Cluster Ledger
            </h1>
            <p className="text-sm text-muted mt-1">
              DIDs and calls in a bounded sample of the deployer-visible ledger for this contract. These are not lifetime totals or independently verified user counts.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={load}
              className="px-3.5 py-2 border hairline bg-panel hover:border-[var(--border-strong)] font-mono text-xs uppercase cursor-pointer"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={exportCsv}
              className="px-4 py-2 border hairline-strong bg-panel hover:bg-elevated font-mono text-xs uppercase cursor-pointer"
            >
              Export Ledger CSV
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5 bg-elevated p-6 border hairline-strong">
            <p className="font-mono text-[11px] uppercase text-muted">DIDs in Ledger Sample</p>
            <p className="font-display text-5xl font-bold mt-2 tabular">
              {loading ? "-" : (data?.uniqueDidsCount ?? 0)}
            </p>
            <p className="font-mono text-xs text-seal mt-2">
              Source: {data?.source ?? "cluster_ledger"}
            </p>
          </div>

          <div className="lg:col-span-7 bg-panel p-6 border hairline grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <p className="font-mono text-[11px] uppercase text-muted">Calls in Ledger Sample</p>
              <p className="font-display text-3xl font-bold mt-2 tabular">
                {loading ? "-" : (data?.totalCallsScanned ?? 0)}
              </p>
            </div>
            <div className="border-l hairline pl-4">
              <p className="font-mono text-[11px] uppercase text-muted">Contract Version</p>
              <p className="font-display text-3xl font-bold mt-2 tabular">v0.4.2</p>
            </div>
            <div className="border-l hairline pl-4 col-span-2 sm:col-span-1">
              <p className="font-mono text-[11px] uppercase text-muted">Success Rate</p>
              <p className="font-display text-3xl font-bold mt-2 tabular text-led">{successRate}</p>
            </div>
          </div>
        </div>

        <div className="bg-panel border hairline overflow-hidden">
          <div className="px-5 py-3 border-b hairline flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-xs font-semibold uppercase">Verified Activity Stream</span>
            <span className="font-mono text-[11px] text-muted">
              {data?.contractId || "credential-vault"}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse font-mono text-xs tabular">
              <thead>
                <tr className="border-b hairline text-[11px] uppercase text-muted bg-paper">
                  <th className="py-3 px-5">Seq</th>
                  <th className="py-3 px-5">Actor DID</th>
                  <th className="py-3 px-5">On Behalf Of</th>
                  <th className="py-3 px-5">Function</th>
                  <th className="py-3 px-5">Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-rule)]">
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 px-5 text-center text-muted">
                      {loading ? "Loading cluster ledger..." : "No entries recorded in current window."}
                    </td>
                  </tr>
                ) : (
                  entries.map((r) => (
                    <tr key={`${r.seq_no}-${r.function}`}>
                      <td className="py-2.5 px-5 font-medium">#{r.seq_no}</td>
                      <td className="py-2.5 px-5">{r.actor.slice(0, 18)}...</td>
                      <td className="py-2.5 px-5 text-muted">{r.on_behalf_of.slice(0, 18)}...</td>
                      <td className="py-2.5 px-5">{r.function}</td>
                      <td className="py-2.5 px-5">
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
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}

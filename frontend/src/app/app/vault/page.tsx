"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";

interface CredItem {
  name: string;
  provider: string;
  host: string;
  auth_scheme: string;
  created_at: number;
}

function VaultContent({
  openStoreModal,
  refreshTrigger,
}: {
  openStoreModal: () => void;
  refreshTrigger: object;
}) {
  const [items, setItems] = useState<CredItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revoking, setRevoking] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/vault", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to load credentials");
      setItems(data.credentials || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [refreshTrigger]);

  async function handleRevoke(name: string) {
    setRevoking(name);
    setError("");
    try {
      const res = await fetch("/api/vault", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to revoke");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revoke failed");
    } finally {
      setRevoking(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b hairline pb-4">
        <div>
          <p className="font-mono text-[11px] uppercase text-muted">01 / Sealed Secrets</p>
          <h1 className="font-display text-2xl font-bold tracking-tight">Vault Keys</h1>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={load}
            className="px-3 py-2 border hairline bg-panel font-mono text-xs uppercase cursor-pointer"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={openStoreModal}
            className="px-4 py-2 bg-seal text-white font-mono text-xs uppercase cursor-pointer"
          >
            + Store Key
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 border border-seal bg-panel font-mono text-xs text-seal">{error}</div>
      )}

      <div className="bg-panel border hairline overflow-x-auto">
        <table className="w-full text-left border-collapse font-mono text-xs tabular">
          <thead>
            <tr className="border-b hairline text-[11px] uppercase text-muted bg-paper">
              <th className="py-3 px-4">Alias</th>
              <th className="py-3 px-4">Provider</th>
              <th className="py-3 px-4">Allowed Host</th>
              <th className="py-3 px-4">Scheme</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-rule)]">
            {loading ? (
              <tr>
                <td colSpan={5} className="py-8 px-4 text-center text-muted">
                  Scanning owner namespace in enclave KV...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 px-4 text-center text-muted">
                  No credentials stored yet. Click + Store Key to seal your first API key.
                </td>
              </tr>
            ) : (
              items.map((c) => (
                <tr key={c.name}>
                  <td className="py-3 px-4 font-semibold text-ink">{c.name}</td>
                  <td className="py-3 px-4 uppercase">{c.provider}</td>
                  <td className="py-3 px-4 text-muted">{c.host}</td>
                  <td className="py-3 px-4 text-muted">{c.auth_scheme}</td>
                  <td className="py-3 px-4 text-right space-x-3">
                    <Link
                      href={`/app/wire?alias=${encodeURIComponent(c.name)}`}
                      className="underline hover:text-seal"
                    >
                      Test
                    </Link>
                    <button
                      type="button"
                      disabled={revoking === c.name}
                      onClick={() => handleRevoke(c.name)}
                      className="text-seal underline cursor-pointer disabled:opacity-50"
                    >
                      {revoking === c.name ? "Revoking..." : "Revoke"}
                    </button>
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

export default function AppVaultPage() {
  return (
    <AppShell>
      {({ user, openStoreModal }) => (
        <VaultContent openStoreModal={openStoreModal} refreshTrigger={user} />
      )}
    </AppShell>
  );
}

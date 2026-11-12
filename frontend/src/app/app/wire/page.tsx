"use client";

import { useEffect, useState } from "react";
import { AppShell, type SessionUser } from "@/components/AppShell";
import { getPreset } from "@/lib/providers";

interface CredItem {
  name: string;
  provider: string;
  host: string;
}

function WireContent({ user }: { user: SessionUser }) {
  const [creds, setCreds] = useState<CredItem[]>([]);
  const [selectedAlias, setSelectedAlias] = useState("");
  const [method, setMethod] = useState<"GET" | "POST" | "PUT" | "PATCH" | "DELETE">("POST");
  const [path, setPath] = useState("/v1/responses");
  const [bodyText, setBodyText] = useState('{\n  "model": "gpt-4.1-mini",\n  "input": "Ping"\n}');
  const [usePlaceholders, setUsePlaceholders] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [trace, setTrace] = useState<{
    outsideView: unknown;
    enclaveResult: {
      ok: boolean;
      http_code: number;
      provider: string;
      host: string;
      path: string;
      seq_no: number;
      owner_did: string;
      actor_did: string;
      delegated: boolean;
      data: unknown;
    };
  } | null>(null);

  useEffect(() => {
    fetch("/api/vault", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const list = (d.credentials || []) as CredItem[];
        setCreds(list);
        if (list.length > 0) {
          applyCredDefaults(list[0]);
        }
      })
      .catch(() => {});
  }, []);

  function applyCredDefaults(cred: CredItem) {
    setSelectedAlias(cred.name);
    const preset = getPreset(cred.provider);
    if (preset) {
      setMethod(preset.sampleMethod);
      setPath(preset.samplePath);
      setBodyText(preset.sampleBody ? JSON.stringify(preset.sampleBody, null, 2) : "");
    }
  }

  async function executeCall() {
    setRunning(true);
    setError("");
    try {
      let parsedBody: unknown = undefined;
      if (method !== "GET" && bodyText.trim()) {
        parsedBody = JSON.parse(bodyText);
      }
      const res = await fetch("/api/wire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credential_name: selectedAlias,
          method,
          path: path.trim(),
          body: parsedBody,
          use_placeholders: usePlaceholders,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Proxy call failed");
      setTrace(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Execution error");
    } finally {
      setRunning(false);
    }
  }

  const outsidePreview = trace
    ? trace.outsideView
    : {
        contract_id: user.contractId,
        function_name: "proxy-call",
        input: {
          credential_name: selectedAlias || "select-a-credential",
          method,
          path,
          key_exposed: false,
        },
      };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b hairline pb-4">
        <div>
          <p className="font-mono text-[11px] uppercase text-muted">03 / Interactive Playground</p>
          <h1 className="font-display text-2xl font-bold tracking-tight">Enclave Wire Tester</h1>
        </div>
        <button
          type="button"
          disabled={running || !selectedAlias}
          onClick={executeCall}
          className="px-4 py-2 bg-seal text-white font-mono text-xs font-semibold uppercase disabled:opacity-50 cursor-pointer"
        >
          {running ? "Executing in TEE..." : "Execute Proxy Call"}
        </button>
      </div>

      {/* Request Builder */}
      <div className="bg-panel border hairline p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-4">
            <label className="block font-mono text-[10px] uppercase text-muted mb-1">
              Credential Alias
            </label>
            <select
              value={selectedAlias}
              onChange={(e) => {
                const found = creds.find((c) => c.name === e.target.value);
                if (found) applyCredDefaults(found);
              }}
              className="w-full bg-paper border hairline px-3 py-2 font-mono text-xs text-ink"
            >
              {creds.length === 0 ? (
                <option value="">No credentials stored</option>
              ) : (
                creds.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} ({c.host})
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block font-mono text-[10px] uppercase text-muted mb-1">Method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as typeof method)}
              className="w-full bg-paper border hairline px-3 py-2 font-mono text-xs text-ink"
            >
              {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-6">
            <label className="block font-mono text-[10px] uppercase text-muted mb-1">Path</label>
            <input
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              className="w-full bg-paper border hairline px-3 py-2 font-mono text-xs text-ink"
            />
          </div>
        </div>

        {method !== "GET" && (
          <div>
            <label className="block font-mono text-[10px] uppercase text-muted mb-1">
              JSON Body
            </label>
            <textarea
              rows={4}
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              className="w-full bg-paper border hairline p-3 font-mono text-xs text-ink"
            />
          </div>
        )}

        <label className="inline-flex items-center gap-2 font-mono text-xs text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={usePlaceholders}
            onChange={(e) => setUsePlaceholders(e.target.checked)}
          />
          Enable host-side {"{{profile.*}}"} PII placeholder resolution (http-with-placeholders)
        </label>
      </div>

      {error && (
        <div className="p-3 border border-seal bg-panel font-mono text-xs text-seal">{error}</div>
      )}

      {/* 3-Layer Boundary Inspector */}
      <div className="grid grid-cols-1 gap-4 wire-grid p-4 border hairline">
        <div className="bg-panel border hairline p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[11px] uppercase text-muted">
              Layer A - Outside TEE (Browser / Agent View)
            </span>
            <span className="font-mono text-[11px] px-1.5 py-0.5 border hairline">
              KEY EXPOSURE: 0 BYTES
            </span>
          </div>
          <pre className="font-mono text-xs bg-paper border hairline p-3 overflow-x-auto">
            {JSON.stringify(outsidePreview, null, 2)}
          </pre>
        </div>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-seal" />
          <span className="px-3 py-1 bg-seal text-white font-mono text-[11px] font-semibold uppercase">
            {running ? "ATTESTING..." : trace ? "SEALED & EXECUTED" : "TEE BOUNDARY READY"}
          </span>
          <div className="h-px flex-1 bg-seal" />
        </div>

        <div className="bg-elevated p-4 border hairline-strong">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[11px] uppercase text-muted">
              Layer B - TDX Enclave Execution
            </span>
            <span className="font-mono text-[11px] text-led">
              {trace ? `HTTP ${trace.enclaveResult.http_code}` : "WAITING"}
            </span>
          </div>
          <pre className="font-mono text-xs overflow-x-auto text-ink">
            {trace
              ? [
                  `[1] owner_did: ${trace.enclaveResult.owner_did}`,
                  `[2] actor_did: ${trace.enclaveResult.actor_did} (delegated=${trace.enclaveResult.delegated})`,
                  `[3] host allowlist verified: ${trace.enclaveResult.host}${trace.enclaveResult.path}`,
                  `[4] key read in enclave RAM & redacted from response`,
                ].join("\n")
              : "Run Execute Proxy Call to inspect live enclave execution metadata."}
          </pre>
        </div>

        <div className="bg-panel border hairline p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[11px] uppercase text-muted">
              Layer C - Upstream Response &amp; Seq Proof
            </span>
            <span className="font-mono text-[11px] text-led font-medium">
              {trace ? `seq_no #${trace.enclaveResult.seq_no}` : "-"}
            </span>
          </div>
          <pre className="font-mono text-xs bg-paper border hairline p-3 overflow-x-auto max-h-80">
            {trace
              ? JSON.stringify(trace.enclaveResult.data, null, 2)
              : "// Upstream JSON payload appears here"}
          </pre>
        </div>
      </div>
    </div>
  );
}

export default function AppWirePage() {
  return <AppShell>{({ user }) => <WireContent user={user} />}</AppShell>;
}

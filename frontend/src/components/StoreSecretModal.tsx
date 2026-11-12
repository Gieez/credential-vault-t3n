"use client";

import { useState } from "react";
import { PROVIDER_PRESETS } from "@/lib/providers";

interface StoreSecretModalProps {
  open: boolean;
  onClose: () => void;
  onStored: () => void;
}

export function StoreSecretModal({ open, onClose, onStored }: StoreSecretModalProps) {
  const [provider, setProvider] = useState("openai");
  const [name, setName] = useState("openai-prod");
  const [host, setHost] = useState("api.openai.com");
  const [authScheme, setAuthScheme] = useState("bearer");
  const [headerName, setHeaderName] = useState("Authorization");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  function onProviderChange(nextId: string) {
    setProvider(nextId);
    const preset = PROVIDER_PRESETS.find((p) => p.id === nextId);
    if (preset) {
      setName(`${preset.id}-prod`);
      setHost(preset.defaultHost);
      setAuthScheme(preset.authScheme);
      setHeaderName(preset.headerName);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          api_key: apiKey.trim(),
          provider,
          host: host.trim(),
          auth_scheme: authScheme,
          header_name: headerName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to store key in enclave");
      }
      setApiKey("");
      onStored();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to store key");
    } finally {
      setLoading(false);
    }
  }

  const currentPreset = PROVIDER_PRESETS.find((p) => p.id === provider);

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div className="bg-panel border hairline-strong w-full max-w-md p-6">
        <div className="flex items-center justify-between pb-3 border-b hairline">
          <h3 className="font-display font-bold text-lg text-ink">Store Secret in Enclave</h3>
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-xs text-muted hover:text-ink cursor-pointer"
          >
            [CLOSE]
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block font-mono text-[11px] uppercase text-muted mb-1">
              Provider Preset
            </label>
            <select
              value={provider}
              onChange={(e) => onProviderChange(e.target.value)}
              className="w-full bg-paper border hairline px-3 py-2 font-mono text-xs text-ink"
            >
              {PROVIDER_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} {p.defaultHost ? `(${p.defaultHost})` : "(Custom Host)"}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-mono text-[11px] uppercase text-muted mb-1">
                Alias Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="openai-prod"
                required
                className="w-full bg-paper border hairline px-3 py-2 font-mono text-xs text-ink"
              />
            </div>
            <div>
              <label className="block font-mono text-[11px] uppercase text-muted mb-1">
                Allowed Host
              </label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="api.example.com"
                required
                className="w-full bg-paper border hairline px-3 py-2 font-mono text-xs text-ink"
              />
            </div>
          </div>

          {provider === "webhook" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-mono text-[11px] uppercase text-muted mb-1">
                  Auth Scheme
                </label>
                <select
                  value={authScheme}
                  onChange={(e) => setAuthScheme(e.target.value)}
                  className="w-full bg-paper border hairline px-3 py-2 font-mono text-xs text-ink"
                >
                  <option value="bearer">Bearer Token</option>
                  <option value="x-api-key">x-api-key</option>
                  <option value="custom-header">Custom Header</option>
                </select>
              </div>
              <div>
                <label className="block font-mono text-[11px] uppercase text-muted mb-1">
                  Header Name
                </label>
                <input
                  type="text"
                  value={headerName}
                  onChange={(e) => setHeaderName(e.target.value)}
                  className="w-full bg-paper border hairline px-3 py-2 font-mono text-xs text-ink"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block font-mono text-[11px] uppercase text-muted mb-1">
              API Key (Sealed Inside TEE KV)
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={currentPreset?.placeholderHint || "Paste secret key"}
              required
              className="w-full bg-paper border hairline px-3 py-2 font-mono text-xs text-ink"
            />
            <p className="font-mono text-[10px] text-muted mt-1.5">
              Never returned by list-credentials or visible to client browsers.
            </p>
          </div>

          {error && (
            <div className="p-2.5 border border-seal bg-elevated font-mono text-xs text-seal">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 border hairline font-mono text-xs text-ink cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-seal text-white font-mono text-xs font-semibold uppercase disabled:opacity-50 cursor-pointer"
            >
              {loading ? "Sealing..." : "Seal into TEE"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

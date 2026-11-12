"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PublicNav } from "@/components/PublicNav";
import { PublicFooter } from "@/components/PublicFooter";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"otp" | "key">("otp");
  const [email, setEmail] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleStartOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/otp/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to send OTP");
      setPendingId(data.pendingId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start OTP");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingId) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingId, code: otpCode }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "OTP verification failed");
      router.push("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleKeyLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ privateKey }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Authentication failed");
      router.push("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink">
      <PublicNav />

      <main className="flex-1 w-full max-w-[1440px] mx-auto px-5 lg:px-8 py-12 grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        <div className="lg:col-span-6 space-y-4">
          <p className="font-mono text-[11px] uppercase text-seal">Per-User Identity</p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
            Authenticate with your own Terminal 3 DID.
          </h1>
          <p className="text-sm text-muted max-w-[52ch] leading-relaxed">
            VaultGate never shares a single developer key across accounts. Signing in creates an encrypted session bound strictly to your did:t3n identity so your stored keys and delegated agents remain isolated.
          </p>

          <div className="bg-panel border hairline p-5 max-w-md space-y-2 font-mono text-xs">
            <p className="font-semibold text-ink">Session Sequence</p>
            <p className="text-muted">1. Attested ML-KEM handshake with T3N testnet node</p>
            <p className="text-muted">2. Authenticate via Email OTP or local secp256k1 challenge</p>
            <p className="text-muted">3. Auto-configure self-delegation for contract v0.4.2</p>
          </div>
        </div>

        <div className="lg:col-span-6 bg-panel border hairline-strong p-6 lg:p-8 max-w-lg w-full">
          <div className="flex border-b hairline mb-6">
            <button
              type="button"
              onClick={() => {
                setMode("otp");
                setError("");
              }}
              className={`pb-3 px-3 font-mono text-xs uppercase border-b-2 cursor-pointer ${
                mode === "otp"
                  ? "border-seal text-ink font-semibold"
                  : "border-transparent text-muted"
              }`}
            >
              Email OTP
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("key");
                setError("");
              }}
              className={`pb-3 px-3 font-mono text-xs uppercase border-b-2 cursor-pointer ${
                mode === "key"
                  ? "border-seal text-ink font-semibold"
                  : "border-transparent text-muted"
              }`}
            >
              T3N Private Key
            </button>
          </div>

          {mode === "otp" ? (
            pendingId ? (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div>
                  <label className="block font-mono text-[11px] uppercase text-muted mb-1">
                    One-Time Code Sent to {email}
                  </label>
                  <input
                    type="text"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    placeholder="Enter 6-digit OTP code"
                    required
                    className="w-full bg-paper border hairline px-3.5 py-2.5 font-mono text-xs text-ink"
                  />
                </div>
                {error && (
                  <div className="p-2.5 border border-seal bg-elevated font-mono text-xs text-seal">
                    {error}
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPendingId(null);
                      setOtpCode("");
                    }}
                    className="px-4 py-3 border hairline font-mono text-xs uppercase cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-3 bg-seal text-white hover:opacity-90 font-mono text-xs font-semibold uppercase disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? "Verifying..." : "Verify Code & Enter App"}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleStartOtp} className="space-y-4">
                <div>
                  <label className="block font-mono text-[11px] uppercase text-muted mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@domain.com"
                    required
                    className="w-full bg-paper border hairline px-3.5 py-2.5 font-mono text-xs text-ink"
                  />
                </div>
                <p className="text-xs text-muted">
                  Issues a T3N one-time code directly from the enclave node and resolves your deterministic did:t3n.
                </p>
                {error && (
                  <div className="p-2.5 border border-seal bg-elevated font-mono text-xs text-seal">
                    {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-seal text-white hover:opacity-90 font-mono text-xs font-semibold uppercase disabled:opacity-50 cursor-pointer"
                >
                  {loading ? "Dispatching OTP..." : "Send OTP Code"}
                </button>
              </form>
            )
          ) : (
            <form onSubmit={handleKeyLogin} className="space-y-4">
              <div>
                <label className="block font-mono text-[11px] uppercase text-muted mb-1">
                  secp256k1 Private Key (0x-prefixed)
                </label>
                <input
                  type="password"
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                  placeholder="0x..."
                  required
                  className="w-full bg-paper border hairline px-3.5 py-2.5 font-mono text-xs text-ink"
                />
              </div>
              <p className="text-xs text-muted">
                Used in memory only to sign the SIWE authentication challenge for your session. Never written to disk.
              </p>
              {error && (
                <div className="p-2.5 border border-seal bg-elevated font-mono text-xs text-seal">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-seal text-white hover:opacity-90 font-mono text-xs font-semibold uppercase disabled:opacity-50 cursor-pointer"
              >
                {loading ? "Authenticating..." : "Authenticate & Enter App"}
              </button>
            </form>
          )}
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}

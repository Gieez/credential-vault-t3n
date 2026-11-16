"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";
import { StoreSecretModal } from "./StoreSecretModal";
import { VaultGateMark } from "./VaultGateMark";

export interface SessionUser {
  did: string;
  email: string | null;
  authMethod: "otp" | "key";
  balance: {
    availableFormatted: string;
    availableRaw: number;
    creditExhausted: boolean;
  };
  contractId: string;
  contractVersion: string;
}

interface AppShellProps {
  children: (ctx: { user: SessionUser; refreshUser: () => void; openStoreModal: () => void }) => React.ReactNode;
}

const NAV_ITEMS = [
  { href: "/app", label: "00 / Overview" },
  { href: "/app/vault", label: "01 / Vault Keys" },
  { href: "/app/agents", label: "02 / Agents" },
  { href: "/app/wire", label: "03 / Wire Tester" },
  { href: "/app/connect", label: "04 / MCP Setup" },
  { href: "/app/audit", label: "05 / Audit Log" },
];

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [logoutError, setLogoutError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  async function loadMe() {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const data = await res.json();
      if (!data.authenticated || !data.user) {
        router.replace("/login");
        return;
      }
      setUser(data.user);
    } catch {
      router.replace("/login");
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    loadMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick]);

  async function logout() {
    setLoggingOut(true);
    setLogoutError("");
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) throw new Error("Logout could not be confirmed. Retry to revoke your session.");
      window.location.replace("/login");
    } catch {
      setLogoutError("Logout could not be confirmed. Retry to revoke your session.");
      setLoggingOut(false);
    }
  }

  if (checking || !user) {
    return (
      <div className="min-h-screen bg-paper text-ink flex items-center justify-center font-mono text-xs">
        <div className="border hairline bg-panel px-6 py-4 flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-seal led-pulse" />
          <span>VERIFYING T3N ENCLAVE SESSION...</span>
        </div>
      </div>
    );
  }

  const shortDid = `${user.did.slice(0, 14)}...${user.did.slice(-4)}`;

  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink">
      {/* Top Telemetry Strip */}
      <header className="w-full border-b hairline-strong bg-panel sticky top-0 z-40">
        <div className="max-w-[1440px] mx-auto px-5 lg:px-8 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/" className="flex items-center gap-2 text-ink">
              <VaultGateMark size={20} />
              <span className="font-display font-bold tracking-tight text-base uppercase">
                VaultGate
              </span>
            </Link>
            <span className="font-mono text-[11px] text-muted hidden sm:inline">/ WORKSPACE</span>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="hidden md:flex items-center gap-2 px-2.5 py-1 border hairline bg-paper font-mono text-xs tabular">
              <span className="text-muted">DID:</span>
              <span className="font-medium text-ink" title={user.did}>
                {shortDid}
              </span>
              <span className="text-muted">|</span>
              <span className={user.balance.creditExhausted ? "text-seal" : "text-led"}>
                {user.balance.availableFormatted} CR
              </span>
            </div>
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="px-3 py-1.5 bg-seal text-white hover:opacity-90 font-mono text-xs font-medium uppercase cursor-pointer"
            >
              + Store Key
            </button>
            <Link
              href="/"
              className="hidden sm:inline-block px-2.5 py-1.5 border hairline font-mono text-[11px] text-muted hover:text-ink"
            >
              Public Site
            </Link>
            <button
              type="button"
              onClick={logout}
              disabled={loggingOut}
              className="px-2.5 py-1.5 border hairline font-mono text-[11px] text-muted hover:text-seal cursor-pointer disabled:opacity-50"
            >
              {loggingOut ? "Revoking..." : "Exit"}
            </button>
          </div>
        </div>
      </header>

      {logoutError && <p role="alert" className="border-b hairline p-3 text-seal font-mono text-xs">{logoutError}</p>}
      {/* Main Split Workspace */}
      <div className="flex-1 w-full max-w-[1440px] mx-auto grid grid-cols-1 lg:grid-cols-12 border-x hairline">
        <aside className="lg:col-span-2 border-b lg:border-b-0 lg:border-r hairline bg-panel p-4 flex lg:flex-col justify-between gap-4 overflow-x-auto">
          <nav className="flex lg:flex-col gap-1 font-mono text-xs min-w-max lg:min-w-0">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-2 border transition-colors ${
                    active
                      ? "bg-elevated border-[var(--border-strong)] text-ink font-semibold"
                      : "border-transparent text-muted hover:text-ink"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden lg:block pt-4 border-t hairline font-mono text-[11px] text-muted space-y-1">
            <p>CONTRACT</p>
            <p className="text-ink truncate" title={user.contractId}>
              {user.contractId.slice(0, 14)}...credential-vault
            </p>
            <p className="text-led">v{user.contractVersion} TDX OK</p>
          </div>
        </aside>

        <main className="lg:col-span-10 bg-paper p-5 lg:p-8 min-w-0">
          {children({
            user,
            refreshUser: () => setRefreshTick((n) => n + 1),
            openStoreModal: () => setModalOpen(true),
          })}
        </main>
      </div>

      <StoreSecretModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onStored={() => setRefreshTick((n) => n + 1)}
      />
    </div>
  );
}

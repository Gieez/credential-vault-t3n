"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";
import { VaultGateMark } from "./VaultGateMark";

export function PublicNav() {
  const pathname = usePathname();

  const links = [
    { href: "/", label: "Overview" },
    { href: "/docs", label: "Docs" },
    { href: "/traction", label: "Live Traction" },
  ];

  return (
    <header className="w-full border-b hairline-strong bg-panel sticky top-0 z-40">
      <div className="max-w-[1440px] mx-auto px-5 lg:px-8 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5 text-ink">
            <VaultGateMark size={22} />
            <span className="font-display font-bold tracking-tight text-lg uppercase text-ink">
              VaultGate
            </span>
            <span className="hidden sm:inline font-mono text-[11px] px-1.5 py-0.5 border hairline text-muted bg-paper">
              T3N TEE
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1 font-mono text-xs">
            {links.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 transition-colors ${
                    active ? "text-seal font-semibold" : "text-muted hover:text-ink"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="hidden lg:inline-flex items-center gap-2 font-mono text-[11px] text-muted pr-3 border-r hairline">
            <span className="w-2 h-2 rounded-full bg-led led-pulse" />
            TESTNET v1.0.12
          </span>
          <ThemeToggle />
          <Link
            href="/login"
            className="px-3.5 py-1.5 border hairline-strong bg-paper hover:bg-elevated transition-colors font-mono text-xs uppercase text-ink"
          >
            Sign In
          </Link>
          <Link
            href="/app"
            className="px-4 py-1.5 bg-seal text-white hover:opacity-90 transition-opacity font-mono text-xs font-semibold uppercase"
          >
            Launch App
          </Link>
        </div>
      </div>
    </header>
  );
}

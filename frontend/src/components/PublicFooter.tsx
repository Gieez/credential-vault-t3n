import Link from "next/link";
import { VaultGateMark } from "./VaultGateMark";

export function PublicFooter() {
  return (
    <footer className="w-full border-t hairline bg-panel mt-auto">
      <div className="max-w-[1440px] mx-auto px-5 lg:px-8 py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 font-mono text-xs text-muted">
        <div className="flex items-center gap-3 text-ink">
          <VaultGateMark size={16} />
          <span className="font-semibold uppercase">VaultGate</span>
          <span className="text-muted">/</span>
          <span className="text-muted">Contract v0.4.2 on Terminal 3 TDX Testnet</span>
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <Link href="/docs" className="hover:text-ink transition-colors">
            Docs
          </Link>
          <Link href="/traction" className="hover:text-ink transition-colors">
            Traction Ledger
          </Link>
          <Link href="/login" className="hover:text-ink transition-colors">
            Sign In
          </Link>
          <Link href="/app" className="text-seal hover:underline">
            Workspace
          </Link>
        </div>
      </div>
    </footer>
  );
}

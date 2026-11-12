import { NextResponse } from "next/server";
import { getActiveContractVersion, getContractId, T3N_ENV } from "@/lib/t3n-config";
import { getSessionFromCookies } from "@/lib/t3n-sessions";

export async function GET() {
  const [session, version] = await Promise.all([
    getSessionFromCookies(),
    getActiveContractVersion(),
  ]);
  return NextResponse.json({
    ok: true,
    env: T3N_ENV,
    contractId: getContractId(),
    contractVersion: version,
    authenticated: Boolean(session),
    did: session?.did ?? null,
  });
}

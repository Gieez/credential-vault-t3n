import { NextResponse } from "next/server";
import { getBalanceSummary, getSessionFromCookies } from "@/lib/t3n-sessions";
import { getActiveContractVersion, getContractId } from "@/lib/t3n-config";

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ authenticated: false, user: null });
  }
  const [balance, contractVersion] = await Promise.all([
    getBalanceSummary(session.client),
    getActiveContractVersion(),
  ]);
  return NextResponse.json({
    authenticated: true,
    user: {
      did: session.did,
      email: session.email ?? null,
      authMethod: session.authMethod,
      balance,
      contractId: getContractId(),
      contractVersion,
    },
  });
}

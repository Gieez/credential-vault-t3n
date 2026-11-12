import { NextResponse } from "next/server";
import { getActiveContractVersion, getContractId } from "@/lib/t3n-config";
import { getSessionFromCookies } from "@/lib/t3n-sessions";

export async function GET(req: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 40, 200);

  try {
    const contract_id = getContractId();
    const contract_version = await getActiveContractVersion();

    const [clusterLog, enclaveLog] = await Promise.all([
      session.client.getActivityLog({ limit }).catch(() => ({ entries: [], next_seq: null })),
      session.client
        .executeAndDecode<{ owner_did: string; entries: unknown[] }>({
          contract_id,
          contract_version,
          function_name: "get-activity-log",
          input: { limit },
        })
        .catch(() => ({ owner_did: session.did, entries: [] })),
    ]);

    return NextResponse.json({
      ownerDid: session.did,
      clusterEntries: clusterLog.entries || [],
      nextSeq: clusterLog.next_seq ?? null,
      enclaveEntries: enclaveLog.entries || [],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to load audit log";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveContractVersion, getContractId } from "@/lib/t3n-config";
import {
  ensureSelfDelegation,
  getSessionFromCookies,
  recordDidActivity,
} from "@/lib/t3n-sessions";

const wireSchema = z.object({
  credential_name: z.string().min(1),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("POST"),
  path: z.string().min(1),
  body: z.unknown().optional(),
  use_placeholders: z.boolean().optional().default(false),
});

export async function POST(req: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const json = await req.json();
    const parsed = wireSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid wire payload" },
        { status: 400 }
      );
    }

    const contract_id = getContractId();
    const contract_version = await getActiveContractVersion();

    const credentials = await session.client.executeAndDecode<{
      credentials: Array<{ name: string; host: string }>;
    }>({
      contract_id,
      contract_version,
      function_name: "list-credentials",
      input: {},
    });
    const credential = credentials.credentials.find(
      (item) => item.name === parsed.data.credential_name
    );
    if (!credential?.host) {
      return NextResponse.json({ error: "Credential alias or host not found" }, { status: 404 });
    }

    const delegation = await ensureSelfDelegation(session.client, session.did, [credential.host]);
    if (!delegation.ok) {
      return NextResponse.json(
        { error: delegation.warning || "Unable to authorize credential host" },
        { status: 403 }
      );
    }

    const result = await session.client.executeAndDecode<{
      ok: boolean;
      http_code: number;
      provider: string;
      host: string;
      path: string;
      seq_no: number;
      timestamp_secs: number;
      owner_did: string;
      actor_did: string;
      delegated: boolean;
      data: unknown;
    }>({
      contract_id,
      contract_version,
      function_name: "proxy-call",
      input: {
        credential_name: parsed.data.credential_name,
        method: parsed.data.method,
        path: parsed.data.path,
        body: parsed.data.body ?? null,
        use_placeholders: parsed.data.use_placeholders,
      },
    });

    recordDidActivity(session.did, {
      seq_no: result.seq_no || Date.now(),
      actor: result.actor_did || session.did,
      on_behalf_of: result.owner_did || session.did,
      contract: contract_id,
      function: "proxy-call",
      outcome: result.ok ? "success" : "error",
      timestamp_ms: (result.timestamp_secs || Math.floor(Date.now() / 1000)) * 1000,
    });

    return NextResponse.json({
      outsideView: {
        contract_id,
        contract_version,
        function_name: "proxy-call",
        input: {
          credential_name: parsed.data.credential_name,
          method: parsed.data.method,
          path: parsed.data.path,
          body: parsed.data.body ?? null,
          key_exposed: false,
        },
      },
      enclaveResult: result,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Proxy call failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveContractVersion, getContractId } from "@/lib/t3n-config";
import {
  ensureSelfDelegation,
  getSessionFromCookies,
  recordDidActivity,
} from "@/lib/t3n-sessions";

const storeSchema = z.object({
  name: z.string().min(1).max(64),
  api_key: z.string().min(1),
  provider: z.string().min(1),
  host: z.string().optional(),
  auth_scheme: z.string().optional(),
  header_name: z.string().optional(),
});

const revokeSchema = z.object({
  name: z.string().min(1),
});

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const contract_id = getContractId();
    const contract_version = await getActiveContractVersion();
    const result = await session.client.executeAndDecode<{
      owner_did: string;
      credentials: Array<{
        name: string;
        provider: string;
        service: string;
        host: string;
        auth_scheme: string;
        created_at: number;
      }>;
    }>({
      contract_id,
      contract_version,
      function_name: "list-credentials",
      input: {},
    });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to list credentials";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const parsed = storeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid credential payload" },
        { status: 400 }
      );
    }

    const contract_id = getContractId();
    const contract_version = await getActiveContractVersion();

    if (parsed.data.host) {
      await ensureSelfDelegation(session.client, session.did, [parsed.data.host]);
    }

    const result = await session.client.executeAndDecode({
      contract_id,
      contract_version,
      function_name: "store-credential",
      input: parsed.data,
    });

    recordDidActivity(session.did, {
      seq_no: Date.now(),
      actor: session.did,
      on_behalf_of: session.did,
      contract: contract_id,
      function: "store-credential",
      outcome: "success",
      timestamp_ms: Date.now(),
    });

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to store credential";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const parsed = revokeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Credential name is required" }, { status: 400 });
    }
    const contract_id = getContractId();
    const contract_version = await getActiveContractVersion();
    const result = await session.client.executeAndDecode({
      contract_id,
      contract_version,
      function_name: "revoke-credential",
      input: { name: parsed.data.name },
    });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to revoke credential";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

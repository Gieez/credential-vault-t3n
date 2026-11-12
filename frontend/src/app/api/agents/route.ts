import { NextResponse } from "next/server";
import { z } from "zod";
import { fanOutGrant, readOnlyScopes, type BoundGrant } from "@terminal3/t3n-sdk";
import {
  DELEGATED_AGENT_PROVIDER,
  getActiveContractVersion,
  getContractId,
} from "@/lib/t3n-config";
import { ALL_CONTRACT_FUNCTIONS, DEFAULT_ALLOWED_HOSTS } from "@/lib/providers";
import { getSessionFromCookies, recordDidActivity } from "@/lib/t3n-sessions";

const createAgentSchema = z.object({
  name: z.string().min(2).max(64),
  provider: z.string().optional(),
  allowed_hosts: z.array(z.string().min(1)).optional(),
  functions: z.array(z.string().min(1)).optional(),
});

const revokeAgentSchema = z.object({
  agentDid: z.string().min(10),
});

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const [agents, delegation] = await Promise.all([
      session.client.listDelegatedAgents().catch(() => []),
      session.client.getMemberDelegation().catch(() => ({ grants: [] })),
    ]);
    return NextResponse.json({
      ownerDid: session.did,
      agents: agents.map((a) => ({
        agentDid: typeof a.agentDid === "string" ? a.agentDid : a.agentDid.value,
        name: a.name,
        createdSecs: a.createdSecs,
        revokedAtSecs: a.revokedAtSecs,
        kind: a.kind,
      })),
      grants: delegation.grants || [],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to load agents";
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
    const parsed = createAgentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid agent request" },
        { status: 400 }
      );
    }

    const created = await session.client.createDelegatedAgent({
      provider: parsed.data.provider || DELEGATED_AGENT_PROVIDER,
      name: parsed.data.name,
    });

    const contract_id = getContractId();
    const version_req = await getActiveContractVersion();
    const allowed_hosts =
      parsed.data.allowed_hosts && parsed.data.allowed_hosts.length > 0
        ? parsed.data.allowed_hosts
        : DEFAULT_ALLOWED_HOSTS;
    const fns =
      parsed.data.functions && parsed.data.functions.length > 0
        ? parsed.data.functions
        : ["list-credentials", "proxy-call", "send-email", "get-activity-log"];

    const agentDidStr =
      typeof created.agentDid === "string" ? created.agentDid : created.agentDid.value;

    const grants: BoundGrant[] = fanOutGrant<BoundGrant>(
      {
        grantee: agentDidStr,
        contract_id,
        version_req,
        scopes: readOnlyScopes(["vault"]),
        allowed_hosts,
      },
      fns
    );

    await session.client.updateMemberDelegation(grants, {
      discoverDids: [session.did],
    });

    recordDidActivity(agentDidStr);

    return NextResponse.json({
      ok: true,
      agent: {
        agentDid: agentDidStr,
        ownerDid: typeof created.ownerDid === "string" ? created.ownerDid : created.ownerDid.value,
        name: created.name,
      },
      grantedFunctions: fns.length ? fns : ALL_CONTRACT_FUNCTIONS,
      allowedHosts: allowed_hosts,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to mint delegated agent";
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
    const parsed = revokeAgentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "agentDid is required" }, { status: 400 });
    }
    const res = await session.client.revokeDelegatedAgent(parsed.data.agentDid);
    const revokedDid =
      typeof res.agentDid === "string" ? res.agentDid : res.agentDid.value;
    return NextResponse.json({ ok: true, revoked: revokedDid });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to revoke agent";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

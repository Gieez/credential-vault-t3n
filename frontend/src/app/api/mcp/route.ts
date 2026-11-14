import { NextResponse } from "next/server";
import {
  getNodeUrl,
  T3nClient,
  eth_get_address,
  metamask_sign,
  createEthAuthInput,
} from "@terminal3/t3n-sdk";
import { discoverWhoami, invoke, type StatelessCredential } from "@terminal3/t3n-client";
import {
  getActiveContractVersion,
  getContractId,
  getSharedTrustAnchor,
  getSharedWasm,
  initT3nEnv,
} from "@/lib/t3n-config";
import { recordDidActivity } from "@/lib/t3n-sessions";

interface JsonRpcReq {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

function extractCredential(req: Request): {
  cred: StatelessCredential | null;
  rawKey?: string;
  piiDid?: string;
  subjectToken?: string;
} {
  const auth = req.headers.get("authorization") || "";
  const apiKey = req.headers.get("x-t3n-api-key") || "";
  const piiDid = req.headers.get("x-t3n-owner-did") || undefined;
  const subjectToken = req.headers.get("x-t3n-subject-token") || undefined;

  const candidate = (
    apiKey.trim() ||
    (auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "")
  ).trim();

  if (!candidate) {
    return { cred: null, piiDid, subjectToken };
  }

  if (candidate.startsWith("0x")) {
    return { cred: null, rawKey: candidate, piiDid, subjectToken };
  }

  if (candidate.startsWith("t3n_") || apiKey.trim()) {
    return { cred: { apiKey: candidate }, piiDid, subjectToken };
  }

  return { cred: { bearer: candidate }, piiDid, subjectToken };
}

// In-memory cache for private key clients to avoid repeated handshakes
const keyClients = new Map<string, { client: T3nClient; did: string; expiresAt: number }>();

async function getClientForPrivateKey(key: string): Promise<{ client: T3nClient; did: string }> {
  const cached = keyClients.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return { client: cached.client, did: cached.did };
  }

  const [trustAnchor, wasmComponent] = await Promise.all([
    getSharedTrustAnchor(),
    getSharedWasm(),
  ]);
  const addr = eth_get_address(key);
  const client = new T3nClient({
    trustAnchor,
    wasmComponent,
    handlers: { EthSign: metamask_sign(addr, undefined, key) },
  });
  await client.handshake();
  const did = await client.authenticate(createEthAuthInput(addr));

  keyClients.set(key, { client, did: did.value, expiresAt: Date.now() + 15 * 60 * 1000 });
  return { client, did: did.value };
}

const MCP_TOOLS = [
  {
    name: "vault_whoami",
    description:
      "Resolve the authenticated T3N agent DID, owner DID, and active VaultGate contract metadata.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "vault_list_aliases",
    description:
      "List credential aliases, provider names, and allowlisted hosts stored in the owner's TEE vault. Never returns raw API keys.",
    inputSchema: {
      type: "object",
      properties: {
        owner_did: {
          type: "string",
          description: "Optional owner did:t3n:... when calling via delegated agent.",
        },
      },
    },
  },
  {
    name: "vault_proxy_call",
    description:
      "Execute an outbound HTTPS API request inside the T3N enclave using a sealed credential alias. Raw API keys are injected inside TEE memory only.",
    inputSchema: {
      type: "object",
      required: ["credential_name", "method", "path"],
      properties: {
        credential_name: { type: "string", description: "Stored credential alias (e.g. openai-prod)." },
        method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
        path: { type: "string", description: "Request path starting with / (e.g. /v1/responses)." },
        body: { type: "object", description: "Optional JSON request body." },
        use_placeholders: {
          type: "boolean",
          description: "Set true to resolve {{profile.*}} PII markers inside the T3N enclave.",
        },
        owner_did: { type: "string", description: "Optional owner did:t3n:..." },
      },
    },
  },
  {
    name: "vault_audit_recent",
    description: "Fetch recent tamper-evident enclave execution logs for the owner DID.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Maximum log entries to return (1-100)." },
        owner_did: { type: "string", description: "Optional owner did:t3n:..." },
      },
    },
  },
];

export async function GET() {
  initT3nEnv();
  return NextResponse.json({
    name: "vaultgate-t3n-mcp",
    version: "0.4.2",
    protocol: "mcp-streamable-http",
    contract_id: getContractId(),
    tools: MCP_TOOLS.map((t) => t.name),
  });
}

export async function POST(req: Request) {
  initT3nEnv();
  let body: JsonRpcReq;
  try {
    body = (await req.json()) as JsonRpcReq;
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400 }
    );
  }

  const id = body.id ?? null;
  const method = body.method || "";

  if (method === "initialize") {
    return NextResponse.json({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        serverInfo: { name: "vaultgate-t3n-mcp", version: "0.4.2" },
        capabilities: { tools: {} },
      },
    });
  }

  if (method === "notifications/initialized") {
    return NextResponse.json({ jsonrpc: "2.0", id, result: {} });
  }

  if (method === "tools/list") {
    return NextResponse.json({
      jsonrpc: "2.0",
      id,
      result: { tools: MCP_TOOLS },
    });
  }

  if (method === "tools/call") {
    const { cred, rawKey, piiDid, subjectToken } = extractCredential(req);
    if (!cred && !rawKey) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32001,
            message: "Missing Authorization: Bearer *** or X-T3N-Api-Key header",
          },
        },
        { status: 401 }
      );
    }

    const params = body.params || {};
    const toolName = String(params.name || "");
    const args = (params.arguments as Record<string, unknown>) || {};
    const baseUrl = getNodeUrl();
    const contract_id = getContractId();
    const contract_version = await getActiveContractVersion();

    try {
      const fnMap: Record<string, { fn: string; input: unknown }> = {
        vault_list_aliases: { fn: "list-credentials", input: {} },
        vault_proxy_call: {
          fn: "proxy-call",
          input: {
            credential_name: args.credential_name,
            method: args.method || "POST",
            path: args.path,
            body: args.body ?? null,
            use_placeholders: Boolean(args.use_placeholders),
          },
        },
        vault_audit_recent: {
          fn: "get-activity-log",
          input: { limit: Number(args.limit) || 20 },
        },
      };

      // Branch 1: Direct Private Key (0x...) authentication
      if (rawKey) {
        const { client, did } = await getClientForPrivateKey(rawKey);
        recordDidActivity(did);

        if (toolName === "vault_whoami") {
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      whoami: { did, owner: did, type: "direct_private_key" },
                      contract_id,
                      contract_version,
                    },
                    null,
                    2
                  ),
                },
              ],
            },
          });
        }

        const target = fnMap[toolName];
        if (!target) {
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            error: { code: -32601, message: `Unknown tool: ${toolName}` },
          });
        }

        const execRes = await client.execute({
          contract_id,
          contract_version,
          function_name: target.fn,
          input: target.input,
        });

        let data: unknown;
        try {
          data = typeof execRes === "string" ? JSON.parse(execRes) : execRes;
        } catch {
          data = execRes;
        }

        recordDidActivity(did, {
          seq_no: Date.now(),
          actor: did,
          on_behalf_of: did,
          contract: contract_id,
          function: target.fn,
          outcome: "success",
          timestamp_ms: Date.now(),
        });

        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          },
        });
      }

      // Branch 2: Stateless Agent Credential (t3n_key_... or OAuth bearer)
      const who = await discoverWhoami({ ...cred!, baseUrl });
      const resolvedOwner =
        (typeof args.owner_did === "string" && args.owner_did) ||
        piiDid ||
        who.owner ||
        who.did;

      recordDidActivity(who.did);
      if (resolvedOwner) recordDidActivity(resolvedOwner);

      if (toolName === "vault_whoami") {
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({ whoami: who, contract_id, contract_version }, null, 2),
              },
            ],
          },
        });
      }

      const target = fnMap[toolName];
      if (!target) {
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Unknown tool: ${toolName}` },
        });
      }

      const data = await invoke({
        ...cred!,
        baseUrl,
        subjectToken,
        request: {
          contract_id,
          contract_version,
          function_name: target.fn,
          pii_did: resolvedOwner !== who.did ? resolvedOwner : undefined,
          input: target.input,
        },
      });

      recordDidActivity(who.did, {
        seq_no: Date.now(),
        actor: who.did,
        on_behalf_of: resolvedOwner,
        contract: contract_id,
        function: target.fn,
        outcome: "success",
        timestamp_ms: Date.now(),
      });

      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "MCP enclave invocation failed";
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: {
          isError: true,
          content: [{ type: "text", text: msg }],
        },
      });
    }
  }

  return NextResponse.json({
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Unsupported MCP method: ${method}` },
  });
}

import { cookies } from "next/headers";
import {
  T3nClient,
  eth_get_address,
  metamask_sign,
  createEthAuthInput,
  TenantClient,
  getNodeUrl,
  fanOutGrant,
  readOnlyScopes,
  formatTokens,
  type ActivityEntry,
  type BoundGrant,
} from "@terminal3/t3n-sdk";
import {
  ALL_CONTRACT_FUNCTIONS,
  DEFAULT_ALLOWED_HOSTS,
} from "./providers";
import {
  ensureEnvLoaded,
  getActiveContractVersion,
  getContractId,
  getSharedTrustAnchor,
  getSharedWasm,
  initT3nEnv,
} from "./t3n-config";

export const SESSION_COOKIE_NAME = "vg_session";
import { createSessionRegistry } from "./session-registry";

export interface UserSession {
  id: string;
  did: string;
  email?: string;
  authMethod: "otp" | "key";
  client: T3nClient;
  createdAt: number;
  lastActiveAt: number;
}

export interface LocalTractionRecord {
  knownDids: Set<string>;
  recentCalls: Array<{
    seq_no: number;
    actor: string;
    on_behalf_of: string;
    contract: string;
    function: string;
    outcome: string;
    timestamp_ms: number;
  }>;
}

const g = globalThis as unknown as {
  __vgSessions?: Map<string, UserSession>;
  __vgAdminClient?: T3nClient | null;
  __vgTraction?: LocalTractionRecord;
};

function sessionsMap() {
  if (!g.__vgSessions) g.__vgSessions = new Map();
  return g.__vgSessions;
}

function tractionStore(): LocalTractionRecord {
  if (!g.__vgTraction) {
    g.__vgTraction = {
      knownDids: new Set<string>(),
      recentCalls: [],
    };
  }
  return g.__vgTraction;
}

export function recordDidActivity(did: string, entry?: LocalTractionRecord["recentCalls"][number]) {
  const store = tractionStore();
  if (did) store.knownDids.add(did);
  if (entry) {
    store.knownDids.add(entry.actor);
    store.knownDids.add(entry.on_behalf_of);
    store.recentCalls.unshift(entry);
    if (store.recentCalls.length > 100) store.recentCalls.length = 100;
  }
}

const userDelegatedHosts = new Set<string>();

export async function ensureSelfDelegation(
  client: T3nClient,
  userDid: string,
  extraHosts: string[] = []
): Promise<{ ok: boolean; warning?: string }> {
  try {
    const key = `${userDid}:${extraHosts.sort().join(",")}`;
    if (userDelegatedHosts.has(key)) {
      return { ok: true };
    }

    if (
      extraHosts.every((h) => DEFAULT_ALLOWED_HOSTS.includes(h)) &&
      userDelegatedHosts.has(`${userDid}:base`)
    ) {
      return { ok: true };
    }

    const contractId = getContractId();
    const version = await getActiveContractVersion();
    const hosts = Array.from(new Set([...DEFAULT_ALLOWED_HOSTS, ...extraHosts.filter(Boolean)]));
    const grants: BoundGrant[] = fanOutGrant<BoundGrant>(
      {
        grantee: userDid,
        contract_id: contractId,
        version_req: version,
        scopes: readOnlyScopes(["vault"]),
        allowed_hosts: hosts,
      },
      ALL_CONTRACT_FUNCTIONS
    );
    await client.updateMemberDelegation(grants, { discoverDids: [userDid] });
    userDelegatedHosts.add(key);
    userDelegatedHosts.add(`${userDid}:base`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      warning: err instanceof Error ? err.message : "Delegation update skipped",
    };
  }
}

async function sessionRegistry() {
  ensureEnvLoaded();
  const secret = process.env.SESSION_SECRET || "";
  // Validate configuration before making authenticated network calls.
  if (secret.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters");
  const admin = await getAdminTelemetryClient();
  const did = admin?.getDid()?.value;
  if (!admin || !did) throw new Error("Session registry is unavailable");
  const tenant = new TenantClient({ t3n: admin, baseUrl: getNodeUrl(), tenantDid: did });
  return createSessionRegistry({
    get: (key) => tenant.maps.entryGet("web-sessions", key),
    set: (key, value) => tenant.maps.entrySet("web-sessions", key, value),
  }, secret);
}

const clientPool = new Map<string, { client: T3nClient; did: string; expiresAt: number }>();

async function getOrCreateClient(cleanKey: string): Promise<{ client: T3nClient; did: string }> {
  const cached = clientPool.get(cleanKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { client: cached.client, did: cached.did };
  }

  const [trustAnchor, wasmComponent] = await Promise.all([
    getSharedTrustAnchor(),
    getSharedWasm(),
  ]);

  const address = eth_get_address(cleanKey);
  const client = new T3nClient({
    trustAnchor,
    wasmComponent,
    handlers: {
      EthSign: metamask_sign(address, undefined, cleanKey),
    },
  });

  await client.handshake();
  const did = await client.authenticate(createEthAuthInput(address));

  clientPool.set(cleanKey, {
    client,
    did: did.value,
    expiresAt: Date.now() + 20 * 60 * 1000,
  });

  return { client, did: did.value };
}

export async function signInWithPrivateKey(privateKey: string): Promise<UserSession> {
  initT3nEnv();
  const cleanKey = privateKey.trim();
  if (!cleanKey) throw new Error("Private key is required");

  const { client, did } = await getOrCreateClient(cleanKey);

  const registry = await sessionRegistry();
  const { id: token, payload } = await registry.issue(did, cleanKey);
  const now = payload.createdAt;

  const session: UserSession = {
    id: token,
    did,
    authMethod: "key",
    client,
    createdAt: now,
    lastActiveAt: now,
  };

  sessionsMap().set(token, session);
  recordDidActivity(session.did);
  await ensureSelfDelegation(client, session.did);
  return session;
}

export async function getSessionFromCookies(): Promise<UserSession | null> {
  initT3nEnv();
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return null;

  try {
    const registry = await sessionRegistry();
    const payload = await registry.read(raw);
    if (!payload) {
      sessionsMap().delete(raw);
      return null;
    }
    const inMemory = sessionsMap().get(raw);
    if (inMemory && inMemory.did === payload.did) {
      inMemory.lastActiveAt = Date.now();
      return inMemory;
    }
    const { client, did } = await getOrCreateClient(payload.privateKey);
    if (did !== payload.did) return null;
    const session: UserSession = {
      id: raw, did, authMethod: "key", client,
      createdAt: payload.createdAt, lastActiveAt: Date.now(),
    };
    sessionsMap().set(raw, session);
    return session;
  } catch {
    // Do not log credentials, encrypted session contents or SDK error payloads.
    return null;
  }
}

export async function destroySessionFromCookies(): Promise<void> {
  const raw = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return;
  const registry = await sessionRegistry();
  await registry.revoke(raw); // Must succeed before reporting logout success.
  sessionsMap().delete(raw);
}

export async function getBalanceSummary(client: T3nClient): Promise<{
  availableFormatted: string;
  availableRaw: number;
  creditExhausted: boolean;
}> {
  try {
    const bal = await client.getBalance();
    return {
      availableFormatted: formatTokens(bal.available),
      availableRaw: bal.available,
      creditExhausted: bal.credit_exhausted,
    };
  } catch {
    return {
      availableFormatted: "0",
      availableRaw: 0,
      creditExhausted: false,
    };
  }
}

export async function getAdminTelemetryClient(): Promise<T3nClient | null> {
  ensureEnvLoaded();
  initT3nEnv();
  if (g.__vgAdminClient !== undefined) return g.__vgAdminClient;

  const key = process.env.T3N_API_KEY;
  if (!key) {
    g.__vgAdminClient = null;
    return null;
  }

  try {
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
    await client.authenticate(createEthAuthInput(addr));
    g.__vgAdminClient = client;
    return client;
  } catch {
    g.__vgAdminClient = null;
    return null;
  }
}

export async function fetchPublicTraction(limit = 30): Promise<{
  uniqueDidsCount: number;
  totalCallsScanned: number;
  contractId: string;
  entries: ActivityEntry[];
  source: "cluster_ledger" | "session_buffer";
}> {
  const contractId = getContractId();

  // Public metrics use the deployer's ledger scope, never an arbitrary user session.
  const reader = await getAdminTelemetryClient();

  if (reader) {
    try {
      const report = await reader.getActivityLog({ limit: 200 });
      const vaultEntries = (report.entries || []).filter((e) => e.contract === contractId);
      const didSet = new Set<string>();
      for (const e of vaultEntries) {
        if (e.actor) didSet.add(e.actor);
        if (e.on_behalf_of) didSet.add(e.on_behalf_of);
      }
      return {
        uniqueDidsCount: didSet.size,
        totalCallsScanned: vaultEntries.length,
        contractId,
        entries: vaultEntries.slice(0, limit),
        source: "cluster_ledger",
      };
    } catch {
      // fall through to session buffer if cluster read fails
    }
  }

  return {
    uniqueDidsCount: 0,
    totalCallsScanned: 0,
    contractId,
    entries: [],
    source: "session_buffer",
  };
}

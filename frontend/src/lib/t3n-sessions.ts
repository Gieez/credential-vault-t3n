import crypto from "crypto";
import { cookies } from "next/headers";
import {
  T3nClient,
  eth_get_address,
  metamask_sign,
  createEthAuthInput,
  createEmailOtpAuthInput,
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

export interface UserSession {
  id: string;
  did: string;
  email?: string;
  authMethod: "otp" | "key";
  client: T3nClient;
  createdAt: number;
  lastActiveAt: number;
}

interface PendingOtp {
  email: string;
  submitCode: (code: string) => void;
  rejectCode: (err: Error) => void;
  authPromise: Promise<UserSession>;
  createdAt: number;
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
  __vgPendingOtp?: Map<string, PendingOtp>;
  __vgAdminClient?: T3nClient | null;
  __vgTraction?: LocalTractionRecord;
};

function sessionsMap() {
  if (!g.__vgSessions) g.__vgSessions = new Map();
  return g.__vgSessions;
}

function pendingOtpMap() {
  if (!g.__vgPendingOtp) g.__vgPendingOtp = new Map();
  return g.__vgPendingOtp;
}

function tractionStore(): LocalTractionRecord {
  if (!g.__vgTraction) {
    g.__vgTraction = {
      knownDids: new Set(["did:t3n:4501765f00802de416a08a09180a96e7d346da75"]),
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

export async function startEmailOtpLogin(email: string): Promise<{ pendingId: string }> {
  initT3nEnv();
  const trimmed = email.trim().toLowerCase();
  if (!trimmed.includes("@") || !trimmed.includes(".")) {
    throw new Error("Invalid email address");
  }

  const [trustAnchor, wasmComponent] = await Promise.all([
    getSharedTrustAnchor(),
    getSharedWasm(),
  ]);

  const client = new T3nClient({ trustAnchor, wasmComponent });
  await client.handshake();

  let submitCode!: (code: string) => void;
  let rejectCode!: (err: Error) => void;
  const codePromise = new Promise<string>((res, rej) => {
    submitCode = res;
    rejectCode = rej;
  });

  const pendingId = crypto.randomBytes(16).toString("hex");

  const authPromise = (async (): Promise<UserSession> => {
    const did = await client.authenticate(
      createEmailOtpAuthInput({
        email: trimmed,
        getOtpCode: () => codePromise,
      })
    );
    const session: UserSession = {
      id: crypto.randomBytes(24).toString("hex"),
      did: did.value,
      email: trimmed,
      authMethod: "otp",
      client,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };
    sessionsMap().set(session.id, session);
    recordDidActivity(session.did);
    await ensureSelfDelegation(client, session.did);
    return session;
  })();

  // Prevent unhandled rejection if caller abandons OTP
  authPromise.catch(() => {});

  // Give the SDK a brief moment to send InitEmailOtp and catch immediate rate-limit errors
  await Promise.race([
    authPromise.then(() => null),
    new Promise((r) => setTimeout(r, 900)),
  ]);

  pendingOtpMap().set(pendingId, {
    email: trimmed,
    submitCode,
    rejectCode,
    authPromise,
    createdAt: Date.now(),
  });

  // Cleanup expired pending flows (> 10 minutes)
  const cutoff = Date.now() - 10 * 60_000;
  for (const [k, v] of pendingOtpMap().entries()) {
    if (v.createdAt < cutoff) {
      v.rejectCode(new Error("OTP session expired"));
      pendingOtpMap().delete(k);
    }
  }

  return { pendingId };
}

export async function verifyEmailOtpLogin(
  pendingId: string,
  code: string
): Promise<UserSession> {
  const pending = pendingOtpMap().get(pendingId);
  if (!pending) {
    throw new Error("OTP session not found or expired. Request a new code.");
  }
  const cleanCode = code.trim();
  if (!cleanCode) {
    throw new Error("OTP code is required");
  }
  pending.submitCode(cleanCode);
  try {
    const session = await pending.authPromise;
    pendingOtpMap().delete(pendingId);
    return session;
  } catch (err) {
    pendingOtpMap().delete(pendingId);
    throw err;
  }
}

const SESSION_TTL_MS = 30 * 60 * 1000;
const SESSION_SECRET_MIN_LENGTH = 32;

function getSessionEncryptionKey(): Buffer {
  ensureEnvLoaded();
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < SESSION_SECRET_MIN_LENGTH) {
    throw new Error("SESSION_SECRET must be configured with at least 32 characters");
  }
  return crypto.createHash("sha256").update(`vaultgate-session-v1:${secret}`).digest();
}

interface SessionTokenPayload {
  did: string;
  privateKey?: string;
  email?: string;
  authMethod: "otp" | "key";
  createdAt: number;
  expiresAt: number;
}

export function encodeSessionToken(payload: SessionTokenPayload): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getSessionEncryptionKey(), iv);
  const json = JSON.stringify(payload);
  const enc = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64url"), tag.toString("base64url"), enc.toString("base64url")].join(".");
}

export function decodeSessionToken(token: string): SessionTokenPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [ivB, tagB, encB] = parts;
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      getSessionEncryptionKey(),
      Buffer.from(ivB, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tagB, "base64url"));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(encB, "base64url")),
      decipher.final(),
    ]);
    const value = JSON.parse(dec.toString("utf8")) as Partial<SessionTokenPayload>;
    if (
      typeof value.did !== "string" ||
      !/^did:t3n:[0-9a-f]{40}$/i.test(value.did) ||
      (value.authMethod !== "key" && value.authMethod !== "otp") ||
      !Number.isSafeInteger(value.createdAt) ||
      !Number.isSafeInteger(value.expiresAt) ||
      value.expiresAt! <= Date.now() ||
      value.createdAt! > Date.now() + 60_000 ||
      value.expiresAt! - value.createdAt! > SESSION_TTL_MS ||
      (value.authMethod === "key" && typeof value.privateKey !== "string")
    ) {
      return null;
    }
    return value as SessionTokenPayload;
  } catch {
    return null;
  }
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

  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  const token = encodeSessionToken({
    did,
    privateKey: cleanKey,
    authMethod: "key",
    createdAt: now,
    expiresAt,
  });

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

  const inMemory = sessionsMap().get(raw);
  if (inMemory) {
    if (Date.now() - inMemory.createdAt > SESSION_TTL_MS) {
      sessionsMap().delete(raw);
      return null;
    }
    inMemory.lastActiveAt = Date.now();
    return inMemory;
  }

  const payload = decodeSessionToken(raw);
  if (!payload || payload.authMethod !== "key" || !payload.privateKey) return null;

  try {
    const { client, did } = await getOrCreateClient(payload.privateKey);

    const session: UserSession = {
      id: raw,
      did: payload.did || did,
      email: payload.email,
      authMethod: payload.authMethod,
      client,
      createdAt: payload.createdAt,
      lastActiveAt: Date.now(),
    };

    sessionsMap().set(raw, session);
    return session;
  } catch (err) {
    console.error("Failed to restore session from cookie:", err);
    return null;
  }
}

export async function destroySessionFromCookies(): Promise<void> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return;

  sessionsMap().delete(raw);
  const payload = decodeSessionToken(raw);
  if (payload?.privateKey) {
    clientPool.delete(payload.privateKey);
  }
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
  const store = tractionStore();

  // Prefer any active session client, else admin telemetry client
  const firstActive = sessionsMap().values().next().value as UserSession | undefined;
  const reader = firstActive?.client ?? (await getAdminTelemetryClient());

  if (reader) {
    try {
      const report = await reader.getActivityLog({ limit: 200 });
      const allEntries = report.entries || [];
      const didSet = new Set<string>(store.knownDids);
      for (const e of allEntries) {
        if (e.actor) didSet.add(e.actor);
        if (e.on_behalf_of) didSet.add(e.on_behalf_of);
      }
      const vaultEntries = allEntries.filter(
        (e) => e.contract === contractId || e.contract.includes("credential-vault")
      );
      return {
        uniqueDidsCount: didSet.size,
        totalCallsScanned: vaultEntries.length || allEntries.length,
        contractId,
        entries: (vaultEntries.length > 0 ? vaultEntries : allEntries).slice(0, limit),
        source: "cluster_ledger",
      };
    } catch {
      // fall through to session buffer if cluster read fails
    }
  }

  return {
    uniqueDidsCount: store.knownDids.size,
    totalCallsScanned: store.recentCalls.length,
    contractId,
    entries: [],
    source: "session_buffer",
  };
}

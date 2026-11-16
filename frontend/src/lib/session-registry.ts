import crypto from "node:crypto";

export const SESSION_TTL_MS = 30 * 60 * 1000;
export interface SessionPayload {
  did: string;
  privateKey: string;
  authMethod: "key";
  createdAt: number;
  expiresAt: number;
}
export interface SessionStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

function encryptionKey(secret: string): Buffer {
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters");
  return crypto.createHash("sha256").update(`vaultgate-registry-v1:${secret}`).digest();
}

export function createSessionRegistry(storage: SessionStorage, secret: string, now = Date.now) {
  const key = encryptionKey(secret);
  const validId = (id: string) => /^[0-9a-f]{64}$/.test(id);
  const storageKey = (id: string) => crypto.createHash("sha256").update(id).digest("hex");
  function seal(payload: SessionPayload): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from("vaultgate-session-v1"));
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted].map(b => b.toString("base64url")).join(".");
  }
  function open(value: string): SessionPayload | null {
    try {
      const parts = value.split(".");
      if (parts.length !== 3) return null;
      const [iv, tag, data] = parts.map(p => Buffer.from(p, "base64url"));
      if (iv.length !== 12 || tag.length !== 16) return null;
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAAD(Buffer.from("vaultgate-session-v1"));
      decipher.setAuthTag(tag);
      const p = JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")) as SessionPayload;
      if (!p || p.authMethod !== "key" || !/^did:t3n:[0-9a-f]{40}$/i.test(p.did) ||
          !/^0x[0-9a-f]{64}$/i.test(p.privateKey) ||
          !Number.isSafeInteger(p.createdAt) || !Number.isSafeInteger(p.expiresAt) ||
          p.createdAt > now() || p.expiresAt <= now() ||
          p.expiresAt <= p.createdAt || p.expiresAt - p.createdAt > SESSION_TTL_MS) return null;
      return p;
    } catch { return null; }
  }
  async function read(id: string): Promise<SessionPayload | null> {
    if (!validId(id)) return null;
    const raw = await storage.get(storageKey(id)); // Always check authoritative store; never positive-cache.
    if (!raw) return null;
    try {
      const row = JSON.parse(raw);
      return row.state === "active" && typeof row.sealed === "string" ? open(row.sealed) : null;
    } catch { return null; }
  }
  return {
    async issue(did: string, privateKey: string): Promise<{ id: string; payload: SessionPayload }> {
      const id = crypto.randomBytes(32).toString("hex");
      const createdAt = now();
      const payload: SessionPayload = { did, privateKey, authMethod: "key", createdAt, expiresAt: createdAt + SESSION_TTL_MS };
      if (!/^did:t3n:[0-9a-f]{40}$/i.test(did) || !/^0x[0-9a-f]{64}$/i.test(privateKey)) throw new Error("Invalid session identity");
      await storage.set(storageKey(id), JSON.stringify({ state: "active", sealed: seal(payload) }));
      const confirmed = await read(id);
      if (!confirmed) throw new Error("Session creation could not be verified");
      return { id, payload };
    },
    read,
    async revoke(id: string): Promise<void> {
      if (!validId(id)) return;
      // Replace the encrypted credential as well as changing state; revocation is monotonic.
      await storage.set(storageKey(id), JSON.stringify({ state: "revoked", revokedAt: now() }));
      if (await read(id)) throw new Error("Session revocation could not be verified");
    },
  };
}

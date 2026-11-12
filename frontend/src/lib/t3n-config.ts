import { readFileSync } from "fs";
import { resolve } from "path";
import {
  setEnvironment,
  loadWasmComponent,
  resolveTrustAnchor,
  getNodeUrl,
  getContractVersion,
} from "@terminal3/t3n-sdk";

// Load parent .env once if running locally
let envLoaded = false;
export function ensureEnvLoaded(): void {
  if (envLoaded) return;
  envLoaded = true;
  for (const rel of [".env", "../.env"]) {
    try {
      const envPath = resolve(/*turbopackIgnore: true*/ process.cwd(), rel);
      const content = readFileSync(/*turbopackIgnore: true*/ envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq > 0) {
          const k = trimmed.slice(0, eq).trim();
          const v = trimmed.slice(eq + 1).trim();
          if (!process.env[k]) process.env[k] = v;
        }
      }
    } catch {
      // ignore missing .env
    }
  }
}

export const T3N_ENV = (process.env.T3N_ENV as "testnet" | "production" | "sandbox") || "testnet";
export const CONTRACT_TAIL = "credential-vault";
export const DEFAULT_CONTRACT_ID =
  process.env.T3N_CONTRACT_ID ||
  "z:1ac7888746320bff5fb4e9b65cf211632fcf15f4:credential-vault";
export const DEFAULT_CONTRACT_VERSION = process.env.T3N_CONTRACT_VERSION || "0.4.2";
export const DELEGATED_AGENT_PROVIDER = process.env.T3N_AGENT_PROVIDER || "t3n";

const g = globalThis as unknown as {
  __vgWasm?: Promise<Awaited<ReturnType<typeof loadWasmComponent>>>;
  __vgAnchor?: Promise<Awaited<ReturnType<typeof resolveTrustAnchor>>>;
  __vgVersionCache?: { value: string; expiresAt: number };
};

export function initT3nEnv() {
  ensureEnvLoaded();
  setEnvironment(T3N_ENV);
}

export async function getSharedWasm() {
  initT3nEnv();
  if (!g.__vgWasm) {
    g.__vgWasm = loadWasmComponent();
  }
  return g.__vgWasm;
}

export async function getSharedTrustAnchor() {
  initT3nEnv();
  if (!g.__vgAnchor) {
    g.__vgAnchor = resolveTrustAnchor(T3N_ENV);
  }
  return g.__vgAnchor;
}

export function getContractId(): string {
  ensureEnvLoaded();
  return process.env.T3N_CONTRACT_ID || DEFAULT_CONTRACT_ID;
}

export async function getActiveContractVersion(): Promise<string> {
  initT3nEnv();
  const now = Date.now();
  if (g.__vgVersionCache && g.__vgVersionCache.expiresAt > now) {
    return g.__vgVersionCache.value;
  }
  try {
    const v = await getContractVersion(getNodeUrl(), getContractId());
    g.__vgVersionCache = { value: v, expiresAt: now + 60_000 };
    return v;
  } catch {
    return DEFAULT_CONTRACT_VERSION;
  }
}

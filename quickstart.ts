import {
  T3nClient,
  setEnvironment,
  loadWasmComponent,
  eth_get_address,
  metamask_sign,
  createEthAuthInput,
  fetchTrustedManifest,
  TenantClient,
  getNodeUrl,
} from "@terminal3/t3n-sdk";
import { readFileSync } from "fs";

// Load .env file manually (no dotenv dependency)
const envFile = readFileSync(new URL(".env", import.meta.url), "utf-8");
for (const line of envFile.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx > 0) {
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

setEnvironment("testnet");

const T3N_API_KEY = process.env.T3N_API_KEY!;
if (!T3N_API_KEY) {
  console.error("ERROR: T3N_API_KEY not found. Set it in .env file.");
  process.exit(1);
}
console.log("API key loaded, length:", T3N_API_KEY.length, "chars");

const wasmComponent = await loadWasmComponent();
const address = eth_get_address(T3N_API_KEY);

const t3n = new T3nClient({
  trustAnchor: await fetchTrustedManifest("testnet"),
  wasmComponent,
  handlers: {
    EthSign: metamask_sign(address, undefined, T3N_API_KEY),
  },
});

await t3n.handshake();
const did = await t3n.authenticate(createEthAuthInput(address));
const tenantDid = did.value;

console.log("Connected as:", tenantDid);

// --- TenantClient (needed for contract registration) ---
const tenant = new TenantClient({
  t3n,
  baseUrl: getNodeUrl(),
  tenantDid,
});

await tenant.tenant.me();
console.log("TenantClient ready.");

// --- Register TEE Contract ---
import { readFile } from "fs/promises";

// Path to the .wasm file INSIDE the cloned z-tenant-flight folder, relative to quickstart.ts.
const WASM_PATH = "../z-tenant-flight/target/wasm32-wasip2/release/z_tenant_flight.wasm";
const CONTRACT_TAIL = "travel-contracts";
const CONTRACT_VERSION = "0.1.2";

const wasmBytes = await readFile(WASM_PATH);

const result = await tenant.contracts.register({
  tail: CONTRACT_TAIL,
  version: CONTRACT_VERSION,
  wasm: wasmBytes,
});

// This numeric ID is required in the next setup step when you create map ACLs.
const contractId = result.contract_id;
const tenantId = tenantDid.slice("did:t3n:".length);
const scriptName = `z:${tenantId}:${CONTRACT_TAIL}`;

console.log(`registered ${scriptName} as contract id ${contractId}`);

// --- Create KV Map (secrets) ---
await tenant.maps.create({
  tail: "secrets",
  visibility: "private",
  writers: { only: [contractId] },
  readers: { only: [contractId] },  // REQUIRED — kv-governor denies reads when omitted
});
console.log("KV map 'secrets' created (or already exists)");

// --- Seed Duffel API Key into secrets map ---
const DUFFEL_API_KEY = process.env.DUFFEL_API_KEY;
if (!DUFFEL_API_KEY) {
  console.warn("WARNING: DUFFEL_API_KEY not set in .env — skipping seed.");
  console.warn("  Get a test key at https://app.duffel.com/join");
  console.warn("  Then add DUFFEL_API_KEY=your_key to .env");
} else {
  await tenant.executeControl("map-entry-set", {
    map_name: tenant.canonicalName("secrets"),
    key: "duffel_api_key",
    value: DUFFEL_API_KEY,
  });
  console.log("API key sealed in z:<tid>:secrets — not visible outside the TEE");
}

// --- Invoke TEE Contract (self-call) ---
import {
  getContractVersion,
  getNodeUrl as getNodeUrlFn,
} from "@terminal3/t3n-sdk";

const TENANT_SCRIPT = `z:${tenantDid.slice("did:t3n:".length)}:travel-contracts`;
const scriptVersion = await getContractVersion(getNodeUrlFn(), TENANT_SCRIPT);
console.log(`contract version: ${scriptVersion}`);

// Self-call: user invokes the contract directly (agentDid = user's own DID)
const userContractVersion = await getContractVersion(getNodeUrlFn(), "tee:user/contracts");
await t3n.execute({
  contract_id: "tee:user/contracts",
  contract_version: userContractVersion,
  function_name: "agent-auth-update",
  input: {
    agents: [{
      agentDid: tenantDid,  // self-grant
      scripts: [{
        scriptName: TENANT_SCRIPT,
        versionReq: scriptVersion,
        functions: ["search-offers", "book-offer"],
        allowedHosts: ["api.duffel.com"],
      }],
    }],
  },
});
console.log("self-grant authorized");

// Invoke search-offers
const searchResult = await t3n.executeAndDecode({
  contract_id: TENANT_SCRIPT,
  contract_version: scriptVersion,
  function_name: "search-offers",
  input: { origin: "LHR", destination: "JFK", departure_date: "2026-07-15", cabin_class: "economy", adult_count: 1 },
});
console.log("search-offers result:", JSON.stringify(searchResult, null, 2));

/**
 * STEP 2: Integration test for credential-vault TEE contract.
 * Registers the WASM, creates KV maps, and tests all 4 functions.
 */

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
  getContractVersion,
} from "@terminal3/t3n-sdk";
import { readFileSync } from "fs";
import { readFile } from "fs/promises";

// --- Load .env ---
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
  console.error("ERROR: T3N_API_KEY not found.");
  process.exit(1);
}

// --- Step 1: Authenticate ---
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
console.log("1. Connected as:", tenantDid);

// --- Step 2: TenantClient ---
const tenant = new TenantClient({
  t3n,
  baseUrl: getNodeUrl(),
  tenantDid,
});

await tenant.tenant.me();
console.log("2. TenantClient ready.");

// --- Step 3: Register credential-vault contract ---
const WASM_PATH = "./credential-vault/target/wasm32-wasip2/release/z_credential_vault.wasm";
const CONTRACT_TAIL = "credential-vault";
const CONTRACT_VERSION = "0.3.0";

const wasmBytes = await readFile(WASM_PATH);
const tenantId = tenantDid.slice("did:t3n:".length);
const scriptName = `z:${tenantId}:${CONTRACT_TAIL}`;
const scriptVersion = await getContractVersion(getNodeUrl(), scriptName);

let contractId: number | null = null;
let aclNeedsUpdate = false;

try {
  const regResult = await tenant.contracts.register({
    tail: CONTRACT_TAIL,
    version: CONTRACT_VERSION,
    wasm: wasmBytes,
  });
  contractId = regResult.contract_id;
  aclNeedsUpdate = true; // fresh registration needs ACL setup
  console.log(`3. Registered ${scriptName} v${CONTRACT_VERSION} as contract id ${contractId}`);
} catch (e: any) {
  // Contract already exists at this version
  console.log(`3. Contract ${scriptName} already registered at v${scriptVersion}`);
  
  // Probe: can the contract read its own map?
  try {
    await t3n.executeAndDecode({
      contract_id: scriptName,
      contract_version: scriptVersion,
      function_name: "list-credentials",
      input: {},
    });
    console.log("   ACL is working — no update needed.");
  } catch (probeErr: any) {
    // ACL broken — extract contract_id from error and update
    const match = (probeErr.message || "").match(/\/(\d+)\)/);
    if (match) {
      contractId = parseInt(match[1]);
      aclNeedsUpdate = true;
      console.log(`   ACL broken. Contract id: ${contractId}. Will fix.`);
    } else {
      console.error("   Cannot determine contract_id:", probeErr.message?.slice(0, 200));
      process.exit(1);
    }
  }
}

// --- Step 4: Create/update KV maps with ACLs (only if needed) ---
if (aclNeedsUpdate && contractId) {
  console.log(`4. Updating map ACLs for contract ${contractId}...`);
  for (const tail of ["credentials", "activity-log"]) {
    try {
      await tenant.maps.create({
        tail,
        visibility: "private",
        writers: { only: [contractId] },
        readers: { only: [contractId] },
      });
      console.log(`   Map '${tail}' created.`);
    } catch (e: any) {
      try {
        await tenant.maps.update(tail, {
          writers: { only: [contractId] },
          readers: { only: [contractId] },
        });
        console.log(`   Map '${tail}' ACL updated.`);
      } catch (e2: any) {
        console.log(`   Map '${tail}' update failed:`, e2.message?.slice(0, 100));
      }
    }
  }
} else if (!aclNeedsUpdate) {
  console.log("4. Skipping map ACL update (already correct).");
}

// --- Step 5: Self-grant (user authorizes themselves) ---
console.log(`5. Contract version: ${scriptVersion}`);

const userContractVersion = await getContractVersion(getNodeUrl(), "tee:user/contracts");
await t3n.execute({
  contract_id: "tee:user/contracts",
  contract_version: userContractVersion,
  function_name: "agent-auth-update",
  input: {
    agents: [{
      agentDid: tenantDid,  // self-grant
      scripts: [{
        scriptName: scriptName,
        versionReq: scriptVersion,
        functions: ["store-credential", "list-credentials", "send-email", "get-activity-log"],
        allowedHosts: ["api.resend.com"],
      }],
    }],
  },
});
console.log("6. Self-grant authorized for all 4 functions.");

// --- Step 6: Test list-credentials (should be empty) ---
console.log("\n=== TEST: list-credentials (empty) ===");
try {
  const listResult = await t3n.executeAndDecode({
    contract_id: scriptName,
    contract_version: scriptVersion,
    function_name: "list-credentials",
    input: {},
  });
  console.log("Result:", JSON.stringify(listResult, null, 2));
} catch (e: any) {
  console.log("Error:", e.message?.slice(0, 200));
}

// --- Step 7: Test get-activity-log (should be empty) ===
console.log("\n=== TEST: get-activity-log (empty) ===");
try {
  const logResult = await t3n.executeAndDecode({
    contract_id: scriptName,
    contract_version: scriptVersion,
    function_name: "get-activity-log",
    input: { limit: 10 },
  });
  console.log("Result:", JSON.stringify(logResult, null, 2));
} catch (e: any) {
  console.log("Error:", e.message?.slice(0, 200));
}

// --- Step 8: Test store-credential with dummy data ---
console.log("\n=== TEST: store-credential (dummy) ===");
try {
  const storeResult = await t3n.executeAndDecode({
    contract_id: scriptName,
    contract_version: scriptVersion,
    function_name: "store-credential",
    input: {
      name: "resend-test",
      api_key: "re_dummy_key_1234567890",
      service: "resend",
      host: "api.resend.com",
    },
  });
  console.log("Result:", JSON.stringify(storeResult, null, 2));
} catch (e: any) {
  console.log("Error:", e.message?.slice(0, 200));
}

// --- Step 9: Test list-credentials (should show 1 entry, NO api_key) ---
console.log("\n=== TEST: list-credentials (after store) ===");
try {
  const listResult = await t3n.executeAndDecode({
    contract_id: scriptName,
    contract_version: scriptVersion,
    function_name: "list-credentials",
    input: {},
  });
  console.log("Result:", JSON.stringify(listResult, null, 2));

  // Security check: verify no api_key in output
  const resultStr = JSON.stringify(listResult);
  if (resultStr.includes("api_key") || resultStr.includes("SG.")) {
    console.error("!!! SECURITY VIOLATION: api_key found in list-credentials output !!!");
  } else {
    console.log("✓ SECURITY CHECK PASSED: No API key in list-credentials output");
  }
} catch (e: any) {
  console.log("Error:", e.message?.slice(0, 200));
}

// --- Step 10: Test store-credential rejects unsupported service ---
console.log("\n=== TEST: store-credential (reject unsupported service) ===");
try {
  const storeResult = await t3n.executeAndDecode({
    contract_id: scriptName,
    contract_version: scriptVersion,
    function_name: "store-credential",
    input: {
      name: "stripe-test",
      api_key: "sk_test_1234567890",
      service: "stripe",
      host: "api.stripe.com",
    },
  });
  console.log("Result (should not reach here):", JSON.stringify(storeResult, null, 2));
} catch (e: any) {
  console.log("Expected error:", e.message?.slice(0, 200));
}

console.log("\n=== INTEGRATION TEST COMPLETE ===");

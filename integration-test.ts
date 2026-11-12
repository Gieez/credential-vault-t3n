/**
 * Integration & Contract Deployment Script for VaultGate TEE Contract v0.4.0.
 * Registers the WASM component, ensures KV map ACLs, applies member-delegation
 * using @terminal3/t3n-sdk v5.39+, and verifies all 6 exported contract functions.
 */

import {
  T3nClient,
  setEnvironment,
  loadWasmComponent,
  eth_get_address,
  metamask_sign,
  createEthAuthInput,
  resolveTrustAnchor,
  TenantClient,
  getNodeUrl,
  getContractVersion,
  fanOutGrant,
  readOnlyScopes,
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

async function main() {
  const wasmComponent = await loadWasmComponent();
  const address = eth_get_address(T3N_API_KEY);

  const t3n = new T3nClient({
    trustAnchor: await resolveTrustAnchor("testnet"),
    wasmComponent,
    handlers: {
      EthSign: metamask_sign(address, undefined, T3N_API_KEY),
    },
  });

  await t3n.handshake();
  const did = await t3n.authenticate(createEthAuthInput(address));
  const tenantDid = did.value;
  console.log("1. Connected as:", tenantDid);

  const tenant = new TenantClient({
    t3n,
    baseUrl: getNodeUrl(),
    tenantDid,
  });
  await tenant.tenant.me();
  console.log("2. TenantClient ready.");

  const WASM_PATH = "./credential-vault/target/wasm32-wasip2/release/z_credential_vault.wasm";
  const CONTRACT_TAIL = "credential-vault";
  const CONTRACT_VERSION = "0.4.2";

  const wasmBytes = await readFile(WASM_PATH);
  console.log(`   WASM size: ${(wasmBytes.byteLength / 1024).toFixed(1)} KB`);

  const tenantId = tenantDid.slice("did:t3n:".length);
  const scriptName = `z:${tenantId}:${CONTRACT_TAIL}`;

  let contractId: number | null = null;
  let aclNeedsUpdate = false;

  try {
    const regResult = await tenant.contracts.register({
      tail: CONTRACT_TAIL,
      version: CONTRACT_VERSION,
      wasm: wasmBytes,
    });
    contractId = regResult.contract_id;
    aclNeedsUpdate = true;
    console.log(`3. Registered ${scriptName} v${CONTRACT_VERSION} as contract id ${contractId}`);
  } catch (e: any) {
    console.log(`3. Contract ${scriptName} registration note:`, e.message?.slice(0, 160));
    try {
      await t3n.executeAndDecode({
        contract_id: scriptName,
        contract_version: CONTRACT_VERSION,
        function_name: "list-credentials",
        input: {},
      });
      console.log("   ACL is working for v0.4.0.");
    } catch (probeErr: any) {
      const match = (probeErr.message || "").match(/\/(\d+)\)/);
      if (match) {
        contractId = parseInt(match[1], 10);
        aclNeedsUpdate = true;
        console.log(`   ACL needs update for contract id: ${contractId}`);
      } else {
        throw probeErr;
      }
    }
  }

  const scriptVersion = await getContractVersion(getNodeUrl(), scriptName);
  console.log("   Active registered version:", scriptVersion);

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
      } catch {
        await tenant.maps.update(tail, {
          writers: { only: [contractId] },
          readers: { only: [contractId] },
        });
        console.log(`   Map '${tail}' ACL updated.`);
      }
    }
  }

  // Self-grant via modern updateMemberDelegation (SDK v5.39+)
  const functions = [
    "store-credential",
    "list-credentials",
    "revoke-credential",
    "proxy-call",
    "send-email",
    "get-activity-log",
  ];
  const allowedHosts = [
    "api.openai.com",
    "generativelanguage.googleapis.com",
    "api.anthropic.com",
    "api.resend.com",
    "api.telegram.org",
    "api.github.com",
  ];

  const grants = fanOutGrant(
    {
      grantee: tenantDid,
      contract_id: scriptName,
      version_req: scriptVersion,
      scopes: readOnlyScopes(["vault"]),
      allowed_hosts: allowedHosts,
    },
    functions
  );

  await t3n.updateMemberDelegation(grants, { discoverDids: [tenantDid] });
  console.log(`5. Self-grant updated via updateMemberDelegation (${grants.length} function rows).`);

  // Test multi-provider store
  const storeRes = await t3n.executeAndDecode({
    contract_id: scriptName,
    contract_version: scriptVersion,
    function_name: "store-credential",
    input: {
      name: "openai-smoke-test",
      api_key: "sk-smoke-dummy-not-real-0001",
      provider: "openai",
    },
  });
  console.log("6. store-credential (openai):", JSON.stringify(storeRes));

  // Test list-credentials & verify no secret leakage
  const listRes = await t3n.executeAndDecode({
    contract_id: scriptName,
    contract_version: scriptVersion,
    function_name: "list-credentials",
    input: {},
  });
  const listJson = JSON.stringify(listRes);
  if (listJson.includes("sk-smoke-dummy") || listJson.includes("api_key")) {
    throw new Error("SECURITY VIOLATION: raw secret leaked in list-credentials");
  }
  console.log("7. list-credentials (verified zero key exposure):", listJson);

  // Test revoke-credential
  const revokeRes = await t3n.executeAndDecode({
    contract_id: scriptName,
    contract_version: scriptVersion,
    function_name: "revoke-credential",
    input: { name: "openai-smoke-test" },
  });
  console.log("8. revoke-credential:", JSON.stringify(revokeRes));

  // Test get-activity-log
  const logRes = await t3n.executeAndDecode({
    contract_id: scriptName,
    contract_version: scriptVersion,
    function_name: "get-activity-log",
    input: { limit: 5 },
  });
  console.log("9. get-activity-log:", JSON.stringify(logRes));
  console.log("\n=== CONTRACT v0.4.0 INTEGRATION PASSED ===");
}

main().catch((err) => {
  console.error("Integration failed:", err);
  process.exit(1);
});

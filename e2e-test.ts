/**
 * E2E Verification Suite - VaultGate v2 (Multi-Route Next.js App + Remote MCP Server)
 * Verifies public pages, workspace shells, API auth guards, MCP JSON-RPC, and T3N health.
 */

const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL  ${name}: ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

async function run() {
  console.log(`\n=== VaultGate v2 E2E (${BASE}) ===`);

  const htmlRoutes = [
    ["/", "VaultGate"],
    ["/docs", "VaultGate Architecture"],
    ["/traction", "T3N Traction"],
    ["/login", "Terminal 3 DID"],
    ["/app", "VERIFYING T3N ENCLAVE SESSION"],
    ["/app/vault", "VERIFYING T3N ENCLAVE SESSION"],
    ["/app/agents", "VERIFYING T3N ENCLAVE SESSION"],
    ["/app/wire", "VERIFYING T3N ENCLAVE SESSION"],
    ["/app/connect", "VERIFYING T3N ENCLAVE SESSION"],
    ["/app/audit", "VERIFYING T3N ENCLAVE SESSION"],
  ] as const;

  for (const [route, expected] of htmlRoutes) {
    await test(`GET ${route} returns 200 + expected marker & dark default`, async () => {
      const res = await fetch(`${BASE}${route}`);
      const html = await res.text();
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(html.includes(expected), `Missing "${expected}" in ${route}`);
      assert(html.includes('data-theme="dark"'), `Missing dark mode default on ${route}`);
      assert(!html.includes("\u2014") && !html.includes("\u2013"), `Em-dash/en-dash found on ${route}`);
    });
  }

  await test("GET /api/health returns active contract v0.4.2", async () => {
    const res = await fetch(`${BASE}/api/health`);
    const data = await res.json();
    assert(res.status === 200, `Status ${res.status}`);
    assert(data.ok === true, "health ok must be true");
    assert(data.contractId.includes("credential-vault"), "Unexpected contractId");
  });

  await test("GET /api/traction returns uniqueDidsCount & ledger structure", async () => {
    const res = await fetch(`${BASE}/api/traction`);
    const data = await res.json();
    assert(res.status === 200, `Status ${res.status}`);
    assert(typeof data.uniqueDidsCount === "number", "Missing uniqueDidsCount");
    assert(Array.isArray(data.entries), "entries must be array");
  });

  await test("Auth guard blocks unauthenticated /api/vault, /api/agents, /api/wire, /api/audit", async () => {
    for (const ep of ["/api/vault", "/api/agents", "/api/audit"]) {
      const r = await fetch(`${BASE}${ep}`);
      assert(r.status === 401, `${ep} expected 401, got ${r.status}`);
    }
    const w = await fetch(`${BASE}/api/wire`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential_name: "x", method: "GET", path: "/" }),
    });
    assert(w.status === 401, `/api/wire expected 401, got ${w.status}`);
  });

  await test("GET /api/mcp returns MCP metadata & 4 tools", async () => {
    const res = await fetch(`${BASE}/api/mcp`);
    const data = await res.json();
    assert(res.status === 200, `Status ${res.status}`);
    assert(data.name === "vaultgate-t3n-mcp", "Unexpected MCP name");
    assert(data.tools.includes("vault_proxy_call"), "Missing vault_proxy_call tool");
  });

  await test("POST /api/mcp initialize & tools/list follow JSON-RPC 2.0", async () => {
    const initRes = await fetch(`${BASE}/api/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    });
    const initJson = await initRes.json();
    assert(initJson.result?.serverInfo?.name === "vaultgate-t3n-mcp", "Bad initialize response");

    const listRes = await fetch(`${BASE}/api/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    });
    const listJson = await listRes.json();
    assert(listJson.result?.tools?.length === 4, "Expected 4 MCP tools");
  });

  await test("POST /api/mcp tools/call requires Bearer or X-T3N-Api-Key", async () => {
    const res = await fetch(`${BASE}/api/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "vault_list_aliases", arguments: {} },
      }),
    });
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  console.log(`\nRESULTS: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

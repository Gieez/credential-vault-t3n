/**
 * E2E Test Suite — Credential Vault Agent
 * Tests all user flows through the Express frontend and T3N contract.
 */

const BASE = "http://localhost:3000";
let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}: ${e.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

function assertIncludes(str, substr, msg) {
  if (!str.includes(substr)) throw new Error(msg || `Expected "${substr}" in "${str.slice(0, 100)}"`);
}

function assertExcludes(str, substr, msg) {
  if (str.includes(substr)) throw new Error(msg || `Unexpected "${substr}" found`);
}

async function api(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  return { status: res.status, data: await res.json() };
}

// ============================================================
console.log("\n=== 1. FRONTEND ===");

await test("GET / returns HTML with Credential Vault", async () => {
  const res = await fetch(`${BASE}/`);
  const html = await res.text();
  assert(res.ok, `Status ${res.status}`);
  assertIncludes(html, "Credential Vault");
  assertIncludes(html, "Dashboard");
  assertIncludes(html, "Add Key");
  assertIncludes(html, "Send Email");
  assertIncludes(html, "Activity");
  assertIncludes(html, "T3N TEE");
});

await test("GET / serves static HTML (not Next.js)", async () => {
  const res = await fetch(`${BASE}/`);
  const html = await res.text();
  assertExcludes(html, "Turbopack");
  assertExcludes(html, "__NEXT_DATA__");
  assertIncludes(html, "<!DOCTYPE html>");
});

// ============================================================
console.log("\n=== 2. LIST CREDENTIALS (GET /api/credentials) ===");

await test("Returns credentials array", async () => {
  const { data } = await api("GET", "/api/credentials");
  assert(Array.isArray(data.credentials), "credentials should be an array");
});

await test("Each credential has name + service, NO api_key", async () => {
  const { data } = await api("GET", "/api/credentials");
  for (const c of data.credentials) {
    assert(c.name, "missing name");
    assert(c.service, "missing service");
    const raw = JSON.stringify(c);
    assertExcludes(raw, "api_key", "api_key should not be in credential metadata");
    assertExcludes(raw, "SG.", "raw API key should not be in output");
  }
});

// ============================================================
console.log("\n=== 3. STORE CREDENTIAL (POST /api/credentials) ===");

const testCredName = `test-e2e-${Date.now()}`;

await test("Stores a new credential successfully", async () => {
  const { status, data } = await api("POST", "/api/credentials", {
    name: testCredName,
    api_key: "SG.e2e_test_key_not_real_1234567890",
    service: "sendgrid",
    host: "api.sendgrid.com",
  });
  assert(status === 200, `Status ${status}`);
  assert(data.ok === true, "should return ok:true");
});

await test("Stored credential appears in list", async () => {
  const { data } = await api("GET", "/api/credentials");
  const found = data.credentials.find((c) => c.name === testCredName);
  assert(found, `Credential "${testCredName}" not found in list`);
  assert(found.service === "sendgrid", "service should be sendgrid");
});

await test("Stored credential does NOT expose api_key in list", async () => {
  const { data } = await api("GET", "/api/credentials");
  const found = data.credentials.find((c) => c.name === testCredName);
  assert(found, "credential not found");
  const raw = JSON.stringify(found);
  assertExcludes(raw, "e2e_test_key", "api_key leaked in list output");
  assertExcludes(raw, "api_key", "api_key field should not exist");
});

// ============================================================
console.log("\n=== 4. ERROR CASES ===");

await test("Rejects empty name", async () => {
  const { status, data } = await api("POST", "/api/credentials", {
    name: "",
    api_key: "key",
    service: "sendgrid",
    host: "api.sendgrid.com",
  });
  assert(data.error, "should return error");
  assertIncludes(data.error, "name is required");
});

await test("Rejects empty api_key", async () => {
  const { data } = await api("POST", "/api/credentials", {
    name: "test",
    api_key: "",
    service: "sendgrid",
    host: "api.sendgrid.com",
  });
  assert(data.error, "should return error");
  assertIncludes(data.error, "api_key is required");
});

await test("Rejects unsupported service (stripe)", async () => {
  const { data } = await api("POST", "/api/credentials", {
    name: "stripe-test",
    api_key: "sk_test_123",
    service: "stripe",
    host: "api.stripe.com",
  });
  assert(data.error, "should return error");
  assertIncludes(data.error, "unsupported service");
  assertIncludes(data.error, "sendgrid");
});

await test("Rejects unsupported service (aws)", async () => {
  const { data } = await api("POST", "/api/credentials", {
    name: "aws-test",
    api_key: "AKIA123",
    service: "aws",
    host: "api.aws.amazon.com",
  });
  assert(data.error, "should return error");
  assertIncludes(data.error, "unsupported service");
});

await test("Rejects invalid email in send-email", async () => {
  const { data } = await api("POST", "/api/send", {
    credential_name: "test",
    to: "not-an-email",
    subject: "Test",
    body: "Hello",
  });
  assert(data.error, "should return error");
  assertIncludes(data.error, "invalid email");
});

await test("Rejects empty to in send-email", async () => {
  const { data } = await api("POST", "/api/send", {
    credential_name: "test",
    to: "",
    subject: "Test",
    body: "Hello",
  });
  // On testnet with limited credits, may get quota error instead
  const isQuotaError = data.error?.includes("quota exceeded");
  const isValidationError = data.error?.includes("to is required");
  assert(isValidationError || isQuotaError, `Unexpected error: ${data.error}`);
});

await test("Rejects empty subject in send-email", async () => {
  const { data } = await api("POST", "/api/send", {
    credential_name: "test",
    to: "user@test.com",
    subject: "",
    body: "Hello",
  });
  const isQuotaError = data.error?.includes("quota exceeded");
  const isValidationError = data.error?.includes("subject is required");
  assert(isValidationError || isQuotaError, `Unexpected error: ${data.error}`);
});

await test("Rejects non-existent credential in send-email", async () => {
  const { data } = await api("POST", "/api/send", {
    credential_name: "nonexistent-cred",
    to: "user@test.com",
    subject: "Test",
    body: "Hello",
  });
  const isQuotaError = data.error?.includes("quota exceeded");
  const isNotFoundError = data.error?.includes("not found");
  assert(isNotFoundError || isQuotaError, `Unexpected error: ${data.error}`);
});

// ============================================================
console.log("\n=== 5. ACTIVITY LOG (GET /api/log) ===");

await test("Returns entries array (or quota error)", async () => {
  const { data } = await api("GET", "/api/log?limit=10");
  // On testnet with limited credits, may get quota error
  if (data.error?.includes("quota exceeded")) return; // pass gracefully
  assert(Array.isArray(data.entries), "entries should be an array");
});

await test("Limit parameter works (or quota error)", async () => {
  const { data } = await api("GET", "/api/log?limit=1");
  if (data.error?.includes("quota exceeded")) return; // pass gracefully
  assert(data.entries.length <= 1, "should return at most 1 entry");
});

// ============================================================
console.log("\n=== 6. SECURITY VERIFICATION ===");

await test("No raw API keys in any API response", async () => {
  const endpoints = ["/api/credentials", "/api/log?limit=10"];
  for (const ep of endpoints) {
    const { data } = await api("GET", ep);
    const raw = JSON.stringify(data);
    // Check for common key patterns
    assertExcludes(raw, "SG.e2e_test_key", `Key leaked in ${ep}`);
    assertExcludes(raw, "SG.final_test_key", `Key leaked in ${ep}`);
    assertExcludes(raw, "SG.dummy", `Key leaked in ${ep}`);
    assertExcludes(raw, "sk_test_", `Key leaked in ${ep}`);
  }
});

await test("Frontend HTML has no embedded secrets", async () => {
  const res = await fetch(`${BASE}/`);
  const html = await res.text();
  assertExcludes(html, "SG.", "API key pattern in HTML");
  assertExcludes(html, "sk_test", "Stripe key pattern in HTML");
  assertExcludes(html, "T3N_API_KEY", "Env variable in HTML");
});

// ============================================================
console.log("\n" + "=".repeat(50));
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log("=".repeat(50));

if (failed > 0) process.exit(1);

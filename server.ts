/**
 * Credential Vault — Express Server
 * Serves the frontend and API routes for the T3N credential vault agent.
 */

import express from "express";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
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

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Load .env ---
const envPath = resolve(__dirname, ".env");
try {
  const envFile = readFileSync(envPath, "utf-8");
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
} catch {}

setEnvironment("testnet");

// --- T3N Client singleton ---
let _t3n: T3nClient | null = null;
let _scriptName: string | null = null;
let _scriptVersion: string | null = null;

async function getT3N() {
  if (_t3n) return { t3n: _t3n, scriptName: _scriptName!, scriptVersion: _scriptVersion! };

  const T3N_API_KEY = process.env.T3N_API_KEY;
  if (!T3N_API_KEY) throw new Error("T3N_API_KEY not set");

  const wasmComponent = await loadWasmComponent();
  const address = eth_get_address(T3N_API_KEY);

  _t3n = new T3nClient({
    trustAnchor: await fetchTrustedManifest("testnet"),
    wasmComponent,
    handlers: { EthSign: metamask_sign(address, undefined, T3N_API_KEY) },
  });

  await _t3n.handshake();
  const did = await _t3n.authenticate(createEthAuthInput(address));
  const tenantDid = did.value;
  const tenantId = tenantDid.slice("did:t3n:".length);
  _scriptName = `z:${tenantId}:credential-vault`;

  try {
    _scriptVersion = await getContractVersion(getNodeUrl(), _scriptName);
  } catch {
    _scriptVersion = "0.1.0";
  }

  console.log(`T3N connected: ${tenantDid}`);
  console.log(`Contract: ${_scriptName} v${_scriptVersion}`);

  return { t3n: _t3n, scriptName: _scriptName, scriptVersion: _scriptVersion };
}

// --- Express App ---
const app = express();
app.use(express.json());
app.use(express.static(resolve(__dirname, "public")));

// API Routes
app.get("/api/credentials", async (req, res) => {
  try {
    const { t3n, scriptName, scriptVersion } = await getT3N();
    const result = await t3n.executeAndDecode({
      contract_id: scriptName, contract_version: scriptVersion,
      function_name: "list-credentials", input: {},
    });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/credentials", async (req, res) => {
  try {
    const { t3n, scriptName, scriptVersion } = await getT3N();
    const result = await t3n.executeAndDecode({
      contract_id: scriptName, contract_version: scriptVersion,
      function_name: "store-credential",
      input: { name: req.body.name, api_key: req.body.api_key, service: req.body.service || "sendgrid", host: req.body.host || "api.sendgrid.com" },
    });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/send", async (req, res) => {
  try {
    const { t3n, scriptName, scriptVersion } = await getT3N();
    const result = await t3n.executeAndDecode({
      contract_id: scriptName, contract_version: scriptVersion,
      function_name: "send-email",
      input: { credential_name: req.body.credential_name, to: req.body.to, subject: req.body.subject, body: req.body.body },
    });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/log", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const { t3n, scriptName, scriptVersion } = await getT3N();
    const result = await t3n.executeAndDecode({
      contract_id: scriptName, contract_version: scriptVersion,
      function_name: "get-activity-log", input: { limit },
    });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// SPA fallback
app.get("/{*splat}", (req, res) => {
  res.sendFile(resolve(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Credential Vault running at http://localhost:${PORT}`);
});

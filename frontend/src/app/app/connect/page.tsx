"use client";

import { useState } from "react";
import { AppShell, type SessionUser } from "@/components/AppShell";

function ConnectContent({ user }: { user: SessionUser }) {
  const [clientTab, setClientTab] = useState<"claude" | "hermes" | "curl">("claude");
  const [copied, setCopied] = useState(false);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://your-deployment.vercel.app";

  const snippets = {
    claude: {
      label: "claude_desktop_config.json / .cursor/mcp.json",
      code: JSON.stringify(
        {
          mcpServers: {
            vaultgate: {
              url: `${origin}/api/mcp`,
              headers: {
                Authorization: "Bearer <T3N_OAUTH_BEARER_OR_X_T3N_API_KEY>",
                "X-T3N-Owner-Did": user.did,
              },
            },
          },
        },
        null,
        2
      ),
    },
    hermes: {
      label: "Hermes Agent / OpenClaw MCP Config",
      code: `mcp_servers:\n  vaultgate:\n    transport: streamable-http\n    url: ${origin}/api/mcp\n    headers:\n      Authorization: Bearer <T3N_OAUTH_BEARER_TOKEN>\n      X-T3N-Owner-Did: ${user.did}`,
    },
    curl: {
      label: "Direct MCP JSON-RPC 2.0 Test (tools/call)",
      code: `curl -X POST ${origin}/api/mcp \\\n  -H "Content-Type: application/json" \\\n  -H "X-T3N-Api-Key: <YOUR_AGENT_API_KEY>" \\\n  -H "X-T3N-Owner-Did: ${user.did}" \\\n  -d '{\n    "jsonrpc": "2.0",\n    "id": 1,\n    "method": "tools/call",\n    "params": {\n      "name": "vault_list_aliases",\n      "arguments": {}\n    }\n  }'`,
    },
  };

  function copy() {
    navigator.clipboard?.writeText(snippets[clientTab].code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="space-y-5">
      <div className="border-b hairline pb-4">
        <p className="font-mono text-[11px] uppercase text-muted">04 / Client Distribution</p>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          1-Click MCP &amp; CLI Config
        </h1>
        <p className="text-sm text-muted mt-1 max-w-[60ch]">
          Connect Claude Desktop, Cursor, or Hermes to your VaultGate enclave without placing raw third-party API keys in local config files.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["claude", "Claude / Cursor MCP"],
            ["hermes", "Hermes Agent"],
            ["curl", "cURL / HTTP Test"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setClientTab(k)}
            className={`px-3 py-1.5 font-mono text-xs border cursor-pointer ${
              clientTab === k
                ? "border-seal bg-elevated text-ink font-semibold"
                : "border-[var(--border-rule)] bg-panel text-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="bg-elevated border hairline-strong p-5">
        <div className="flex items-center justify-between pb-3 mb-3 border-b hairline">
          <span className="font-mono text-xs text-muted">{snippets[clientTab].label}</span>
          <button
            type="button"
            onClick={copy}
            className="px-3 py-1 bg-seal text-white font-mono text-[11px] uppercase cursor-pointer"
          >
            {copied ? "Copied" : "Copy Config"}
          </button>
        </div>
        <pre className="font-mono text-xs leading-relaxed overflow-x-auto text-ink">
          {snippets[clientTab].code}
        </pre>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-panel border hairline p-4 space-y-2">
          <p className="font-mono text-[11px] uppercase text-muted">Exposed MCP Tools</p>
          <ul className="space-y-1 font-mono text-xs text-ink">
            <li>1. vault_whoami()</li>
            <li>2. vault_list_aliases()</li>
            <li>3. vault_proxy_call(credential_name, method, path, body)</li>
            <li>4. vault_audit_recent(limit)</li>
          </ul>
        </div>
        <div className="bg-panel border hairline p-4 space-y-2">
          <p className="font-mono text-[11px] uppercase text-muted">Active Contract Target</p>
          <p className="font-mono text-xs text-ink break-all">{user.contractId}</p>
          <p className="font-mono text-xs text-muted">Version: v{user.contractVersion}</p>
        </div>
      </div>
    </div>
  );
}

export default function AppConnectPage() {
  return <AppShell>{({ user }) => <ConnectContent user={user} />}</AppShell>;
}

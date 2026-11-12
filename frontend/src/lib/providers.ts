export interface ProviderPreset {
  id: "openai" | "gemini" | "anthropic" | "resend" | "telegram" | "github" | "webhook";
  label: string;
  defaultHost: string;
  authScheme: "bearer" | "x-api-key" | "x-goog-api-key" | "telegram-bot" | "custom-header";
  headerName: string;
  sampleMethod: "GET" | "POST";
  samplePath: string;
  sampleBody: Record<string, unknown> | null;
  placeholderHint: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "openai",
    label: "OpenAI",
    defaultHost: "api.openai.com",
    authScheme: "bearer",
    headerName: "Authorization",
    sampleMethod: "POST",
    samplePath: "/v1/responses",
    sampleBody: {
      model: "gpt-4.1-mini",
      input: "Return OK if this TEE proxy call succeeded.",
    },
    placeholderHint: "sk-proj-...",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    defaultHost: "generativelanguage.googleapis.com",
    authScheme: "x-goog-api-key",
    headerName: "x-goog-api-key",
    sampleMethod: "POST",
    samplePath: "/v1beta/models/gemini-2.5-flash:generateContent",
    sampleBody: {
      contents: [{ parts: [{ text: "Reply with one word: VERIFIED" }] }],
    },
    placeholderHint: "AIza...",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    defaultHost: "api.anthropic.com",
    authScheme: "x-api-key",
    headerName: "x-api-key",
    sampleMethod: "POST",
    samplePath: "/v1/messages",
    sampleBody: {
      model: "claude-sonnet-4-20250514",
      max_tokens: 64,
      messages: [{ role: "user", content: "Ping" }],
    },
    placeholderHint: "sk-ant-...",
  },
  {
    id: "resend",
    label: "Resend Email",
    defaultHost: "api.resend.com",
    authScheme: "bearer",
    headerName: "Authorization",
    sampleMethod: "POST",
    samplePath: "/emails",
    sampleBody: {
      from: "VaultGate <onboarding@resend.dev>",
      to: ["{{profile.verified_contacts.email.value}}"],
      subject: "VaultGate TEE Verification",
      text: "Sent directly from Terminal 3 enclave without exposing your Resend key.",
    },
    placeholderHint: "re_...",
  },
  {
    id: "telegram",
    label: "Telegram Bot API",
    defaultHost: "api.telegram.org",
    authScheme: "telegram-bot",
    headerName: "Authorization",
    sampleMethod: "GET",
    samplePath: "/getMe",
    sampleBody: null,
    placeholderHint: "123456789:AAH...",
  },
  {
    id: "github",
    label: "GitHub REST",
    defaultHost: "api.github.com",
    authScheme: "bearer",
    headerName: "Authorization",
    sampleMethod: "GET",
    samplePath: "/user",
    sampleBody: null,
    placeholderHint: "ghp_...",
  },
  {
    id: "webhook",
    label: "Custom HTTPS Webhook",
    defaultHost: "",
    authScheme: "bearer",
    headerName: "Authorization",
    sampleMethod: "POST",
    samplePath: "/post",
    sampleBody: { event: "vaultgate.ping", source: "t3n-tee" },
    placeholderHint: "whsec_...",
  },
];

export const ALL_CONTRACT_FUNCTIONS = [
  "store-credential",
  "list-credentials",
  "revoke-credential",
  "proxy-call",
  "send-email",
  "get-activity-log",
];

export const DEFAULT_ALLOWED_HOSTS = PROVIDER_PRESETS.map((p) => p.defaultHost).filter(Boolean);

export function getPreset(provider: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === provider.toLowerCase());
}

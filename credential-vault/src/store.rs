//! store_credential: Saves an API key into the TEE-encrypted KV map,
//! scoped strictly to the resolved owner DID (`u:<owner_hex>:<name>`).

use alloc::format;
use alloc::string::{String, ToString};
use alloc::vec::Vec;

#[derive(serde::Deserialize)]
pub struct StoreCredentialReq {
    pub name: String,
    pub api_key: String,
    #[serde(alias = "service")]
    pub provider: String,
    pub host: Option<String>,
    pub auth_scheme: Option<String>,
    pub header_name: Option<String>,
}

#[derive(serde::Serialize)]
pub struct StoreCredentialResp {
    pub ok: bool,
    pub name: String,
    pub provider: String,
    pub host: String,
    pub auth_scheme: String,
}

#[derive(Clone, Copy)]
pub struct ProviderPreset {
    pub id: &'static str,
    pub default_host: &'static str,
    pub default_auth: &'static str,
    pub default_header: &'static str,
}

pub fn resolve_preset(provider: &str) -> Option<ProviderPreset> {
    match provider.to_ascii_lowercase().as_str() {
        "openai" => Some(ProviderPreset {
            id: "openai",
            default_host: "api.openai.com",
            default_auth: "bearer",
            default_header: "Authorization",
        }),
        "gemini" => Some(ProviderPreset {
            id: "gemini",
            default_host: "generativelanguage.googleapis.com",
            default_auth: "x-goog-api-key",
            default_header: "x-goog-api-key",
        }),
        "anthropic" => Some(ProviderPreset {
            id: "anthropic",
            default_host: "api.anthropic.com",
            default_auth: "x-api-key",
            default_header: "x-api-key",
        }),
        "resend" => Some(ProviderPreset {
            id: "resend",
            default_host: "api.resend.com",
            default_auth: "bearer",
            default_header: "Authorization",
        }),
        "telegram" => Some(ProviderPreset {
            id: "telegram",
            default_host: "api.telegram.org",
            default_auth: "telegram-bot",
            default_header: "Authorization",
        }),
        "github" => Some(ProviderPreset {
            id: "github",
            default_host: "api.github.com",
            default_auth: "bearer",
            default_header: "Authorization",
        }),
        "webhook" => Some(ProviderPreset {
            id: "webhook",
            default_host: "",
            default_auth: "bearer",
            default_header: "Authorization",
        }),
        _ => None,
    }
}

pub fn is_valid_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 64
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

pub fn is_valid_public_host(host: &str) -> bool {
    let h = host.trim().to_ascii_lowercase();
    if h.is_empty()
        || h.len() > 253
        || h.contains('/')
        || h.contains(':')
        || h.contains('@')
        || h.contains(' ')
        || !h.contains('.')
    {
        return false;
    }
    let blocked_exact = ["localhost", "0.0.0.0", "metadata.google.internal"];
    if blocked_exact.contains(&h.as_str()) {
        return false;
    }
    if h.starts_with("127.")
        || h.starts_with("10.")
        || h.starts_with("192.168.")
        || h.starts_with("169.254.")
        || h.ends_with(".local")
        || h.ends_with(".internal")
    {
        return false;
    }
    true
}

pub fn store_credential(input: &[u8], context: Option<&[u8]>) -> Result<Vec<u8>, String> {
    let req: StoreCredentialReq = serde_json::from_slice(input)
        .map_err(|e| format!("store-credential: bad input: {e}"))?;

    if !is_valid_name(&req.name) {
        return Err(
            "store-credential: name must be 1-64 alphanumeric, '-' or '_' characters".to_string(),
        );
    }
    if req.api_key.trim().is_empty() {
        return Err("store-credential: api_key is required".to_string());
    }

    let preset = resolve_preset(&req.provider).ok_or_else(|| {
        format!(
            "store-credential: unsupported provider '{}' (supported: openai, gemini, anthropic, resend, telegram, github, webhook)",
            req.provider
        )
    })?;

    let host = match req.host.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        Some(custom) => custom.to_ascii_lowercase(),
        None if !preset.default_host.is_empty() => preset.default_host.to_string(),
        None => return Err("store-credential: host is required for webhook provider".to_string()),
    };

    if !is_valid_public_host(&host) {
        return Err(format!("store-credential: invalid or private host '{host}'"));
    }

    let auth_scheme = req
        .auth_scheme
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(preset.default_auth)
        .to_ascii_lowercase();

    if !matches!(
        auth_scheme.as_str(),
        "bearer" | "x-api-key" | "x-goog-api-key" | "telegram-bot" | "custom-header"
    ) {
        return Err(format!(
            "store-credential: unsupported auth_scheme '{auth_scheme}'"
        ));
    }

    let header_name = req
        .header_name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(preset.default_header)
        .to_string();

    #[cfg(target_arch = "wasm32")]
    {
        let resp = store_credential_wasm(req, preset.id, host, auth_scheme, header_name, context)?;
        serde_json::to_vec(&resp).map_err(|e| e.to_string())
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = (preset, host, auth_scheme, header_name, context);
        Err("store_credential is only implemented on the wasm32 target".to_string())
    }
}

#[cfg(target_arch = "wasm32")]
fn store_credential_wasm(
    req: StoreCredentialReq,
    provider: &str,
    host: String,
    auth_scheme: String,
    header_name: String,
    context: Option<&[u8]>,
) -> Result<StoreCredentialResp, String> {
    use crate::context::{
        cred_map_name, log_map_name, owner_cred_key, owner_log_key, resolve_identity,
    };
    use crate::host::interfaces::{kv_store, logging};

    let id = resolve_identity(context);
    let cred_map = cred_map_name(&id.tenant_hex);
    let key = owner_cred_key(&id.owner_hex, &req.name);

    let credential = serde_json::json!({
        "api_key": req.api_key,
        "provider": provider,
        "service": provider,
        "host": host,
        "auth_scheme": auth_scheme,
        "header_name": header_name,
        "owner_did": format!("did:t3n:{}", id.owner_hex),
        "created_at": id.timestamp_secs,
    });

    let value = serde_json::to_vec(&credential).map_err(|e| e.to_string())?;
    kv_store::put(&cred_map, key.as_bytes(), &value)
        .map_err(|e| format!("kv write: {e}"))?;

    let log_map = log_map_name(&id.tenant_hex);
    let log_key = owner_log_key(&id.owner_hex, id.seq_no, id.timestamp_secs);
    let log_val = serde_json::to_vec(&serde_json::json!({
        "seq_no": id.seq_no,
        "action": "store-credential",
        "credential": req.name,
        "provider": provider,
        "host": host,
        "path": "-",
        "status": "stored",
        "http_code": 200,
        "timestamp_secs": id.timestamp_secs,
        "actor_did": id.actor_did,
    }))
    .map_err(|e| e.to_string())?;
    let _ = kv_store::put(&log_map, log_key.as_bytes(), &log_val);

    let _ = logging::info(&format!(
        "stored credential '{}' ({}) for owner {}",
        req.name, provider, id.owner_hex
    ));

    Ok(StoreCredentialResp {
        ok: true,
        name: req.name,
        provider: provider.to_string(),
        host,
        auth_scheme,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_valid_providers_and_rejects_unknown() {
        for p in ["openai", "gemini", "anthropic", "resend", "telegram", "github", "webhook"] {
            assert!(resolve_preset(p).is_some());
        }
        assert!(resolve_preset("unknown-x").is_none());
    }

    #[test]
    fn blocks_private_and_loopback_hosts() {
        assert!(is_valid_public_host("api.openai.com"));
        assert!(!is_valid_public_host("localhost"));
        assert!(!is_valid_public_host("127.0.0.1"));
        assert!(!is_valid_public_host("169.254.169.254"));
        assert!(!is_valid_public_host("10.0.0.1"));
        assert!(!is_valid_public_host("api.openai.com:443"));
    }

    #[test]
    fn rejects_invalid_name_or_unsupported_provider() {
        let bad_name = serde_json::to_vec(&serde_json::json!({
            "name": "bad name!",
            "api_key": "k",
            "provider": "openai"
        }))
        .unwrap();
        assert!(store_credential(&bad_name, None).is_err());

        let bad_prov = serde_json::to_vec(&serde_json::json!({
            "name": "stripe-live",
            "api_key": "k",
            "provider": "stripe"
        }))
        .unwrap();
        assert!(store_credential(&bad_prov, None)
            .unwrap_err()
            .contains("unsupported provider"));
    }
}

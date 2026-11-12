//! proxy_call: Executes an allowlisted outbound HTTPS call inside the TEE,
//! injecting the owner's sealed API key in enclave memory and never returning it.

use alloc::format;
use alloc::string::{String, ToString};
use alloc::vec::Vec;

#[derive(serde::Deserialize)]
pub struct ProxyCallReq {
    pub credential_name: String,
    #[serde(default = "default_method")]
    pub method: String,
    pub path: String,
    pub headers: Option<Vec<(String, String)>>,
    pub body: Option<serde_json::Value>,
    #[serde(default)]
    pub use_placeholders: bool,
}

fn default_method() -> String {
    "POST".to_string()
}

#[derive(serde::Serialize)]
pub struct ProxyCallResp {
    pub ok: bool,
    pub http_code: u16,
    pub provider: String,
    pub host: String,
    pub path: String,
    pub seq_no: u64,
    pub timestamp_secs: u64,
    pub owner_did: String,
    pub actor_did: String,
    pub delegated: bool,
    pub data: serde_json::Value,
}

pub fn validate_request_path(path: &str) -> Result<(), String> {
    if !path.starts_with('/') {
        return Err("proxy-call: path must start with '/'".to_string());
    }
    if path.contains("://")
        || path.contains('@')
        || path.contains('\r')
        || path.contains('\n')
        || path.contains(' ')
    {
        return Err("proxy-call: invalid characters in path".to_string());
    }
    Ok(())
}

pub fn redact_secret(text: &str, secret: &str) -> String {
    if secret.is_empty() {
        return text.to_string();
    }
    text.replace(secret, "[REDACTED_BY_TEE]")
}

pub fn proxy_call(input: &[u8], context: Option<&[u8]>) -> Result<Vec<u8>, String> {
    let req: ProxyCallReq = serde_json::from_slice(input)
        .map_err(|e| format!("proxy-call: bad input: {e}"))?;

    if req.credential_name.trim().is_empty() {
        return Err("proxy-call: credential_name is required".to_string());
    }
    validate_request_path(&req.path)?;

    let method_upper = req.method.trim().to_ascii_uppercase();
    if !matches!(
        method_upper.as_str(),
        "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
    ) {
        return Err(format!("proxy-call: unsupported HTTP method '{method_upper}'"));
    }

    #[cfg(target_arch = "wasm32")]
    {
        let resp = proxy_call_wasm(req, &method_upper, context)?;
        serde_json::to_vec(&resp).map_err(|e| e.to_string())
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = (req, method_upper, context);
        Err("proxy_call is only implemented on the wasm32 target".to_string())
    }
}

#[cfg(target_arch = "wasm32")]
fn proxy_call_wasm(
    req: ProxyCallReq,
    method_upper: &str,
    context: Option<&[u8]>,
) -> Result<ProxyCallResp, String> {
    use crate::context::{
        cred_map_name, log_map_name, owner_cred_key, owner_log_key, resolve_identity,
    };
    use crate::host::interfaces::{http as http_iface, http_with_placeholders as hwp, kv_store, logging};

    let id = resolve_identity(context);
    let cred_map = cred_map_name(&id.tenant_hex);
    let cred_key = owner_cred_key(&id.owner_hex, &req.credential_name);

    let bytes = kv_store::get(&cred_map, cred_key.as_bytes())
        .map_err(|e| format!("kv read: {e}"))?
        .ok_or_else(|| {
            format!(
                "credential '{}' not found for owner did:t3n:{}",
                req.credential_name, id.owner_hex
            )
        })?;

    let cred: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(|e| format!("credential parse error: {e}"))?;

    let api_key = cred["api_key"]
        .as_str()
        .ok_or("credential missing api_key")?
        .to_string();
    let provider = cred["provider"]
        .as_str()
        .or_else(|| cred["service"].as_str())
        .unwrap_or("webhook")
        .to_string();
    let host = cred["host"]
        .as_str()
        .ok_or("credential missing host")?
        .to_string();
    let auth_scheme = cred["auth_scheme"].as_str().unwrap_or("bearer");
    let header_name = cred["header_name"].as_str().unwrap_or("Authorization");

    let target_url = if auth_scheme == "telegram-bot" {
        format!("https://{host}/bot{api_key}{}", req.path)
    } else {
        format!("https://{host}{}", req.path)
    };

    let mut headers: Vec<(String, String)> = Vec::new();
    if let Some(user_headers) = req.headers {
        for (k, v) in user_headers {
            let kl = k.to_ascii_lowercase();
            if kl != "authorization"
                && kl != "x-api-key"
                && kl != "x-goog-api-key"
                && kl != header_name.to_ascii_lowercase()
                && kl != "host"
            {
                headers.push((k, v));
            }
        }
    }

    match auth_scheme {
        "bearer" => headers.push(("Authorization".to_string(), format!("Bearer {api_key}"))),
        "x-api-key" => headers.push(("x-api-key".to_string(), api_key.clone())),
        "x-goog-api-key" => headers.push(("x-goog-api-key".to_string(), api_key.clone())),
        "custom-header" => headers.push((header_name.to_string(), api_key.clone())),
        "telegram-bot" => {}
        _ => headers.push(("Authorization".to_string(), format!("Bearer {api_key}"))),
    }

    if provider == "github" && !headers.iter().any(|(k, _)| k.eq_ignore_ascii_case("user-agent")) {
        headers.push(("User-Agent".to_string(), "VaultGate-T3N/0.4".to_string()));
    }
    if req.body.is_some()
        && !headers
            .iter()
            .any(|(k, _)| k.eq_ignore_ascii_case("content-type"))
    {
        headers.push(("Content-Type".to_string(), "application/json".to_string()));
    }

    let payload = match req.body {
        Some(v) => Some(serde_json::to_vec(&v).map_err(|e| e.to_string())?),
        None => None,
    };

    let _ = logging::info(&format!(
        "proxy-call {} https://{}{} via '{}' (use_placeholders={})",
        method_upper, host, req.path, req.credential_name, req.use_placeholders
    ));

    let (code, resp_bytes) = if req.use_placeholders {
        let verb = match method_upper {
            "GET" => hwp::Verb::Get,
            "POST" => hwp::Verb::Post,
            "PUT" => hwp::Verb::Put,
            "PATCH" => hwp::Verb::Patch,
            "DELETE" => hwp::Verb::Delete,
            _ => unreachable!(),
        };
        let r = hwp::call(&hwp::Request {
            method: verb,
            url: target_url,
            headers: Some(headers),
            payload,
        })
        .map_err(|e| match e {
            hwp::HttpError::EgressDenied(h) => format!("egress denied for host {h}"),
            hwp::HttpError::PlaceholderDenied(m) => format!("placeholder not permitted: {m}"),
            hwp::HttpError::PlaceholderUnknown(f) => format!("user profile missing field: {f}"),
            hwp::HttpError::PlaceholderNoUserContext => {
                "no user context bound for placeholder resolution".to_string()
            }
            hwp::HttpError::UpstreamError(reason) => {
                format!("upstream error: {}", redact_secret(&reason, &api_key))
            }
        })?;
        (r.code, r.payload)
    } else {
        let verb = match method_upper {
            "GET" => http_iface::Verb::Get,
            "POST" => http_iface::Verb::Post,
            "PUT" => http_iface::Verb::Put,
            "PATCH" => http_iface::Verb::Patch,
            "DELETE" => http_iface::Verb::Delete,
            _ => unreachable!(),
        };
        let r = http_iface::call(&http_iface::Request {
            method: verb,
            url: target_url,
            headers: Some(headers),
            payload,
        })
        .map_err(|e| format!("http call failed: {}", redact_secret(&e, &api_key)))?;
        (r.code, r.payload)
    };

    let raw_text = String::from_utf8_lossy(&resp_bytes);
    let safe_text = redact_secret(&raw_text, &api_key);
    let data: serde_json::Value = serde_json::from_str(&safe_text)
        .unwrap_or_else(|_| serde_json::Value::String(safe_text.clone()));

    let status_label = if (200..300).contains(&code) {
        "success"
    } else {
        "upstream_error"
    };

    let log_map = log_map_name(&id.tenant_hex);
    let log_key = owner_log_key(&id.owner_hex, id.seq_no, id.timestamp_secs);
    let log_val = serde_json::to_vec(&serde_json::json!({
        "seq_no": id.seq_no,
        "action": "proxy-call",
        "credential": req.credential_name,
        "provider": provider,
        "host": host,
        "path": req.path,
        "status": status_label,
        "http_code": code,
        "timestamp_secs": id.timestamp_secs,
        "actor_did": id.actor_did,
    }))
    .map_err(|e| e.to_string())?;
    let _ = kv_store::put(&log_map, log_key.as_bytes(), &log_val);

    Ok(ProxyCallResp {
        ok: (200..300).contains(&code),
        http_code: code,
        provider,
        host,
        path: req.path,
        seq_no: id.seq_no,
        timestamp_secs: id.timestamp_secs,
        owner_did: format!("did:t3n:{}", id.owner_hex),
        actor_did: id.actor_did,
        delegated: id.is_delegated,
        data,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_paths_and_redacts_secret() {
        assert!(validate_request_path("/v1/responses").is_ok());
        assert!(validate_request_path("v1/responses").is_err());
        assert!(validate_request_path("/foo@evil.com").is_err());
        assert!(validate_request_path("https://evil.com/x").is_err());

        let redacted = redact_secret("echo Bearer sk_secret_123 failed", "sk_secret_123");
        assert!(!redacted.contains("sk_secret_123"));
        assert!(redacted.contains("[REDACTED_BY_TEE]"));
    }

    #[test]
    fn rejects_bad_method() {
        let input = serde_json::to_vec(&serde_json::json!({
            "credential_name": "openai-prod",
            "method": "TRACE",
            "path": "/v1/models"
        }))
        .unwrap();
        let err = proxy_call(&input, None).unwrap_err();
        assert!(err.contains("unsupported HTTP method"));
    }
}

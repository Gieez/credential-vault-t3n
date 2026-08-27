//! store_credential: Saves an API key into the TEE-encrypted KV map.
//!
//! The key is stored in z:<tid>:credentials under the credential name.
//! The map is ACL-restricted to this contract only — no other entity
//! can read the raw key.

#[derive(serde::Deserialize)]
pub struct StoreCredentialReq {
    pub name: String,
    pub api_key: String,
    pub service: String,
    pub host: String,
}

#[derive(serde::Serialize)]
pub struct StoreCredentialResp {
    pub ok: bool,
}

/// Entry point called from `lib.rs`.
pub fn store_credential(input: &[u8]) -> Result<Vec<u8>, String> {
    let req: StoreCredentialReq = serde_json::from_slice(input)
        .map_err(|e| alloc::format!("store-credential: bad input: {e}"))?;

    // Input validation
    if req.name.is_empty() {
        return Err("store-credential: name is required".to_string());
    }
    if req.api_key.is_empty() {
        return Err("store-credential: api_key is required".to_string());
    }
    if req.service.is_empty() {
        return Err("store-credential: service is required".to_string());
    }
    if req.host.is_empty() {
        return Err("store-credential: host is required".to_string());
    }

    // Only allow known services for MVP
    if req.service != "sendgrid" {
        return Err(alloc::format!(
            "store-credential: unsupported service '{}' — only 'sendgrid' is supported",
            req.service
        ));
    }

    #[cfg(target_arch = "wasm32")]
    {
        store_credential_wasm(req)?;
        serde_json::to_vec(&StoreCredentialResp { ok: true }).map_err(|e| e.to_string())
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = req;
        Err("store_credential is only implemented on the wasm32 target".to_string())
    }
}

#[cfg(target_arch = "wasm32")]
use crate::host::{
    interfaces::{kv_store, logging},
    tenant::tenant_context,
};

#[cfg(target_arch = "wasm32")]
fn store_credential_wasm(req: StoreCredentialReq) -> Result<(), String> {
    let tid = tenant_context::tenant_did();
    let map_name = alloc::format!("z:{}:credentials", hex::encode(&tid));

    // Build the credential value (metadata + key)
    let credential = serde_json::json!({
        "api_key": req.api_key,
        "service": req.service,
        "host": req.host,
        "created_at": "now", // TEE timestamp would be better, but simplified for MVP
    });

    let value = serde_json::to_vec(&credential).map_err(|e| e.to_string())?;

    kv_store::put(&map_name, req.name.as_bytes(), &value)
        .map_err(|e| alloc::format!("kv write: {e}"))?;

    let _ = logging::info(&alloc::format!(
        "credential '{}' stored in {}",
        req.name,
        map_name
    ));

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn store_credential_non_wasm_returns_err() {
        let input = serde_json::to_vec(&serde_json::json!({
            "name": "test",
            "api_key": "key123",
            "service": "sendgrid",
            "host": "api.sendgrid.com",
        }))
        .unwrap();
        let result = store_credential(&input);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("only implemented on the wasm32 target"));
    }

    #[test]
    fn store_credential_bad_input_returns_err() {
        let result = store_credential(b"not json");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("bad input"));
    }

    #[test]
    fn store_credential_rejects_empty_name() {
        let input = serde_json::to_vec(&serde_json::json!({
            "name": "",
            "api_key": "key123",
            "service": "sendgrid",
            "host": "api.sendgrid.com",
        }))
        .unwrap();
        let result = store_credential(&input);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("name is required"));
    }

    #[test]
    fn store_credential_rejects_unsupported_service() {
        let input = serde_json::to_vec(&serde_json::json!({
            "name": "test",
            "api_key": "key123",
            "service": "stripe",
            "host": "api.stripe.com",
        }))
        .unwrap();
        let result = store_credential(&input);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("unsupported service"));
    }
}

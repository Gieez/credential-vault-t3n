//! revoke_credential: Deletes an owner-scoped API key from enclave KV.

use alloc::format;
use alloc::string::{String, ToString};
use alloc::vec::Vec;

#[derive(serde::Deserialize)]
pub struct RevokeCredentialReq {
    pub name: String,
}

#[derive(serde::Serialize)]
pub struct RevokeCredentialResp {
    pub revoked: bool,
    pub name: String,
}

pub fn revoke_credential(input: &[u8], context: Option<&[u8]>) -> Result<Vec<u8>, String> {
    let req: RevokeCredentialReq = serde_json::from_slice(input)
        .map_err(|e| format!("revoke-credential: bad input: {e}"))?;

    if req.name.trim().is_empty() {
        return Err("revoke-credential: name is required".to_string());
    }

    #[cfg(target_arch = "wasm32")]
    {
        let resp = revoke_credential_wasm(req, context)?;
        serde_json::to_vec(&resp).map_err(|e| e.to_string())
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = (req, context);
        Err("revoke_credential is only implemented on the wasm32 target".to_string())
    }
}

#[cfg(target_arch = "wasm32")]
fn revoke_credential_wasm(
    req: RevokeCredentialReq,
    context: Option<&[u8]>,
) -> Result<RevokeCredentialResp, String> {
    use crate::context::{
        cred_map_name, log_map_name, owner_cred_key, owner_log_key, resolve_identity,
    };
    use crate::host::interfaces::{kv_store, logging};

    let id = resolve_identity(context);
    let cred_map = cred_map_name(&id.tenant_hex);
    let key = owner_cred_key(&id.owner_hex, &req.name);

    let existed = kv_store::delete(&cred_map, key.as_bytes())
        .map_err(|e| format!("kv delete: {e}"))?;

    if !existed {
        return Err(format!("credential '{}' not found for owner", req.name));
    }

    let log_map = log_map_name(&id.tenant_hex);
    let log_key = owner_log_key(&id.owner_hex, id.seq_no, id.timestamp_secs);
    let log_val = serde_json::to_vec(&serde_json::json!({
        "seq_no": id.seq_no,
        "action": "revoke-credential",
        "credential": req.name,
        "provider": "-",
        "host": "-",
        "path": "-",
        "status": "revoked",
        "http_code": 200,
        "timestamp_secs": id.timestamp_secs,
        "actor_did": id.actor_did,
    }))
    .map_err(|e| e.to_string())?;
    let _ = kv_store::put(&log_map, log_key.as_bytes(), &log_val);

    let _ = logging::info(&format!("revoked credential '{}'", req.name));

    Ok(RevokeCredentialResp {
        revoked: true,
        name: req.name,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn revoke_rejects_empty_name() {
        let input = serde_json::to_vec(&serde_json::json!({ "name": "" })).unwrap();
        let err = revoke_credential(&input, None).unwrap_err();
        assert!(err.contains("name is required"));
    }
}

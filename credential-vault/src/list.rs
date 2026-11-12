//! list_credentials: Lists owner-scoped credential metadata (NEVER returns raw API keys).

use alloc::string::String;
use alloc::vec::Vec;

#[derive(serde::Serialize)]
pub struct CredentialInfo {
    pub name: String,
    pub provider: String,
    pub service: String,
    pub host: String,
    pub auth_scheme: String,
    pub created_at: u64,
}

#[derive(serde::Serialize)]
pub struct ListCredentialsResp {
    pub owner_did: String,
    pub credentials: Vec<CredentialInfo>,
}

pub fn list_credentials(context: Option<&[u8]>) -> Result<Vec<u8>, String> {
    #[cfg(target_arch = "wasm32")]
    {
        let resp = list_credentials_wasm(context)?;
        serde_json::to_vec(&resp).map_err(|e| e.to_string())
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = context;
        Err("list_credentials is only implemented on the wasm32 target".to_string())
    }
}

#[cfg(target_arch = "wasm32")]
fn list_credentials_wasm(context: Option<&[u8]>) -> Result<ListCredentialsResp, String> {
    use alloc::format;
    use alloc::string::ToString;
    use crate::context::{cred_map_name, owner_cred_prefix, resolve_identity};
    use crate::host::interfaces::{kv_store, logging};

    let id = resolve_identity(context);
    let map_name = cred_map_name(&id.tenant_hex);
    let prefix = owner_cred_prefix(&id.owner_hex);
    let end = format!("u:{};", id.owner_hex);

    let pairs = kv_store::scan(&map_name, prefix.as_bytes(), end.as_bytes(), 100)
        .map_err(|e| format!("kv scan: {e}"))?;

    let mut credentials = Vec::new();
    for (key, bytes) in &pairs {
        let key_str = String::from_utf8_lossy(key);
        let name = key_str.strip_prefix(&prefix).unwrap_or(&key_str).to_string();
        if let Ok(cred) = serde_json::from_slice::<serde_json::Value>(bytes) {
            let provider = cred["provider"]
                .as_str()
                .or_else(|| cred["service"].as_str())
                .unwrap_or("unknown")
                .to_string();
            let host = cred["host"].as_str().unwrap_or("").to_string();
            let auth_scheme = cred["auth_scheme"].as_str().unwrap_or("bearer").to_string();
            let created_at = cred["created_at"].as_u64().unwrap_or(0);
            credentials.push(CredentialInfo {
                name,
                provider: provider.clone(),
                service: provider,
                host,
                auth_scheme,
                created_at,
            });
        }
    }

    let _ = logging::info(&format!(
        "listed {} credentials for owner {}",
        credentials.len(),
        id.owner_hex
    ));

    Ok(ListCredentialsResp {
        owner_did: format!("did:t3n:{}", id.owner_hex),
        credentials,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn list_credentials_non_wasm_returns_err() {
        let res = list_credentials(None);
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("wasm32 target"));
    }
}

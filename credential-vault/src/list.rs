//! list_credentials: Lists stored credential names (NEVER returns raw API keys).
//!
//! Returns only metadata: name, service, and creation timestamp.
//! The actual API key value is never included in the output.

#[derive(serde::Serialize)]
pub struct CredentialInfo {
    pub name: String,
    pub service: String,
}

#[derive(serde::Serialize)]
pub struct ListCredentialsResp {
    pub credentials: alloc::vec::Vec<CredentialInfo>,
}

/// Entry point called from `lib.rs`.
pub fn list_credentials() -> Result<Vec<u8>, String> {
    #[cfg(target_arch = "wasm32")]
    {
        let resp = list_credentials_wasm()?;
        serde_json::to_vec(&resp).map_err(|e| e.to_string())
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        Err("list_credentials is only implemented on the wasm32 target".to_string())
    }
}

#[cfg(target_arch = "wasm32")]
use crate::host::{
    interfaces::{kv_store, logging},
    tenant::tenant_context,
};

#[cfg(target_arch = "wasm32")]
fn list_credentials_wasm() -> Result<ListCredentialsResp, String> {
    let tid = tenant_context::tenant_did();
    let map_name = alloc::format!("z:{}:credentials", hex::encode(&tid));

    // Scan all entries in the credentials map
    let pairs = kv_store::scan(&map_name, b"", b"\xff", 100)
        .map_err(|e| alloc::format!("kv scan: {e}"))?;

    let mut credentials = alloc::vec::Vec::new();

    for (key, bytes) in &pairs {
        if let Ok(credential) = serde_json::from_slice::<serde_json::Value>(bytes) {
            let name = alloc::string::String::from_utf8_lossy(key).to_string();
            let service = credential["service"]
                .as_str()
                .unwrap_or("unknown")
                .to_string();
            credentials.push(CredentialInfo { name, service });
        }
    }

    let _ = logging::info(&alloc::format!(
        "listed {} credentials from {}",
        credentials.len(),
        map_name
    ));

    Ok(ListCredentialsResp { credentials })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn list_credentials_non_wasm_returns_err() {
        let result = list_credentials();
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("only implemented on the wasm32 target"));
    }
}

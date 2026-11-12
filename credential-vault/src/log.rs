//! get_activity_log: Retrieves owner-scoped activity log entries from enclave KV.

use alloc::format;
use alloc::string::String;
use alloc::vec::Vec;

#[derive(serde::Deserialize)]
pub struct GetActivityLogReq {
    pub limit: Option<u32>,
}

#[derive(serde::Deserialize, serde::Serialize)]
pub struct ActivityEntry {
    #[serde(default)]
    pub seq_no: u64,
    pub action: String,
    pub credential: String,
    #[serde(default)]
    pub provider: String,
    #[serde(default)]
    pub host: String,
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub recipient_hash: String,
    pub status: String,
    #[serde(default)]
    pub http_code: u16,
    #[serde(default)]
    pub timestamp_secs: u64,
    #[serde(default)]
    pub actor_did: String,
}

#[derive(serde::Serialize)]
pub struct GetActivityLogResp {
    pub owner_did: String,
    pub entries: Vec<ActivityEntry>,
}

pub fn get_activity_log(input: &[u8], context: Option<&[u8]>) -> Result<Vec<u8>, String> {
    let req: GetActivityLogReq = serde_json::from_slice(input)
        .map_err(|e| format!("get-activity-log: bad input: {e}"))?;

    let limit = req.limit.unwrap_or(20).min(100) as usize;

    #[cfg(target_arch = "wasm32")]
    {
        let resp = get_activity_log_wasm(limit, context)?;
        serde_json::to_vec(&resp).map_err(|e| e.to_string())
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = (limit, context);
        Err("get_activity_log is only implemented on the wasm32 target".to_string())
    }
}

#[cfg(target_arch = "wasm32")]
fn get_activity_log_wasm(limit: usize, context: Option<&[u8]>) -> Result<GetActivityLogResp, String> {
    use crate::context::{log_map_name, owner_log_prefix, resolve_identity};
    use crate::host::interfaces::kv_store;

    let id = resolve_identity(context);
    let map_name = log_map_name(&id.tenant_hex);
    let prefix = owner_log_prefix(&id.owner_hex);
    let end = format!("u:{};", id.owner_hex);

    let pairs = kv_store::scan(&map_name, prefix.as_bytes(), end.as_bytes(), 200)
        .map_err(|e| format!("kv scan: {e}"))?;

    let mut kv_pairs = pairs;
    kv_pairs.sort_by(|a, b| b.0.cmp(&a.0));
    kv_pairs.truncate(limit);

    let mut entries = Vec::new();
    for (_key, bytes) in &kv_pairs {
        if let Ok(entry) = serde_json::from_slice::<ActivityEntry>(bytes) {
            entries.push(entry);
        }
    }

    Ok(GetActivityLogResp {
        owner_did: format!("did:t3n:{}", id.owner_hex),
        entries,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_invalid_json() {
        assert!(get_activity_log(b"bad", None).is_err());
    }
}

//! get_activity_log: Retrieves recent activity log entries.
//!
//! Activity logs store recipient emails as SHA-256 hashes, never
//! plaintext. Only action type, credential name, status, and
//! timestamp are stored.

#[derive(serde::Deserialize)]
pub struct GetActivityLogReq {
    pub limit: Option<u32>,
}

#[derive(serde::Deserialize, serde::Serialize)]
pub struct ActivityEntry {
    pub action: String,
    pub credential: String,
    pub recipient_hash: String,
    pub status: String,
    pub timestamp: String,
}

#[derive(serde::Serialize)]
pub struct GetActivityLogResp {
    pub entries: alloc::vec::Vec<ActivityEntry>,
}

/// Entry point called from `lib.rs`.
pub fn get_activity_log(input: &[u8]) -> Result<Vec<u8>, String> {
    let req: GetActivityLogReq = serde_json::from_slice(input)
        .map_err(|e| alloc::format!("get-activity-log: bad input: {e}"))?;

    let limit = req.limit.unwrap_or(10).min(100) as usize;

    #[cfg(target_arch = "wasm32")]
    {
        let resp = get_activity_log_wasm(limit)?;
        serde_json::to_vec(&resp).map_err(|e| e.to_string())
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = limit;
        Err("get_activity_log is only implemented on the wasm32 target".to_string())
    }
}

#[cfg(target_arch = "wasm32")]
use crate::host::{
    interfaces::{kv_store, logging},
    tenant::tenant_context,
};

#[cfg(target_arch = "wasm32")]
fn get_activity_log_wasm(limit: usize) -> Result<GetActivityLogResp, String> {
    let tid = tenant_context::tenant_did();
    let map_name = alloc::format!("z:{}:activity-log", hex::encode(&tid));

    // Scan all log entries
    let pairs = kv_store::scan(&map_name, b"", b"\xff", 100)
        .map_err(|e| alloc::format!("kv scan: {e}"))?;

    let mut entries = alloc::vec::Vec::new();

    // Collect keys for sorting
    let mut key_value_pairs: alloc::vec::Vec<(alloc::vec::Vec<u8>, alloc::vec::Vec<u8>)> = pairs;
    key_value_pairs.sort_by(|a, b| b.0.cmp(&a.0)); // descending (newest first)
    key_value_pairs.truncate(limit);

    for (_key, bytes) in &key_value_pairs {
        if let Ok(entry) = serde_json::from_slice::<ActivityEntry>(bytes) {
            entries.push(entry);
        }
    }

    let _ = logging::info(&alloc::format!(
        "activity log: {} entries returned (limit: {})",
        entries.len(),
        limit
    ));

    Ok(GetActivityLogResp { entries })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn get_activity_log_non_wasm_returns_err() {
        let input = serde_json::to_vec(&serde_json::json!({ "limit": 10 })).unwrap();
        let result = get_activity_log(&input);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("only implemented on the wasm32 target"));
    }

    #[test]
    fn get_activity_log_bad_input_returns_err() {
        let result = get_activity_log(b"not json");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("bad input"));
    }

    #[test]
    fn get_activity_log_empty_input_works() {
        // Empty JSON object should work (limit defaults to None)
        let result = get_activity_log(b"{}");
        // Will fail on non-wasm, but input parsing should succeed
        assert!(result.is_err());
        assert!(!result.unwrap_err().contains("bad input"));
    }
}

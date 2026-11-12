//! Execution identity & cluster metadata helpers.
//!
//! Resolves the effective data-owner DID (for KV scoping) and actor DID
//! from node-minted `DynamicContext` + `tenant_context` host calls.

use alloc::format;
use alloc::string::String;

/// Normalize a `did:t3n:<hex>` or raw 40-char hex string into lowercase 40-char hex.
pub fn normalize_did_hex(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    let hex_part = trimmed.strip_prefix("did:t3n:").unwrap_or(trimmed);
    if hex_part.len() == 40 && hex_part.chars().all(|c| c.is_ascii_hexdigit()) {
        Some(hex_part.to_ascii_lowercase())
    } else {
        None
    }
}

/// Extract owner and actor hex DIDs from serialized `DynamicContext` JSON if present.
pub fn parse_context_dids(context_bytes: Option<&[u8]>) -> (Option<String>, Option<String>) {
    let Some(bytes) = context_bytes else {
        return (None, None);
    };
    let Ok(val) = serde_json::from_slice::<serde_json::Value>(bytes) else {
        return (None, None);
    };

    let owner = ["pii_did", "owner_did", "on_behalf_of", "subject_did"]
        .iter()
        .find_map(|k| val.get(*k).and_then(|v| v.as_str()).and_then(normalize_did_hex));

    let actor = ["caller_did", "actor_did", "agent_did", "caller"]
        .iter()
        .find_map(|k| val.get(*k).and_then(|v| v.as_str()).and_then(normalize_did_hex));

    (owner.or_else(|| actor.clone()), actor)
}

#[cfg(target_arch = "wasm32")]
pub struct ExecIdentity {
    pub tenant_hex: String,
    pub owner_hex: String,
    pub actor_did: String,
    pub is_delegated: bool,
    pub timestamp_secs: u64,
    pub seq_no: u64,
}

#[cfg(target_arch = "wasm32")]
pub fn resolve_identity(context_bytes: Option<&[u8]>) -> ExecIdentity {
    use crate::host::tenant::tenant_context;

    let tenant_hex = hex::encode(tenant_context::tenant_did());
    let calling_hex = tenant_context::calling_user_did().map(hex::encode);
    let auth_hex = tenant_context::authenticated_did().map(hex::encode);
    let (ctx_owner, ctx_actor) = parse_context_dids(context_bytes);

    let owner_hex = calling_hex
        .or(ctx_owner)
        .unwrap_or_else(|| tenant_hex.clone());

    let actor_hex = auth_hex
        .or(ctx_actor)
        .unwrap_or_else(|| owner_hex.clone());

    ExecIdentity {
        tenant_hex,
        owner_hex,
        actor_did: format!("did:t3n:{actor_hex}"),
        is_delegated: tenant_context::is_delegated(),
        timestamp_secs: tenant_context::cluster_timestamp_secs(),
        seq_no: tenant_context::seq_no(),
    }
}

#[cfg(target_arch = "wasm32")]
pub fn cred_map_name(tenant_hex: &str) -> String {
    format!("z:{tenant_hex}:credentials")
}

#[cfg(target_arch = "wasm32")]
pub fn log_map_name(tenant_hex: &str) -> String {
    format!("z:{tenant_hex}:activity-log")
}

pub fn owner_cred_key(owner_hex: &str, name: &str) -> String {
    format!("u:{owner_hex}:{name}")
}

pub fn owner_cred_prefix(owner_hex: &str) -> String {
    format!("u:{owner_hex}:")
}

pub fn owner_log_key(owner_hex: &str, seq_no: u64, ts: u64) -> String {
    format!("u:{owner_hex}:{seq_no:016}:{ts:012}")
}

pub fn owner_log_prefix(owner_hex: &str) -> String {
    format!("u:{owner_hex}:")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_did_and_raw_hex() {
        let did = "did:t3n:4501765F00802DE416A08A09180A96E7D346DA75";
        assert_eq!(
            normalize_did_hex(did).as_deref(),
            Some("4501765f00802de416a08a09180a96e7d346da75")
        );
        assert_eq!(normalize_did_hex("bad-did"), None);
    }

    #[test]
    fn parses_dynamic_context_owner_and_actor() {
        let raw = serde_json::to_vec(&serde_json::json!({
            "pii_did": "did:t3n:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            "caller_did": "did:t3n:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        }))
        .unwrap();
        let (owner, actor) = parse_context_dids(Some(&raw));
        assert_eq!(
            owner.as_deref(),
            Some("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
        );
        assert_eq!(
            actor.as_deref(),
            Some("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")
        );
    }
}

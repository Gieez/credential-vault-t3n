//! z-credential-vault v0.1.0 — Confidential Credential Vault Agent.
//!
//! Stores API keys inside TEE-encrypted KV maps and uses them to call
//! external services (Resend) without ever exposing the raw keys to
//! the agent runtime, frontend, or application server.
//!
//! # Exported functions
//!
//!   - `store-credential`:  Save an API key into z:<tid>:credentials KV map
//!   - `list-credentials`:  List credential names (never the keys themselves)
//!   - `send-email`:        Send email via Resend using a stored credential
//!   - `get-activity-log`:  Retrieve hashed audit trail
//!
//! # Security model
//!
//!   - API keys stored in KV, encrypted at rest inside TEE
//!   - Contract reads key from KV inside enclave, uses for HTTP auth
//!   - Key bytes never cross the WIT boundary back to the caller
//!   - Activity log stores recipient email as SHA-256 hash, not plaintext
//!   - Only the contract itself can read/write the credentials map (ACL)
#![warn(clippy::style, missing_debug_implementations)]
#![cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]

extern crate alloc;

pub const CONTRACT_VERSION: &str = "0.1.0";

wit_bindgen::generate!({
    world: "credential-vault",
    path: "wit",
    additional_derives: [
        serde::Deserialize,
        serde::Serialize,
    ],
    generate_all,
});

mod store;
mod list;
mod send;
mod log;

struct Component;

#[cfg(target_arch = "wasm32")]
impl exports::z::credential_vault::contracts::Guest for Component {
    fn store_credential(
        req: exports::z::credential_vault::contracts::GenericInput,
    ) -> Result<alloc::vec::Vec<u8>, alloc::string::String> {
        let input = req.input.ok_or("store-credential: missing input")?;
        store::store_credential(&input)
    }

    fn list_credentials(
        req: exports::z::credential_vault::contracts::GenericInput,
    ) -> Result<alloc::vec::Vec<u8>, alloc::string::String> {
        let _ = req; // list-credentials takes no input
        list::list_credentials()
    }

    fn send_email(
        req: exports::z::credential_vault::contracts::GenericInput,
    ) -> Result<alloc::vec::Vec<u8>, alloc::string::String> {
        let input = req.input.ok_or("send-email: missing input")?;
        send::send_email(&input)
    }

    fn get_activity_log(
        req: exports::z::credential_vault::contracts::GenericInput,
    ) -> Result<alloc::vec::Vec<u8>, alloc::string::String> {
        let input = req.input.unwrap_or_else(|| b"{}".to_vec());
        log::get_activity_log(&input)
    }
}

#[cfg(target_arch = "wasm32")]
export!(Component);

#[cfg(test)]
mod tests {
    use super::CONTRACT_VERSION;

    #[test]
    fn contract_version_is_semver() {
        let parts: Vec<&str> = CONTRACT_VERSION.split('.').collect();
        assert_eq!(parts.len(), 3, "CONTRACT_VERSION must be MAJOR.MINOR.PATCH");
        for part in parts {
            assert!(part.parse::<u32>().is_ok(), "each part must be a number");
        }
    }

    #[test]
    fn contract_version_is_v0_1_0() {
        assert_eq!(CONTRACT_VERSION, "0.1.0");
    }
}

//! z-credential-vault v0.4.0 - VaultGate TEE Contract.
//!
//! Stores per-owner API credentials inside T3N TEE-encrypted KV maps and
//! dispatches authenticated outbound API requests without exposing raw secrets
//! to the browser, proxy server, or AI agent runtime.
#![warn(clippy::style, missing_debug_implementations)]
#![cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]

extern crate alloc;

pub const CONTRACT_VERSION: &str = "0.4.2";

wit_bindgen::generate!({
    world: "credential-vault",
    path: "wit",
    additional_derives: [
        serde::Deserialize,
        serde::Serialize,
    ],
    generate_all,
});

mod context;
mod list;
mod log;
mod proxy;
mod revoke;
mod send;
mod store;

struct Component;

#[cfg(target_arch = "wasm32")]
impl exports::z::credential_vault::contracts::Guest for Component {
    fn store_credential(
        req: exports::z::credential_vault::contracts::GenericInput,
    ) -> Result<alloc::vec::Vec<u8>, alloc::string::String> {
        let input = req.input.ok_or("store-credential: missing input")?;
        store::store_credential(&input, req.context.as_deref())
    }

    fn list_credentials(
        req: exports::z::credential_vault::contracts::GenericInput,
    ) -> Result<alloc::vec::Vec<u8>, alloc::string::String> {
        list::list_credentials(req.context.as_deref())
    }

    fn revoke_credential(
        req: exports::z::credential_vault::contracts::GenericInput,
    ) -> Result<alloc::vec::Vec<u8>, alloc::string::String> {
        let input = req.input.ok_or("revoke-credential: missing input")?;
        revoke::revoke_credential(&input, req.context.as_deref())
    }

    fn proxy_call(
        req: exports::z::credential_vault::contracts::GenericInput,
    ) -> Result<alloc::vec::Vec<u8>, alloc::string::String> {
        let input = req.input.ok_or("proxy-call: missing input")?;
        proxy::proxy_call(&input, req.context.as_deref())
    }

    fn send_email(
        req: exports::z::credential_vault::contracts::GenericInput,
    ) -> Result<alloc::vec::Vec<u8>, alloc::string::String> {
        let input = req.input.ok_or("send-email: missing input")?;
        send::send_email(&input, req.context.as_deref())
    }

    fn get_activity_log(
        req: exports::z::credential_vault::contracts::GenericInput,
    ) -> Result<alloc::vec::Vec<u8>, alloc::string::String> {
        let input = req.input.unwrap_or_else(|| b"{}".to_vec());
        log::get_activity_log(&input, req.context.as_deref())
    }
}

#[cfg(target_arch = "wasm32")]
export!(Component);

#[cfg(test)]
mod tests {
    use super::CONTRACT_VERSION;

    #[test]
    fn contract_version_is_v0_4_2() {
        assert_eq!(CONTRACT_VERSION, "0.4.2");
    }
}

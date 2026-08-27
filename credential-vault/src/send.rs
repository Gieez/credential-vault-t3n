//! send_email: Sends an email via Resend using a stored credential.
//!
//! The API key is read from the z:<tid>:credentials KV map inside the
//! TEE enclave. The key is used to authenticate the Resend API call
//! but is NEVER returned to the caller. Only success/failure and the
//! Resend message ID are returned.

#[derive(serde::Deserialize)]
pub struct SendEmailReq {
    pub credential_name: String,
    pub to: String,
    pub subject: String,
    pub body: String,
}

#[derive(serde::Serialize)]
pub struct SendEmailResp {
    pub sent: bool,
    pub message_id: String,
    pub timestamp: String,
}

const RESEND_BASE: &str = "https://api.resend.com";

/// Entry point called from `lib.rs`.
pub fn send_email(input: &[u8]) -> Result<Vec<u8>, String> {
    let req: SendEmailReq = serde_json::from_slice(input)
        .map_err(|e| alloc::format!("send-email: bad input: {e}"))?;

    // Input validation
    if req.credential_name.is_empty() {
        return Err("send-email: credential_name is required".to_string());
    }
    if req.to.is_empty() {
        return Err("send-email: to is required".to_string());
    }
    if req.subject.is_empty() {
        return Err("send-email: subject is required".to_string());
    }

    // Validate email format (basic check)
    if !req.to.contains('@') || !req.to.contains('.') {
        return Err("send-email: invalid email address".to_string());
    }

    #[cfg(target_arch = "wasm32")]
    {
        let resp = send_email_wasm(req)?;
        serde_json::to_vec(&resp).map_err(|e| e.to_string())
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = req;
        Err("send_email is only implemented on the wasm32 target".to_string())
    }
}

#[cfg(target_arch = "wasm32")]
use crate::host::{
    interfaces::{http as http_iface, kv_store, logging},
    tenant::tenant_context,
};

#[cfg(target_arch = "wasm32")]
fn send_email_wasm(req: SendEmailReq) -> Result<SendEmailResp, String> {
    use serde_json::json;

    // Step 1: Read the API key from the credentials KV map
    let api_key = get_credential_key(&req.credential_name)?;

    // Step 2: Build the Resend email request body
    // Resend API: POST /emails
    // Body: { from, to: [...], subject, text }
    let mail_body = json!({
        "from": "Credential Vault <onboarding@resend.dev>",
        "to": [req.to],
        "subject": req.subject,
        "text": req.body,
    });

    let _ = logging::info(&alloc::format!(
        "Calling Resend POST /emails via credential '{}'",
        req.credential_name
    ));

    // Step 3: Call Resend API inside the TEE
    let resp = http_iface::call(&http_iface::Request {
        method: http_iface::Verb::Post,
        url: alloc::format!("{RESEND_BASE}/emails"),
        headers: Some(resend_headers(&api_key)),
        payload: Some(serde_json::to_vec(&mail_body).map_err(|e| e.to_string())?),
    })
    .map_err(|e| alloc::format!("resend email: {e}"))?;

    // Step 4: Handle response
    // Resend returns 200 OK with { id, from, to, ... } on success
    if resp.code != 200 {
        let body = alloc::string::String::from_utf8_lossy(&resp.payload);
        let _ = logging::error(&alloc::format!(
            "Resend API HTTP {}: {}",
            resp.code,
            body
        ));
        return Err(alloc::format!(
            "Resend email failed: HTTP {code} — {body}",
            code = resp.code,
            body = body
        ));
    }

    // Parse response to get the message ID
    let resp_json: serde_json::Value = serde_json::from_slice(&resp.payload)
        .map_err(|e| alloc::format!("resend response parse: {e}"))?;

    let message_id = resp_json["id"]
        .as_str()
        .unwrap_or("unknown")
        .to_string();

    let _ = logging::info(&alloc::format!(
        "Email sent to {} via credential '{}' (id: {})",
        req.to,
        req.credential_name,
        message_id
    ));

    // Step 5: Log the activity (with hashed recipient email)
    log_activity(&req.credential_name, &req.to, "sent")?;

    Ok(SendEmailResp {
        sent: true,
        message_id,
        timestamp: "now".to_string(), // Simplified for MVP
    })
}

/// Read the API key for a named credential from the credentials KV map.
#[cfg(target_arch = "wasm32")]
fn get_credential_key(credential_name: &str) -> Result<alloc::string::String, String> {
    let tid = tenant_context::tenant_did();
    let map_name = alloc::format!("z:{}:credentials", hex::encode(&tid));

    let bytes = kv_store::get(&map_name, credential_name.as_bytes())
        .map_err(|e| alloc::format!("kv read: {e}"))?
        .ok_or_else(|| {
            alloc::format!(
                "credential '{}' not found in z:<tid>:credentials — store it first via store-credential",
                credential_name
            )
        })?;

    let credential: serde_json::Value = serde_json::from_slice(&bytes)
        .map_err(|e| alloc::format!("credential parse error: {e}"))?;

    let api_key = credential["api_key"]
        .as_str()
        .ok_or("credential missing api_key field")?
        .to_string();

    // Validate the service is resend
    let service = credential["service"].as_str().unwrap_or("");
    if service != "resend" {
        return Err(alloc::format!(
            "credential '{}' is for service '{}' — only 'resend' is supported",
            credential_name,
            service
        ));
    }

    Ok(api_key)
}

/// Build Resend API headers.
#[cfg(target_arch = "wasm32")]
fn resend_headers(
    api_key: &str,
) -> alloc::vec::Vec<(alloc::string::String, alloc::string::String)> {
    alloc::vec![
        (
            "Authorization".to_string(),
            alloc::format!("Bearer {api_key}"),
        ),
        (
            "Content-Type".to_string(),
            "application/json".to_string(),
        ),
    ]
}

/// Log an activity entry with the recipient email hashed (never stored plaintext).
#[cfg(target_arch = "wasm32")]
fn log_activity(credential_name: &str, recipient: &str, status: &str) -> Result<(), String> {
    use sha2::{Digest, Sha256};

    let tid = tenant_context::tenant_did();
    let map_name = alloc::format!("z:{}:activity-log", hex::encode(&tid));

    // Hash the recipient email — never store plaintext PII
    let mut hasher = Sha256::new();
    hasher.update(recipient.as_bytes());
    let hash = hex::encode(hasher.finalize());

    let entry = serde_json::json!({
        "action": "send-email",
        "credential": credential_name,
        "recipient_hash": hash,
        "status": status,
        "timestamp": "now",
    });

    let key = alloc::format!("log:{}", chrono_timestamp());
    let value = serde_json::to_vec(&entry).map_err(|e| e.to_string())?;

    kv_store::put(&map_name, key.as_bytes(), &value)
        .map_err(|e| alloc::format!("kv log write: {e}"))?;

    Ok(())
}

/// Simple timestamp placeholder for MVP.
#[cfg(target_arch = "wasm32")]
fn chrono_timestamp() -> &'static str {
    "2026-01-01T00:00:00Z"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn send_email_non_wasm_returns_err() {
        let input = serde_json::to_vec(&serde_json::json!({
            "credential_name": "test",
            "to": "user@example.com",
            "subject": "Hello",
            "body": "World",
        }))
        .unwrap();
        let result = send_email(&input);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("only implemented on the wasm32 target"));
    }

    #[test]
    fn send_email_bad_input_returns_err() {
        let result = send_email(b"not json");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("bad input"));
    }

    #[test]
    fn send_email_rejects_empty_to() {
        let input = serde_json::to_vec(&serde_json::json!({
            "credential_name": "test",
            "to": "",
            "subject": "Hello",
            "body": "World",
        }))
        .unwrap();
        let result = send_email(&input);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("to is required"));
    }

    #[test]
    fn send_email_rejects_invalid_email() {
        let input = serde_json::to_vec(&serde_json::json!({
            "credential_name": "test",
            "to": "not-an-email",
            "subject": "Hello",
            "body": "World",
        }))
        .unwrap();
        let result = send_email(&input);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("invalid email"));
    }
}

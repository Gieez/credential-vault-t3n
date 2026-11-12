//! send_email: Backwards-compatible Resend convenience function with
//! SHA-256 recipient hashing and real cluster timestamp/seq_no.

use alloc::format;
use alloc::string::{String, ToString};
use alloc::vec::Vec;

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
    pub timestamp_secs: u64,
    pub seq_no: u64,
}

pub fn send_email(input: &[u8], context: Option<&[u8]>) -> Result<Vec<u8>, String> {
    let req: SendEmailReq = serde_json::from_slice(input)
        .map_err(|e| format!("send-email: bad input: {e}"))?;

    if req.credential_name.is_empty() {
        return Err("send-email: credential_name is required".to_string());
    }
    if req.to.is_empty() {
        return Err("send-email: to is required".to_string());
    }
    if req.subject.is_empty() {
        return Err("send-email: subject is required".to_string());
    }
    if !req.to.contains('@') || !req.to.contains('.') {
        return Err("send-email: invalid email address".to_string());
    }

    #[cfg(target_arch = "wasm32")]
    {
        let resp = send_email_wasm(req, context)?;
        serde_json::to_vec(&resp).map_err(|e| e.to_string())
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = (req, context);
        Err("send_email is only implemented on the wasm32 target".to_string())
    }
}

#[cfg(target_arch = "wasm32")]
fn send_email_wasm(req: SendEmailReq, context: Option<&[u8]>) -> Result<SendEmailResp, String> {
    use sha2::{Digest, Sha256};
    use crate::context::{
        cred_map_name, log_map_name, owner_cred_key, owner_log_key, resolve_identity,
    };
    use crate::host::interfaces::{http as http_iface, kv_store};

    let id = resolve_identity(context);
    let cred_map = cred_map_name(&id.tenant_hex);
    let cred_key = owner_cred_key(&id.owner_hex, &req.credential_name);

    let bytes = kv_store::get(&cred_map, cred_key.as_bytes())
        .map_err(|e| format!("kv read: {e}"))?
        .ok_or_else(|| format!("credential '{}' not found", req.credential_name))?;

    let cred: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(|e| format!("credential parse error: {e}"))?;
    let api_key = cred["api_key"].as_str().ok_or("credential missing api_key")?;
    let provider = cred["provider"].as_str().or_else(|| cred["service"].as_str()).unwrap_or("");
    if provider != "resend" {
        return Err(format!(
            "credential '{}' is for provider '{}', not 'resend'",
            req.credential_name, provider
        ));
    }

    let mail_body = serde_json::json!({
        "from": "VaultGate <onboarding@resend.dev>",
        "to": [req.to],
        "subject": req.subject,
        "text": req.body,
    });

    let resp = http_iface::call(&http_iface::Request {
        method: http_iface::Verb::Post,
        url: "https://api.resend.com/emails".to_string(),
        headers: Some(alloc::vec![
            ("Authorization".to_string(), format!("Bearer {api_key}")),
            ("Content-Type".to_string(), "application/json".to_string()),
        ]),
        payload: Some(serde_json::to_vec(&mail_body).map_err(|e| e.to_string())?),
    })
    .map_err(|e| format!("resend email: {e}"))?;

    if resp.code != 200 {
        let body = String::from_utf8_lossy(&resp.payload);
        return Err(format!("Resend HTTP {}: {}", resp.code, body));
    }

    let resp_json: serde_json::Value = serde_json::from_slice(&resp.payload)
        .map_err(|e| format!("resend response parse: {e}"))?;
    let message_id = resp_json["id"].as_str().unwrap_or("unknown").to_string();

    let mut hasher = Sha256::new();
    hasher.update(req.to.as_bytes());
    let recipient_hash = hex::encode(hasher.finalize());

    let log_map = log_map_name(&id.tenant_hex);
    let log_key = owner_log_key(&id.owner_hex, id.seq_no, id.timestamp_secs);
    let log_val = serde_json::to_vec(&serde_json::json!({
        "seq_no": id.seq_no,
        "action": "send-email",
        "credential": req.credential_name,
        "provider": "resend",
        "host": "api.resend.com",
        "path": "/emails",
        "recipient_hash": recipient_hash,
        "status": "sent",
        "http_code": 200,
        "timestamp_secs": id.timestamp_secs,
        "actor_did": id.actor_did,
    }))
    .map_err(|e| e.to_string())?;
    let _ = kv_store::put(&log_map, log_key.as_bytes(), &log_val);

    Ok(SendEmailResp {
        sent: true,
        message_id,
        timestamp_secs: id.timestamp_secs,
        seq_no: id.seq_no,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn send_email_validation() {
        let bad = serde_json::to_vec(&serde_json::json!({
            "credential_name": "r",
            "to": "bad",
            "subject": "hi",
            "body": "ok"
        }))
        .unwrap();
        assert!(send_email(&bad, None).unwrap_err().contains("invalid email"));
    }
}

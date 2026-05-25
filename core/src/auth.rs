use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Algorithm, Argon2, Params, Version,
};
use rand_core::OsRng;
use rusqlite::params;
use std::fmt;

use crate::{into_ipc, open_connection, redacted, DbState, IpcResponse};

const MASTER_SECRET_HASH_KEY: &str = "auth_master_secret_hash";
const LEGACY_MASTER_PASSWORD_KEY: &str = "master_password_hash";

#[derive(Debug)]
enum AppError {
    Hashing(String),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::Hashing(message) => write!(f, "{message}"),
        }
    }
}

fn hash_password(password: &str) -> Result<String, AppError> {
    let salt = SaltString::generate(&mut OsRng);
    let params = Params::new(19_456, 2, 1, Some(32))
        .map_err(|err| AppError::Hashing(format!("Invalid Argon2 params: {err}")))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    argon2
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|err| AppError::Hashing(format!("Failed hashing secret: {err}")))
}

fn verify_password_hash(hash: &str, password: &str) -> bool {
    let parsed_hash = match PasswordHash::new(hash) {
        Ok(value) => value,
        Err(_) => return false,
    };

    let params = match Params::new(19_456, 2, 1, Some(32)) {
        Ok(value) => value,
        Err(_) => return false,
    };

    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok()
}

fn fetch_master_hash(conn: &rusqlite::Connection) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT value
         FROM settings
         WHERE key IN (?1, ?2)
         ORDER BY CASE key WHEN ?1 THEN 0 ELSE 1 END
         LIMIT 1;",
        params![MASTER_SECRET_HASH_KEY, LEGACY_MASTER_PASSWORD_KEY],
        |row| row.get::<_, String>(0),
    )
    .map(Some)
    .or_else(|err| {
        if matches!(err, rusqlite::Error::QueryReturnedNoRows) {
            Ok(None)
        } else {
            Err(format!("Failed reading master secret hash: {err}"))
        }
    })
}

#[tauri::command]
pub fn auth_secret_is_setup(state: tauri::State<'_, DbState>) -> IpcResponse<bool> {
    into_ipc((|| {
        let conn = open_connection(&state.db_path)?;
        Ok(fetch_master_hash(&conn)?.is_some())
    })())
}

#[tauri::command]
pub fn auth_secret_set(passphrase: String, state: tauri::State<'_, DbState>) -> IpcResponse<bool> {
    into_ipc((|| {
        let conn = open_connection(&state.db_path)?;

        if fetch_master_hash(&conn)?.is_some() {
            return Err(
                "Master password is already set. Cannot reset without migrating data.".to_string(),
            );
        }

        let phc_hash = hash_password(&passphrase).map_err(|err| err.to_string())?;
        let stored_value = serde_json::to_string(&phc_hash)
            .map_err(|err| format!("Failed serializing master secret hash: {err}"))?;
        let data_salt = redacted::ensure_data_salt(&conn)?;
        let session_key = redacted::derive_session_key(&passphrase, &data_salt)?;

        conn.execute(
            "INSERT INTO settings (key, value, scope, updated_at)
             VALUES (?1, ?2, 'global', datetime('now'))
             ON CONFLICT(key) DO UPDATE
             SET value = excluded.value,
                 updated_at = datetime('now');",
            params![MASTER_SECRET_HASH_KEY, stored_value],
        )
        .map_err(|err| format!("Failed storing master secret hash: {err}"))?;

        conn.execute(
            "DELETE FROM settings WHERE key = ?1;",
            params![LEGACY_MASTER_PASSWORD_KEY],
        )
        .map_err(|err| format!("Failed cleaning up legacy secret hash key: {err}"))?;

        redacted::set_session_key(&state, session_key);
        redacted::migrate_legacy_redacted_records(&conn, &session_key)?;

        Ok(true)
    })())
}

#[tauri::command]
pub fn auth_secret_verify(
    passphrase: String,
    state: tauri::State<'_, DbState>,
) -> IpcResponse<bool> {
    into_ipc((|| {
        let conn = open_connection(&state.db_path)?;
        let stored_value = match fetch_master_hash(&conn)? {
            Some(value) => value,
            None => return Ok(false),
        };

        let phc_hash: String = serde_json::from_str(&stored_value)
            .map_err(|err| format!("Failed parsing stored master secret hash: {err}"))?;

        if !verify_password_hash(&phc_hash, &passphrase) {
            return Ok(false);
        }

        let data_salt = redacted::ensure_data_salt(&conn)?;
        let session_key = redacted::derive_session_key(&passphrase, &data_salt)?;
        redacted::set_session_key(&state, session_key);
        redacted::migrate_legacy_redacted_records(&conn, &session_key)?;

        Ok(true)
    })())
}

#[cfg(test)]
mod tests {
    use super::{hash_password, verify_password_hash};

    #[test]
    fn hash_and_verify_valid_password() {
        let password = "correct horse battery staple";
        let hash = match hash_password(password) {
            Ok(value) => value,
            Err(err) => panic!("failed to hash password in test: {err}"),
        };
        assert!(verify_password_hash(&hash, password));
    }

    #[test]
    fn hash_verification_fails_for_invalid_password() {
        let hash = match hash_password("right-secret") {
            Ok(value) => value,
            Err(err) => panic!("failed to hash password in test: {err}"),
        };
        assert!(!verify_password_hash(&hash, "wrong-secret"));
    }
}

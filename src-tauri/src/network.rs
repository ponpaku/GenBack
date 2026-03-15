use crate::logger::BackupLogger;
use std::process::Command;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// net use でホストへの資格情報を登録する
pub fn net_use_connect(
    logger: &BackupLogger,
    host: &str,
    user: &str,
    password: &str,
) -> Result<(), String> {
    if host.is_empty() {
        return Ok(());
    }
    logger.log("info", &format!("ネットワーク接続中: {}", host), true);
    let cp = Command::new("net")
        .args(["use", host, password, &format!("/user:{}", user)])
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map_err(|e| format!("net use 実行失敗: {}", e))?;
    if !cp.success() {
        return Err("ネットワーク資格情報の登録に失敗しました。".to_string());
    }
    Ok(())
}

/// net use でホストへの接続を切断する
pub fn net_use_disconnect(logger: &BackupLogger, host: &str) -> Result<(), String> {
    if host.is_empty() {
        return Ok(());
    }
    logger.log("info", &format!("ネットワーク切断: {}", host), true);
    Command::new("net")
        .args(["use", host, "/delete", "/yes"])
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map_err(|e| format!("net use disconnect 実行失敗: {}", e))?;
    Ok(())
}

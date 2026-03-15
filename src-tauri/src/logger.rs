use chrono::Local;
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::Emitter;

#[derive(Serialize, Clone)]
pub struct LogEvent {
    pub timestamp: String,
    pub level: String,
    pub message: String,
}

pub struct BackupLogger {
    pub main_log: PathBuf,
    pub app_handle: Option<tauri::AppHandle>,
}

impl BackupLogger {
    pub fn new(main_log: PathBuf, app_handle: Option<tauri::AppHandle>) -> Self {
        BackupLogger { main_log, app_handle }
    }

    /// レベルを明示してログを記録する。ファイルは JSONL 形式で書き込む。
    /// level: "section" | "info" | "warn" | "error" | "test" | "success"
    pub fn log(&self, level: &str, msg: &str, also_print: bool) {
        let ts = Local::now().format("%Y-%m-%dT%H:%M:%S").to_string();

        let json_line = serde_json::json!({
            "ts": ts,
            "level": level,
            "msg": msg,
        })
        .to_string();

        // ファイル書き込み（JSONL）
        if let Some(parent) = self.main_log.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        use std::io::Write;
        if let Ok(mut f) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.main_log)
        {
            let _ = writeln!(f, "{}", json_line);
        }

        // Tauri Event（リアルタイム表示用）
        if let Some(handle) = &self.app_handle {
            let event = LogEvent {
                timestamp: ts.clone(),
                level: level.to_string(),
                message: msg.to_string(),
            };
            let _ = handle.emit("backup://log", event);
        }

        // headless モード用 stdout（人間が読みやすい形式）
        if also_print {
            println!("[{:<7}] {} {}", level.to_uppercase(), ts, msg);
        }
    }

    /// JSONL 形式の行をそのままファイルに追記する（同時バックアップのプリアンブル用）
    pub fn log_raw(log_path: &Path, json_line: &str) {
        if let Some(parent) = log_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        use std::io::Write;
        if let Ok(mut f) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(log_path)
        {
            let _ = writeln!(f, "{}", json_line);
        }
    }

    /// JSONL 行を生成するヘルパー（プリアンブル構築用）
    pub fn make_jsonl(level: &str, msg: &str) -> String {
        let ts = Local::now().format("%Y-%m-%dT%H:%M:%S").to_string();
        serde_json::json!({
            "ts": ts,
            "level": level,
            "msg": msg,
        })
        .to_string()
    }
}

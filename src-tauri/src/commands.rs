use crate::backup::{BackupState, DestStatus, HistoryEntry};
use crate::config::{self, Config};
use crate::scheduler::{self, ScheduleConfig, ScheduleEntry};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

// ============================================================
// Phase 1: プロファイル管理コマンド
// ============================================================

#[tauri::command]
pub fn list_profiles() -> Result<Vec<String>, String> {
    config::list_profiles()
}

#[tauri::command]
pub fn load_profile(name: String) -> Result<Config, String> {
    config::load_profile(&name)
}

#[tauri::command]
pub fn save_profile(name: String, config: Config) -> Result<(), String> {
    config::validate_profile_name(&name)?;
    validate_config(&config)?;
    check_dest_conflicts(&name, &config)?;
    // ラベル変更があればバックアップ先の data/ フォルダ名を先にリネーム
    rename_data_dirs_on_label_change(&name, &config);
    config::save_profile(&name, &config)
}

/// 旧プロファイルと新設定を比較し、source path が同じでラベルが変わった場合に
/// 各バックアップ先の data/{old_label}/ → data/{new_label}/ をリネームする（best-effort）
fn rename_data_dirs_on_label_change(name: &str, new_config: &Config) {
    let Ok(old_config) = config::load_profile(name) else { return };
    // source.path をキーにして old_label → new_label のマッピングを作る
    let renames: Vec<(String, String)> = new_config
        .source
        .paths
        .iter()
        .filter_map(|new_sp| {
            let old_sp = old_config.source.paths.iter().find(|sp| sp.path == new_sp.path)?;
            if old_sp.label != new_sp.label {
                Some((old_sp.label.clone(), new_sp.label.clone()))
            } else {
                None
            }
        })
        .collect();
    if renames.is_empty() {
        return;
    }
    for dest in &new_config.destinations.paths {
        for (old_label, new_label) in &renames {
            let old_dir = std::path::Path::new(dest).join("data").join(old_label);
            let new_dir = std::path::Path::new(dest).join("data").join(new_label);
            if old_dir.exists() {
                let _ = std::fs::rename(&old_dir, &new_dir);
            }
        }
    }
}

/// 設定値のバリデーション
fn validate_config(config: &Config) -> Result<(), String> {
    if !["rotate", "simultaneous"].contains(&config.destinations.mode.as_str()) {
        return Err(format!(
            "destinations.mode が無効です: {:?}（'rotate' または 'simultaneous' を指定してください）",
            config.destinations.mode
        ));
    }
    if !config.generations.mirror_mode && config.generations.keep < 1 {
        return Err("generations.keep は 1 以上を指定してください".to_string());
    }
    if config.destinations.paths.is_empty() {
        return Err("destinations.paths を最低1つ設定してください".to_string());
    }
    if config.source.paths.is_empty() {
        return Err("source.paths を最低1つ設定してください".to_string());
    }
    // label の重複チェック（同一プロファイル内）
    let mut labels = std::collections::HashSet::new();
    for sp in &config.source.paths {
        if sp.label.is_empty() {
            return Err("source.paths の label は空にできません".to_string());
        }
        if !labels.insert(&sp.label) {
            return Err(format!("source.paths に重複するラベルがあります: {:?}", sp.label));
        }
    }
    if config.notification.discord.enabled
        && !config.notification.discord.webhook_url.is_empty()
        && !config.notification.discord.webhook_url.starts_with("https://")
    {
        return Err("notification.discord.webhook_url は https:// で始まる必要があります".to_string());
    }
    Ok(())
}

/// プロファイル間の宛先・ラベル衝突チェック
/// 同じ宛先パス × 同じラベル → エラー（世代ローテーションが干渉する）
fn check_dest_conflicts(current_name: &str, config: &Config) -> Result<(), String> {
    let all_profiles = config::list_profiles().unwrap_or_default();
    for other_name in &all_profiles {
        if other_name == current_name {
            continue;
        }
        let Ok(other) = config::load_profile(other_name) else {
            continue;
        };
        for dest in &config.destinations.paths {
            if !other.destinations.paths.contains(dest) {
                continue;
            }
            // 同じ宛先パスを持つ → ラベル衝突チェック
            for sp in &config.source.paths {
                if other.source.paths.iter().any(|osp| osp.label == sp.label) {
                    return Err(format!(
                        "プロファイル「{}」と宛先「{}」およびラベル「{}」が重複しています。\
                         ラベルを変更するか、別の宛先パスを使用してください。",
                        other_name, dest, sp.label
                    ));
                }
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn delete_profile(name: String) -> Result<(), String> {
    config::delete_profile(&name)
}

/// プロファイルをリネームする。
/// 戻り値: スケジュールタスクが削除された場合 true（UI 側で警告トーストを表示する用途）
#[tauri::command]
pub fn rename_profile(old_name: String, new_name: String) -> Result<bool, String> {
    let task_names = config::rename_profile(&old_name, &new_name)?;
    let mut had_schedule = false;
    for task_name in &task_names {
        if scheduler::delete_schedule(task_name).is_ok() {
            had_schedule = true;
        }
    }
    Ok(had_schedule)
}

/// プロファイルを複製する（設定のみコピー）
#[tauri::command]
pub fn duplicate_profile(name: String, new_name: String) -> Result<(), String> {
    config::duplicate_profile(&name, &new_name)
}

#[tauri::command]
pub fn import_profile(path: String) -> Result<String, String> {
    config::import_profile(&path)
}

#[tauri::command]
pub fn export_profile(name: String, path: String) -> Result<(), String> {
    config::export_profile(&name, &path)
}

#[tauri::command]
pub fn get_default_config() -> Config {
    Config::default()
}

/// 全プロファイルを指定フォルダへ一括エクスポート
#[tauri::command]
pub fn export_all_profiles(dest_dir: String) -> Result<Vec<String>, String> {
    config::export_all_profiles(&dest_dir)
}

/// 指定フォルダ内の全 .toml を一括インポート
#[tauri::command]
pub fn import_all_profiles(src_dir: String) -> Result<Vec<String>, String> {
    config::import_all_profiles(&src_dir)
}

// ============================================================
// Phase 2: バックアップコマンド
// ============================================================

#[tauri::command]
pub async fn start_backup(
    app: tauri::AppHandle,
    profile: String,
    state: tauri::State<'_, Mutex<BackupState>>,
    cancel: tauri::State<'_, Arc<AtomicBool>>,
) -> Result<(), String> {
    cancel.store(false, Ordering::Relaxed);

    if let Ok(mut s) = state.lock() {
        *s = BackupState {
            status: "running".to_string(),
            detail: "バックアップ開始".to_string(),
            current_share: None,
            current_dest: None,
        };
    }

    let cfg = config::load_profile(&profile)?;
    let cancel_clone = Arc::clone(&cancel);
    let profile_clone = profile.clone();

    tokio::spawn(async move {
        let result = crate::backup::run_backup(app.clone(), profile_clone, cfg, cancel_clone).await;
        if let Err(e) = result {
            eprintln!("[error] バックアップ失敗: {}", e);
        }
    });

    Ok(())
}

#[tauri::command]
pub fn cancel_backup(cancel: tauri::State<'_, Arc<AtomicBool>>) -> Result<(), String> {
    cancel.store(true, Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
pub fn get_backup_status(
    state: tauri::State<'_, Mutex<BackupState>>,
) -> Result<BackupState, String> {
    state.lock()
        .map(|s| s.clone())
        .map_err(|e| format!("状態取得失敗: {}", e))
}

#[tauri::command]
pub fn check_destinations(profile: String) -> Result<Vec<DestStatus>, String> {
    let cfg = config::load_profile(&profile)?;
    let results = cfg
        .destinations
        .paths
        .iter()
        .map(|p| {
            let path = std::path::Path::new(p);
            let writable = crate::backup::is_writable_dir(path);
            let latest_backup = crate::backup::latest_ts_in_success(path, &profile);
            DestStatus {
                path: p.clone(),
                writable,
                latest_backup,
            }
        })
        .collect();
    Ok(results)
}

#[tauri::command]
pub fn get_backup_history(dest: String, profile: String) -> Result<Vec<HistoryEntry>, String> {
    let path = std::path::Path::new(&dest);
    let succ = path.join("_run_success").join(&profile);
    if !succ.exists() {
        return Ok(vec![]);
    }
    use regex::Regex;
    let re = Regex::new(r"^\d{8}__\d{4}$").unwrap();
    let mut entries: Vec<HistoryEntry> = std::fs::read_dir(&succ)
        .map_err(|e| e.to_string())?
        .filter_map(|e| {
            let e = e.ok()?;
            let p = e.path();
            if p.is_dir() {
                let name = p.file_name()?.to_str()?.to_string();
                if re.is_match(&name) {
                    return Some(HistoryEntry {
                        timestamp: name,
                        path: dest.clone(),
                    });
                }
            }
            None
        })
        .collect();
    entries.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    Ok(entries)
}

#[tauri::command]
pub fn read_log(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path)
        .map_err(|e| format!("ログ読み込み失敗: {}", e))
}

/// 指定タイムスタンプに対応する詳細ログファイルの一覧を返す
/// ファイル名: {timestamp}_{label}.txt
#[tauri::command]
pub fn list_detail_logs(dest: String, profile: String, timestamp: String) -> Result<Vec<String>, String> {
    let dir = std::path::Path::new(&dest)
        .join("log")
        .join(format!("{}_detail", profile));
    if !dir.exists() {
        return Ok(vec![]);
    }
    let prefix = format!("{}_", timestamp);
    let mut files: Vec<String> = std::fs::read_dir(&dir)
        .map_err(|e| format!("詳細ログ一覧取得失敗: {}", e))?
        .filter_map(|e| {
            let e = e.ok()?;
            let path = e.path();
            if path.is_file() {
                let name = path.file_name()?.to_str()?;
                if name.starts_with(&prefix) && name.ends_with(".txt") {
                    return Some(path.to_string_lossy().to_string());
                }
            }
            None
        })
        .collect();
    files.sort();
    Ok(files)
}

// ============================================================
// Discord テスト送信コマンド
// ============================================================

#[tauri::command]
pub async fn test_discord(webhook_url: String) -> Result<(), String> {
    if webhook_url.is_empty() {
        return Err("Webhook URL が設定されていません".to_string());
    }
    if !webhook_url.starts_with("https://") {
        return Err("Webhook URL は https:// で始まる必要があります".to_string());
    }
    let client = reqwest::Client::new();
    let payload = serde_json::json!({
        "content": "✅ GenBack テスト通知 — Webhook の設定が正常に動作しています。"
    });
    let resp = client
        .post(&webhook_url)
        .header("Content-Type", "application/json")
        .header("User-Agent", "Mozilla/5.0")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("送信失敗: {}", e))?;

    if resp.status().is_success() {
        Ok(())
    } else {
        Err(format!("Discord API エラー: HTTP {}", resp.status()))
    }
}

// ============================================================
// Phase 4: スケジュール管理コマンド
// ============================================================

#[tauri::command]
pub async fn list_schedules() -> Result<Vec<ScheduleEntry>, String> {
    tokio::task::spawn_blocking(scheduler::list_schedules)
        .await
        .map_err(|e| format!("スケジュール取得失敗: {}", e))?
}

#[tauri::command]
pub async fn create_schedule(profile: String, schedule: ScheduleConfig) -> Result<(), String> {
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("実行ファイルパス取得失敗: {}", e))?
        .to_string_lossy()
        .to_string();
    tokio::task::spawn_blocking(move || scheduler::create_schedule(&profile, &schedule, &exe_path))
        .await
        .map_err(|e| format!("スケジュール作成失敗: {}", e))?
}

#[tauri::command]
pub async fn delete_schedule(task_name: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || scheduler::delete_schedule(&task_name))
        .await
        .map_err(|e| format!("スケジュール削除失敗: {}", e))?
}

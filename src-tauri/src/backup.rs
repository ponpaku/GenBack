use crate::config::Config;
use crate::generations::rotate_generations;
use crate::logger::BackupLogger;
use crate::network::{net_use_connect, net_use_disconnect};
use crate::notify::{send_discord_start, send_discord_end, send_discord_error};
use crate::robocopy::run_robocopy;
use crate::trashbox::cleanup_trashbox;
use chrono::Local;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager};

static TS_DIR_RE: OnceLock<Regex> = OnceLock::new();
fn ts_dir_re() -> &'static Regex {
    TS_DIR_RE.get_or_init(|| Regex::new(r"^\d{8}__\d{4}$").unwrap())
}

// ============================================================
// 型定義
// ============================================================

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum BackupStatus {
    Success,
    Partial,
    DestError,
    SourceError,
}

#[derive(Serialize, Clone, Debug)]
pub struct BackupState {
    pub status: String, // "idle" | "running" | "success" | "error"
    pub detail: String,
    pub current_share: Option<String>,
    pub current_dest: Option<String>,
}

impl Default for BackupState {
    fn default() -> Self {
        BackupState {
            status: "idle".to_string(),
            detail: String::new(),
            current_share: None,
            current_dest: None,
        }
    }
}

#[derive(Serialize, Clone)]
pub struct DestStatus {
    pub path: String,
    pub writable: bool,
    pub latest_backup: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct HistoryEntry {
    pub timestamp: String,
    pub path: String,
}

// ============================================================
// ユーティリティ関数
// ============================================================

pub fn nowdate_str() -> String {
    Local::now().format("%Y%m%d__%H%M").to_string()
}

pub fn ts_score(ts_dirname: &str) -> String {
    ts_dirname.replace("__", "")
}

/// 書き込み可否を一時ディレクトリ作成で確認
pub fn is_writable_dir(path: &Path) -> bool {
    if !path.exists() {
        return false;
    }
    let test_dir = path.join(format!("__writetest_{}", rand_u32()));
    match std::fs::create_dir(&test_dir) {
        Ok(_) => {
            let _ = std::fs::remove_dir(&test_dir);
            true
        }
        Err(_) => false,
    }
}

fn rand_u32() -> u32 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| (d.subsec_nanos() % 900000 + 100000) as u32)
        .unwrap_or(123456)
}

/// ソースパスを構築する（NAS: \\host\path / local: path そのまま）
pub fn build_src_path(config: &Config, path: &str) -> String {
    if config.source.kind == "nas" {
        format!("{}\\{}", config.source.host, path)
    } else {
        path.to_string()
    }
}

pub fn check_source_accessible(logger: &BackupLogger, src_path: &str) -> bool {
    let p = PathBuf::from(src_path);
    match p.try_exists() {
        Ok(exists) => {
            if !exists {
                logger.log("warn", &format!("コピー元にアクセスできません: {}", p.display()), true);
            }
            exists
        }
        Err(e) => {
            logger.log("warn", &format!("コピー元の確認でエラーが発生しました: {} ({})", p.display(), e), true);
            false
        }
    }
}

pub fn latest_ts_in_success(dest: &Path, profile: &str) -> Option<String> {
    let succ = dest.join("_run_success").join(profile);
    if !succ.exists() {
        return None;
    }
    let re = ts_dir_re();
    let mut cands: Vec<String> = std::fs::read_dir(&succ)
        .ok()?
        .filter_map(|e| {
            let e = e.ok()?;
            let p = e.path();
            if p.is_dir() {
                let name = p.file_name()?.to_str()?.to_string();
                if re.is_match(&name) {
                    return Some(name);
                }
            }
            None
        })
        .collect();
    cands.sort_by(|a, b| b.cmp(a));
    cands.into_iter().next()
}

pub fn latest_ts_in_success_any(dest: &Path) -> Option<String> {
    let succ = dest.join("_run_success");
    if !succ.exists() {
        return None;
    }
    let re = ts_dir_re();
    let mut best: Option<String> = None;
    let profile_dirs = std::fs::read_dir(&succ).ok()?;
    for prof_entry in profile_dirs.filter_map(|e| e.ok()) {
        let prof_path = prof_entry.path();
        if !prof_path.is_dir() {
            continue;
        }
        if let Ok(ts_dirs) = std::fs::read_dir(&prof_path) {
            for ts_entry in ts_dirs.filter_map(|e| e.ok()) {
                let p = ts_entry.path();
                if p.is_dir() {
                    if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
                        if re.is_match(name) {
                            if best.as_deref().unwrap_or("") < name {
                                best = Some(name.to_string());
                            }
                        }
                    }
                }
            }
        }
    }
    best
}

pub fn latest_ts_in_data(dest: &Path) -> Option<String> {
    let data_root = dest.join("data");
    if !data_root.exists() {
        return None;
    }
    let re = ts_dir_re();
    let mut best: Option<String> = None;
    let share_dirs = std::fs::read_dir(&data_root).ok()?;
    for share_dir in share_dirs.filter_map(|e| e.ok()) {
        let share_path = share_dir.path();
        if !share_path.is_dir() {
            continue;
        }
        if let Ok(ts_dirs) = std::fs::read_dir(&share_path) {
            for ts_entry in ts_dirs.filter_map(|e| e.ok()) {
                let p = ts_entry.path();
                if p.is_dir() {
                    if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
                        if re.is_match(name) {
                            if best.as_deref().unwrap_or("") < name {
                                best = Some(name.to_string());
                            }
                        }
                    }
                }
            }
        }
    }
    best
}

pub fn get_dest_score(dest: &Path) -> Option<String> {
    if !is_writable_dir(dest) {
        return None;
    }
    let ts = latest_ts_in_success_any(dest)
        .or_else(|| latest_ts_in_data(dest));
    Some(match ts {
        Some(t) => ts_score(&t),
        None => "000000000000".to_string(),
    })
}

pub fn select_backup_destination(
    logger: &BackupLogger,
    dests: &[String],
) -> Result<PathBuf, String> {
    let mut scored: Vec<(String, PathBuf)> = dests
        .iter()
        .filter_map(|d| {
            let p = PathBuf::from(d);
            get_dest_score(&p).map(|score| (score, p))
        })
        .collect();

    if scored.is_empty() {
        return Err("バックアップ先が選択できません（全保存先が利用不可の可能性）。".to_string());
    }
    scored.sort_by(|a, b| a.0.cmp(&b.0));
    let chosen = scored[0].1.clone();
    logger.log("info", &format!("バックアップ先を選択: {}", chosen.display()), true);
    Ok(chosen)
}

// ============================================================
// 成功マーカー・クリーンアップ
// ============================================================

pub fn create_success_marker(
    logger: &BackupLogger,
    back: &Path,
    profile: &str,
    nowdate: &str,
) -> Result<(), String> {
    let succ_dir = back.join("_run_success").join(profile).join(nowdate);
    std::fs::create_dir_all(&succ_dir)
        .map_err(|e| format!("success marker ディレクトリ作成失敗: {}", e))?;
    let ts = Local::now().format("%Y-%m-%dT%H:%M:%S").to_string();
    std::fs::write(succ_dir.join("_SUCCESS.txt"), ts)
        .map_err(|e| format!("success marker 書き込み失敗: {}", e))?;
    logger.log("info", &format!("バックアップ完了マーカーを作成: {}", succ_dir.display()), true);
    Ok(())
}

pub fn cleanup_success_history(
    logger: &BackupLogger,
    back: &Path,
    profile: &str,
    keep: i32,
) -> Result<(), String> {
    if keep <= 0 {
        return Ok(());
    }
    let root = back.join("_run_success").join(profile);
    if !root.exists() {
        return Ok(());
    }
    let re = ts_dir_re();
    let mut dirs: Vec<PathBuf> = std::fs::read_dir(&root)
        .map_err(|e| e.to_string())?
        .filter_map(|e| {
            let e = e.ok()?;
            let p = e.path();
            if p.is_dir() {
                let name = p.file_name()?.to_str()?.to_string();
                if re.is_match(&name) {
                    return Some(p);
                }
            }
            None
        })
        .collect();
    dirs.sort_by(|a, b| {
        b.file_name()
            .unwrap_or_default()
            .cmp(a.file_name().unwrap_or_default())
    });
    for p in dirs.iter().skip(keep as usize) {
        if let Err(e) = std::fs::remove_dir_all(p) {
            logger.log("warn", &format!("成功履歴の削除に失敗しました: {} ({})", p.display(), e), true);
        }
    }
    Ok(())
}

pub fn cleanup_detail_logs(
    logger: &BackupLogger,
    detail_log_dir: &Path,
    keep: u32,
) -> Result<(), String> {
    if !detail_log_dir.exists() {
        return Ok(());
    }
    let mut files: Vec<PathBuf> = std::fs::read_dir(detail_log_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| {
            let e = e.ok()?;
            let p = e.path();
            if p.is_file() { Some(p) } else { None }
        })
        .collect();
    files.sort_by(|a, b| {
        b.file_name()
            .unwrap_or_default()
            .cmp(a.file_name().unwrap_or_default())
    });
    for p in files.iter().skip(keep as usize) {
        match std::fs::remove_file(p) {
            Ok(_) => {
                let name = p.file_name().unwrap_or_default().to_string_lossy();
                logger.log("info", &format!("詳細ログを整理: {}", name), true);
            }
            Err(e) => {
                logger.log("warn", &format!("詳細ログの削除に失敗しました: {} ({})", p.display(), e), true);
            }
        }
    }
    Ok(())
}

fn log_skipped_shares(logger: &BackupLogger, labels: &[String], current_idx: usize, reason: &str) {
    let remaining = &labels[current_idx + 1..];
    if !remaining.is_empty() {
        logger.log("info", &format!("以降の処理をスキップします ({}): {}", reason, remaining.join(", ")), true);
    }
}

// ============================================================
// バックアップ先への処理
// ============================================================

/// 指定バックアップ先への一連のバックアップ処理を実行する
pub fn backup_to_dest(
    logger: &BackupLogger,
    config: &Config,
    profile: &str,
    back: &Path,
    fallback_log_path: &Path,
    nowdate: &str,
    preamble: Option<&[String]>,
    cancel: &Arc<AtomicBool>,
) -> BackupStatus {
    let data_dir = back.join("data");
    let back_log = back.join("log");
    let detail_log = back_log.join(format!("{}_detail", profile));

    if std::fs::create_dir_all(&back_log).is_err() || std::fs::create_dir_all(&detail_log).is_err() {
        let fallback = BackupLogger::new(fallback_log_path.to_path_buf(), logger.app_handle.clone());
        fallback.log("error", &format!("バックアップ先ディレクトリの作成に失敗しました: {}", back.display()), true);
        return BackupStatus::DestError;
    }

    let main_log_path = back_log.join(format!("{}_main_log.txt", profile));
    let dest_logger = BackupLogger::new(main_log_path.clone(), logger.app_handle.clone());

    if let Some(lines) = preamble {
        for line in lines {
            BackupLogger::log_raw(&main_log_path, line);
        }
    }

    dest_logger.log("section", &format!("バックアップ開始: {}", back.display()), true);

    if let Err(e) = std::fs::create_dir_all(&data_dir) {
        dest_logger.log("error", &format!("データディレクトリの作成に失敗しました: {} ({})", data_dir.display(), e), true);
        dest_logger.log("section", "バックアップ中断", true);
        return BackupStatus::DestError;
    }

    let labels: Vec<String> = config.source.paths.iter().map(|sp| sp.label.clone()).collect();
    let total = config.source.paths.len();

    for (idx, sp) in config.source.paths.iter().enumerate() {
        if cancel.load(Ordering::Relaxed) {
            dest_logger.log("info", "キャンセルされました", true);
            dest_logger.log("section", "バックアップ中断", true);
            return BackupStatus::DestError;
        }

        dest_logger.log("section", &format!("コピー開始: {} ({}/{})", sp.label, idx + 1, total), true);

        let label_data_dir = data_dir.join(&sp.label);
        if let Err(e) = rotate_generations(&dest_logger, &label_data_dir, nowdate, config.generations.keep) {
            dest_logger.log("error", &format!("世代ローテーションに失敗しました: {} ({})", sp.label, e), true);
            log_skipped_shares(&dest_logger, &labels, idx, "バックアップ先エラー");
            dest_logger.log("section", "バックアップ中断", true);
            return BackupStatus::DestError;
        }

        let dst = label_data_dir.join(nowdate);
        if let Err(e) = std::fs::create_dir_all(&dst) {
            dest_logger.log("error", &format!("コピー先ディレクトリの作成に失敗しました: {} ({})", dst.display(), e), true);
            log_skipped_shares(&dest_logger, &labels, idx, "バックアップ先エラー");
            dest_logger.log("section", "バックアップ中断", true);
            return BackupStatus::DestError;
        }

        let src_path = build_src_path(config, &sp.path);

        if !check_source_accessible(&dest_logger, &src_path) {
            dest_logger.log("error", &format!("コピー元にアクセスできないため処理を中断しました: {}", src_path), true);
            log_skipped_shares(&dest_logger, &labels, idx, "コピー元エラー");
            dest_logger.log("section", "バックアップ中断", true);
            return BackupStatus::SourceError;
        }

        let rc = match run_robocopy(&dest_logger, config, &src_path, &sp.label, &dst, &detail_log, nowdate) {
            Ok(code) => code,
            Err(e) => {
                dest_logger.log("error", &format!("Robocopy の実行に失敗しました: {}", e), true);
                log_skipped_shares(&dest_logger, &labels, idx, "コピー元エラー");
                dest_logger.log("section", "バックアップ中断", true);
                return BackupStatus::SourceError;
            }
        };

        if rc >= 8 {
            dest_logger.log("error", &format!("Robocopy がエラーで終了したため処理を中断しました: {} (終了コード: {})", sp.label, rc), true);
            log_skipped_shares(&dest_logger, &labels, idx, "コピー元エラー");
            dest_logger.log("section", "バックアップ中断", true);
            return BackupStatus::SourceError;
        }

        if config.trashbox.enabled && config.source.kind == "nas" {
            if let Err(e) = cleanup_trashbox(
                &dest_logger,
                &src_path,
                &sp.label,
                config.trashbox.retention_days,
                &config.test_mode,
            ) {
                dest_logger.log("error", &format!("trashbox クリーンアップに失敗したため処理を中断しました: {} ({})", sp.label, e), true);
                log_skipped_shares(&dest_logger, &labels, idx, "コピー元エラー");
                dest_logger.log("section", "バックアップ中断", true);
                return BackupStatus::SourceError;
            }
        }
    }

    let _ = cleanup_detail_logs(&dest_logger, &detail_log, config.generations.detail_log_keep);

    if config.test_mode.enabled {
        dest_logger.log("test", "完了マーカーの作成をスキップしました", true);
    } else {
        let _ = create_success_marker(&dest_logger, back, profile, nowdate);
    }

    dest_logger.log("section", "バックアップ完了", true);
    BackupStatus::Success
}

// ============================================================
// メインバックアップ関数
// ============================================================

pub async fn run_backup(
    app_handle: tauri::AppHandle,
    profile: String,
    config: Config,
    cancel: Arc<AtomicBool>,
) -> Result<(), String> {
    let nowdate = nowdate_str();

    let temp_log_path = std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(format!("main_log_{}.txt", nowdate));
    let temp_logger = BackupLogger::new(temp_log_path.clone(), Some(app_handle.clone()));

    if !["rotate", "simultaneous"].contains(&config.destinations.mode.as_str()) {
        return Err(format!("destinations.mode が無効です: {:?}", config.destinations.mode));
    }
    if config.generations.keep < 1 {
        return Err("generations.keep は 1 以上を指定してください".to_string());
    }

    if config.test_mode.enabled {
        temp_logger.log(
            "test",
            &format!(
                "テストモード: 実際のコピーは行いません (robocopy {} 行 / trashbox {} 件)",
                config.test_mode.robocopy_lines, config.test_mode.trashbox_lines
            ),
            true,
        );
    }

    emit_status(&app_handle, "running", "バックアップ開始", None, None);

    send_discord_start(&config.notification.discord, &config.destinations.paths).await;

    let result = if config.destinations.mode == "simultaneous" {
        run_backup_simultaneous(&temp_logger, &app_handle, &profile, &config, &nowdate, &temp_log_path, &cancel).await
    } else {
        run_backup_rotate(&temp_logger, &app_handle, &profile, &config, &nowdate, &temp_log_path, &cancel).await
    };

    if let Err(ref e) = result {
        send_discord_error(&config.notification.discord, e).await;
    } else {
        send_discord_end(&config.notification.discord).await;
    }

    if config.shutdown.enabled && !config.test_mode.enabled {
        temp_logger.log(
            "info",
            &format!("システムは {} 秒後にシャットダウンします", config.shutdown.delay_seconds),
            true,
        );
        let _ = std::process::Command::new("shutdown")
            .args(["/s", "/t", &config.shutdown.delay_seconds.to_string()])
            .status();
    }

    result
}

async fn run_backup_rotate(
    temp_logger: &BackupLogger,
    app_handle: &tauri::AppHandle,
    profile: &str,
    config: &Config,
    nowdate: &str,
    temp_log_path: &Path,
    cancel: &Arc<AtomicBool>,
) -> Result<(), String> {
    // NAS 認証を先に行い、接続済みの状態でバックアップ先の到達可否を判定する
    if config.source.kind == "nas" {
        net_use_connect(temp_logger, &config.source.host, &config.source.user, &config.source.password)?;
    }
    if config.destinations.kind == "nas" {
        net_use_connect(temp_logger, &config.destinations.host, &config.destinations.user, &config.destinations.password)?;
    }

    // 接続後にバックアップ先を選択する。選択失敗時は切断してから返す
    let back = match select_backup_destination(temp_logger, &config.destinations.paths) {
        Ok(b) => b,
        Err(e) => {
            if config.destinations.kind == "nas" { let _ = net_use_disconnect(temp_logger, &config.destinations.host); }
            if config.source.kind == "nas" { let _ = net_use_disconnect(temp_logger, &config.source.host); }
            return Err(e);
        }
    };

    let logger = BackupLogger::new(
        back.join("log").join(format!("{}_main_log.txt", profile)),
        Some(app_handle.clone()),
    );

    let status = backup_to_dest(&logger, config, profile, &back, temp_log_path, nowdate, None, cancel);

    if status == BackupStatus::Success && config.generations.success_history_keep > 0 && !config.test_mode.enabled {
        for d in &config.destinations.paths {
            let _ = cleanup_success_history(&logger, Path::new(d), profile, config.generations.success_history_keep);
        }
        logger.log("info", &format!("成功履歴を整理しました (保持: {} 世代, 全バックアップ先)", config.generations.success_history_keep), true);
    }

    if config.destinations.kind == "nas" {
        let _ = net_use_disconnect(temp_logger, &config.destinations.host);
    }
    if config.source.kind == "nas" {
        net_use_disconnect(temp_logger, &config.source.host)?;
    }

    let status_msg = match status {
        BackupStatus::Success     => "完了",
        BackupStatus::DestError   => "バックアップ先エラー",
        BackupStatus::SourceError => "コピー元エラー",
        BackupStatus::Partial     => "一部エラー",
    };
    emit_status(
        app_handle,
        if status == BackupStatus::Success { "success" } else { "error" },
        status_msg,
        None, None,
    );

    if status == BackupStatus::Success { Ok(()) } else { Err(status_msg.to_string()) }
}

async fn run_backup_simultaneous(
    temp_logger: &BackupLogger,
    app_handle: &tauri::AppHandle,
    profile: &str,
    config: &Config,
    nowdate: &str,
    temp_log_path: &Path,
    cancel: &Arc<AtomicBool>,
) -> Result<(), String> {
    // NAS 認証を先に行い、接続済みの状態でバックアップ先の到達可否を判定する
    if config.source.kind == "nas" {
        net_use_connect(temp_logger, &config.source.host, &config.source.user, &config.source.password)?;
    }
    if config.destinations.kind == "nas" {
        net_use_connect(temp_logger, &config.destinations.host, &config.destinations.user, &config.destinations.password)?;
    }

    let available: Vec<PathBuf> = config.destinations.paths.iter()
        .filter_map(|d| {
            let p = PathBuf::from(d);
            if is_writable_dir(&p) {
                Some(p)
            } else {
                temp_logger.log("warn", &format!("バックアップ先が利用不可のためスキップ: {}", d), true);
                None
            }
        })
        .collect();

    // 利用可能なバックアップ先がなければ切断してから返す
    if available.is_empty() {
        if config.destinations.kind == "nas" { let _ = net_use_disconnect(temp_logger, &config.destinations.host); }
        if config.source.kind == "nas" { let _ = net_use_disconnect(temp_logger, &config.source.host); }
        return Err("バックアップ先が選択できません（全保存先が利用不可の可能性）。".to_string());
    }

    temp_logger.log("info", &format!("同時バックアップモード: 対象 {} 件", available.len()), true);

    let mut all_success = true;
    let mut source_aborted = false;
    let mut processed_backs: Vec<PathBuf> = Vec::new();

    for back in &available {
        if cancel.load(Ordering::Relaxed) {
            break;
        }
        processed_backs.push(back.clone());

        let dest_list: Vec<String> = available.iter().map(|p| p.to_string_lossy().into_owned()).collect();
        let preamble = vec![
            BackupLogger::make_jsonl("info", &format!("同時バックアップモード / 全対象: {}", dest_list.join(", "))),
            BackupLogger::make_jsonl("info", &format!("ソース接続済み: {}", config.source.host)),
        ];

        let logger = BackupLogger::new(
            back.join("log").join(format!("{}_main_log.txt", profile)),
            Some(app_handle.clone()),
        );

        let status = backup_to_dest(&logger, config, profile, back, temp_log_path, nowdate, Some(&preamble), cancel);

        if status == BackupStatus::Success && config.generations.success_history_keep > 0 && !config.test_mode.enabled {
            let _ = cleanup_success_history(&logger, back, profile, config.generations.success_history_keep);
            logger.log("info", &format!("成功履歴を整理しました (保持: {} 世代)", config.generations.success_history_keep), true);
        }

        if status == BackupStatus::SourceError {
            temp_logger.log("error", "コピー元エラーのため残りのバックアップ先をスキップします", true);
            all_success = false;
            source_aborted = true;
            break;
        } else if status != BackupStatus::Success {
            all_success = false;
        }
    }

    // 各 dest ログに切断情報を追記
    for back in &processed_backs {
        let dest_log = back.join("log").join(format!("{}_main_log.txt", profile));
        if dest_log.exists() {
            BackupLogger::log_raw(
                &dest_log,
                &BackupLogger::make_jsonl("info", &format!("ソース切断: {}", config.source.host)),
            );
        }
    }

    if config.destinations.kind == "nas" {
        let _ = net_use_disconnect(temp_logger, &config.destinations.host);
    }
    if config.source.kind == "nas" {
        net_use_disconnect(temp_logger, &config.source.host)?;
    }

    emit_status(
        app_handle,
        if all_success { "success" } else { "error" },
        if source_aborted { "コピー元エラーで中断" } else { "完了" },
        None, None,
    );

    if all_success { Ok(()) } else { Err("バックアップにエラーがありました".to_string()) }
}

fn emit_status(
    handle: &tauri::AppHandle,
    status: &str,
    detail: &str,
    current_share: Option<&str>,
    current_dest: Option<&str>,
) {
    let state = BackupState {
        status: status.to_string(),
        detail: detail.to_string(),
        current_share: current_share.map(|s| s.to_string()),
        current_dest: current_dest.map(|s| s.to_string()),
    };
    // Managed state（Mutex<BackupState>）を更新することで、
    // get_backup_status() が常に最新の完了・エラー状態を返せるようにする
    if let Ok(mut s) = handle.state::<Mutex<BackupState>>().lock() {
        *s = state.clone();
    }
    let _ = handle.emit("backup://status", state);
}

// ============================================================
// ヘッドレス（CLI）モード専用バックアップ関数
// ============================================================

pub async fn run_backup_headless(
    profile: String,
    config: Config,
    cancel: Arc<AtomicBool>,
) -> Result<(), String> {
    let nowdate = nowdate_str();

    if !["rotate", "simultaneous"].contains(&config.destinations.mode.as_str()) {
        return Err(format!("destinations.mode が無効です: {:?}", config.destinations.mode));
    }
    if config.generations.keep < 1 {
        return Err("generations.keep は 1 以上を指定してください".to_string());
    }

    let temp_log_path = std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(format!("genback_headless_{}.log", nowdate));
    let temp_logger = BackupLogger::new(temp_log_path.clone(), None);

    if config.test_mode.enabled {
        temp_logger.log(
            "test",
            &format!(
                "テストモード: 実際のコピーは行いません (robocopy {} 行 / trashbox {} 件)",
                config.test_mode.robocopy_lines, config.test_mode.trashbox_lines
            ),
            true,
        );
    }

    send_discord_start(&config.notification.discord, &config.destinations.paths).await;

    let result = if config.destinations.mode == "simultaneous" {
        run_backup_simultaneous_headless(&temp_logger, &profile, &config, &nowdate, &temp_log_path, &cancel).await
    } else {
        run_backup_rotate_headless(&temp_logger, &profile, &config, &nowdate, &temp_log_path, &cancel).await
    };

    if let Err(ref e) = result {
        send_discord_error(&config.notification.discord, e).await;
    } else {
        send_discord_end(&config.notification.discord).await;
    }

    if config.shutdown.enabled && !config.test_mode.enabled {
        temp_logger.log(
            "info",
            &format!("システムは {} 秒後にシャットダウンします", config.shutdown.delay_seconds),
            true,
        );
        let _ = std::process::Command::new("shutdown")
            .args(["/s", "/t", &config.shutdown.delay_seconds.to_string()])
            .status();
    }

    result
}

async fn run_backup_rotate_headless(
    temp_logger: &BackupLogger,
    profile: &str,
    config: &Config,
    nowdate: &str,
    temp_log_path: &Path,
    cancel: &Arc<AtomicBool>,
) -> Result<(), String> {
    // NAS 認証を先に行い、接続済みの状態でバックアップ先の到達可否を判定する
    if config.source.kind == "nas" {
        net_use_connect(temp_logger, &config.source.host, &config.source.user, &config.source.password)?;
    }
    if config.destinations.kind == "nas" {
        net_use_connect(temp_logger, &config.destinations.host, &config.destinations.user, &config.destinations.password)?;
    }

    // 接続後にバックアップ先を選択する。選択失敗時は切断してから返す
    let back = match select_backup_destination(temp_logger, &config.destinations.paths) {
        Ok(b) => b,
        Err(e) => {
            if config.destinations.kind == "nas" { let _ = net_use_disconnect(temp_logger, &config.destinations.host); }
            if config.source.kind == "nas" { let _ = net_use_disconnect(temp_logger, &config.source.host); }
            return Err(e);
        }
    };

    let logger = BackupLogger::new(back.join("log").join(format!("{}_main_log.txt", profile)), None);
    let status = backup_to_dest(&logger, config, profile, &back, temp_log_path, nowdate, None, cancel);

    if status == BackupStatus::Success && config.generations.success_history_keep > 0 && !config.test_mode.enabled {
        for d in &config.destinations.paths {
            let _ = cleanup_success_history(&logger, Path::new(d), profile, config.generations.success_history_keep);
        }
        logger.log("info", &format!("成功履歴を整理しました (保持: {} 世代, 全バックアップ先)", config.generations.success_history_keep), true);
    }

    if config.destinations.kind == "nas" {
        let _ = net_use_disconnect(temp_logger, &config.destinations.host);
    }
    if config.source.kind == "nas" {
        net_use_disconnect(temp_logger, &config.source.host)?;
    }

    let status_msg = match status {
        BackupStatus::Success     => "完了",
        BackupStatus::DestError   => "バックアップ先エラー",
        BackupStatus::SourceError => "コピー元エラー",
        BackupStatus::Partial     => "一部エラー",
    };
    if status == BackupStatus::Success { Ok(()) } else { Err(status_msg.to_string()) }
}

async fn run_backup_simultaneous_headless(
    temp_logger: &BackupLogger,
    profile: &str,
    config: &Config,
    nowdate: &str,
    temp_log_path: &Path,
    cancel: &Arc<AtomicBool>,
) -> Result<(), String> {
    // NAS 認証を先に行い、接続済みの状態でバックアップ先の到達可否を判定する
    if config.source.kind == "nas" {
        net_use_connect(temp_logger, &config.source.host, &config.source.user, &config.source.password)?;
    }
    if config.destinations.kind == "nas" {
        net_use_connect(temp_logger, &config.destinations.host, &config.destinations.user, &config.destinations.password)?;
    }

    let available: Vec<PathBuf> = config.destinations.paths.iter()
        .filter_map(|d| {
            let p = PathBuf::from(d);
            if is_writable_dir(&p) {
                Some(p)
            } else {
                temp_logger.log("warn", &format!("バックアップ先が利用不可のためスキップ: {}", d), true);
                None
            }
        })
        .collect();

    // 利用可能なバックアップ先がなければ切断してから返す
    if available.is_empty() {
        if config.destinations.kind == "nas" { let _ = net_use_disconnect(temp_logger, &config.destinations.host); }
        if config.source.kind == "nas" { let _ = net_use_disconnect(temp_logger, &config.source.host); }
        return Err("バックアップ先が選択できません（全保存先が利用不可の可能性）。".to_string());
    }

    let mut all_success = true;
    let mut source_aborted = false;
    let mut processed_backs: Vec<PathBuf> = Vec::new();

    for back in &available {
        if cancel.load(Ordering::Relaxed) {
            break;
        }
        processed_backs.push(back.clone());

        let dest_list: Vec<String> = available.iter().map(|p| p.to_string_lossy().into_owned()).collect();
        let preamble = vec![
            BackupLogger::make_jsonl("info", &format!("同時バックアップモード / 全対象: {}", dest_list.join(", "))),
            BackupLogger::make_jsonl("info", &format!("ソース接続済み: {}", config.source.host)),
        ];

        let logger = BackupLogger::new(back.join("log").join(format!("{}_main_log.txt", profile)), None);
        let status = backup_to_dest(&logger, config, profile, back, temp_log_path, nowdate, Some(&preamble), cancel);

        if status == BackupStatus::Success && config.generations.success_history_keep > 0 && !config.test_mode.enabled {
            let _ = cleanup_success_history(&logger, back, profile, config.generations.success_history_keep);
        }

        if status == BackupStatus::SourceError {
            all_success = false;
            source_aborted = true;
            break;
        } else if status != BackupStatus::Success {
            all_success = false;
        }
    }

    for back in &processed_backs {
        let dest_log = back.join("log").join(format!("{}_main_log.txt", profile));
        if dest_log.exists() {
            BackupLogger::log_raw(
                &dest_log,
                &BackupLogger::make_jsonl("info", &format!("ソース切断: {}", config.source.host)),
            );
        }
    }

    if config.destinations.kind == "nas" {
        let _ = net_use_disconnect(temp_logger, &config.destinations.host);
    }
    if config.source.kind == "nas" {
        net_use_disconnect(temp_logger, &config.source.host)?;
    }

    if source_aborted {
        temp_logger.log("info", "コピー元エラーにより中断しました", true);
    }

    if all_success { Ok(()) } else { Err("バックアップにエラーがありました".to_string()) }
}

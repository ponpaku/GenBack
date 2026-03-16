use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// ============================================================
// 設定構造体
// ============================================================

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Config {
    pub source: SourceConfig,
    pub destinations: DestinationsConfig,
    pub generations: GenerationsConfig,
    pub trashbox: TrashboxConfig,
    pub robocopy: RobocopyConfig,
    pub notification: NotificationConfig,
    pub shutdown: ShutdownConfig,
    pub test_mode: TestModeConfig,
}

/// ソースパス（NAS: share名 / local: フルパス）とラベルのペア
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SourcePath {
    pub path: String,  // NAS: "docs" / local: r"D:\data\docs"
    pub label: String, // バックアップ先の data/{label}/ ディレクトリ名
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SourceConfig {
    /// "nas" | "local"
    #[serde(default = "default_nas")]
    pub kind: String,
    /// NAS 接続先ホスト（例: r"\\server.local"）。local の場合は空
    #[serde(default)]
    pub host: String,
    /// NAS 認証ユーザー。local の場合は空
    #[serde(default)]
    pub user: String,
    /// NAS 認証パスワード。local の場合は空
    #[serde(default)]
    pub password: String,
    /// コピー元パス一覧
    #[serde(default)]
    pub paths: Vec<SourcePath>,
    /// 旧スキーマ互換フィールド（load 時にマイグレーション → 保存時は出力しない）
    #[serde(default, skip_serializing)]
    pub shares: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DestinationsConfig {
    /// "local" | "nas"
    #[serde(default = "default_local")]
    pub kind: String,
    /// NAS 宛先ホスト（net use 認証用）。local の場合は空
    #[serde(default)]
    pub host: String,
    /// NAS 認証ユーザー
    #[serde(default)]
    pub user: String,
    /// NAS 認証パスワード
    #[serde(default)]
    pub password: String,
    pub paths: Vec<String>,
    pub mode: String, // "rotate" | "simultaneous"
}

fn default_nas() -> String { "nas".to_string() }
fn default_local() -> String { "local".to_string() }

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GenerationsConfig {
    pub keep: u32,
    pub detail_log_keep: u32,
    pub success_history_keep: i32,
    /// true = 世代なし完全ミラー（data/ フォルダを作らず直接コピー）
    #[serde(default)]
    pub mirror_mode: bool,
    /// true = バックアップ先直下に直接コピー / false = {dest}/{label}/ 配下にコピー
    /// mirror_mode が false の場合は無効
    #[serde(default)]
    pub mirror_flat: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TrashboxConfig {
    pub enabled: bool,
    pub retention_days: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RobocopyConfig {
    // bool-only flags (デフォルト有効)
    #[serde(default = "default_true")]
    pub opt_mir: bool,
    #[serde(default = "default_true")]
    pub opt_compress: bool,
    #[serde(default = "default_true")]
    pub opt_tee: bool,
    #[serde(default = "default_true")]
    pub opt_np: bool,
    #[serde(default = "default_true")]
    pub opt_ns: bool,
    // value flags
    #[serde(default = "default_true")]
    pub opt_mt_enabled: bool,
    pub threads: u32,
    #[serde(default = "default_true")]
    pub opt_r_enabled: bool,
    pub retry_count: u32,
    #[serde(default = "default_true")]
    pub opt_w_enabled: bool,
    pub retry_wait: u32,
    #[serde(default = "default_true")]
    pub opt_dcopy_enabled: bool,
    #[serde(default = "default_dcopy")]
    pub opt_dcopy_val: String,
    #[serde(default = "default_true")]
    pub opt_copy_enabled: bool,
    #[serde(default = "default_copy")]
    pub opt_copy_val: String,
    pub extra_flags: Vec<String>,
}

fn default_dcopy() -> String { "DAT".to_string() }
fn default_copy() -> String { "DATS".to_string() }

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct NotificationConfig {
    pub discord: DiscordConfig,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DiscordConfig {
    pub enabled: bool,
    pub webhook_url: String,
    #[serde(default = "default_true")]
    pub notify_start: bool,
    #[serde(default = "default_true")]
    pub notify_end: bool,
    #[serde(default = "default_true")]
    pub notify_error: bool,
    pub start_message: String,
    pub end_message: String,
    #[serde(default = "default_error_message")]
    pub error_message: String,
}

fn default_true() -> bool { true }
fn default_error_message() -> String { "[genback] error".to_string() }

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ShutdownConfig {
    pub enabled: bool,
    pub delay_seconds: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TestModeConfig {
    pub enabled: bool,
    pub robocopy_lines: usize,
    pub trashbox_lines: usize,
}

// ============================================================
// デフォルト実装
// ============================================================

impl Default for Config {
    fn default() -> Self {
        Config {
            source: SourceConfig {
                kind: "nas".to_string(),
                host: r"\\nas-server.local".to_string(),
                user: "username".to_string(),
                password: "".to_string(),
                paths: vec![
                    SourcePath { path: "share1".to_string(), label: "share1".to_string() },
                ],
                shares: vec![],
            },
            destinations: DestinationsConfig {
                kind: "local".to_string(),
                host: "".to_string(),
                user: "".to_string(),
                password: "".to_string(),
                paths: vec![
                    r"D:\backup".to_string(),
                ],
                mode: "rotate".to_string(),
            },
            generations: GenerationsConfig {
                keep: 1,
                detail_log_keep: 24,
                success_history_keep: 30,
                mirror_mode: false,
                mirror_flat: false,
            },
            trashbox: TrashboxConfig {
                enabled: true,
                retention_days: 120,
            },
            robocopy: RobocopyConfig {
                opt_mir: true,
                opt_compress: true,
                opt_tee: true,
                opt_np: true,
                opt_ns: true,
                opt_mt_enabled: true,
                threads: 16,
                opt_r_enabled: true,
                retry_count: 3,
                opt_w_enabled: true,
                retry_wait: 5,
                opt_dcopy_enabled: true,
                opt_dcopy_val: "DAT".to_string(),
                opt_copy_enabled: true,
                opt_copy_val: "DATS".to_string(),
                extra_flags: vec![],
            },
            notification: NotificationConfig {
                discord: DiscordConfig {
                    enabled: true,
                    webhook_url: "".to_string(),
                    notify_start: true,
                    notify_end: true,
                    notify_error: true,
                    start_message: "[genback] start".to_string(),
                    end_message: "[genback] finish".to_string(),
                    error_message: "[genback] error".to_string(),
                },
            },
            shutdown: ShutdownConfig {
                enabled: false,
                delay_seconds: 300,
            },
            test_mode: TestModeConfig {
                enabled: false,
                robocopy_lines: 10,
                trashbox_lines: 5,
            },
        }
    }
}

// ============================================================
// 旧スキーマ → 新スキーマ マイグレーション
// ============================================================

/// 旧フォーマット（shares: Vec<String>）を新フォーマット（paths: Vec<SourcePath>）へ変換
fn migrate_config(config: &mut Config) {
    // source.shares が残っていて paths が空なら移行
    if config.source.paths.is_empty() && !config.source.shares.is_empty() {
        config.source.paths = config.source.shares
            .iter()
            .map(|s| SourcePath { path: s.clone(), label: s.clone() })
            .collect();
    }
    // kind が空なら既存プロファイルは NAS 扱い
    if config.source.kind.is_empty() {
        config.source.kind = "nas".to_string();
    }
    if config.destinations.kind.is_empty() {
        config.destinations.kind = "local".to_string();
    }
}

// ============================================================
// プロファイルディレクトリ
// ============================================================

pub fn profiles_dir() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join(".genback").join("profiles")
}

// ============================================================
// プロファイル管理関数
// ============================================================

pub fn list_profiles() -> Result<Vec<String>, String> {
    let dir = profiles_dir();
    if !dir.exists() {
        return Ok(vec![]);
    }
    let entries = std::fs::read_dir(&dir)
        .map_err(|e| format!("プロファイルディレクトリ読み取り失敗: {}", e))?;
    let mut names: Vec<String> = entries
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let path = entry.path();
            if path.extension()?.to_str()? == "toml" {
                path.file_stem()?.to_str().map(|s| s.to_string())
            } else {
                None
            }
        })
        .collect();
    names.sort();
    Ok(names)
}

pub fn load_profile(name: &str) -> Result<Config, String> {
    let path = profiles_dir().join(format!("{}.toml", name));
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("プロファイル読み込み失敗 '{}': {}", name, e))?;
    let mut config: Config = toml::from_str(&content)
        .map_err(|e| format!("プロファイル解析失敗 '{}': {}", name, e))?;
    migrate_config(&mut config);
    Ok(config)
}

pub fn save_profile(name: &str, config: &Config) -> Result<(), String> {
    let dir = profiles_dir();
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("プロファイルディレクトリ作成失敗: {}", e))?;
    let path = dir.join(format!("{}.toml", name));
    let content = toml::to_string_pretty(config)
        .map_err(|e| format!("TOML シリアライズ失敗: {}", e))?;
    std::fs::write(&path, content)
        .map_err(|e| format!("プロファイル書き込み失敗 '{}': {}", name, e))
}

pub fn delete_profile(name: &str) -> Result<(), String> {
    let path = profiles_dir().join(format!("{}.toml", name));
    std::fs::remove_file(&path)
        .map_err(|e| format!("プロファイル削除失敗 '{}': {}", name, e))
}

pub fn import_profile(src_path: &str) -> Result<String, String> {
    let src = std::path::Path::new(src_path);
    let stem = src
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "ファイル名の取得に失敗しました".to_string())?;
    let content = std::fs::read_to_string(src)
        .map_err(|e| format!("ファイル読み込み失敗: {}", e))?;
    // TOML として正しいかチェック（マイグレーション込み）
    let mut config: Config = toml::from_str(&content)
        .map_err(|e| format!("TOML 解析失敗: {}", e))?;
    migrate_config(&mut config);
    let dir = profiles_dir();
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("プロファイルディレクトリ作成失敗: {}", e))?;
    // マイグレーション済みの内容で保存
    let new_content = toml::to_string_pretty(&config)
        .map_err(|e| format!("TOML シリアライズ失敗: {}", e))?;
    let dst = dir.join(format!("{}.toml", stem));
    std::fs::write(&dst, new_content)
        .map_err(|e| format!("プロファイル保存失敗: {}", e))?;
    Ok(stem.to_string())
}

pub fn export_profile(name: &str, dest_path: &str) -> Result<(), String> {
    let src = profiles_dir().join(format!("{}.toml", name));
    std::fs::copy(&src, dest_path)
        .map_err(|e| format!("プロファイルエクスポート失敗 '{}': {}", name, e))?;
    Ok(())
}

/// プロファイル名バリデーション（共通）
pub fn validate_profile_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("プロファイル名を入力してください".to_string());
    }
    if name.contains('/') || name.contains('\\') || name.contains('.') {
        return Err("プロファイル名に '/' '\\' '.' は使用できません".to_string());
    }
    Ok(())
}

/// プロファイルをリネームする。
/// - TOML ファイルを新名でコピー後に旧ファイルを削除
/// - 各バックアップ先の log/ および _run_success/ ディレクトリを best-effort でリネーム
/// - 戻り値: 旧スケジュールタスク名（存在した場合）のリスト（呼び出し元がスケジュール削除を担う）
pub fn rename_profile(old_name: &str, new_name: &str) -> Result<Vec<String>, String> {
    validate_profile_name(new_name)?;
    let dir = profiles_dir();
    let old_path = dir.join(format!("{}.toml", old_name));
    let new_path = dir.join(format!("{}.toml", new_name));
    if !old_path.exists() {
        return Err(format!("プロファイル '{}' が見つかりません", old_name));
    }
    if new_path.exists() {
        return Err(format!("プロファイル '{}' は既に存在します", new_name));
    }

    let config = load_profile(old_name)?;

    // 新名で保存
    save_profile(new_name, &config)?;

    // 各バックアップ先のディレクトリを best-effort でリネーム
    for dest in &config.destinations.paths {
        let dest_path = std::path::Path::new(dest);
        let log_dir = dest_path.join("log");
        if log_dir.exists() {
            // メインログ
            let old_log = log_dir.join(format!("{}_main_log.txt", old_name));
            let new_log = log_dir.join(format!("{}_main_log.txt", new_name));
            if old_log.exists() { let _ = std::fs::rename(&old_log, &new_log); }
            // 詳細ログディレクトリ
            let old_detail = log_dir.join(format!("{}_detail", old_name));
            let new_detail = log_dir.join(format!("{}_detail", new_name));
            if old_detail.exists() { let _ = std::fs::rename(&old_detail, &new_detail); }
        }
        // 成功マーカーディレクトリ
        let old_success = dest_path.join("_run_success").join(old_name);
        let new_success = dest_path.join("_run_success").join(new_name);
        if old_success.exists() { let _ = std::fs::rename(&old_success, &new_success); }
    }

    // 旧 TOML 削除
    std::fs::remove_file(&old_path)
        .map_err(|e| format!("旧プロファイルファイル削除失敗: {}", e))?;

    // 旧スケジュールタスク名を返す（呼び出し元が削除する）
    Ok(vec![format!(r"\genback\{}", old_name)])
}

/// プロファイルを複製する（設定のみコピー、ログ/履歴は引き継がない）
pub fn duplicate_profile(src_name: &str, new_name: &str) -> Result<(), String> {
    validate_profile_name(new_name)?;
    let dir = profiles_dir();
    let new_path = dir.join(format!("{}.toml", new_name));
    if new_path.exists() {
        return Err(format!("プロファイル '{}' は既に存在します", new_name));
    }
    let config = load_profile(src_name)?;
    save_profile(new_name, &config)
}

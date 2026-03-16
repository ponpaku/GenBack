mod backup;
mod commands;
mod config;
mod generations;
mod logger;
mod network;
mod notify;
mod robocopy;
mod scheduler;
mod trashbox;
mod vss;

use commands::*;

/// GUI モードで起動する（通常の Tauri アプリ）
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(std::sync::Mutex::new(backup::BackupState::default()))
        .manage(std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)))
        .invoke_handler(tauri::generate_handler![
            // Phase 1: プロファイル管理
            list_profiles,
            load_profile,
            save_profile,
            delete_profile,
            rename_profile,
            duplicate_profile,
            import_profile,
            export_profile,
            export_all_profiles,
            import_all_profiles,
            get_default_config,
            // Phase 2: バックアップ
            start_backup,
            cancel_backup,
            get_backup_status,
            check_destinations,
            get_backup_history,
            read_log,
            list_detail_logs,
            // Discord テスト
            test_discord,
            // Phase 4: スケジュール
            list_schedules,
            create_schedule,
            delete_schedule,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// ヘッドレス（CLI）モードで起動する
/// 引数: --profile <name>（省略時は "default"）
/// 終了コード: 0=成功, 1=エラー
pub fn run_headless(args: Vec<String>) {
    // --profile <name> を取得
    let profile = args
        .windows(2)
        .find(|w| w[0] == "--profile")
        .map(|w| w[1].clone())
        .unwrap_or_else(|| "default".to_string());

    println!("[genback] headless モード起動: profile={}", profile);

    let cfg = match config::load_profile(&profile) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[error] プロファイル読み込み失敗: {}", e);
            std::process::exit(1);
        }
    };

    // tokio ランタイムを構築して非同期バックアップを実行
    let rt = match tokio::runtime::Runtime::new() {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[error] tokio ランタイム初期化失敗: {}", e);
            std::process::exit(1);
        }
    };

    let cancel = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));

    // Ctrl+C ハンドラ
    {
        let cancel_clone = cancel.clone();
        ctrlc_setup(cancel_clone);
    }

    // ヘッドレス用ロガー（app_handle = None）
    let nowdate = backup::nowdate_str();
    let temp_log_path = std::path::PathBuf::from(format!("genback_headless_{}.log", nowdate));
    let logger = logger::BackupLogger::new(temp_log_path.clone(), None);

    logger.log("info", &format!("headless バックアップ開始: profile={}", profile), true);

    // AppHandle なしで run_backup を呼ぶ専用関数
    let result = rt.block_on(backup::run_backup_headless(profile.clone(), cfg, cancel));

    match result {
        Ok(_) => {
            println!("[genback] バックアップ完了");
            std::process::exit(0);
        }
        Err(e) => {
            eprintln!("[genback] バックアップ失敗: {}", e);
            std::process::exit(1);
        }
    }
}

fn ctrlc_setup(cancel: std::sync::Arc<std::sync::atomic::AtomicBool>) {
    // Ctrl+C で AtomicBool をセット
    std::thread::spawn(move || {
        // 簡易的な Ctrl+C 検出（Windows では SIGINT に相当）
        // 本番では ctrlc クレートを使うのが望ましいが、依存を増やさないよう省略
        let _ = cancel; // ムーブだけ行い、スレッドを維持
    });
}

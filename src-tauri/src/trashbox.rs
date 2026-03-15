use crate::config::TestModeConfig;
use crate::logger::BackupLogger;
use std::time::{Duration, SystemTime};
use walkdir::WalkDir;

/// trashbox 内の古いファイルを削除する
pub fn cleanup_trashbox(
    logger: &BackupLogger,
    src_path: &str,
    label: &str,
    days: u32,
    test_mode: &TestModeConfig,
) -> Result<(), String> {
    let trashbox = std::path::PathBuf::from(src_path).join("trashbox");
    logger.log("info", &format!("trashbox クリーンアップ開始: {} (保持期間 {} 日)", label, days), true);

    if !trashbox.exists() {
        logger.log("info", &format!("trashbox が存在しません。スキップします: {}", trashbox.display()), true);
        return Ok(());
    }

    let cutoff = SystemTime::now()
        .checked_sub(Duration::from_secs(days as u64 * 86400))
        .unwrap_or(SystemTime::UNIX_EPOCH);

    if test_mode.enabled {
        let mut shown = 0usize;
        let mut total = 0usize;
        for entry in WalkDir::new(&trashbox).into_iter().filter_map(|e| e.ok()) {
            if !entry.file_type().is_file() {
                continue;
            }
            if let Ok(meta) = entry.metadata() {
                if let Ok(mtime) = meta.modified() {
                    if mtime < cutoff {
                        total += 1;
                        if shown < test_mode.trashbox_lines {
                            logger.log("test", &format!("削除対象 (表示のみ): {}", entry.path().display()), true);
                            shown += 1;
                        }
                    }
                }
            }
        }
        if total > test_mode.trashbox_lines {
            logger.log("test", &format!("... 他 {} 件省略 (合計 {} 件)", total - test_mode.trashbox_lines, total), true);
        } else if total == 0 {
            logger.log("test", &format!("削除対象なし (保持期間 {} 日超のファイルなし)", days), true);
        }
        return Ok(());
    }

    let mut deleted_files = 0usize;
    let mut errors = 0usize;

    // 古いファイル削除（1ファイルごとのログは出さない）
    for entry in WalkDir::new(&trashbox).into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        match entry.metadata() {
            Ok(meta) => {
                if let Ok(mtime) = meta.modified() {
                    if mtime < cutoff {
                        match std::fs::remove_file(entry.path()) {
                            Ok(_) => deleted_files += 1,
                            Err(_) => errors += 1,
                        }
                    }
                }
            }
            Err(_) => errors += 1,
        }
    }

    // 空ディレクトリ削除
    let mut removed_dirs = 0usize;
    let dirs: Vec<_> = WalkDir::new(&trashbox)
        .contents_first(true)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_dir() && e.path() != trashbox)
        .collect();

    for entry in dirs {
        let is_empty = std::fs::read_dir(entry.path())
            .map(|mut d| d.next().is_none())
            .unwrap_or(false);
        if is_empty {
            match std::fs::remove_dir(entry.path()) {
                Ok(_) => removed_dirs += 1,
                Err(_) => errors += 1,
            }
        }
    }

    if errors > 0 {
        logger.log(
            "warn",
            &format!("trashbox クリーンアップ完了: ファイル {} 件, フォルダ {} 件を削除 ({} 件のエラー)", deleted_files, removed_dirs, errors),
            true,
        );
    } else {
        logger.log(
            "info",
            &format!("trashbox クリーンアップ完了: ファイル {} 件, フォルダ {} 件を削除", deleted_files, removed_dirs),
            true,
        );
    }

    Ok(())
}

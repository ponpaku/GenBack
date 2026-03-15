use crate::logger::BackupLogger;
use regex::Regex;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

static TS_DIR_RE: OnceLock<Regex> = OnceLock::new();

fn ts_dir_re() -> &'static Regex {
    TS_DIR_RE.get_or_init(|| Regex::new(r"^\d{8}__\d{4}$").unwrap())
}

/// parent 直下の YYYYMMDD__HHMM ディレクトリを新しい順で返す
pub fn list_ts_dirs(parent: &Path) -> Vec<PathBuf> {
    if !parent.exists() {
        return vec![];
    }
    let re = ts_dir_re();
    let mut dirs: Vec<PathBuf> = std::fs::read_dir(parent)
        .into_iter()
        .flatten()
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let path = entry.path();
            if path.is_dir() {
                let name = path.file_name()?.to_str()?;
                if re.is_match(name) {
                    return Some(path);
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
    dirs
}

/// バックアップ世代のローテーション
pub fn rotate_generations(
    logger: &BackupLogger,
    share_data_dir: &Path,
    nowdate: &str,
    keep: u32,
) -> Result<(), String> {
    std::fs::create_dir_all(share_data_dir)
        .map_err(|e| format!("ディレクトリ作成失敗: {}", e))?;

    // 古い世代を削除（keep を超えた分）
    let dirs = list_ts_dirs(share_data_dir);
    for p in dirs.iter().skip(keep as usize) {
        match std::fs::remove_dir_all(p) {
            Ok(_) => {
                let label = share_data_dir.file_name().unwrap_or_default().to_string_lossy();
                let gen = p.file_name().unwrap_or_default().to_string_lossy();
                logger.log("info", &format!("古い世代を削除: {}\\{}", label, gen), true);
            }
            Err(e) => {
                logger.log("warn", &format!("古い世代の削除に失敗しました: {} ({})", p.display(), e), true);
            }
        }
    }

    // 再リスト
    let dirs = list_ts_dirs(share_data_dir);
    let dir_count = dirs.len() as u32;

    // keep=1 の特例
    if keep <= 1 && dir_count >= 1 {
        let src = &dirs[0];
        let dst = share_data_dir.join(nowdate);
        let src_name = src.file_name().unwrap_or_default().to_string_lossy().to_string();
        if src_name != nowdate && !dst.exists() {
            match std::fs::rename(src, &dst) {
                Ok(_) => {
                    let label = share_data_dir.file_name().unwrap_or_default().to_string_lossy();
                    logger.log("info", &format!("世代フォルダを更新: {} ← {}\\{}", nowdate, label, src_name), true);
                }
                Err(e) => {
                    logger.log("warn", &format!("世代フォルダの更新に失敗しました: {} → {} ({})", src.display(), dst.display(), e), true);
                }
            }
        }
        return Ok(());
    }

    // keep>1: dir_count >= keep なら古い側の1つを nowdate にリネーム
    if keep > 1 && dir_count >= keep {
        let idx = (keep - 1) as usize;
        let src = &dirs[idx];
        let dst = share_data_dir.join(nowdate);
        let src_name = src.file_name().unwrap_or_default().to_string_lossy().to_string();
        if src_name != nowdate && !dst.exists() {
            match std::fs::rename(src, &dst) {
                Ok(_) => {
                    let label = share_data_dir.file_name().unwrap_or_default().to_string_lossy();
                    logger.log("info", &format!("世代フォルダを更新: {} ← {}\\{}", nowdate, label, src_name), true);
                }
                Err(e) => {
                    logger.log("warn", &format!("世代フォルダの更新に失敗しました: {} → {} ({})", src.display(), dst.display(), e), true);
                }
            }
        }
    }

    Ok(())
}

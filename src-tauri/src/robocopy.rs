use crate::config::{Config, TestModeConfig};
use crate::logger::BackupLogger;
use serde::Serialize;
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Command, Stdio};
use tauri::Emitter;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Serialize, Clone)]
pub struct ProgressEvent {
    pub share: String,
    pub file: String,
    pub percent: f64,
    pub speed: String,
}

/// robocopy を実行し、進捗イベントを送出する
/// 戻り値: robocopy の終了コード（0-7=正常, 8+=エラー）
pub fn run_robocopy(
    logger: &BackupLogger,
    config: &Config,
    src_path: &str,
    label: &str,
    dst_dir: &Path,
    detail_log_dir: &Path,
    nowdate: &str,
) -> Result<i32, String> {
    let src = src_path.to_string();
    let log_file = detail_log_dir.join(format!("{}_{}.txt", nowdate, label));

    let mut args: Vec<String> = vec![
        src.clone(),
        dst_dir.to_string_lossy().to_string(),
        "/MIR".to_string(),
        "/DCOPY:DAT".to_string(),
        format!("/LOG+:{}", log_file.to_string_lossy()),
        "/NP".to_string(),
        "/NS".to_string(),
        format!("/R:{}", config.robocopy.retry_count),
        format!("/W:{}", config.robocopy.retry_wait),
        "/COMPRESS".to_string(),
        format!("/MT:{}", config.robocopy.threads),
        "/TEE".to_string(),
        "/COPY:DATS".to_string(),
    ];

    for flag in &config.robocopy.extra_flags {
        args.push(flag.clone());
    }

    if config.test_mode.enabled {
        args.push("/L".to_string());
        logger.log("test", &format!("テスト実行 (最大 {} 行表示)", config.test_mode.robocopy_lines), true);
    }

    logger.log("info", &format!("Robocopy 開始: {} → {}", label, dst_dir.display()), true);

    let rc = if config.test_mode.enabled {
        run_robocopy_test(logger, label, &args, &config.test_mode)
    } else {
        run_robocopy_live(logger, label, &args)
    };

    logger.log("info", &format!("Robocopy 完了: {} (終了コード: {})", label, rc), true);

    Ok(rc)
}

fn run_robocopy_test(logger: &BackupLogger, _label: &str, args: &[String], test_config: &TestModeConfig) -> i32 {
    let mut cmd = Command::new("robocopy");
    cmd.args(args).creation_flags(CREATE_NO_WINDOW);

    let output = match cmd.output() {
        Ok(o) => o,
        Err(e) => {
            logger.log("error", &format!("robocopy 実行失敗: {}", e), true);
            return 1;
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let lines: Vec<&str> = stdout
        .lines()
        .filter(|l| !l.trim().is_empty())
        .collect();

    for line in lines.iter().take(test_config.robocopy_lines) {
        println!("{}", line);
    }
    if lines.len() > test_config.robocopy_lines {
        logger.log("test", &format!("... 他 {} 行省略", lines.len() - test_config.robocopy_lines), true);
    }

    output.status.code().unwrap_or(1)
}

fn run_robocopy_live(logger: &BackupLogger, label: &str, args: &[String]) -> i32 {
    let mut cmd = Command::new("robocopy");
    cmd.args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW);

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            logger.log("error", &format!("robocopy 起動失敗: {}", e), true);
            return 1;
        }
    };

    if let Some(stdout) = child.stdout.take() {
        let reader = BufReader::new(stdout);
        for line in reader.lines().map_while(Result::ok) {
            if let Some(handle) = &logger.app_handle {
                let event = ProgressEvent {
                    share: label.to_string(),
                    file: line.trim().to_string(),
                    percent: 0.0,
                    speed: String::new(),
                };
                let _ = handle.emit("backup://progress", event);
            }
        }
    }

    match child.wait() {
        Ok(status) => status.code().unwrap_or(1),
        Err(_) => 1,
    }
}

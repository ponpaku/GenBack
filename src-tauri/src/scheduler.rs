use serde::{Deserialize, Serialize};
use std::process::Command;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Serialize, Deserialize, Clone)]
pub struct ScheduleEntry {
    pub task_name: String,
    pub profile: String,
    pub schedule_type: String,
    pub start_time: String,
    pub status: String,
    pub next_run: String,
    pub detail: String, // MONTHLY: "15日" / WEEKLY: "月,水,金" / ONCE: "2024/01/15"
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ScheduleConfig {
    pub schedule_type: String,   // "DAILY" | "WEEKLY" | "MONTHLY" | "ONCE"
    pub start_time: String,      // "HH:MM"
    pub days_of_week: Option<String>,  // WEEKLY: "MON,WED" など
    pub day_of_month: Option<u32>,     // MONTHLY: 1〜31
    pub start_date: Option<String>,    // ONCE: "YYYY/MM/DD"
}

/// \genback\ フォルダ内のタスク一覧を PowerShell で取得する。
/// schtasks /Query /V でシステム全タスクを読む代わりに
/// Get-ScheduledTask -TaskPath '\genback\' でフォルダ内のみ取得するため高速。
pub fn list_schedules() -> Result<Vec<ScheduleEntry>, String> {
    // PowerShell スクリプト: \genback\ フォルダのタスクをパイプ区切りで出力
    let ps = r#"
$ErrorActionPreference = 'SilentlyContinue'
$tasks = Get-ScheduledTask -TaskPath '\genback\' -ErrorAction SilentlyContinue
if (-not $tasks) { exit 0 }
foreach ($t in $tasks) {
    $info    = Get-ScheduledTaskInfo -TaskPath '\genback\' -TaskName $t.TaskName
    $trigger = $t.Triggers | Select-Object -First 1
    $cn      = if ($trigger) { $trigger.CimClass.CimClassName } else { '' }
    $type    = switch -Wildcard ($cn) {
        '*Daily*'   { 'Daily' }
        '*Weekly*'  { 'Weekly' }
        '*Monthly*' { 'Monthly' }
        '*Time*'    { 'Once' }
        default     { $cn }
    }
    $start = if ($trigger -and $trigger.StartBoundary) {
        try { ([datetime]$trigger.StartBoundary).ToString('HH:mm') } catch { '' }
    } else { '' }
    $next = if ($info -and $info.NextRunTime -and $info.NextRunTime -gt [datetime]::MinValue) {
        $info.NextRunTime.ToString('yyyy/MM/dd HH:mm')
    } else { '' }
    $detail = switch -Wildcard ($cn) {
        '*Monthly*' {
            if ($trigger.StartBoundary) {
                try { "$( ([datetime]$trigger.StartBoundary).Day )日" } catch { '' }
            } else { '' }
        }
        '*Weekly*' {
            $dow = $trigger.DaysOfWeek
            $days = @()
            if ($dow -band 2)  { $days += '月' }
            if ($dow -band 4)  { $days += '火' }
            if ($dow -band 8)  { $days += '水' }
            if ($dow -band 16) { $days += '木' }
            if ($dow -band 32) { $days += '金' }
            if ($dow -band 64) { $days += '土' }
            if ($dow -band 1)  { $days += '日' }
            $days -join ','
        }
        '*Time*' {
            if ($trigger.StartBoundary) {
                try { ([datetime]$trigger.StartBoundary).ToString('yyyy/MM/dd') } catch { '' }
            } else { '' }
        }
        default { '' }
    }
    Write-Output "$($t.TaskName)|$($t.State)|$type|$start|$next|$detail"
}
"#;

    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", ps])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("PowerShell 実行失敗: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut entries: Vec<ScheduleEntry> = Vec::new();

    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() { continue; }
        let parts: Vec<&str> = line.splitn(6, '|').collect();
        if parts.len() < 5 { continue; }
        let profile = parts[0].to_string();
        let task_name = format!(r"\genback\{}", profile);
        entries.push(ScheduleEntry {
            task_name,
            profile,
            status: parts[1].to_string(),
            schedule_type: parts[2].to_string(),
            start_time: parts[3].to_string(),
            next_run: parts[4].to_string(),
            detail: parts.get(5).unwrap_or(&"").trim().to_string(),
        });
    }

    Ok(entries)
}

/// スケジュールを作成する（タスクは \genback\ フォルダに登録）
pub fn create_schedule(profile: &str, config: &ScheduleConfig, exe_path: &str) -> Result<(), String> {
    let task_name = format!(r"\genback\{}", profile);
    let tr = format!("\"{}\" --profile \"{}\" --headless", exe_path, profile);

    let mut args = vec![
        "/Create".to_string(),
        "/TN".to_string(),
        task_name,
        "/TR".to_string(),
        tr,
        "/SC".to_string(),
        config.schedule_type.clone(),
        "/ST".to_string(),
        config.start_time.clone(),
        "/F".to_string(),
    ];

    match config.schedule_type.to_uppercase().as_str() {
        "WEEKLY" => {
            if let Some(days) = &config.days_of_week {
                args.push("/D".to_string());
                args.push(days.clone());
            }
        }
        "MONTHLY" => {
            let day = config.day_of_month.unwrap_or(1);
            args.push("/D".to_string());
            args.push(day.to_string());
        }
        "ONCE" => {
            if let Some(date) = &config.start_date {
                args.push("/SD".to_string());
                args.push(date.clone());
            }
        }
        _ => {}
    }

    let status = Command::new("schtasks")
        .args(&args)
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map_err(|e| format!("schtasks /Create 実行失敗: {}", e))?;

    if !status.success() {
        return Err("スケジュール作成に失敗しました".to_string());
    }
    Ok(())
}

/// スケジュールを削除する
pub fn delete_schedule(task_name: &str) -> Result<(), String> {
    let status = Command::new("schtasks")
        .args(["/Delete", "/TN", task_name, "/F"])
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map_err(|e| format!("schtasks /Delete 実行失敗: {}", e))?;

    if !status.success() {
        return Err("スケジュール削除に失敗しました".to_string());
    }
    Ok(())
}


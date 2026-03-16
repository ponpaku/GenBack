/// VSS（ボリュームシャドウコピーサービス）スナップショット管理
///
/// ローカルソースのバックアップ時に VSS スナップショットを作成することで、
/// 使用中のファイル（ロックされたファイル）もコピー可能にする。
///
/// 要件: Windows 管理者権限
use crate::logger::BackupLogger;
use std::path::Path;
use std::process::Command;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// VSS マウント情報
pub struct VssMount {
    /// スナップショット ID（削除時に使用）
    pub shadow_id: String,
    /// ジャンクション（一時マウントポイント）パス
    pub junction_path: String,
    /// Robocopy に渡す実際のソースパス（ジャンクション経由）
    pub mapped_src: String,
}

/// VSS スナップショットを作成してジャンクションでマウントする
///
/// # 処理フロー
/// 1. PowerShell WMI で Win32_ShadowCopy を作成
/// 2. デバイスオブジェクトパスを取得
/// 3. cmd mklink /j でジャンクションを %TEMP% 配下に作成
/// 4. src_path に対応するジャンクション経由パスを返す
pub fn mount_vss_snapshot(logger: &BackupLogger, src_path: &str) -> Result<VssMount, String> {
    let path = Path::new(src_path);

    // ドライブルート取得 (例: "C:" → "C:\")
    let drive_root = {
        let mut comps = path.components();
        match comps.next() {
            Some(c) => {
                let s = c.as_os_str().to_string_lossy().to_string();
                if s.ends_with('\\') { s } else { format!("{}\\", s) }
            }
            None => return Err("ドライブレターを取得できません".to_string()),
        }
    };

    logger.log("info", &format!("VSS スナップショット作成中: ドライブ={}", drive_root.trim_end_matches('\\')), true);

    // PowerShell スクリプト: スナップショット作成 → ID と DeviceObject を出力
    // 単一引用符でパスを囲むことでバックスラッシュのエスケープ不要
    let ps_script = format!(
        "$r=([WMICLASS]'Win32_ShadowCopy').Create('{}','ClientAccessible');\
         $id=$r.ShadowID;\
         $s=Get-WmiObject Win32_ShadowCopy|Where-Object{{$_.ID -eq $id}};\
         Write-Output $id;\
         Write-Output $s.DeviceObject",
        drive_root
    );

    let out = run_powershell(&ps_script)?;
    let lines: Vec<&str> = out.lines().map(|l| l.trim()).filter(|l| !l.is_empty()).collect();
    if lines.len() < 2 {
        return Err(format!("VSS 出力が不正です（{}行）: {}", lines.len(), out));
    }
    let shadow_id = lines[0].to_string();
    let device_obj = lines[1].to_string(); // 例: \\?\GLOBALROOT\Device\HarddiskVolumeShadowCopy1

    // ジャンクションパス: %TEMP%\genback_vss_XXXXXXXX
    let short_id = shadow_id.replace('-', "").chars().take(8).collect::<String>();
    let junction_path = std::env::temp_dir()
        .join(format!("genback_vss_{}", short_id))
        .to_string_lossy()
        .to_string();

    // mklink /j <junction> "<device_obj>\"
    let device_with_slash = format!("{}\\", device_obj);
    let mk_output = run_cmd(&["mklink", "/j", &junction_path, &device_with_slash])?;
    if mk_output.contains("エラー") || mk_output.to_lowercase().contains("error") {
        // ジャンクション失敗 → スナップショット削除してエラー返す
        let _ = delete_shadow_by_id(&shadow_id);
        return Err(format!("ジャンクション作成失敗: {}", mk_output.trim()));
    }

    // src_path をジャンクション経由のパスに変換
    // 例: "C:\Users\docs" → "<junction>\Users\docs"
    let relative = src_path
        .trim_start_matches(&drive_root)
        .trim_start_matches(drive_root.trim_end_matches('\\'))
        .trim_start_matches('\\');
    let mapped_src = if relative.is_empty() {
        junction_path.clone()
    } else {
        format!("{}\\{}", junction_path, relative)
    };

    logger.log("info", &format!("VSS マウント完了: {} → {}", src_path, mapped_src), true);
    Ok(VssMount { shadow_id, junction_path, mapped_src })
}

/// VSS スナップショットをアンマウントして削除する
pub fn unmount_vss_snapshot(logger: &BackupLogger, mount: &VssMount) {
    // ジャンクション削除 (rmdir はジャンクション自体だけ削除、中身は消えない)
    let _ = run_cmd(&["rmdir", &mount.junction_path]);

    // スナップショット削除
    match delete_shadow_by_id(&mount.shadow_id) {
        Ok(_)  => logger.log("info", "VSS スナップショット削除完了", true),
        Err(e) => logger.log("warn", &format!("VSS スナップショット削除失敗: {}", e), true),
    }
}

// ============================================================
// 内部ヘルパー
// ============================================================

fn run_powershell(script: &str) -> Result<String, String> {
    let mut cmd = Command::new("powershell");
    cmd.args(["-NonInteractive", "-NoProfile", "-Command", script]);

    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd.output()
        .map_err(|e| format!("PowerShell 起動失敗: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("PowerShell エラー: {}", stderr.trim()));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn run_cmd(args: &[&str]) -> Result<String, String> {
    let mut cmd = Command::new("cmd");
    cmd.arg("/c");
    for a in args { cmd.arg(a); }

    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd.output()
        .map_err(|e| format!("cmd 起動失敗: {}", e))?;

    Ok(String::from_utf8_lossy(&output.stdout).to_string()
        + &String::from_utf8_lossy(&output.stderr))
}

fn delete_shadow_by_id(shadow_id: &str) -> Result<(), String> {
    let script = format!(
        "$s=Get-WmiObject Win32_ShadowCopy|Where-Object{{$_.ID -eq '{}'}};\
         if ($s){{$s.Delete()}}",
        shadow_id
    );
    run_powershell(&script).map(|_| ())
}

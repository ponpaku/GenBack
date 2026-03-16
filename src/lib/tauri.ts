import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// ============================================================
// 型定義
// ============================================================

export interface SourcePath {
  path: string;   // NAS: share名("docs") / local: フルパス("D:\\data\\docs")
  label: string;  // バックアップ先 data/{label}/ のフォルダ名
}

export interface SourceConfig {
  kind: string;     // "nas" | "local"
  host: string;     // NAS: "\\\\server.local" / local: ""
  user: string;
  password: string;
  paths: SourcePath[];
}

export interface DestinationsConfig {
  kind: string;     // "local" | "nas"
  host: string;     // NAS: "\\\\nas2" / local: ""
  user: string;
  password: string;
  paths: string[];
  mode: "rotate" | "simultaneous";
}

export interface GenerationsConfig {
  keep: number;
  detail_log_keep: number;
  success_history_keep: number;
  mirror_mode: boolean;
  mirror_flat: boolean;
}

export interface TrashboxConfig {
  enabled: boolean;
  retention_days: number;
}

export interface RobocopyConfig {
  opt_mir: boolean;
  opt_compress: boolean;
  opt_tee: boolean;
  opt_np: boolean;
  opt_ns: boolean;
  opt_mt_enabled: boolean;
  threads: number;
  opt_r_enabled: boolean;
  retry_count: number;
  opt_w_enabled: boolean;
  retry_wait: number;
  opt_dcopy_enabled: boolean;
  opt_dcopy_val: string;
  opt_copy_enabled: boolean;
  opt_copy_val: string;
  extra_flags: string[];
}

export interface DiscordConfig {
  enabled: boolean;
  webhook_url: string;
  notify_start: boolean;
  notify_end: boolean;
  notify_error: boolean;
  start_message: string;
  end_message: string;
  error_message: string;
}

export interface NotificationConfig {
  discord: DiscordConfig;
}

export interface ShutdownConfig {
  enabled: boolean;
  delay_seconds: number;
}

export interface TestModeConfig {
  enabled: boolean;
  robocopy_lines: number;
  trashbox_lines: number;
}

export interface Config {
  source: SourceConfig;
  destinations: DestinationsConfig;
  generations: GenerationsConfig;
  trashbox: TrashboxConfig;
  robocopy: RobocopyConfig;
  notification: NotificationConfig;
  shutdown: ShutdownConfig;
  test_mode: TestModeConfig;
}

export interface BackupState {
  status: "idle" | "running" | "success" | "error";
  detail: string;
  current_share: string | null;
  current_dest: string | null;
}

export interface DestStatus {
  path: string;
  writable: boolean;
  latest_backup: string | null;
}

export interface HistoryEntry {
  timestamp: string;
  path: string;
}

export interface LogEvent {
  timestamp: string;
  level: string;
  message: string;
}

export interface ProgressEvent {
  share: string;
  file: string;
  percent: number;
  speed: string;
}

export interface ScheduleEntry {
  task_name: string;
  profile: string;
  schedule_type: string;
  start_time: string;
  status: string;
  next_run: string;
  detail: string;
}

export interface ScheduleConfig {
  schedule_type: string;       // "DAILY" | "WEEKLY" | "MONTHLY" | "ONCE"
  start_time: string;          // "HH:MM"
  days_of_week: string | null; // WEEKLY: "MON,WED" など
  day_of_month: number | null; // MONTHLY: 1〜31
  start_date: string | null;   // ONCE: "YYYY/MM/DD"
}

// ============================================================
// Phase 1: プロファイル管理 API
// ============================================================

export const listProfiles = () => invoke<string[]>("list_profiles");
export const loadProfile = (name: string) => invoke<Config>("load_profile", { name });
export const saveProfile = (name: string, config: Config) => invoke<void>("save_profile", { name, config });
export const deleteProfile = (name: string) => invoke<void>("delete_profile", { name });
export const renameProfile = (oldName: string, newName: string) => invoke<boolean>("rename_profile", { oldName, newName });
export const duplicateProfile = (name: string, newName: string) => invoke<void>("duplicate_profile", { name, newName });
export const importProfile = (path: string) => invoke<string>("import_profile", { path });
export const exportProfile = (name: string, path: string) => invoke<void>("export_profile", { name, path });
export const exportAllProfiles = (destDir: string) => invoke<string[]>("export_all_profiles", { destDir });
export const importAllProfiles = (srcDir: string) => invoke<string[]>("import_all_profiles", { srcDir });
export const getDefaultConfig = () => invoke<Config>("get_default_config");

// ============================================================
// Phase 2: バックアップ API
// ============================================================

export const startBackup = (profile: string) => invoke<void>("start_backup", { profile });
export const cancelBackup = () => invoke<void>("cancel_backup");
export const getBackupStatus = () => invoke<BackupState>("get_backup_status");
export const checkDestinations = (profile: string) => invoke<DestStatus[]>("check_destinations", { profile });
export const getBackupHistory = (dest: string, profile: string) =>
  invoke<HistoryEntry[]>("get_backup_history", { dest, profile });
export const readLog = (path: string) => invoke<string>("read_log", { path });
export const listDetailLogs = (dest: string, profile: string, timestamp: string) =>
  invoke<string[]>("list_detail_logs", { dest, profile, timestamp });

// ============================================================
// Tauri Events
// ============================================================

export const onBackupLog = (cb: (e: LogEvent) => void) =>
  listen<LogEvent>("backup://log", (e) => cb(e.payload));

export const onBackupProgress = (cb: (e: ProgressEvent) => void) =>
  listen<ProgressEvent>("backup://progress", (e) => cb(e.payload));

export const onBackupStatus = (cb: (e: BackupState) => void) =>
  listen<BackupState>("backup://status", (e) => cb(e.payload));

// ============================================================
// Phase 4: スケジュール API
// ============================================================

export const testDiscord = (webhookUrl: string) => invoke<void>("test_discord", { webhookUrl });

export const listSchedules = () => invoke<ScheduleEntry[]>("list_schedules");
export const createSchedule = (profile: string, schedule: ScheduleConfig) =>
  invoke<void>("create_schedule", { profile, schedule });
export const deleteSchedule = (taskName: string) => invoke<void>("delete_schedule", { taskName });

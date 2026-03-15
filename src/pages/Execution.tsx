import { useState, useEffect, useRef, useCallback } from "react";
import {
  listProfiles,
  startBackup,
  cancelBackup,
  onBackupLog,
  onBackupProgress,
  onBackupStatus,
  type LogEvent,
  type ProgressEvent,
  type BackupState,
} from "../lib/tauri";
import { Button, Select, Badge, Card, Spinner } from "../components/ui";

const MAX_LOG_LINES = 1000;

function StatusBadge({ status }: { status: BackupState["status"] }) {
  const variants = {
    idle: { variant: "default" as const, label: "待機中", dot: "bg-gray-500" },
    running: { variant: "info" as const, label: "実行中", dot: "bg-blue-400" },
    success: { variant: "success" as const, label: "完了", dot: "bg-emerald-400" },
    error: { variant: "error" as const, label: "エラー", dot: "bg-red-400" },
  }[status] ?? { variant: "default" as const, label: status, dot: "bg-gray-500" };

  return (
    <Badge variant={variants.variant}>
      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${variants.dot} ${status === "running" ? "animate-pulse-dot" : ""}`} />
      {variants.label}
    </Badge>
  );
}

function LogLine({ log }: { log: LogEvent }) {
  const colorClass =
    log.level === "error"
      ? "text-red-400"
      : log.level === "warn"
      ? "text-amber-400"
      : "text-gray-700 dark:text-gray-300";
  return (
    <div className={`flex gap-2 leading-5 text-xs ${colorClass}`}>
      <span className="text-gray-600 shrink-0 select-none">{log.timestamp.slice(11)}</span>
      <span className="break-all">{log.message}</span>
    </div>
  );
}

export default function Execution() {
  const [profiles, setProfiles] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [status, setStatus] = useState<BackupState>({
    status: "idle",
    detail: "",
    current_share: null,
    current_dest: null,
  });
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const logEndRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listProfiles().then((list) => {
      setProfiles(list);
      if (list.length > 0) setSelected(list[0]);
    });
  }, []);

  useEffect(() => {
    const u1 = onBackupLog((e) => {
      setLogs((prev) => {
        const next = [...prev, e];
        return next.length > MAX_LOG_LINES ? next.slice(next.length - MAX_LOG_LINES) : next;
      });
    });
    const u2 = onBackupProgress((e) => setProgress(e));
    const u3 = onBackupStatus((e) => setStatus(e));
    return () => {
      u1.then((f) => f());
      u2.then((f) => f());
      u3.then((f) => f());
    };
  }, []);

  useEffect(() => {
    if (autoScroll) logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, autoScroll]);

  const handleScroll = useCallback(() => {
    const el = logContainerRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(isAtBottom);
  }, []);

  const handleStart = useCallback(async () => {
    if (!selected) return;
    setLogs([]);
    setProgress(null);
    setError(null);
    setStatus({ status: "running", detail: "開始中...", current_share: null, current_dest: null });
    setAutoScroll(true);
    try {
      await startBackup(selected);
    } catch (e) {
      setError(String(e));
      setStatus({ status: "error", detail: String(e), current_share: null, current_dest: null });
    }
  }, [selected]);

  const handleCancel = useCallback(async () => {
    try {
      await cancelBackup();
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const isRunning = status.status === "running";

  return (
    <div className="flex flex-col h-full p-6 gap-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xl font-bold text-white">バックアップ実行</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">プロファイルを選択してバックアップを開始します</p>
        </div>
        <StatusBadge status={status.status} />
      </div>

      {/* 操作パネル */}
      <Card className="shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400 shrink-0">プロファイル</span>
            <Select
              value={selected}
              onChange={setSelected}
              options={profiles.map((p) => ({ value: p, label: p }))}
              disabled={isRunning}
            />
          </div>
          <div className="flex gap-2 ml-auto">
            {isRunning ? (
              <Button variant="danger" onClick={handleCancel}>
                ⏹ キャンセル
              </Button>
            ) : (
              <Button variant="primary" onClick={handleStart} disabled={!selected}>
                ▶ バックアップ開始
              </Button>
            )}
          </div>
        </div>

        {/* 進捗情報 */}
        {isRunning && (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex items-center gap-3">
            <Spinner size="sm" />
            <div className="text-sm text-gray-700 dark:text-gray-300">
              {status.current_share && (
                <span>処理中: <span className="text-blue-400 font-medium">{status.current_share}</span></span>
              )}
              {progress?.file && (
                <span className="text-gray-500 ml-2 text-xs truncate max-w-xs inline-block align-bottom">
                  {progress.file}
                </span>
              )}
            </div>
            {!autoScroll && (
              <Button variant="ghost" className="ml-auto text-xs" onClick={() => {
                setAutoScroll(true);
                logEndRef.current?.scrollIntoView({ behavior: "smooth" });
              }}>
                ↓ 最新へ
              </Button>
            )}
          </div>
        )}

        {/* 完了メッセージ */}
        {status.status === "success" && (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex items-center gap-2 text-emerald-500 dark:text-emerald-400 text-sm">
            <span>✓</span> バックアップが正常に完了しました
          </div>
        )}
        {status.status === "error" && (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 text-red-500 dark:text-red-400 text-sm">
            <span>✕ エラー: </span>{error ?? status.detail}
          </div>
        )}
      </Card>

      {/* ログエリア */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-2 shrink-0">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
            ログ {logs.length > 0 && <span className="normal-case text-gray-600 ml-1">({logs.length} 行)</span>}
          </span>
          {logs.length > 0 && (
            <Button variant="ghost" className="text-xs" onClick={() => setLogs([])}>
              クリア
            </Button>
          )}
        </div>
        <div
          ref={logContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-auto rounded-xl border border-gray-200 dark:border-gray-700 p-3 font-mono-ja"
          style={{ backgroundColor: "var(--color-code)" }}
        >
          {logs.length === 0 ? (
            <p className="text-gray-600 text-xs">バックアップ開始後、ログがここに表示されます...</p>
          ) : (
            logs.map((log, i) => <LogLine key={i} log={log} />)
          )}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
}

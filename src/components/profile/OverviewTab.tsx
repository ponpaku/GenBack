import { useState, useEffect, useRef } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  getBackupHistory,
  listDetailLogs,
  listSchedules,
  readLog,
  type Config,
  type DestStatus,
  type HistoryEntry,
  type LogEvent,
  type BackupState,
} from "../../lib/tauri";
import { Spinner } from "../ui";

// ============================================================
// ログパーサー
// ============================================================
interface ParsedEntry { ts: string; level: string; msg: string; }

function parseLogs(raw: string): ParsedEntry[] {
  const lines = raw.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return [];
  try { JSON.parse(lines[0]); } catch {
    return lines.map((line) => {
      const m = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s+(.*)/);
      if (m) {
        const rest = m[2];
        const level = rest.includes("[error]") ? "error"
          : rest.includes("[warn]") ? "warn"
          : rest.startsWith("====") ? "section"
          : rest.includes("[TEST]") ? "test" : "info";
        const msg = rest.replace(/^\[(?:error|warn|info|TEST)\]\s*/, "").replace(/^[-=]+\s*/, "").trim();
        return { ts: m[1], level, msg };
      }
      return { ts: "", level: "info", msg: line };
    });
  }
  return lines.map((line) => {
    try { return JSON.parse(line) as ParsedEntry; }
    catch { return { ts: "", level: "info", msg: line }; }
  });
}

function formatTs(ts: string): string {
  if (ts.includes("T") || ts.includes(" ")) return ts.slice(11, 19);
  return ts;
}

// タイムスタンプ形式: YYYYMMDD__HHMM (例: 20260313__1010)
function formatTimestamp(ts: string): string {
  if (ts.length !== 14) return ts;
  return `${ts.slice(0, 4)}/${ts.slice(4, 6)}/${ts.slice(6, 8)} ${ts.slice(10, 12)}:${ts.slice(12, 14)}`;
}

// ============================================================
// DataFlowCard
// ============================================================
function DataFlowCard({ config }: { config: Config }) {
  const srcPaths = config.source.paths;
  const dstPaths = config.destinations.paths;

  return (
    <div className="dataflow-card profile-anim-card">
      <div className="dataflow-inner">
        <div className="dataflow-node">
          <div className="node-icon node-icon--accent">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <ellipse cx="12" cy="5" rx="9" ry="3"/>
              <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/>
              <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/>
            </svg>
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="node-label">ソース{config.source.kind === "nas" ? " (NAS)" : ""}</div>
            <div className="node-value">
              {srcPaths.length > 0 ? (srcPaths[0].label || srcPaths[0].path || "—") : "—"}
            </div>
            {srcPaths.length > 1 && (
              <div style={{ fontSize: "10px", color: "var(--subtle)", marginTop: "1px" }}>+{srcPaths.length - 1} 件</div>
            )}
          </div>
        </div>

        <div className="dataflow-arrow">
          <div className="arrow-line" />
          <div className="arrow-tag">{config.destinations.mode}</div>
        </div>

        <div className="dataflow-node">
          <div className="node-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3zm-8.27 4a2 2 0 0 1-3.46 0"/>
            </svg>
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="node-label">バックアップ先{config.destinations.kind === "nas" ? " (NAS)" : ""}</div>
            <div className="node-value">{dstPaths[0] || "—"}</div>
            {dstPaths.length > 1 && (
              <div style={{ fontSize: "10px", color: "var(--subtle)", marginTop: "1px" }}>+{dstPaths.length - 1} 件</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// StatsRow
// ============================================================
function StatsRow({
  config,
  destStatuses,
  profileName,
}: {
  config: Config;
  destStatuses: DestStatus[];
  profileName: string;
}) {
  const [nextRun, setNextRun] = useState<string>("—");

  useEffect(() => {
    listSchedules().then((schedules) => {
      const match = schedules.find((s) => s.profile === profileName);
      setNextRun(match?.next_run ?? "—");
    }).catch(() => setNextRun("—"));
  }, [profileName]);

  const latestBackup = destStatuses.map((d) => d.latest_backup).filter(Boolean).sort().pop();
  const availableCount = destStatuses.filter((d) => d.writable).length;

  return (
    <div className="stats-row profile-anim-card">
      <div className="stat-card">
        <div className="stat-label">最終バックアップ</div>
        <div className={`stat-value ${latestBackup ? "stat-value--sm" : ""}`}>
          {latestBackup ? formatTimestamp(latestBackup).slice(0, 10) : "—"}
        </div>
        <div className="stat-sub">{latestBackup ? "直近の実行日" : "未実行"}</div>
      </div>
      <div className="stat-card">
        <div className="stat-label">保持世代数</div>
        <div className="stat-value stat-value--accent">{config.generations.keep}</div>
        <div className="stat-sub">世代</div>
      </div>
      <div className="stat-card">
        <div className="stat-label">次回実行</div>
        <div className="stat-value stat-value--sm" style={{ fontSize: nextRun && nextRun !== "—" ? "13px" : undefined }}>
          {nextRun || "—"}
        </div>
        {destStatuses.length > 0 && (
          <div className="stat-sub">{availableCount}/{destStatuses.length} 先が利用可</div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Terminal (auto-scroll only when running)
// ============================================================
function Terminal({
  profileName,
  destStatuses,
  backupStatus,
  liveLogs,
  isRunning,
}: {
  profileName: string;
  destStatuses: DestStatus[];
  backupStatus: BackupState;
  liveLogs: LogEvent[];
  isRunning: boolean;
}) {
  const [lastEntries, setLastEntries] = useState<ParsedEntry[]>([]);
  const [loadingLog, setLoadingLog] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isRunning || destStatuses.length === 0) return;
    const dest = destStatuses[0]?.path;
    if (!dest) return;
    setLoadingLog(true);
    readLog(`${dest}\\log\\${profileName}_main_log.txt`)
      .then((raw) => setLastEntries(parseLogs(raw).slice(-50)))
      .catch(() => setLastEntries([]))
      .finally(() => setLoadingLog(false));
  }, [profileName, destStatuses, isRunning]);

  // auto-scroll は実行中のみ
  useEffect(() => {
    if (!isRunning) return;
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [liveLogs, isRunning]);

  return (
    <div className="terminal profile-anim-card">
      <div className="terminal-bar">
        <span className="terminal-title">
          {isRunning ? "▶ リアルタイムログ" : "最終ログ (末尾 50件)"}
        </span>
        {isRunning && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Spinner size="sm" />
            {backupStatus.current_share && (
              <span style={{ fontSize: "11px", color: "#71717a", fontFamily: "'JetBrains Mono', monospace" }}>
                {backupStatus.current_share}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="terminal-body">
        {loadingLog && !isRunning ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "20px" }}>
            <Spinner size="sm" />
          </div>
        ) : isRunning ? (
          liveLogs.length === 0 ? (
            <div className="tlog-row tlog-info">
              <span className="tlog-time"></span>
              <span className="tlog-level">INFO</span>
              <span className="tlog-msg" style={{ color: "#3f3f46" }}>ログ待機中...</span>
            </div>
          ) : (
            liveLogs.map((log, i) => (
              <div key={i} className={`tlog-row tlog-${log.level || "info"}`}>
                <span className="tlog-time">{log.timestamp ? log.timestamp.slice(11, 19) : ""}</span>
                <span className="tlog-level">{(log.level || "info").toUpperCase().slice(0, 4)}</span>
                <span className="tlog-msg">{log.message}</span>
              </div>
            ))
          )
        ) : lastEntries.length === 0 ? (
          <div className="tlog-row tlog-info">
            <span className="tlog-time"></span>
            <span className="tlog-level">INFO</span>
            <span className="tlog-msg" style={{ color: "#3f3f46" }}>バックアップを実行するとログが表示されます</span>
          </div>
        ) : (
          lastEntries.map((e, i) => (
            <div key={i} className={`tlog-row tlog-${e.level || "info"}`}>
              <span className="tlog-time">{formatTs(e.ts)}</span>
              <span className="tlog-level">{(e.level || "info").toUpperCase().slice(0, 4)}</span>
              <span className="tlog-msg">{e.msg}</span>
            </div>
          ))
        )}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}

// ============================================================
// ExecutionHistory
// ============================================================
const HIST_PAGE_SIZE = 15;

function ExecutionHistory({
  profileName,
  destStatuses,
  onOpenLog,
}: {
  profileName: string;
  destStatuses: DestStatus[];
  onOpenLog?: () => void;
}) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [expandedFiles, setExpandedFiles] = useState<{ key: string; files: string[] } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (destStatuses.length === 0) return;
    setLoading(true);
    Promise.all(
      destStatuses.map((d) => getBackupHistory(d.path, profileName).catch(() => []))
    ).then((results) => {
      const all: HistoryEntry[] = results.flat();
      all.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      setHistory(all);
      setPage(1);
    }).finally(() => setLoading(false));
  }, [profileName, destStatuses]);

  const totalPages = Math.max(1, Math.ceil(history.length / HIST_PAGE_SIZE));
  const pageItems = history.slice((page - 1) * HIST_PAGE_SIZE, page * HIST_PAGE_SIZE);

  const handleDetail = async (h: HistoryEntry) => {
    const rowKey = `${h.timestamp}|${h.path}`;
    if (expandedFiles?.key === rowKey) { setExpandedFiles(null); return; }
    try {
      const files = await listDetailLogs(h.path, profileName, h.timestamp);
      if (files.length === 0) { setErrorMsg("詳細ログファイルが見つかりません"); return; }
      if (files.length === 1) { await openPath(files[0]); return; }
      setExpandedFiles({ key: rowKey, files });
    } catch (e) { setErrorMsg(String(e)); }
  };

  return (
    <div className="hist-section profile-anim-card">
      <div className="hist-toolbar">
        <span className="hist-title">
          実行履歴 {history.length > 0 && `(${history.length}件)`}
        </span>
        <span style={{ flex: 1 }} />
        {onOpenLog && (
          <button className="btn-ghost-sm" style={{ fontSize: "12px" }} onClick={onOpenLog}>
            フルログ →
          </button>
        )}
      </div>

      {errorMsg && (
        <div style={{ marginBottom: "10px", padding: "8px 12px", background: "var(--red-bg)", border: "1px solid rgba(244,63,94,0.25)", color: "var(--red)", borderRadius: "9px", fontSize: "12px" }}>
          {errorMsg}
          <button style={{ marginLeft: "8px", textDecoration: "underline", background: "none", border: "none", cursor: "pointer", color: "inherit" }} onClick={() => setErrorMsg(null)}>閉じる</button>
        </div>
      )}

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "24px" }}>
          <Spinner size="md" />
        </div>
      ) : history.length === 0 ? (
        <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "12px", padding: "24px", textAlign: "center", color: "var(--muted)", fontSize: "13px" }}>
          履歴がありません
        </div>
      ) : (
        <>
          <table className="hist-table">
            <colgroup>
              <col style={{ width: "155px" }} />
              <col />
              <col style={{ width: "80px" }} />
              <col style={{ width: "80px" }} />
            </colgroup>
            <thead>
              <tr>
                <th>日時</th>
                <th>バックアップ先</th>
                <th>結果</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((h) => {
                const rowKey = `${h.timestamp}|${h.path}`;
                const isExpanded = expandedFiles?.key === rowKey;
                return (
                  <>
                    <tr key={rowKey}>
                      <td style={{ color: "var(--text)", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", whiteSpace: "nowrap" }}>
                        {formatTimestamp(h.timestamp)}
                      </td>
                      <td style={{ color: "var(--muted)", fontSize: "12px", overflow: "hidden" }}>
                        <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {h.path}
                        </span>
                      </td>
                      <td>
                        <span style={{
                          display: "inline-flex", alignItems: "center", padding: "2px 8px",
                          borderRadius: "99px", fontSize: "10px", fontWeight: 700,
                          background: "var(--green-bg)", color: "var(--green)",
                          border: "1px solid rgba(16,185,129,0.25)",
                        }}>
                          成功
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button className="hist-detail-btn" onClick={() => handleDetail(h)}>
                          {isExpanded ? "✕" : "詳細"}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && expandedFiles && (
                      <tr key={`${rowKey}-files`} style={{ background: "var(--panel2)" }}>
                        <td colSpan={4} style={{ padding: "8px 14px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            {expandedFiles.files.map((f) => {
                              const name = f.split("\\").pop() ?? f;
                              return (
                                <button
                                  key={f}
                                  style={{ textAlign: "left", fontSize: "11px", color: "var(--accent)", fontFamily: "'JetBrains Mono', monospace", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
                                  onClick={() => openPath(f).catch((e) => setErrorMsg(String(e)))}
                                >
                                  {name}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>

          {/* ページネーション */}
          {totalPages > 1 && (
            <div className="pagination">
              <button className="page-btn" onClick={() => setPage(1)} disabled={page === 1}>«</button>
              <button className="page-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>‹</button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                const p = start + i;
                return (
                  <button
                    key={p}
                    className={`page-btn ${page === p ? "page-btn--active" : ""}`}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </button>
                );
              })}
              <button className="page-btn" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>›</button>
              <button className="page-btn" onClick={() => setPage(totalPages)} disabled={page >= totalPages}>»</button>
              <span className="page-info">{(page - 1) * HIST_PAGE_SIZE + 1}–{Math.min(page * HIST_PAGE_SIZE, history.length)} / {history.length}件</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================
// Main OverviewTab
// ============================================================
interface OverviewTabProps {
  profileName: string;
  config: Config;
  destStatuses: DestStatus[];
  backupStatus: BackupState;
  liveLogs: LogEvent[];
  isRunning: boolean;
  onOpenLogs?: () => void;
}

export default function OverviewTab({
  profileName,
  config,
  destStatuses,
  backupStatus,
  liveLogs,
  isRunning,
  onOpenLogs,
}: OverviewTabProps) {
  return (
    <div className="tab-content">
      <DataFlowCard config={config} />
      <StatsRow config={config} destStatuses={destStatuses} profileName={profileName} />
      <Terminal
        profileName={profileName}
        destStatuses={destStatuses}
        backupStatus={backupStatus}
        liveLogs={liveLogs}
        isRunning={isRunning}
      />
      <ExecutionHistory
        profileName={profileName}
        destStatuses={destStatuses}
        onOpenLog={onOpenLogs}
      />
    </div>
  );
}

import { useState, useEffect, useRef, useCallback } from "react";
import { readLog, type Config } from "../../lib/tauri";
import { Button, Select, Spinner } from "../ui";

interface LogEntry { ts: string; level: string; msg: string; }
type LevelFilter = "all" | "error" | "warn" | "info" | "section" | "test";


function parseLogs(raw: string): LogEntry[] {
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
    try { return JSON.parse(line) as LogEntry; }
    catch { return { ts: "", level: "info", msg: line }; }
  });
}

function formatTs(ts: string) {
  if (ts.includes("T") || ts.includes(" ")) return ts.slice(11, 19);
  return ts;
}
function formatDate(ts: string) {
  if (ts.includes("T") || ts.includes(" ")) return ts.slice(0, 10);
  return "";
}

interface Props {
  profileName: string;
  config: Config;
}

export default function LogTab({ profileName, config }: Props) {
  const destPaths = config.destinations.paths;

  const [selectedDest, setSelectedDest] = useState<string>(destPaths[0] ?? "");
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, []);

  const loadLog = useCallback(async (dest?: string) => {
    const target = dest ?? selectedDest;
    if (!target) return;
    setLoading(true);
    setError(null);
    try {
      const raw = await readLog(`${target}\\log\\${profileName}_main_log.txt`);
      setEntries(parseLogs(raw));
    } catch {
      setError("ログファイルを読み込めませんでした。バックアップを実行するとログが生成されます。");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDest, profileName]);

  // プロファイルまたは選択 dest が変わったら自動ロード
  useEffect(() => {
    setSelectedDest(destPaths[0] ?? "");
    setEntries([]);
    setSearch("");
    setLevelFilter("all");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileName]);

  useEffect(() => {
    if (selectedDest) loadLog(selectedDest);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDest]);

  useEffect(() => {
    if (entries.length > 0) scrollToBottom();
  }, [entries, scrollToBottom]);

  const filtered = entries.filter((e) => {
    if (levelFilter !== "all" && e.level !== levelFilter) return false;
    if (search && !e.msg.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const errorCount = entries.filter((e) => e.level === "error").length;
  const warnCount  = entries.filter((e) => e.level === "warn").length;

  return (
    <div className="flex flex-col h-full p-4 gap-3">
      {/* ツールバー */}
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        {destPaths.length > 1 && (
          <Select
            value={selectedDest}
            onChange={setSelectedDest}
            options={destPaths.map((d) => ({ value: d, label: d }))}
            className="max-w-xs"
          />
        )}
        <Button variant="secondary" onClick={() => loadLog()} disabled={!selectedDest || loading}>
          {loading ? <Spinner size="sm" /> : "↻"} 再読み込み
        </Button>

        {entries.length > 0 && (
          <>
            <div className="flex gap-1">
              {(["all", "error", "warn", "info"] as LevelFilter[]).map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => setLevelFilter(lvl)}
                  className={`px-2 py-1 rounded text-xs font-medium transition ${
                    levelFilter === lvl
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
                >
                  {lvl === "all" ? "すべて" : lvl.toUpperCase()}
                  {lvl === "error" && errorCount > 0 && (
                    <span className="ml-1 bg-red-500 text-white rounded-full px-1 text-[10px]">{errorCount}</span>
                  )}
                  {lvl === "warn" && warnCount > 0 && (
                    <span className="ml-1 bg-amber-500 text-white rounded-full px-1 text-[10px]">{warnCount}</span>
                  )}
                </button>
              ))}
            </div>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px", flexShrink: 0, flexWrap: "nowrap" }}>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <svg style={{ position: "absolute", left: "8px", pointerEvents: "none", color: "var(--muted)" }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="検索..." className="field-input" style={{ paddingLeft: "27px", width: "176px" }} />
              </div>
              <button
                className="btn-ghost-sm"
                style={{ fontSize: "12px", flexShrink: 0, whiteSpace: "nowrap" }}
                onClick={() => { setEntries([]); setSearch(""); setLevelFilter("all"); }}
              >
                クリア
              </button>
            </div>
          </>
        )}
      </div>

      {/* エラー */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700/40 text-amber-800 dark:text-amber-300 rounded-xl text-sm shrink-0">
          <span>ℹ</span> {error}
        </div>
      )}

      {/* 件数 */}
      {entries.length > 0 && (
        <div className="shrink-0 text-xs text-gray-500">
          {filtered.length} 件{search && ` (「${search}」に一致)`}{levelFilter !== "all" && ` / ${levelFilter.toUpperCase()} のみ`}
        </div>
      )}

      {/* ログ本体 */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0"
        style={{ overflow: "auto", borderRadius: "12px", border: "1px solid #27272a", background: "#0d0d0f" }}
      >
        {!entries.length && !loading ? (
          <div className="tlog-row tlog-info" style={{ padding: "16px 10px" }}>
            <span className="tlog-time"></span>
            <span className="tlog-level">INFO</span>
            <span className="tlog-msg" style={{ color: "#3f3f46" }}>「再読み込み」ボタンを押してください</span>
          </div>
        ) : loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "32px" }}>
            <Spinner size="md" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="tlog-row tlog-info">
            <span className="tlog-time"></span>
            <span className="tlog-level">INFO</span>
            <span className="tlog-msg" style={{ color: "#3f3f46" }}>該当するログがありません</span>
          </div>
        ) : (
          <div style={{ fontFamily: "'JetBrains Mono', 'Consolas', monospace" }}>
            {filtered.map((e, i) => {
              const date = formatDate(e.ts);
              const prevDate = i > 0 ? formatDate(filtered[i - 1].ts) : "";
              const showDateSep = date && date !== prevDate;
              return (
                <>
                  {showDateSep && (
                    <div key={`date-${i}`} style={{ padding: "10px 10px 4px", fontSize: "10px", color: "#52525b", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                      {date}
                    </div>
                  )}
                  <div key={i} className={`tlog-row tlog-${e.level || "info"}`}>
                    <span className="tlog-time">{formatTs(e.ts)}</span>
                    <span className="tlog-level">{(e.level || "info").toUpperCase().slice(0, 4)}</span>
                    <span className="tlog-msg">{e.msg}</span>
                  </div>
                </>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

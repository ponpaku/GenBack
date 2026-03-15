import { useState, useEffect, useRef, useCallback } from "react";
import { listProfiles, loadProfile, readLog } from "../lib/tauri";
import { Button, Select, Input, Spinner, EmptyState, Badge } from "../components/ui";

interface LogEntry {
  ts: string;
  level: string;
  msg: string;
}

type LevelFilter = "all" | "error" | "warn" | "info" | "section" | "test";

const LEVEL_CONFIG: Record<string, { label: string; variant: "error" | "warning" | "info" | "success" | "default"; textClass: string }> = {
  error:   { label: "ERROR",   variant: "error",   textClass: "text-red-700 dark:text-red-400" },
  warn:    { label: "WARN",    variant: "warning",  textClass: "text-amber-700 dark:text-amber-400" },
  info:    { label: "INFO",    variant: "info",     textClass: "text-gray-800 dark:text-gray-300" },
  section: { label: "SECTION", variant: "default",  textClass: "text-blue-700 dark:text-blue-400 font-semibold" },
  test:    { label: "TEST",    variant: "default",  textClass: "text-purple-700 dark:text-purple-400" },
  success: { label: "SUCCESS", variant: "success",  textClass: "text-emerald-700 dark:text-emerald-400" },
};

function parseLogs(raw: string): { entries: LogEntry[]; isJsonl: boolean } {
  const lines = raw.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return { entries: [], isJsonl: false };

  try {
    JSON.parse(lines[0]);
  } catch {
    const entries = lines.map((line) => {
      const m = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s+(.*)/);
      if (m) {
        const rest = m[2];
        const level = rest.includes("[error]") ? "error"
          : rest.includes("[warn]") ? "warn"
          : rest.startsWith("====") ? "section"
          : rest.startsWith("----") ? "info"
          : rest.includes("[TEST]") ? "test"
          : "info";
        const msg = rest.replace(/^\[(?:error|warn|info|TEST)\]\s*/, "").replace(/^[-=]+\s*/, "").trim();
        return { ts: m[1], level, msg };
      }
      return { ts: "", level: "info", msg: line };
    });
    return { entries, isJsonl: false };
  }

  const entries: LogEntry[] = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line) as LogEntry;
      entries.push(obj);
    } catch {
      entries.push({ ts: "", level: "info", msg: line });
    }
  }
  return { entries, isJsonl: true };
}

function formatTs(ts: string): string {
  if (ts.includes("T")) return ts.slice(11);
  if (ts.includes(" ")) return ts.slice(11);
  return ts;
}

function formatDate(ts: string): string {
  if (ts.includes("T")) return ts.slice(0, 10);
  if (ts.includes(" ")) return ts.slice(0, 10);
  return "";
}

interface Props {
  initialProfile?: string;
  initialDest?: string;
}

export default function Logs({ initialProfile, initialDest }: Props) {
  const [profiles, setProfiles] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [destPaths, setDestPaths] = useState<string[]>([]);
  const [selectedDest, setSelectedDest] = useState<string>("");
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [search, setSearch] = useState<string>("");
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listProfiles().then((list) => {
      setProfiles(list);
      const init = initialProfile && list.includes(initialProfile)
        ? initialProfile
        : list[0] ?? "";
      setSelected(init);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selected) return;
    loadProfile(selected)
      .then((cfg) => {
        setDestPaths(cfg.destinations.paths);
        const initDest = initialDest && cfg.destinations.paths.includes(initialDest)
          ? initialDest
          : cfg.destinations.paths[0] ?? "";
        setSelectedDest(initDest);
      })
      .catch((e) => setError(String(e)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  const loadLog = async (destOverride?: string, profileOverride?: string) => {
    const dest = destOverride ?? selectedDest;
    const profile = profileOverride ?? selected;
    if (!dest || !profile) return;
    setLoading(true);
    setError(null);
    try {
      const raw = await readLog(`${dest}\\log\\${profile}_main_log.txt`);
      const { entries: parsed } = parseLogs(raw);
      setEntries(parsed);
    } catch {
      setError("ログファイルを読み込めませんでした。バックアップを実行するとログが生成されます。");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedDest || !selected) return;
    loadLog(selectedDest, selected);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDest, selected]);

  useEffect(() => {
    if (entries.length > 0) scrollToBottom();
  }, [entries, scrollToBottom]);

  const filtered = entries.filter((e) => {
    if (levelFilter !== "all" && e.level !== levelFilter) return false;
    if (search && !e.msg.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const errorCount = entries.filter((e) => e.level === "error").length;
  const warnCount = entries.filter((e) => e.level === "warn").length;

  return (
    <div className="flex flex-col h-full p-6 gap-4">
      <div className="shrink-0">
        <h2 className="text-xl font-bold" style={{ color: "var(--color-text)" }}>ログ</h2>
        <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>バックアップの実行ログを確認します</p>
      </div>

      {/* 操作バー */}
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        {profiles.length > 0 && (
          <Select
            value={selected}
            onChange={setSelected}
            options={profiles.map((p) => ({ value: p, label: p }))}
          />
        )}
        {destPaths.length > 0 && (
          <Select
            value={selectedDest}
            onChange={setSelectedDest}
            options={destPaths.map((d) => ({ value: d, label: d }))}
            className="max-w-xs"
          />
        )}
        <Button variant="primary" onClick={() => loadLog()} disabled={!selectedDest || loading}>
          {loading ? <Spinner size="sm" /> : "↻"}
          ログを読み込む
        </Button>

        {entries.length > 0 && (
          <>
            <div className="flex gap-1 ml-2">
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

            <div className="ml-auto">
              <Input
                value={search}
                onChange={setSearch}
                placeholder="🔍 検索..."
                className="w-48"
              />
            </div>
          </>
        )}
      </div>

      {/* エラー */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700/40 text-amber-800 dark:text-amber-300 rounded-xl text-sm shrink-0">
          <span>ℹ</span> {error}
        </div>
      )}

      {/* ログ本文 */}
      <div className="flex-1 flex flex-col min-h-0">
        {entries.length > 0 && (
          <div className="flex items-center justify-between mb-2 shrink-0">
            <span className="text-xs text-gray-500">
              {filtered.length} 件
              {search && ` (「${search}」に一致)`}
              {levelFilter !== "all" && ` / ${levelFilter.toUpperCase()} のみ`}
            </span>
            <Button variant="ghost" className="text-xs" onClick={() => { setEntries([]); setSearch(""); setLevelFilter("all"); }}>
              クリア
            </Button>
          </div>
        )}

        <div
          ref={scrollRef}
          className="flex-1 overflow-auto rounded-xl border border-gray-200 dark:border-gray-700 min-h-0"
          style={{ backgroundColor: "var(--color-code)" }}
        >
          {!entries.length && !loading ? (
            <div className="p-4">
              <EmptyState icon="≡" title="ログを選択してください" description="上のボタンからログを読み込んでください" />
            </div>
          ) : loading ? (
            <div className="flex justify-center py-8"><Spinner size="md" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-gray-600 text-xs p-4">該当するログがありません</p>
          ) : (
            <table className="w-full text-xs font-mono-ja">
              <tbody>
                {filtered.map((e, i) => {
                  const cfg = LEVEL_CONFIG[e.level] ?? LEVEL_CONFIG.info;
                  const date = formatDate(e.ts);
                  const prevDate = i > 0 ? formatDate(filtered[i - 1].ts) : "";
                  const showDateSep = date && date !== prevDate;

                  return (
                    <>
                      {showDateSep && (
                        <tr key={`date-${i}`}>
                          <td colSpan={3} className="px-3 pt-3 pb-1">
                            <span className="text-[10px] text-gray-500 font-sans tracking-widest uppercase">
                              {date}
                            </span>
                          </td>
                        </tr>
                      )}
                      <tr
                        key={i}
                        className={`border-b border-gray-200 dark:border-gray-800/30 ${
                          e.level === "section"
                            ? "bg-blue-50 dark:bg-blue-950/20"
                            : e.level === "error"
                            ? "bg-red-50 dark:bg-red-950/20"
                            : e.level === "warn"
                            ? "bg-amber-50 dark:bg-amber-950/10"
                            : ""
                        }`}
                      >
                        <td className="px-3 py-1 text-gray-500 whitespace-nowrap w-20 select-none">
                          {formatTs(e.ts)}
                        </td>
                        <td className="px-2 py-1 w-16 whitespace-nowrap">
                          <Badge variant={cfg.variant}>{cfg.label}</Badge>
                        </td>
                        <td className={`px-2 py-1 break-all leading-5 ${cfg.textClass}`}>
                          {e.msg}
                        </td>
                      </tr>
                    </>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

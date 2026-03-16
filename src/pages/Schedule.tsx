import { useState, useEffect, useRef, useCallback } from "react";
import {
  listProfiles,
  listSchedules,
  createSchedule,
  deleteSchedule,
  type ScheduleEntry,
  type ScheduleConfig,
} from "../lib/tauri";
import { Button, Select, Card, Badge, Toast, EmptyState, Spinner } from "../components/ui";

// モジュールレベルキャッシュ（ページ遷移をまたいで保持）
let _schedulesCache: ScheduleEntry[] | null = null;

const DAYS = [
  { value: "MON", label: "月" },
  { value: "TUE", label: "火" },
  { value: "WED", label: "水" },
  { value: "THU", label: "木" },
  { value: "FRI", label: "金" },
  { value: "SAT", label: "土" },
  { value: "SUN", label: "日" },
];

function ScheduleRow({
  entry,
  onDelete,
}: {
  entry: ScheduleEntry;
  onDelete: (name: string) => void;
}) {
  const statusVariant =
    entry.status === "Ready" ? "success" : entry.status === "Running" ? "info" : "default";

  return (
    <tr className="border-t border-gray-200/60 dark:border-gray-700/60 hover:bg-gray-50 dark:hover:bg-gray-700/20 transition">
      <td className="px-4 py-3">
        <div className="text-sm text-gray-800 dark:text-gray-200 font-medium">{entry.profile}</div>
        <div className="text-xs text-gray-500 font-mono-ja mt-0.5">{entry.task_name}</div>
      </td>
      <td className="px-4 py-3">
        <div className="text-sm text-gray-700 dark:text-gray-300">{entry.schedule_type}</div>
        {entry.detail && (
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{entry.detail}</div>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 font-mono-ja">{entry.start_time}</td>
      <td className="px-4 py-3">
        <Badge variant={statusVariant}>{entry.status}</Badge>
      </td>
      <td className="px-4 py-3 text-xs text-gray-500">{entry.next_run}</td>
      <td className="px-4 py-3 text-right">
        <Button variant="danger" onClick={() => onDelete(entry.task_name)} className="text-xs px-2 py-1">
          削除
        </Button>
      </td>
    </tr>
  );
}

export default function Schedule() {
  const [profiles, setProfiles] = useState<string[]>([]);
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  const [formProfile, setFormProfile] = useState<string>("");
  const [formType, setFormType] = useState<string>("DAILY");
  const [formTime, setFormTime] = useState<string>("03:00");
  const [formDays, setFormDays] = useState<string[]>([]);
  const [formDayOfMonth, setFormDayOfMonth] = useState<number>(1);
  const [formDate, setFormDate] = useState<string>(() => {
    const d = new Date();
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-");
  });

  const showToast = (message: string, type: "success" | "error" | "info" = "info") =>
    setToast({ message, type });

  // バックグラウンド更新中かどうか（スピナーを出さない更新）
  const refreshingRef = useRef(false);

  const fetchSchedules = useCallback(async (silent: boolean) => {
    if (!silent) setLoading(true);
    try {
      const list = await listSchedules();
      _schedulesCache = list;
      setSchedules(list);
    } catch (e) {
      if (!silent) showToast(String(e), "error");
    } finally {
      if (!silent) setLoading(false);
      refreshingRef.current = false;
    }
  }, []);

  /** 手動更新ボタン用（常にスピナーあり） */
  const refresh = useCallback(() => fetchSchedules(false), [fetchSchedules]);

  useEffect(() => {
    listProfiles().then((list) => {
      setProfiles(list);
      if (list.length > 0) setFormProfile(list[0]);
    });

    if (_schedulesCache !== null) {
      // キャッシュがあれば即座に表示してバックグラウンドで更新
      setSchedules(_schedulesCache);
      if (!refreshingRef.current) {
        refreshingRef.current = true;
        fetchSchedules(true);
      }
    } else {
      // 初回はスピナーあり
      fetchSchedules(false);
    }
  }, [fetchSchedules]);

  const handleCreate = async () => {
    if (!formProfile || !formTime) return;
    const cfg: ScheduleConfig = {
      schedule_type: formType,
      start_time: formTime,
      days_of_week: formType === "WEEKLY" && formDays.length > 0 ? formDays.join(",") : null,
      day_of_month: formType === "MONTHLY" ? formDayOfMonth : null,
      start_date: formType === "ONCE" ? formDate.replace(/-/g, "/") : null,
    };
    try {
      await createSchedule(formProfile, cfg);
      _schedulesCache = null;
      showToast("スケジュールを登録しました", "success");
      await fetchSchedules(false);
    } catch (e) {
      showToast(String(e), "error");
    }
  };

  const handleDelete = async (taskName: string) => {
    if (!confirm(`「${taskName}」を削除しますか？`)) return;
    try {
      await deleteSchedule(taskName);
      _schedulesCache = null;
      showToast("削除しました", "success");
      await fetchSchedules(false);
    } catch (e) {
      showToast(String(e), "error");
    }
  };

  const toggleDay = (day: string) =>
    setFormDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]);

  return (
    <div className="page-view">
    <div className="page-inner">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "28px" }}>
        <div>
          <h1 className="page-heading profile-anim-name">スケジュール</h1>
          <p className="page-sub profile-anim-badges">Windows タスクスケジューラと連携して自動バックアップを設定します</p>
        </div>
        <button className="btn-ghost-sm profile-anim-actions" onClick={refresh} disabled={loading} style={{ fontSize: "13px" }}>
          {loading ? <Spinner size="sm" /> : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
              <path d="M21 3v5h-5"/>
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
              <path d="M8 16H3v5"/>
            </svg>
          )}
          更新
        </button>
      </div>

      {/* 登録済みスケジュール */}
      <div className="section-title" style={{ marginTop: 0 }}>登録済みスケジュール</div>

      {loading && schedules.length === 0 ? (
        <div className="flex justify-center py-8"><Spinner size="md" /></div>
      ) : schedules.length === 0 ? (
        <Card className="mb-6">
          <EmptyState icon="◷" title="スケジュールが登録されていません" description="下のフォームからスケジュールを追加できます" />
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 mb-6 profile-anim-card">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "var(--color-surface)" }}>
                {["プロファイル", "種類", "時刻", "状態", "次回実行", ""].map((h, i) => (
                  <th key={i} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => (
                <ScheduleRow key={s.task_name} entry={s} onDelete={handleDelete} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 新規登録フォーム */}
      <div className="section-title">新規スケジュール登録</div>
      <Card className="max-w-md profile-anim-card">
        <div className="space-y-3">
          <div className="grid grid-cols-[120px_1fr] gap-3 items-center">
            <span className="text-sm text-gray-600 dark:text-gray-400">プロファイル</span>
            <Select
              value={formProfile}
              onChange={setFormProfile}
              options={profiles.map((p) => ({ value: p, label: p }))}
            />
          </div>

          <div className="grid grid-cols-[120px_1fr] gap-3 items-center">
            <span className="text-sm text-gray-600 dark:text-gray-400">スケジュール種類</span>
            <Select
              value={formType}
              onChange={(v) => { setFormType(v); setFormDays([]); }}
              options={[
                { value: "DAILY",   label: "毎日" },
                { value: "WEEKLY",  label: "毎週" },
                { value: "MONTHLY", label: "毎月" },
                { value: "ONCE",    label: "指定日時（1回）" },
              ]}
            />
          </div>

          {/* ONCE: 日付 */}
          {formType === "ONCE" && (
            <div className="grid grid-cols-[120px_1fr] gap-3 items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">実行日</span>
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-500 w-full"
                style={{ backgroundColor: "var(--color-surface)" }}
              />
            </div>
          )}

          {/* 時刻（ONCE 以外は常に表示、ONCE も表示） */}
          <div className="grid grid-cols-[120px_1fr] gap-3 items-center">
            <span className="text-sm text-gray-600 dark:text-gray-400">開始時刻</span>
            <input
              type="time"
              value={formTime}
              onChange={(e) => setFormTime(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-500 w-full"
              style={{ backgroundColor: "var(--color-surface)" }}
            />
          </div>

          {/* WEEKLY: 曜日 */}
          {formType === "WEEKLY" && (
            <div className="grid grid-cols-[120px_1fr] gap-3 items-start">
              <span className="text-sm text-gray-600 dark:text-gray-400 pt-1">曜日</span>
              <div className="flex gap-1.5 flex-wrap">
                {DAYS.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => toggleDay(d.value)}
                    className={`w-8 h-8 rounded-lg text-xs font-medium transition ${
                      formDays.includes(d.value)
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* MONTHLY: 日付（何日） */}
          {formType === "MONTHLY" && (
            <div className="grid grid-cols-[120px_1fr] gap-3 items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">実行日（日）</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={formDayOfMonth}
                  onChange={(e) => setFormDayOfMonth(Math.min(31, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-500 w-20"
                  style={{ backgroundColor: "var(--color-surface)" }}
                />
                <span className="text-sm text-gray-500 dark:text-gray-400">日</span>
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
            <Button variant="primary" onClick={handleCreate} disabled={!formProfile} className="w-full justify-center">
              スケジュールを登録
            </Button>
          </div>
        </div>
      </Card>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import {
  listProfiles,
  checkDestinations,
  type DestStatus,
} from "../lib/tauri";
import { Spinner } from "../components/ui";

interface Props {
  onNavigateToProfile?: (name: string) => void;
}

export default function Dashboard({ onNavigateToProfile }: Props) {
  const [profiles, setProfiles] = useState<string[]>([]);
  const [allStatuses, setAllStatuses] = useState<{ profile: string; statuses: DestStatus[] }[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listProfiles();
      setProfiles(list);
      const results = await Promise.all(
        list.map((p) =>
          checkDestinations(p)
            .then((statuses) => ({ profile: p, statuses }))
            .catch(() => ({ profile: p, statuses: [] as DestStatus[] }))
        )
      );
      setAllStatuses(results);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const totalDests = allStatuses.reduce((n, p) => n + p.statuses.length, 0);
  const availableDests = allStatuses.reduce((n, p) => n + p.statuses.filter((d) => d.writable).length, 0);
  const profilesOk = allStatuses.filter((p) => p.statuses.length > 0 && p.statuses.every((d) => d.writable)).length;

  return (
    <div className="page-view">
      <div className="page-inner">
        {/* ヘッダー */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "28px" }}>
          <div>
            <h1 className="page-heading">Dashboard</h1>
            <p className="page-sub">全プロファイルの状態概要</p>
          </div>
          <button
            className="btn-ghost-sm"
            onClick={refresh}
            disabled={loading}
            style={{ fontSize: "13px" }}
          >
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

        {profiles.length === 0 && !loading ? (
          <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "14px", padding: "40px", textAlign: "center" }}>
            <p style={{ fontSize: "13px", color: "var(--muted)" }}>プロファイルがありません</p>
            <p style={{ fontSize: "12px", color: "var(--subtle)", marginTop: "4px" }}>「プロファイル」からプロファイルを作成してください</p>
          </div>
        ) : (
          <>
            {/* グローバル統計 */}
            <div className="section-title" style={{ marginTop: 0 }}>Summary</div>
            <div className="stats-row" style={{ marginBottom: "28px" }}>
              <div className="stat-card">
                <div className="stat-label">プロファイル数</div>
                <div className="stat-value stat-value--accent">{profiles.length}</div>
                <div className="stat-sub">登録済み</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">正常なプロファイル</div>
                <div className={`stat-value ${profilesOk === profiles.length && profiles.length > 0 ? "stat-value--accent" : ""}`}
                  style={{ color: profilesOk < profiles.length ? "var(--amber)" : undefined }}>
                  {profilesOk}<span style={{ fontSize: "16px", color: "var(--subtle)", marginLeft: "4px", fontWeight: 500 }}>/ {profiles.length}</span>
                </div>
                <div className="stat-sub">デスティネーション確認済み</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">利用可能なバックアップ先</div>
                <div className={`stat-value`}
                  style={{ color: availableDests < totalDests ? "var(--amber)" : availableDests === 0 ? "var(--subtle)" : "var(--green)" }}>
                  {availableDests}<span style={{ fontSize: "16px", color: "var(--subtle)", marginLeft: "4px", fontWeight: 500 }}>/ {totalDests}</span>
                </div>
                <div className="stat-sub">書き込み可能</div>
              </div>
            </div>

            {/* プロファイル別ステータス */}
            <div className="section-title">プロファイル別ステータス</div>

            {loading && allStatuses.length === 0 ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "32px" }}>
                <Spinner size="md" />
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {allStatuses.map(({ profile, statuses }) => {
                  const allOk = statuses.length > 0 && statuses.every((d) => d.writable);
                  const anyOk = statuses.some((d) => d.writable);
                  const dotClass = statuses.length === 0 ? "dot-gray" : allOk ? "dot-green" : anyOk ? "dot-amber" : "dot-red";
                  const statusLabel = statuses.length === 0 ? "未確認" : allOk ? "正常" : anyOk ? "一部利用不可" : "エラー";
                  const badgePill = statuses.length === 0 ? "badge-pill-idle" : allOk ? "badge-pill-success" : anyOk ? "" : "badge-pill-error";

                  const latestBackup = statuses.map((d) => d.latest_backup).filter(Boolean).sort().pop();

                  return (
                    <div
                      key={profile}
                      onClick={() => onNavigateToProfile?.(profile)}
                      style={{
                        background: "var(--panel)",
                        border: "1px solid var(--border)",
                        borderRadius: "12px",
                        padding: "14px 18px",
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        cursor: onNavigateToProfile ? "pointer" : "default",
                        transition: "background 0.15s, border-color 0.15s",
                      }}
                      onMouseEnter={(e) => { if (onNavigateToProfile) (e.currentTarget as HTMLElement).style.borderColor = "var(--accent-border)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}
                    >
                      <span className={`status-dot ${dotClass}`} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {profile}
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "2px" }}>
                          {latestBackup
                            ? `最終: ${latestBackup.length === 14
                                ? `${latestBackup.slice(0, 4)}/${latestBackup.slice(4, 6)}/${latestBackup.slice(6, 8)}`
                                : latestBackup}`
                            : "バックアップ履歴なし"}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
                        <span style={{ fontSize: "11px", color: "var(--subtle)" }}>{statuses.length} 先</span>
                        <span className={`badge-pill ${badgePill}`} style={!badgePill ? { background: "var(--amber-bg)", color: "var(--amber)", border: "1px solid rgba(245,158,11,0.25)" } : undefined}>
                          {statusLabel}
                        </span>
                        {onNavigateToProfile && (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--subtle)" }}>
                            <path d="M9 18l6-6-6-6"/>
                          </svg>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {lastUpdated && (
              <p style={{ fontSize: "11px", color: "var(--subtle)", marginTop: "12px", textAlign: "right" }}>
                最終更新: {lastUpdated.toLocaleTimeString("ja-JP")}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

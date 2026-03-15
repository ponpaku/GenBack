import { useState, useEffect, useCallback } from "react";
import { ask, open, save } from "@tauri-apps/plugin-dialog";
import {
  listProfiles,
  loadProfile,
  checkDestinations,
  startBackup,
  cancelBackup,
  onBackupLog,
  onBackupProgress,
  onBackupStatus,
  getBackupStatus,
  getDefaultConfig,
  saveProfile,
  deleteProfile,
  renameProfile,
  duplicateProfile,
  importProfile,
  exportProfile,
  type Config,
  type DestStatus,
  type LogEvent,
  type BackupState,
} from "../lib/tauri";
import { Input, Spinner, Toast } from "../components/ui";
import OverviewTab from "../components/profile/OverviewTab";
import ConfigTab from "../components/profile/ConfigTab";
import LogTab from "../components/profile/LogTab";

type ActiveTab = "overview" | "config" | "logs";

const STATUS_LABEL: Record<BackupState["status"], string> = {
  idle:    "待機中",
  running: "実行中",
  success: "完了",
  error:   "エラー",
};

interface Props {
  initialProfile?: string | null;
  onReady?: () => void;
}

export default function ProfilesView({ initialProfile, onReady }: Props) {
  const [profiles, setProfiles] = useState<string[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<string>("");
  const [profileConfig, setProfileConfig] = useState<Config | null>(null);
  const [destStatuses, setDestStatuses] = useState<DestStatus[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
  const [loadingConfig, setLoadingConfig] = useState(false);

  const [backupStatus, setBackupStatus] = useState<BackupState>({
    status: "idle", detail: "", current_share: null, current_dest: null,
  });
  const [liveLogs, setLiveLogs] = useState<LogEvent[]>([]);
  const [execError, setExecError] = useState<string | null>(null);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [duplicating, setDuplicating] = useState(false);
  const [dupName, setDupName] = useState("");

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const showToast = useCallback((msg: string, type: "success" | "error" | "info" = "info") => {
    setToast({ message: msg, type });
  }, []);

  const applyOrder = (list: string[]): string[] => {
    try {
      const saved = localStorage.getItem("roboback-profile-order");
      if (!saved) return list;
      const order: string[] = JSON.parse(saved);
      return [
        ...order.filter((n) => list.includes(n)),
        ...list.filter((n) => !order.includes(n)),
      ];
    } catch {
      return list;
    }
  };

  const refreshProfiles = useCallback(async () => {
    const list = await listProfiles();
    const ordered = applyOrder(list);
    setProfiles(ordered);
    return ordered;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refreshProfiles().then((list) => {
      if (initialProfile && list.includes(initialProfile)) {
        setSelectedProfile(initialProfile);
        onReady?.();
      } else if (list.length > 0) {
        setSelectedProfile(list[0]);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const MAX_LINES = 1000;
    const u1 = onBackupLog((e) => {
      setLiveLogs((prev) => {
        const next = [...prev, e];
        return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
      });
    });
    const u2 = onBackupProgress(() => {});
    const u3 = onBackupStatus((e) => setBackupStatus(e));
    getBackupStatus().then(setBackupStatus).catch(() => {});
    return () => {
      u1.then((f) => f());
      u2.then((f) => f());
      u3.then((f) => f());
    };
  }, []);

  useEffect(() => {
    if (!selectedProfile) { setProfileConfig(null); return; }
    setLoadingConfig(true);
    setProfileConfig(null);
    setDestStatuses([]);
    setIsDirty(false);
    loadProfile(selectedProfile)
      .then((cfg) => { setProfileConfig(cfg); return checkDestinations(selectedProfile); })
      .then(setDestStatuses)
      .catch((e) => showToast(String(e), "error"))
      .finally(() => setLoadingConfig(false));
  }, [selectedProfile, showToast]);

  const isRunning = backupStatus.status === "running";

  const handleSelectProfile = async (name: string) => {
    if (name === selectedProfile) return;
    if (isDirty) {
      const ok = await ask("未保存の変更があります。切り替えますか？", { title: "未保存の変更", kind: "warning" });
      if (!ok) return;
    }
    setIsDirty(false);
    setActiveTab("overview");
    setSelectedProfile(name);
  };

  const handleRunBackup = async () => {
    if (!selectedProfile || isRunning) return;
    setLiveLogs([]);
    setExecError(null);
    setBackupStatus({ status: "running", detail: "開始中...", current_share: null, current_dest: null });
    setActiveTab("overview");
    try {
      await startBackup(selectedProfile);
    } catch (e) {
      setExecError(String(e));
      setBackupStatus({ status: "error", detail: String(e), current_share: null, current_dest: null });
    }
  };

  const handleCancelBackup = async () => {
    try { await cancelBackup(); } catch (e) { showToast(String(e), "error"); }
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const def = await getDefaultConfig();
      await saveProfile(name, def);
      setNewName("");
      setCreating(false);
      await refreshProfiles();
      setSelectedProfile(name);
      showToast(`プロファイル "${name}" を作成しました`, "success");
    } catch (e) { showToast(String(e), "error"); }
  };

  const handleRename = async () => {
    const newN = renameName.trim();
    if (!newN || newN === selectedProfile) return;
    try {
      const hadSchedule = await renameProfile(selectedProfile, newN);
      setRenaming(false);
      await refreshProfiles();
      setSelectedProfile(newN);
      const msg = hadSchedule
        ? `リネームしました。スケジュールタスクは削除されました。「スケジュール」で再作成してください。`
        : `"${newN}" にリネームしました`;
      showToast(msg, hadSchedule ? "info" : "success");
    } catch (e) { showToast(String(e), "error"); }
  };

  const handleDuplicate = async () => {
    const newN = dupName.trim();
    if (!newN) return;
    try {
      await duplicateProfile(selectedProfile, newN);
      setDuplicating(false);
      await refreshProfiles();
      setSelectedProfile(newN);
      showToast(`"${selectedProfile}" を "${newN}" として複製しました`, "success");
    } catch (e) { showToast(String(e), "error"); }
  };

  const handleDelete = async () => {
    if (!selectedProfile) return;
    const confirmed = await ask(`プロファイル "${selectedProfile}" を削除しますか？\nこの操作は元に戻せません。`, {
      title: "削除の確認", kind: "warning",
    });
    if (!confirmed) return;
    try {
      await deleteProfile(selectedProfile);
      setSelectedProfile("");
      setProfileConfig(null);
      const list = await refreshProfiles();
      if (list.length > 0) setSelectedProfile(list[0]);
      showToast("削除しました", "success");
    } catch (e) { showToast(String(e), "error"); }
  };

  const handleImport = async () => {
    try {
      const filePath = await open({ filters: [{ name: "TOML", extensions: ["toml"] }] });
      if (!filePath) return;
      const name = await importProfile(filePath as string);
      await refreshProfiles();
      setSelectedProfile(name);
      showToast(`インポートしました: ${name}`, "success");
    } catch (e) { showToast(String(e), "error"); }
  };

  const handleExport = async () => {
    if (!selectedProfile) return;
    try {
      const filePath = await save({ defaultPath: `${selectedProfile}.toml`, filters: [{ name: "TOML", extensions: ["toml"] }] });
      if (!filePath) return;
      await exportProfile(selectedProfile, filePath);
      showToast("エクスポートしました", "success");
    } catch (e) { showToast(String(e), "error"); }
  };

  // プロファイルドラッグ&ドロップ
  const handleDragStart = (i: number) => setDragIndex(i);

  const handleDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    setDragOverIndex(i);
  };

  const handleDrop = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === i) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const next = [...profiles];
    const [item] = next.splice(dragIndex, 1);
    next.splice(i, 0, item);
    setProfiles(next);
    setDragIndex(null);
    setDragOverIndex(null);
    localStorage.setItem("roboback-profile-order", JSON.stringify(next));
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  // ステータスドットクラスを決定
  const getDotClass = (isActive: boolean) => {
    if (!isActive || destStatuses.length === 0) return "dot-gray";
    if (destStatuses.every((d) => d.writable)) return "dot-green";
    if (destStatuses.some((d) => d.writable)) return "dot-amber";
    return "dot-red";
  };

  // サブテキスト: デスティネーションパス (最初の1つ)
  const getSubText = (isActive: boolean) => {
    if (!isActive || destStatuses.length === 0) return "—";
    return destStatuses[0].path;
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* 左ペイン: プロファイルリスト */}
      <div className="profile-list-pane">
        <div className="pane-header">
          <span className="pane-title">プロファイル</span>
          <button
            className="icon-btn"
            title="新規プロファイル"
            onClick={() => { setCreating(true); setNewName(""); setRenaming(false); setDuplicating(false); }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 1v10M1 6h10"/>
            </svg>
          </button>
        </div>

        {/* 新規作成 */}
        {creating && (
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
            <Input
              value={newName}
              onChange={setNewName}
              placeholder="プロファイル名"
              autoFocus
              className="text-xs mb-1.5"
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreating(false); }}
            />
            <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
              <button className="btn-run" style={{ flex: 1, fontSize: "12px", padding: "5px 10px", justifyContent: "center" }} onClick={handleCreate} disabled={!newName.trim()}>作成</button>
              <button className="btn-ghost-sm" style={{ fontSize: "12px", padding: "5px 10px" }} onClick={() => setCreating(false)}>✕</button>
            </div>
          </div>
        )}

        {/* リネーム */}
        {renaming && (
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
            <p style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "6px" }}>新しい名前</p>
            <Input
              value={renameName}
              onChange={setRenameName}
              autoFocus
              className="text-xs mb-1.5"
              onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setRenaming(false); }}
            />
            <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
              <button className="btn-run" style={{ flex: 1, fontSize: "12px", padding: "5px 10px", justifyContent: "center" }} onClick={handleRename} disabled={!renameName.trim() || renameName.trim() === selectedProfile}>保存</button>
              <button className="btn-ghost-sm" style={{ fontSize: "12px", padding: "5px 10px" }} onClick={() => setRenaming(false)}>✕</button>
            </div>
          </div>
        )}

        {/* 複製 */}
        {duplicating && (
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
            <p style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "6px" }}>複製先の名前</p>
            <Input
              value={dupName}
              onChange={setDupName}
              placeholder={`${selectedProfile}_copy`}
              autoFocus
              className="text-xs mb-1.5"
              onKeyDown={(e) => { if (e.key === "Enter") handleDuplicate(); if (e.key === "Escape") setDuplicating(false); }}
            />
            <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
              <button className="btn-run" style={{ flex: 1, fontSize: "12px", padding: "5px 10px", justifyContent: "center" }} onClick={handleDuplicate} disabled={!dupName.trim()}>複製</button>
              <button className="btn-ghost-sm" style={{ fontSize: "12px", padding: "5px 10px" }} onClick={() => setDuplicating(false)}>✕</button>
            </div>
          </div>
        )}

        {/* プロファイル一覧 */}
        <ul className="profile-list">
          {profiles.length === 0 ? (
            <li style={{ padding: "24px 12px", textAlign: "center", fontSize: "12px", color: "var(--muted)" }}>
              プロファイルがありません
            </li>
          ) : (
            profiles.map((p, i) => {
              const isActive = p === selectedProfile;
              const dotClass = getDotClass(isActive);
              const subText = getSubText(isActive);
              const isDragOver = dragOverIndex === i && dragIndex !== i;
              return (
                <li key={p}>
                  <div
                    role="button"
                    tabIndex={0}
                    draggable
                    onDragStart={() => handleDragStart(i)}
                    onDragOver={(e) => handleDragOver(e, i)}
                    onDrop={(e) => handleDrop(e, i)}
                    onDragEnd={handleDragEnd}
                    onClick={() => handleSelectProfile(p)}
                    onKeyDown={(e) => e.key === "Enter" && handleSelectProfile(p)}
                    className={`profile-item ${isActive ? "profile-item--active" : ""} ${isDragOver ? "profile-item--drag-over" : ""}`}
                    style={{ opacity: dragIndex === i ? 0.45 : 1, display: "flex", alignItems: "center", gap: "6px" }}
                  >
                    <span className="profile-drag-handle">
                      <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
                        <circle cx="3" cy="2" r="1.5"/>
                        <circle cx="7" cy="2" r="1.5"/>
                        <circle cx="3" cy="7" r="1.5"/>
                        <circle cx="7" cy="7" r="1.5"/>
                        <circle cx="3" cy="12" r="1.5"/>
                        <circle cx="7" cy="12" r="1.5"/>
                      </svg>
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <div className="profile-item-name">{p}</div>
                        {isActive && isRunning && <Spinner size="sm" />}
                      </div>
                      <div className="profile-item-sub">
                        <span className={`status-dot ${dotClass}`} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subText}</span>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })
          )}
        </ul>

        {/* インポート / エクスポート */}
        <div style={{ padding: "8px 12px", borderTop: "1px solid var(--border)", display: "flex", gap: "6px" }}>
          <button className="btn-ghost-sm" style={{ flex: 1, fontSize: "12px", justifyContent: "center" }} onClick={handleImport}>
            ↑ Import
          </button>
          <button className="btn-ghost-sm" style={{ flex: 1, fontSize: "12px", justifyContent: "center" }} onClick={handleExport} disabled={!selectedProfile}>
            ↓ Export
          </button>
        </div>
      </div>

      {/* 右ペイン */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden", background: "var(--bg)" }}>
        {!selectedProfile ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: "13px" }}>
            プロファイルを選択してください
          </div>
        ) : loadingConfig ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Spinner size="md" />
          </div>
        ) : !profileConfig ? null : (
          <>
            {/* 詳細ヘッダー */}
            <div className="detail-header">
              <div className="detail-header-top">
                {/* 左: プロファイル名 + バッジ */}
                <div>
                  <div className="detail-name profile-anim-name">{selectedProfile}</div>
                  <div className="detail-badges profile-anim-badges">
                    <span className={`badge-pill badge-pill-${backupStatus.status}`}>
                      {backupStatus.status === "running" && (
                        <span className="animate-pulse-dot" style={{
                          display: "inline-block", width: "6px", height: "6px",
                          borderRadius: "50%", background: "currentColor", marginRight: "5px",
                        }} />
                      )}
                      {STATUS_LABEL[backupStatus.status]}
                    </span>
                    {backupStatus.current_share && (
                      <span style={{ fontSize: "11px", color: "var(--muted)", fontFamily: "monospace" }}>
                        {backupStatus.current_share}
                      </span>
                    )}
                  </div>
                </div>

                {/* 右: アクション */}
                <div className="header-actions profile-anim-actions">
                  {!renaming && !duplicating && !creating && (
                    <>
                      <button
                        className="btn-ghost-sm"
                        title="リネーム"
                        onClick={() => { setRenameName(selectedProfile); setRenaming(true); }}
                        disabled={isRunning}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>
                        </svg>
                        リネーム
                      </button>
                      <button
                        className="btn-ghost-sm"
                        title="複製"
                        onClick={() => { setDupName(`${selectedProfile}_copy`); setDuplicating(true); }}
                        disabled={isRunning}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                        </svg>
                        複製
                      </button>
                      <button
                        className="btn-ghost-sm"
                        style={{ color: "var(--red)" }}
                        onClick={handleDelete}
                        disabled={isRunning}
                      >
                        削除
                      </button>
                    </>
                  )}
                  {isRunning ? (
                    <button className="btn-run-cancel" onClick={handleCancelBackup}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
                      キャンセル
                    </button>
                  ) : (
                    <button className="btn-run" onClick={handleRunBackup} disabled={!selectedProfile}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l16 8-16 8z"/></svg>
                      実行
                    </button>
                  )}
                </div>
              </div>

              {/* タブバー */}
              <div className="tab-bar">
                {(["overview", "config", "logs"] as ActiveTab[]).map((tab) => {
                  const label = tab === "overview" ? "Overview"
                    : tab === "config" ? "Configuration"
                    : "Logs";
                  return (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`tab-btn ${activeTab === tab ? "tab-btn--active" : ""}`}
                    >
                      {label}
                      {tab === "config" && isDirty && (
                        <span style={{ marginLeft: "4px", color: "var(--amber)" }}>*</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 実行エラー */}
            {execError && (
              <div style={{
                margin: "12px 28px 0",
                padding: "10px 14px",
                background: "var(--red-bg)",
                border: "1px solid rgba(244,63,94,0.25)",
                color: "var(--red)",
                borderRadius: "10px",
                fontSize: "12px",
                flexShrink: 0,
              }}>
                ✕ {execError}
                <button style={{ marginLeft: "8px", textDecoration: "underline", fontSize: "11px", background: "none", border: "none", cursor: "pointer", color: "inherit" }} onClick={() => setExecError(null)}>閉じる</button>
              </div>
            )}

            {/* タブコンテンツ */}
            <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              {activeTab === "overview" && (
                <OverviewTab
                  profileName={selectedProfile}
                  config={profileConfig}
                  destStatuses={destStatuses}
                  backupStatus={backupStatus}
                  liveLogs={liveLogs}
                  isRunning={isRunning}
                  onOpenLogs={() => setActiveTab("logs")}
                />
              )}
              {activeTab === "config" && (
                <ConfigTab
                  profileName={selectedProfile}
                  initialConfig={profileConfig}
                  onSaved={(newConfig) => {
                    setProfileConfig(newConfig);
                    setIsDirty(false);
                    checkDestinations(selectedProfile).then(setDestStatuses).catch(() => {});
                  }}
                  onCancel={() => setActiveTab("overview")}
                />
              )}
              {activeTab === "logs" && (
                <LogTab
                  profileName={selectedProfile}
                  config={profileConfig}
                />
              )}
            </div>
          </>
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

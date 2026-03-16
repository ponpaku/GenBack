import { useState, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { exportAllProfiles, importAllProfiles } from "../lib/tauri";
import { useTheme } from "../lib/theme";
import { Card, SectionHeader, Toast } from "../components/ui";

export default function GlobalSettings() {
  const { theme, toggle } = useTheme();
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const showToast = useCallback((message: string, type: "success" | "error" | "info" = "info") => {
    setToast({ message, type });
  }, []);

  const handleExportAll = async () => {
    const dir = await open({ directory: true, title: "エクスポート先フォルダを選択" });
    if (!dir) return;
    setExporting(true);
    try {
      const names = await exportAllProfiles(dir as string);
      showToast(`${names.length} 件のプロファイルをエクスポートしました`, "success");
    } catch (e) {
      showToast(String(e), "error");
    } finally {
      setExporting(false);
    }
  };

  const handleImportAll = async () => {
    const dir = await open({ directory: true, title: "インポート元フォルダを選択" });
    if (!dir) return;
    setImporting(true);
    try {
      const names = await importAllProfiles(dir as string);
      showToast(`${names.length} 件のプロファイルをインポートしました`, "success");
    } catch (e) {
      showToast(String(e), "error");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="page-view">
    <div className="page-inner">
      <div style={{ marginBottom: "28px" }}>
        <h1 className="page-heading profile-anim-name">グローバル設定</h1>
        <p className="page-sub profile-anim-badges">アプリケーション全体の設定</p>
      </div>

      <div className="space-y-1">
        <SectionHeader>外観</SectionHeader>
        <Card className="profile-anim-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>テーマ</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                {theme === "dark" ? "ダークモード" : "ライトモード"}
              </p>
            </div>
            <button
              onClick={toggle}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
            >
              {theme === "dark" ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="4"/>
                    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
                  </svg>
                  ライトに切替
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
                  </svg>
                  ダークに切替
                </>
              )}
            </button>
          </div>
        </Card>

        <SectionHeader>プロファイル保存場所</SectionHeader>
        <Card className="profile-anim-card">
          <p className="text-xs font-mono-ja text-gray-500 dark:text-gray-400">
            %USERPROFILE%\.genback\profiles\
          </p>
          <p className="text-xs text-gray-500 mt-1.5">
            各プロファイルは <code className="font-mono">.toml</code> ファイルとして保存されます
          </p>
        </Card>

        <SectionHeader>プロファイルの一括管理</SectionHeader>
        <Card className="profile-anim-card">
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div className="toggle-row">
              <div className="toggle-info">
                <strong>一括エクスポート</strong>
                <span>全プロファイルを選択したフォルダに .toml ファイルとして書き出します</span>
              </div>
              <button
                className="btn-ghost-sm"
                onClick={handleExportAll}
                disabled={exporting}
                style={{ flexShrink: 0 }}
              >
                {exporting ? "処理中..." : "↓ Export All"}
              </button>
            </div>
            <div style={{ height: "1px", background: "var(--border)" }} />
            <div className="toggle-row">
              <div className="toggle-info">
                <strong>一括インポート</strong>
                <span>選択したフォルダ内の全 .toml ファイルをプロファイルとして読み込みます（同名は上書き）</span>
              </div>
              <button
                className="btn-ghost-sm"
                onClick={handleImportAll}
                disabled={importing}
                style={{ flexShrink: 0 }}
              >
                {importing ? "処理中..." : "↑ Import All"}
              </button>
            </div>
          </div>
        </Card>

        <SectionHeader>バージョン情報</SectionHeader>
        <Card className="profile-anim-card">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span style={{ color: "var(--color-text-muted)" }}>GenBack</span>
              <span className="font-mono text-xs" style={{ color: "var(--color-text)" }}>v1.0.0</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span style={{ color: "var(--color-text-muted)" }}>フレームワーク</span>
              <span className="font-mono text-xs" style={{ color: "var(--color-text)" }}>Tauri v2 + React 19</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
    </div>
    {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
  );
}

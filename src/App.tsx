import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Dashboard from "./pages/Dashboard";
import ProfilesView from "./pages/ProfilesView";
import Schedule from "./pages/Schedule";
import GlobalSettings from "./pages/GlobalSettings";
import { useTheme } from "./lib/theme";

type ViewId = "dashboard" | "profiles" | "schedule" | "settings";

interface NavItem {
  id: ViewId;
  label: string;
  icon: React.ReactNode;
}

function IconDashboard() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  );
}

function IconProfiles() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>
    </svg>
  );
}

function IconSchedule() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

function IconSun() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
    </svg>
  );
}

function IconMoon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
    </svg>
  );
}

const appWindow = getCurrentWindow();

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "ダッシュボード", icon: <IconDashboard /> },
  { id: "profiles",  label: "プロファイル",   icon: <IconProfiles /> },
  { id: "schedule",  label: "スケジュール",   icon: <IconSchedule /> },
];

export default function App() {
  const { theme, toggle } = useTheme();
  const [currentView, setCurrentView] = useState<ViewId>("profiles");
  const [profileTarget, setProfileTarget] = useState<string | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      {/* カスタムタイトルバー */}
      <div className="titlebar">
        <div className="titlebar-title">
          <span className="titlebar-title-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </span>
          GenBack
        </div>
        <div className="titlebar-controls">
          <button
            className="titlebar-btn"
            onClick={() => appWindow.minimize()}
            title="最小化"
          >
            <svg width="12" height="12" viewBox="0 0 12 12">
              <rect x="1" y="5.5" width="10" height="1" fill="currentColor"/>
            </svg>
          </button>
          <button
            className="titlebar-btn"
            onClick={() => appWindow.toggleMaximize()}
            title="最大化"
          >
            <svg width="12" height="12" viewBox="0 0 12 12">
              <rect x="1.5" y="1.5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
            </svg>
          </button>
          <button
            className="titlebar-btn"
            onClick={() => appWindow.close()}
            title="閉じる"
          >
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* コンテンツ行: Activity Bar + メイン */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Activity Bar */}
        <nav className="activity-bar">
          {/* メインナビ */}
          <ul className="act-nav">
            {NAV_ITEMS.map((item) => {
              const isActive = currentView === item.id;
              return (
                <li key={item.id}>
                  <button
                    onClick={() => setCurrentView(item.id)}
                    title={item.label}
                    className={`act-btn ${isActive ? "act-btn--active" : ""}`}
                  >
                    {item.icon}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* 下部: テーマトグル + 設定 */}
          <div className="act-bottom">
            <button
              onClick={toggle}
              title={theme === "dark" ? "ライトモードに切替" : "ダークモードに切替"}
              className="act-btn"
            >
              {theme === "dark" ? <IconSun /> : <IconMoon />}
            </button>
            <div className="act-sep" />
            <button
              onClick={() => setCurrentView("settings")}
              title="設定"
              className={`act-btn ${currentView === "settings" ? "act-btn--active" : ""}`}
            >
              <IconSettings />
            </button>
          </div>
        </nav>

        {/* メインコンテンツ */}
        <main style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
          {currentView === "dashboard" && (
            <Dashboard
              onNavigateToProfile={(name) => {
                setProfileTarget(name);
                setCurrentView("profiles");
              }}
            />
          )}
          {currentView === "profiles" && (
            <ProfilesView
              initialProfile={profileTarget}
              onReady={() => setProfileTarget(null)}
            />
          )}
          {currentView === "schedule" && <Schedule />}
          {currentView === "settings" && <GlobalSettings />}
        </main>
      </div>
    </div>
  );
}

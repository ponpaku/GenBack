import { useState, useCallback, useId, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  saveProfile,
  testDiscord,
  type Config,
  type SourcePath,
} from "../../lib/tauri";
import { Toast, Button } from "../ui";

// ============================================================
// 小コンポーネント
// ============================================================

function SectionIcon({ children }: { children: React.ReactNode }) {
  return <span className="config-section-icon">{children}</span>;
}

function TooltipIcon({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLSpanElement>(null);
  return (
    <>
      <span
        ref={ref}
        className="tooltip-icon"
        onMouseEnter={() => {
          if (ref.current) {
            const r = ref.current.getBoundingClientRect();
            setPos({ x: r.left + r.width / 2, y: r.top - 8 });
          }
          setVisible(true);
        }}
        onMouseLeave={() => setVisible(false)}
      >?</span>
      {visible && (
        <div className="tooltip-popup" style={{ left: pos.x, top: pos.y }}>
          {text}
        </div>
      )}
    </>
  );
}

function Accordion({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="accordion">
      <button className="accordion-btn" onClick={() => setOpen(v => !v)}>
        <span>{title}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", flexShrink: 0 }}>
          <path d="M2 4l4 4 4-4"/>
        </svg>
      </button>
      {open && <div className="accordion-body">{children}</div>}
    </div>
  );
}

function ToggleSwitch({
  id,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="toggle" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span className="toggle-track" />
      <span className="toggle-thumb" />
    </label>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="toggle-row">
      <div className="toggle-info">
        <strong>{label}</strong>
        {description && <span>{description}</span>}
      </div>
      <ToggleSwitch id={id} checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

function FieldRow({
  label,
  flag,
  tooltip,
  hint,
  children,
}: {
  label: string;
  flag?: string;
  tooltip?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field-row">
      <div>
        <div className="field-label" style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          {label}
          {flag && <code className="flag-code">{flag}</code>}
          {tooltip && <TooltipIcon text={tooltip} />}
        </div>
        {hint && <div className="field-hint">{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function FieldInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`field-input${className ? ` ${className}` : ""}`} {...props} />;
}

function RoboOptionRow({
  checked,
  onToggle,
  flag,
  label,
  tooltip,
  value,
  onValueChange,
  valueType = "text",
  valueWidth = 70,
}: {
  checked: boolean;
  onToggle: (v: boolean) => void;
  flag: string;
  label: string;
  tooltip?: string;
  value?: string;
  onValueChange?: (v: string) => void;
  valueType?: string;
  valueWidth?: number;
}) {
  const id = useId();
  return (
    <div className="robo-option-row">
      <label className="robo-option-check" htmlFor={id}>
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onToggle(e.target.checked)} />
      </label>
      <code className="flag-code">{flag}</code>
      <span className="robo-option-label">{label}</span>
      {tooltip && <TooltipIcon text={tooltip} />}
      {value !== undefined && onValueChange && (
        <FieldInput
          type={valueType}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          disabled={!checked}
          style={{ width: `${valueWidth}px`, marginLeft: "auto" }}
        />
      )}
    </div>
  );
}

// ============================================================
// Props
// ============================================================
interface Props {
  profileName: string;
  initialConfig: Config;
  onSaved: (newConfig: Config) => void;
  onCancel: () => void;
}

export default function ConfigTab({ profileName, initialConfig, onSaved, onCancel }: Props) {
  const [config, setConfig] = useState<Config>(initialConfig);
  const [originalConfig] = useState<Config>(initialConfig);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [testingDiscord, setTestingDiscord] = useState(false);
  const [labelChanges, setLabelChanges] = useState<{ path: string; oldLabel: string; newLabel: string }[]>([]);

  const showToast = useCallback((message: string, type: "success" | "error" | "info" = "info") => {
    setToast({ message, type });
  }, []);

  const update = <K extends keyof Config>(section: K, patch: Partial<Config[K]>) => {
    setConfig((prev) => ({ ...prev, [section]: { ...prev[section], ...patch } }));
    setDirty(true);
  };

  const validateForSave = (): string | null => {
    if (!config.generations.mirror_mode && config.generations.keep < 1) return "世代数は1以上を指定してください";
    if (!["rotate", "simultaneous"].includes(config.destinations.mode))
      return "バックアップモードは rotate または simultaneous を指定してください";
    if (config.destinations.paths.length === 0) return "バックアップ先を最低1つ設定してください";
    if (config.source.paths.length === 0) return "コピー元を最低1つ設定してください";
    const labels = config.source.paths.map((sp) => sp.label);
    if (labels.some((l) => !l.trim())) return "コピー元のラベルは空にできません";
    if (new Set(labels).size !== labels.length) return "コピー元に重複するラベルがあります";
    if (
      config.notification.discord.enabled &&
      config.notification.discord.webhook_url &&
      !config.notification.discord.webhook_url.startsWith("https://")
    ) return "Webhook URLは https:// で始める必要があります";
    return null;
  };

  const executeSave = async () => {
    try {
      await saveProfile(profileName, config);
      setDirty(false);
      setLabelChanges([]);
      showToast("保存しました", "success");
      onSaved(config);
    } catch (e) {
      showToast(String(e), "error");
    }
  };

  const handleSave = async () => {
    const err = validateForSave();
    if (err) return showToast(err, "error");

    const changes = config.source.paths.flatMap((newSp) => {
      const oldSp = originalConfig.source.paths.find((sp) => sp.path === newSp.path);
      if (oldSp && oldSp.label !== newSp.label) {
        return [{ path: newSp.path, oldLabel: oldSp.label, newLabel: newSp.label }];
      }
      return [];
    });

    if (changes.length > 0) {
      setLabelChanges(changes);
      return;
    }

    await executeSave();
  };

  const handleCancel = () => {
    setConfig(initialConfig);
    setDirty(false);
    setLabelChanges([]);
    onCancel();
  };

  const browsePath = async (): Promise<string | null> => {
    const result = await open({ directory: true });
    return typeof result === "string" ? result : null;
  };

  const updateSourcePath = (idx: number, patch: Partial<SourcePath>) => {
    const paths = config.source.paths.map((sp, i) => i === idx ? { ...sp, ...patch } : sp);
    update("source", { paths });
  };

  return (
    <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div className="config-scroll-body">

        {/* ラベル変更確認パネル */}
        {labelChanges.length > 0 && (
          <div style={{
            marginBottom: "16px", borderRadius: "12px",
            border: "1px solid rgba(245,158,11,0.4)", background: "var(--amber-bg)",
            padding: "16px",
          }}>
            <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
              <span style={{ color: "var(--amber)", fontSize: "16px", flexShrink: 0 }}>⚠</span>
              <div>
                <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>ラベル変更を検出しました</p>
                <p style={{ fontSize: "11px", color: "var(--muted)", marginTop: "2px" }}>
                  バックアップ先の <code style={{ fontFamily: "monospace" }}>data/</code> フォルダ名を変更します。
                </p>
              </div>
            </div>
            <ul style={{ marginBottom: "12px", display: "flex", flexDirection: "column", gap: "4px" }}>
              {labelChanges.map((c, i) => (
                <li key={i} style={{ fontSize: "11px", fontFamily: "monospace", color: "var(--muted)", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: "200px" }}>{c.path}</span>:
                  <span style={{ color: "var(--red)", textDecoration: "line-through" }}>{c.oldLabel}</span>
                  →
                  <span style={{ color: "var(--green)" }}>{c.newLabel}</span>
                </li>
              ))}
            </ul>
            <div style={{ display: "flex", gap: "8px" }}>
              <Button variant="primary" onClick={executeSave}>続行して保存</Button>
              <Button variant="ghost" onClick={() => setLabelChanges([])}>キャンセル</Button>
            </div>
          </div>
        )}

        {/* ═══ コピー元 ═══ */}
        <div className="config-section">
          <div className="config-section-header">
            <SectionIcon>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </SectionIcon>
            <span className="config-section-title">コピー元</span>
          </div>
          <div className="config-section-body">
            <FieldRow label="種別">
              <div className="mode-options">
                <div
                  className={`mode-option ${config.source.kind === "nas" ? "mode-option--active" : ""}`}
                  onClick={() => update("source", { kind: "nas" })}
                >
                  <div className="mode-option-title">NAS</div>
                  <div className="mode-option-desc">ネットワーク共有</div>
                </div>
                <div
                  className={`mode-option ${config.source.kind === "local" ? "mode-option--active" : ""}`}
                  onClick={() => update("source", { kind: "local" })}
                >
                  <div className="mode-option-title">ローカル</div>
                  <div className="mode-option-desc">ローカルフォルダ</div>
                </div>
              </div>
            </FieldRow>

            {config.source.kind === "nas" && (
              <>
                <FieldRow label="ホスト" hint="\\\\server 形式">
                  <FieldInput
                    value={config.source.host}
                    onChange={(e) => update("source", { host: e.target.value })}
                    placeholder="\\\\server.local"
                    className="mono"
                  />
                </FieldRow>
                <FieldRow label="ユーザー名">
                  <FieldInput
                    value={config.source.user}
                    onChange={(e) => update("source", { user: e.target.value })}
                  />
                </FieldRow>
                <FieldRow label="パスワード">
                  <FieldInput
                    type="password"
                    value={config.source.password}
                    onChange={(e) => update("source", { password: e.target.value })}
                  />
                </FieldRow>
              </>
            )}

            {/* コピー元パス一覧 */}
            <div>
              <div className="field-label" style={{ marginBottom: "8px" }}>コピー元パス</div>
              {config.source.paths.map((sp, i) => (
                <div key={i} style={{ display: "flex", gap: "6px", marginBottom: "6px", alignItems: "center" }}>
                  {config.source.kind === "local" && (
                    <button className="browse-btn" title="フォルダを選択" onClick={async () => {
                      const p = await browsePath();
                      if (p) updateSourcePath(i, { path: p });
                    }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>
                      </svg>
                    </button>
                  )}
                  <FieldInput
                    style={{ flex: 2 }}
                    value={sp.path}
                    onChange={(e) => updateSourcePath(i, { path: e.target.value })}
                    placeholder={config.source.kind === "nas" ? "docs" : "D:\\data\\docs"}
                    className="mono"
                  />
                  <FieldInput
                    style={{ flex: 1 }}
                    value={sp.label}
                    onChange={(e) => updateSourcePath(i, { label: e.target.value })}
                    placeholder="backup-docs"
                  />
                  <button
                    className="remove-btn"
                    onClick={() => update("source", { paths: config.source.paths.filter((_, j) => j !== i) })}
                    title="削除"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M1 1l10 10M11 1L1 11"/>
                    </svg>
                  </button>
                </div>
              ))}
              <button
                className="add-btn"
                onClick={() => update("source", { paths: [...config.source.paths, { path: "", label: "" }] })}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 1v10M1 6h10"/></svg>
                パスを追加
              </button>
              <div style={{ fontSize: "11px", color: "var(--subtle)", marginTop: "6px" }}>
                {config.source.kind === "nas"
                  ? "共有名: NAS の共有フォルダ名（例: docs）　ラベル: バックアップ先の data/ 配下のフォルダ名"
                  : "フォルダパス: コピー元のフルパス（例: D:\\data\\docs）　ラベル: バックアップ先の data/ 配下のフォルダ名"}
              </div>
            </div>
          </div>
        </div>

        {/* ═══ バックアップ先 ═══ */}
        <div className="config-section">
          <div className="config-section-header">
            <SectionIcon>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </SectionIcon>
            <span className="config-section-title">バックアップ先</span>
          </div>
          <div className="config-section-body">
            <FieldRow label="種別">
              <div className="mode-options">
                <div
                  className={`mode-option ${config.destinations.kind === "local" ? "mode-option--active" : ""}`}
                  onClick={() => update("destinations", { kind: "local" })}
                >
                  <div className="mode-option-title">ローカル</div>
                  <div className="mode-option-desc">ローカルフォルダ</div>
                </div>
                <div
                  className={`mode-option ${config.destinations.kind === "nas" ? "mode-option--active" : ""}`}
                  onClick={() => update("destinations", { kind: "nas" })}
                >
                  <div className="mode-option-title">NAS</div>
                  <div className="mode-option-desc">ネットワーク共有</div>
                </div>
              </div>
            </FieldRow>

            {config.destinations.kind === "nas" && (
              <>
                <FieldRow label="ホスト" hint="net use 認証用（例: \\\\nas2）">
                  <FieldInput
                    value={config.destinations.host}
                    onChange={(e) => update("destinations", { host: e.target.value })}
                    placeholder="\\\\nas2.local"
                    className="mono"
                  />
                </FieldRow>
                <FieldRow label="ユーザー名">
                  <FieldInput
                    value={config.destinations.user}
                    onChange={(e) => update("destinations", { user: e.target.value })}
                  />
                </FieldRow>
                <FieldRow label="パスワード">
                  <FieldInput
                    type="password"
                    value={config.destinations.password}
                    onChange={(e) => update("destinations", { password: e.target.value })}
                  />
                </FieldRow>
              </>
            )}

            <FieldRow label="バックアップモード">
              <div className="mode-options">
                <div
                  className={`mode-option ${config.destinations.mode === "rotate" ? "mode-option--active" : ""}`}
                  onClick={() => update("destinations", { mode: "rotate" })}
                >
                  <div className="mode-option-title">rotate</div>
                  <div className="mode-option-desc">最も古い先を1つ選ぶ</div>
                </div>
                <div
                  className={`mode-option ${config.destinations.mode === "simultaneous" ? "mode-option--active" : ""}`}
                  onClick={() => update("destinations", { mode: "simultaneous" })}
                >
                  <div className="mode-option-title">simultaneous</div>
                  <div className="mode-option-desc">全先へ順次実行</div>
                </div>
              </div>
            </FieldRow>

            <div>
              <div className="field-label" style={{ marginBottom: "8px" }}>
                保存先パス
                <span className="field-hint" style={{ display: "inline", marginLeft: "6px" }}>
                  {config.destinations.kind === "nas" ? "例: \\\\nas2\\backup" : "例: D:\\backup"}
                </span>
              </div>
              {config.destinations.paths.map((p, i) => (
                <div key={i} style={{ display: "flex", gap: "6px", marginBottom: "6px", alignItems: "center" }}>
                  {config.destinations.kind === "local" && (
                    <button className="browse-btn" title="フォルダを選択" onClick={async () => {
                      const sel = await browsePath();
                      if (sel) {
                        const paths = [...config.destinations.paths];
                        paths[i] = sel;
                        update("destinations", { paths });
                      }
                    }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>
                      </svg>
                    </button>
                  )}
                  <FieldInput
                    style={{ flex: 1 }}
                    value={p}
                    onChange={(e) => {
                      const paths = [...config.destinations.paths];
                      paths[i] = e.target.value;
                      update("destinations", { paths });
                    }}
                    placeholder={config.destinations.kind === "nas" ? "\\\\nas2\\backup" : "D:\\backup"}
                    className="mono"
                  />
                  <button
                    className="remove-btn"
                    onClick={() => update("destinations", { paths: config.destinations.paths.filter((_, j) => j !== i) })}
                    title="削除"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M1 1l10 10M11 1L1 11"/>
                    </svg>
                  </button>
                </div>
              ))}
              <button
                className="add-btn"
                onClick={() => update("destinations", { paths: [...config.destinations.paths, ""] })}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 1v10M1 6h10"/></svg>
                パスを追加
              </button>
            </div>
          </div>
        </div>

        {/* ═══ 世代管理 + ゴミ箱 (2カラム) ═══ */}
        <div className="config-2col">
          <div className="config-section" style={{ marginBottom: 0 }}>
            <div className="config-section-header">
              <SectionIcon>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
              </SectionIcon>
              <span className="config-section-title">世代管理</span>
            </div>
            <div className="config-section-body">
              <ToggleRow
                label="直ミラーモード"
                description="世代なし・バックアップ先へ直接ミラー"
                checked={config.generations.mirror_mode}
                onChange={(v) => update("generations", { mirror_mode: v })}
              />
              {config.generations.mirror_mode && (
                <>
                  <div style={{ display: "flex", gap: "6px", padding: "4px 0 6px 2px" }}>
                    {([
                      [false, "{label}/", `{dest}/{"{label}"}/ 配下にコピー（ラベルごとにフォルダ分け）`],
                      [true,  "直下",     "{dest}/ のルート直下に直接コピー（ラベルなし）"],
                    ] as [boolean, string, string][]).map(([flat, title, desc]) => (
                      <div
                        key={String(flat)}
                        className={`mode-option${config.generations.mirror_flat === flat ? " mode-option--active" : ""}`}
                        style={{ flex: 1 }}
                        onClick={() => update("generations", { mirror_flat: flat })}
                      >
                        <div className="mode-option-title">{title}</div>
                        <div className="mode-option-desc">{desc}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{
                    margin: "0 0 2px",
                    padding: "8px 10px",
                    borderRadius: "8px",
                    background: "rgba(239,68,68,0.08)",
                    border: "1px solid rgba(239,68,68,0.3)",
                    display: "flex",
                    gap: "7px",
                    alignItems: "flex-start",
                    fontSize: "11px",
                    lineHeight: "1.5",
                  }}>
                    <span style={{ color: "var(--red)", fontSize: "13px", flexShrink: 0, marginTop: "1px" }}>⚠</span>
                    <span style={{ color: "var(--muted)" }}>
                      {config.generations.mirror_flat
                        ? <><code style={{ fontFamily: "monospace", color: "var(--text)" }}>{"{dest}/"}</code> のルート直下に直接コピーします。</>
                        : <><code style={{ fontFamily: "monospace", color: "var(--text)" }}>{"{dest}/{label}/"}</code> にコピーします。</>
                      }
                    </span>
                  </div>
                </>
              )}
              <div className="section-divider" />
              <FieldRow label="保持世代数" hint={config.generations.mirror_mode ? "ミラーモード時は無効" : "1以上"}>
                <FieldInput type="number" value={config.generations.keep} onChange={(e) => update("generations", { keep: parseInt(e.target.value) || 1 })} style={{ width: "80px" }} disabled={config.generations.mirror_mode} />
              </FieldRow>
              <FieldRow label="詳細ログ保持数">
                <FieldInput type="number" value={config.generations.detail_log_keep} onChange={(e) => update("generations", { detail_log_keep: parseInt(e.target.value) || 1 })} style={{ width: "80px" }} />
              </FieldRow>
              <FieldRow label="成功履歴保持数" hint="0以下で無効">
                <FieldInput type="number" value={config.generations.success_history_keep} onChange={(e) => update("generations", { success_history_keep: parseInt(e.target.value) || 0 })} style={{ width: "80px" }} />
              </FieldRow>
            </div>
          </div>

          <div className="config-section" style={{ marginBottom: 0 }}>
            <div className="config-section-header">
              <SectionIcon>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14H6L5 6"/>
                  <path d="M10 11v6M14 11v6"/>
                  <path d="M9 6V4h6v2"/>
                </svg>
              </SectionIcon>
              <span className="config-section-title">ゴミ箱クリーンアップ</span>
            </div>
            <div className="config-section-body">
              <ToggleRow label="クリーンアップを有効にする" description="NAS ソースのみ対応" checked={config.trashbox.enabled} onChange={(v) => update("trashbox", { enabled: v })} />
              <div className="section-divider" />
              <FieldRow label="保持期間（日）">
                <FieldInput type="number" value={config.trashbox.retention_days} onChange={(e) => update("trashbox", { retention_days: parseInt(e.target.value) || 1 })} disabled={!config.trashbox.enabled || config.source.kind !== "nas"} style={{ width: "80px" }} />
              </FieldRow>
            </div>
          </div>
        </div>

        {/* ═══ Robocopy ═══ */}
        <div className="config-section">
          <div className="config-section-header">
            <SectionIcon>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
              </svg>
            </SectionIcon>
            <span className="config-section-title">Robocopy</span>
          </div>
          <div className="config-section-body">
            <div className="robo-option-list">
              <RoboOptionRow
                checked={config.robocopy.opt_mir}
                onToggle={(v) => update("robocopy", { opt_mir: v })}
                flag="/MIR"
                label="ミラーリング"
                tooltip={"コピー先をコピー元と完全同期。\nコピー元に存在しないファイルはコピー先から削除されます。"}
              />
              <RoboOptionRow
                checked={config.robocopy.opt_mt_enabled}
                onToggle={(v) => update("robocopy", { opt_mt_enabled: v })}
                flag="/MT"
                label="スレッド数"
                tooltip={"マルチスレッドコピーのスレッド数。\n値が大きいほど高速ですが CPU 負荷も増加します。\nデフォルト: 16"}
                value={String(config.robocopy.threads)}
                onValueChange={(v) => update("robocopy", { threads: parseInt(v) || 1 })}
                valueType="number"
              />
              <RoboOptionRow
                checked={config.robocopy.opt_r_enabled}
                onToggle={(v) => update("robocopy", { opt_r_enabled: v })}
                flag="/R"
                label="リトライ回数"
                tooltip={"コピー失敗時のリトライ回数。\n0 を指定するとリトライしません。\nデフォルト: 3"}
                value={String(config.robocopy.retry_count)}
                onValueChange={(v) => update("robocopy", { retry_count: parseInt(v) || 0 })}
                valueType="number"
              />
              <RoboOptionRow
                checked={config.robocopy.opt_w_enabled}
                onToggle={(v) => update("robocopy", { opt_w_enabled: v })}
                flag="/W"
                label="待機秒数"
                tooltip={"リトライまでの待機秒数。\n/R が 0 の場合は無効です。\nデフォルト: 5"}
                value={String(config.robocopy.retry_wait)}
                onValueChange={(v) => update("robocopy", { retry_wait: parseInt(v) || 0 })}
                valueType="number"
              />
              <RoboOptionRow
                checked={config.robocopy.opt_dcopy_enabled}
                onToggle={(v) => update("robocopy", { opt_dcopy_enabled: v })}
                flag="/DCOPY"
                label="ディレクトリ属性"
                tooltip={"ディレクトリのコピー対象属性。\nD=データ A=属性 T=タイムスタンプ\nデフォルト: DAT"}
                value={config.robocopy.opt_dcopy_val}
                onValueChange={(v) => update("robocopy", { opt_dcopy_val: v })}
                valueWidth={60}
              />
              <RoboOptionRow
                checked={config.robocopy.opt_copy_enabled}
                onToggle={(v) => update("robocopy", { opt_copy_enabled: v })}
                flag="/COPY"
                label="ファイル属性"
                tooltip={"ファイルのコピー対象属性。\nD=データ A=属性 T=タイムスタンプ S=セキュリティ\nデフォルト: DATS"}
                value={config.robocopy.opt_copy_val}
                onValueChange={(v) => update("robocopy", { opt_copy_val: v })}
                valueWidth={60}
              />
              <RoboOptionRow
                checked={config.robocopy.opt_compress}
                onToggle={(v) => update("robocopy", { opt_compress: v })}
                flag="/COMPRESS"
                label="ネットワーク圧縮"
                tooltip={"ネットワーク転送時にデータを圧縮。\n転送速度が向上することがあります。"}
              />
              <RoboOptionRow
                checked={config.robocopy.opt_tee}
                onToggle={(v) => update("robocopy", { opt_tee: v })}
                flag="/TEE"
                label="二重出力"
                tooltip={"ログファイルとコンソールの両方に出力します。"}
              />
              <RoboOptionRow
                checked={config.robocopy.opt_np}
                onToggle={(v) => update("robocopy", { opt_np: v })}
                flag="/NP"
                label="進捗非表示"
                tooltip={"コピー進捗率を表示しません（ログ肥大化を防ぐ）。"}
              />
              <RoboOptionRow
                checked={config.robocopy.opt_ns}
                onToggle={(v) => update("robocopy", { opt_ns: v })}
                flag="/NS"
                label="サイズ非表示"
                tooltip={"ファイルサイズを表示しません（ログ肥大化を防ぐ）。"}
              />
            </div>
            {/* 追加フラグ */}
            <Accordion title="追加フラグ">
              <div>
                <div className="field-label" style={{ marginBottom: "8px" }}>よく使うオプション一覧</div>
                <table className="flag-ref-table">
                  <thead>
                    <tr>
                      <th>フラグ</th>
                      <th>説明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      ["/XD <dir>",     "指定ディレクトリを除外。例: /XD tmp .git node_modules"],
                      ["/XF <pattern>", "指定パターンのファイルを除外。例: /XF *.tmp *.log"],
                      ["/XA:SH",        "隠し属性・システム属性のファイルを除外"],
                      ["/XJD",          "ジャンクションポイント（ディレクトリ）を除外"],
                      ["/Z",            "再起動可能モード。ネットワーク障害に強くなるが低速"],
                      ["/B",            "バックアップモード。管理者権限でACLを無視してコピー"],
                      ["/FFT",          "FAT精度のタイムスタンプを使用。一部のNASで必要"],
                      ["/IPG:N",        "ファイル間待機時間（ms）。帯域を制限したい場合に使用"],
                      ["/MAXAGE:N",     "N日より古いファイルを除外"],
                      ["/MAX:N",        "N バイト超のファイルを除外"],
                    ] as [string, string][]).map(([flag, desc]) => (
                      <tr key={flag}>
                        <td><code className="flag-code">{flag}</code></td>
                        <td>{desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <FieldRow label="追加フラグ" hint="スペース区切り（例: /XD tmp /XF *.tmp）">
                <FieldInput
                  value={config.robocopy.extra_flags.join(" ")}
                  onChange={(e) => update("robocopy", { extra_flags: e.target.value.split(" ").map((s) => s.trim()).filter(Boolean) })}
                  placeholder="/XD tmp /XF *.tmp"
                  className="mono"
                />
              </FieldRow>
            </Accordion>
          </div>
        </div>

        {/* ═══ Discord 通知 ═══ */}
        <div className="config-section">
          <div className="config-section-header">
            <SectionIcon>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </SectionIcon>
            <span className="config-section-title">Discord 通知</span>
          </div>
          <div className="config-section-body">
            <ToggleRow label="Webhook 通知を有効にする" checked={config.notification.discord.enabled} onChange={(v) => update("notification", { discord: { ...config.notification.discord, enabled: v } })} />
            <div className="section-divider" />
            <FieldRow label="Webhook URL">
              <FieldInput value={config.notification.discord.webhook_url} onChange={(e) => update("notification", { discord: { ...config.notification.discord, webhook_url: e.target.value } })} placeholder="https://discord.com/api/webhooks/..." disabled={!config.notification.discord.enabled} className="mono" />
            </FieldRow>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                className="btn-ghost-sm"
                style={{ fontSize: "12px" }}
                disabled={!config.notification.discord.enabled || !config.notification.discord.webhook_url || testingDiscord}
                onClick={async () => {
                  setTestingDiscord(true);
                  try {
                    await testDiscord(config.notification.discord.webhook_url);
                    showToast("テスト送信成功 ✅", "success");
                  } catch (e) {
                    showToast(`テスト送信失敗: ${e}`, "error");
                  } finally {
                    setTestingDiscord(false);
                  }
                }}
              >
                {testingDiscord ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 2 11 13"/><path d="M22 2 15 22 11 13 2 9l20-7z"/>
                  </svg>
                )}
                テスト送信
              </button>
            </div>
            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
              {([
                ["notify_start", "開始時"],
                ["notify_end", "正常終了時"],
                ["notify_error", "エラー時"],
              ] as const).map(([key, label]) => (
                <label key={key} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer", color: "var(--muted)" }}>
                  <input
                    type="checkbox"
                    checked={config.notification.discord[key]}
                    onChange={(e) => update("notification", { discord: { ...config.notification.discord, [key]: e.target.checked } })}
                    disabled={!config.notification.discord.enabled}
                  />
                  {label}
                </label>
              ))}
            </div>
            <FieldRow label="開始メッセージ">
              <FieldInput value={config.notification.discord.start_message} onChange={(e) => update("notification", { discord: { ...config.notification.discord, start_message: e.target.value } })} disabled={!config.notification.discord.enabled || !config.notification.discord.notify_start} />
            </FieldRow>
            <FieldRow label="終了メッセージ">
              <FieldInput value={config.notification.discord.end_message} onChange={(e) => update("notification", { discord: { ...config.notification.discord, end_message: e.target.value } })} disabled={!config.notification.discord.enabled || !config.notification.discord.notify_end} />
            </FieldRow>
            <FieldRow label="エラーメッセージ">
              <FieldInput value={config.notification.discord.error_message} onChange={(e) => update("notification", { discord: { ...config.notification.discord, error_message: e.target.value } })} disabled={!config.notification.discord.enabled || !config.notification.discord.notify_error} />
            </FieldRow>
          </div>
        </div>

        {/* ═══ シャットダウン + テストモード (2カラム) ═══ */}
        <div className="config-2col">
          <div className="config-section" style={{ marginBottom: 0 }}>
            <div className="config-section-header">
              <SectionIcon>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
                  <line x1="12" y1="2" x2="12" y2="12"/>
                </svg>
              </SectionIcon>
              <span className="config-section-title">シャットダウン</span>
            </div>
            <div className="config-section-body">
              <ToggleRow label="完了後シャットダウン" description="指定秒数待ってシャットダウン" checked={config.shutdown.enabled} onChange={(v) => update("shutdown", { enabled: v })} />
              <div className="section-divider" />
              <FieldRow label="待機秒数">
                <FieldInput type="number" value={config.shutdown.delay_seconds} onChange={(e) => update("shutdown", { delay_seconds: parseInt(e.target.value) || 0 })} disabled={!config.shutdown.enabled} style={{ width: "80px" }} />
              </FieldRow>
            </div>
          </div>

          <div className="config-section" style={{ marginBottom: 0 }}>
            <div className="config-section-header">
              <SectionIcon>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
              </SectionIcon>
              <span className="config-section-title">テストモード</span>
            </div>
            <div className="config-section-body">
              <ToggleRow label="ドライラン実行" description="実際のファイル操作なし" checked={config.test_mode.enabled} onChange={(v) => update("test_mode", { enabled: v })} />
              <div className="section-divider" />
              <FieldRow label="Robocopy 表示行数">
                <FieldInput type="number" value={config.test_mode.robocopy_lines} onChange={(e) => update("test_mode", { robocopy_lines: parseInt(e.target.value) || 1 })} disabled={!config.test_mode.enabled} style={{ width: "80px" }} />
              </FieldRow>
              <FieldRow label="Trashbox 表示件数">
                <FieldInput type="number" value={config.test_mode.trashbox_lines} onChange={(e) => update("test_mode", { trashbox_lines: parseInt(e.target.value) || 1 })} disabled={!config.test_mode.enabled} style={{ width: "80px" }} />
              </FieldRow>
            </div>
          </div>
        </div>

      </div>

      {/* Save/Cancel バー */}
      {dirty && (
        <div className="save-bar">
          <button className="btn-cancel" onClick={handleCancel}>キャンセル</button>
          <button className="btn-save" onClick={handleSave}>
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline", marginRight: "6px" }}>
              <path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/>
              <path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/>
              <path d="M7 3v4a1 1 0 0 0 1 1h7"/>
            </svg>
            保存
          </button>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

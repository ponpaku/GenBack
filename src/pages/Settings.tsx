import { useState, useEffect, useCallback } from "react";
import { open, save, ask } from "@tauri-apps/plugin-dialog";
import {
  listProfiles,
  loadProfile,
  saveProfile,
  deleteProfile,
  renameProfile,
  duplicateProfile,
  importProfile,
  exportProfile,
  getDefaultConfig,
  type Config,
  type SourcePath,
} from "../lib/tauri";
import {
  Toast,
  Button,
  Input,
  Select,
  CheckboxRow,
  FormRow,
  Card,
  PageHeader,
  SectionHeader,
} from "../components/ui";

function FolderIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>
    </svg>
  );
}

export default function Settings() {
  const [profiles, setProfiles] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [config, setConfig] = useState<Config | null>(null);
  const [originalConfig, setOriginalConfig] = useState<Config | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [duplicating, setDuplicating] = useState(false);
  const [dupName, setDupName] = useState("");
  const [dirty, setDirty] = useState(false);
  // ラベル変更確認パネル用
  const [labelChanges, setLabelChanges] = useState<{ path: string; oldLabel: string; newLabel: string }[]>([]);

  const showToast = useCallback((message: string, type: "success" | "error" | "info" = "info") => {
    setToast({ message, type });
  }, []);

  const refreshProfiles = useCallback(async () => {
    try {
      const list = await listProfiles();
      setProfiles(list);
      return list;
    } catch (e) {
      showToast(String(e), "error");
      return [];
    }
  }, [showToast]);

  useEffect(() => {
    refreshProfiles().then((list) => {
      if (list.length > 0 && !selected) setSelected(list[0]);
    });
  }, []);

  useEffect(() => {
    if (!selected) return;
    setDirty(false);
    setLabelChanges([]);
    loadProfile(selected)
      .then((cfg) => { setConfig(cfg); setOriginalConfig(cfg); })
      .catch((e) => showToast(String(e), "error"));
  }, [selected, showToast]);

  const update = <K extends keyof Config>(section: K, patch: Partial<Config[K]>) => {
    if (!config) return;
    setConfig({ ...config, [section]: { ...config[section], ...patch } });
    setDirty(true);
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
      setSelected(name);
      showToast(`プロファイル "${name}" を作成しました`, "success");
    } catch (e) {
      showToast(String(e), "error");
    }
  };

  const handleRename = async () => {
    const newN = renameName.trim();
    if (!newN || newN === selected) return;
    try {
      const hadSchedule = await renameProfile(selected, newN);
      setRenaming(false);
      await refreshProfiles();
      setSelected(newN);
      const msg = hadSchedule
        ? `リネームしました。スケジュールタスクは削除されました。「スケジュール」ページで再作成してください。`
        : `プロファイルを "${newN}" にリネームしました`;
      showToast(msg, hadSchedule ? "info" : "success");
    } catch (e) {
      showToast(String(e), "error");
    }
  };

  const handleDuplicate = async () => {
    const newN = dupName.trim();
    if (!newN) return;
    try {
      await duplicateProfile(selected, newN);
      setDuplicating(false);
      await refreshProfiles();
      setSelected(newN);
      showToast(`"${selected}" を "${newN}" として複製しました`, "success");
    } catch (e) {
      showToast(String(e), "error");
    }
  };

  const handleSelectChange = async (v: string) => {
    if (v === "__new__") {
      setCreating(true);
      setNewName("");
      return;
    }
    if (dirty) {
      const ok = await ask("変更が保存されていません。切り替えますか？", {
        title: "未保存の変更",
        kind: "warning",
      });
      if (!ok) return;
    }
    setSelected(v);
  };

  const handleDelete = async () => {
    if (!selected) return;
    const confirmed = await ask(`プロファイル "${selected}" を削除しますか？\nこの操作は元に戻せません。`, {
      title: "削除の確認",
      kind: "warning",
    });
    if (!confirmed) return;
    try {
      await deleteProfile(selected);
      setSelected("");
      setConfig(null);
      const list = await refreshProfiles();
      if (list.length > 0) setSelected(list[0]);
      showToast("削除しました", "success");
    } catch (e) {
      showToast(String(e), "error");
    }
  };

  /** バリデーションのみ。エラーがあれば文字列を返す */
  const validateForSave = (): string | null => {
    if (!config) return null;
    if (config.generations.keep < 1) return "世代数は1以上を指定してください";
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

  /** 実際の保存処理（バリデーション済み前提） */
  const executeSave = async () => {
    if (!selected || !config) return;
    try {
      await saveProfile(selected, config);
      setDirty(false);
      setLabelChanges([]);
      setOriginalConfig(config);
      showToast("保存しました", "success");
    } catch (e) {
      showToast(String(e), "error");
    }
  };

  const handleSave = async () => {
    if (!selected || !config) return;
    const err = validateForSave();
    if (err) return showToast(err, "error");

    // ラベル変更を検出
    const changes = config.source.paths.flatMap((newSp) => {
      const oldSp = originalConfig?.source.paths.find((sp) => sp.path === newSp.path);
      if (oldSp && oldSp.label !== newSp.label) {
        return [{ path: newSp.path, oldLabel: oldSp.label, newLabel: newSp.label }];
      }
      return [];
    });

    if (changes.length > 0) {
      // 確認パネルを表示して処理を中断
      setLabelChanges(changes);
      return;
    }

    await executeSave();
  };

  const handleImport = async () => {
    try {
      const filePath = await open({ filters: [{ name: "TOML", extensions: ["toml"] }] });
      if (!filePath) return;
      const name = await importProfile(filePath as string);
      await refreshProfiles();
      setSelected(name);
      showToast(`インポートしました: ${name}`, "success");
    } catch (e) {
      showToast(String(e), "error");
    }
  };

  const handleExport = async () => {
    if (!selected) return;
    try {
      const filePath = await save({ defaultPath: `${selected}.toml`, filters: [{ name: "TOML", extensions: ["toml"] }] });
      if (!filePath) return;
      await exportProfile(selected, filePath);
      showToast("エクスポートしました", "success");
    } catch (e) {
      showToast(String(e), "error");
    }
  };

  const browsePath = async (): Promise<string | null> => {
    const result = await open({ directory: true });
    return typeof result === "string" ? result : null;
  };

  // ソースパス操作
  const updateSourcePath = (idx: number, patch: Partial<SourcePath>) => {
    if (!config) return;
    const paths = config.source.paths.map((sp, i) => i === idx ? { ...sp, ...patch } : sp);
    update("source", { paths });
  };
  const addSourcePath = () => {
    if (!config) return;
    update("source", { paths: [...config.source.paths, { path: "", label: "" }] });
  };
  const removeSourcePath = (idx: number) => {
    if (!config) return;
    update("source", { paths: config.source.paths.filter((_, i) => i !== idx) });
  };

  // 宛先パス操作
  const updateDestPath = (idx: number, v: string) => {
    if (!config) return;
    const paths = [...config.destinations.paths];
    paths[idx] = v;
    update("destinations", { paths });
  };

  return (
    <div className="page-view">
    <div className="page-inner">
      <PageHeader
        title="プロファイル"
        subtitle="バックアップジョブの定義と管理"
        actions={
          config && (
            <Button variant="primary" onClick={handleSave} disabled={!dirty}>
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg>
              保存{dirty ? " *" : ""}
            </Button>
          )
        }
      />

      {/* プロファイル選択バー */}
      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          {creating ? (
            /* 新規作成モード */
            <>
              <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">新しい名前:</span>
              <Input
                value={newName}
                onChange={setNewName}
                placeholder="プロファイル名"
                className="w-44"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreating(false); }}
              />
              <Button variant="primary" onClick={handleCreate} disabled={!newName.trim()}>作成</Button>
              <Button variant="ghost" onClick={() => setCreating(false)}>キャンセル</Button>
            </>
          ) : renaming ? (
            /* リネームモード */
            <>
              <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">新しい名前:</span>
              <Input
                value={renameName}
                onChange={setRenameName}
                className="w-44"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setRenaming(false); }}
              />
              <Button variant="primary" onClick={handleRename} disabled={!renameName.trim() || renameName.trim() === selected}>保存</Button>
              <Button variant="ghost" onClick={() => setRenaming(false)}>キャンセル</Button>
            </>
          ) : duplicating ? (
            /* 複製モード */
            <>
              <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">複製先の名前:</span>
              <Input
                value={dupName}
                onChange={setDupName}
                placeholder={`${selected}_copy`}
                className="w-44"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") handleDuplicate(); if (e.key === "Escape") setDuplicating(false); }}
              />
              <Button variant="primary" onClick={handleDuplicate} disabled={!dupName.trim()}>複製</Button>
              <Button variant="ghost" onClick={() => setDuplicating(false)}>キャンセル</Button>
            </>
          ) : (
            /* 通常モード */
            <>
              <Select
                value={selected}
                onChange={handleSelectChange}
                options={[
                  { value: "__new__", label: "＋ 新規作成..." },
                  ...(profiles.length === 0
                    ? [{ value: "", label: "（プロファイルなし）" }]
                    : profiles.map((p) => ({ value: p, label: p }))),
                ]}
                className="min-w-36"
              />
              {/* リネームボタン */}
              <Button
                variant="ghost"
                disabled={!selected}
                onClick={() => { setRenameName(selected); setRenaming(true); }}
                title="プロファイル名を変更"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>
              </Button>
              {/* 複製ボタン */}
              <Button
                variant="ghost"
                disabled={!selected}
                onClick={() => { setDupName(`${selected}_copy`); setDuplicating(true); }}
                title="プロファイルを複製"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
              </Button>
              <Button variant="danger" onClick={handleDelete} disabled={!selected}>削除</Button>
              <span className="text-gray-400 dark:text-gray-600">|</span>
              <Button variant="secondary" onClick={handleImport}>↑ Import</Button>
              <Button variant="secondary" onClick={handleExport} disabled={!selected}>↓ Export</Button>
            </>
          )}
        </div>
      </Card>

      {/* ラベル変更確認パネル */}
      {labelChanges.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-500/50 bg-amber-900/20 p-4">
          <div className="flex items-start gap-2 mb-3">
            <span className="text-amber-400 text-base shrink-0">⚠</span>
            <div>
              <p className="text-sm font-semibold text-amber-300">ラベル変更を検出しました</p>
              <p className="text-xs text-amber-400/80 mt-0.5">
                バックアップ先の <code className="font-mono">data/</code> フォルダ名を変更します。
                ネットワーク先の場合は接続が必要です。
              </p>
            </div>
          </div>
          <ul className="mb-3 space-y-1">
            {labelChanges.map((c, i) => (
              <li key={i} className="text-xs font-mono text-amber-200/80 flex items-center gap-2">
                <span className="text-gray-500 dark:text-gray-400 truncate max-w-[12rem]">{c.path}</span>
                <span className="shrink-0">:</span>
                <span className="text-red-400 line-through">{c.oldLabel}</span>
                <span className="text-gray-500">→</span>
                <span className="text-emerald-400">{c.newLabel}</span>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button variant="primary" onClick={executeSave}>続行して保存</Button>
            <Button variant="ghost" onClick={() => setLabelChanges([])}>キャンセル</Button>
          </div>
        </div>
      )}

      {config && (
        <div className="space-y-1">
          {/* コピー元 */}
          <SectionHeader>コピー元</SectionHeader>
            <Card>
              <FormRow label="種別">
                <Select
                  value={config.source.kind}
                  onChange={(v) => update("source", { kind: v })}
                  options={[
                    { value: "nas", label: "NAS（ネットワーク共有）" },
                    { value: "local", label: "ローカルフォルダ" },
                  ]}
                />
              </FormRow>

              {config.source.kind === "nas" && (
                <>
                  <FormRow label="ホスト" hint="\\\\server 形式">
                    <Input value={config.source.host} onChange={(v) => update("source", { host: v })} placeholder="\\\\server.local" />
                  </FormRow>
                  <FormRow label="ユーザー名">
                    <Input value={config.source.user} onChange={(v) => update("source", { user: v })} />
                  </FormRow>
                  <FormRow label="パスワード">
                    <Input type="password" value={config.source.password} onChange={(v) => update("source", { password: v })} />
                  </FormRow>
                </>
              )}

              <div className="mt-3">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1.5">コピー元パス</span>
                {/* ヘッダーとデータ行を同一グリッドにまとめて列を揃える */}
                <div
                  className="grid gap-x-1.5 gap-y-1.5 items-center"
                  style={{ gridTemplateColumns: config.source.kind === "local" ? "auto 1fr 7rem auto" : "1fr 7rem auto" }}
                >
                  {config.source.paths.length > 0 && (
                    <>
                      {config.source.kind === "local" && <span />}
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {config.source.kind === "nas" ? "共有名" : "フォルダパス"}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">ラベル</span>
                      <span />
                    </>
                  )}
                  {config.source.paths.map((sp, i) => (
                    <>
                      {config.source.kind === "local" && (
                        <Button key={`browse-${i}`} variant="ghost" title="フォルダを選択" onClick={async () => {
                          const p = await browsePath();
                          if (p) updateSourcePath(i, { path: p });
                        }}>
                          <FolderIcon />
                        </Button>
                      )}
                      <Input
                        key={`path-${i}`}
                        value={sp.path}
                        onChange={(v) => updateSourcePath(i, { path: v })}
                        placeholder={config.source.kind === "nas" ? "docs" : "D:\\data\\docs"}
                      />
                      <Input
                        key={`label-${i}`}
                        value={sp.label}
                        onChange={(v) => updateSourcePath(i, { label: v })}
                        placeholder="backup-docs"
                      />
                      <Button key={`del-${i}`} variant="danger" onClick={() => removeSourcePath(i)}>✕</Button>
                    </>
                  ))}
                </div>
                <Button variant="ghost" className="self-start text-xs mt-1" onClick={addSourcePath}>
                  ＋ パスを追加
                </Button>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                  {config.source.kind === "nas"
                    ? "共有名: NAS の共有フォルダ名（例: docs）　ラベル: バックアップ先の data/ 配下のフォルダ名"
                    : "フォルダパス: コピー元のフルパス（例: D:\\data\\docs）　ラベル: バックアップ先の data/ 配下のフォルダ名"}
                </p>
              </div>
            </Card>

            {/* バックアップ先 */}
            <SectionHeader>バックアップ先</SectionHeader>
            <Card>
              <FormRow label="種別">
                <Select
                  value={config.destinations.kind}
                  onChange={(v) => update("destinations", { kind: v })}
                  options={[
                    { value: "local", label: "ローカルフォルダ" },
                    { value: "nas", label: "NAS（ネットワーク共有）" },
                  ]}
                />
              </FormRow>

              {config.destinations.kind === "nas" && (
                <>
                  <FormRow label="ホスト" hint="net use 認証用（例: \\\\nas2）">
                    <Input value={config.destinations.host} onChange={(v) => update("destinations", { host: v })} placeholder="\\\\nas2.local" />
                  </FormRow>
                  <FormRow label="ユーザー名">
                    <Input value={config.destinations.user} onChange={(v) => update("destinations", { user: v })} />
                  </FormRow>
                  <FormRow label="パスワード">
                    <Input type="password" value={config.destinations.password} onChange={(v) => update("destinations", { password: v })} />
                  </FormRow>
                </>
              )}

              <FormRow label="バックアップモード">
                <Select
                  value={config.destinations.mode}
                  onChange={(v) => update("destinations", { mode: v as "rotate" | "simultaneous" })}
                  options={[
                    { value: "rotate", label: "rotate — 最も古い先を1つ選ぶ" },
                    { value: "simultaneous", label: "simultaneous — 全先へ順次実行" },
                  ]}
                />
              </FormRow>
              <FormRow
                label="保存先パス"
                hint={config.destinations.kind === "nas" ? "例: \\\\nas2\\backup" : "例: D:\\backup"}
              >
                <div className="flex flex-col gap-1.5">
                  {config.destinations.paths.map((p, i) => (
                    <div key={i} className="flex gap-1.5">
                      {config.destinations.kind === "local" && (
                        <Button variant="ghost" title="フォルダを選択" onClick={async () => {
                          const selected = await browsePath();
                          if (selected) updateDestPath(i, selected);
                        }}>
                          <FolderIcon />
                        </Button>
                      )}
                      <Input
                        value={p}
                        onChange={(v) => updateDestPath(i, v)}
                        placeholder={config.destinations.kind === "nas" ? "\\\\nas2\\backup" : "D:\\backup"}
                      />
                      <Button
                        variant="danger"
                        onClick={() => update("destinations", { paths: config.destinations.paths.filter((_, j) => j !== i) })}
                      >✕</Button>
                    </div>
                  ))}
                  <Button
                    variant="ghost"
                    className="self-start text-xs"
                    onClick={() => update("destinations", { paths: [...config.destinations.paths, ""] })}
                  >
                    ＋ パスを追加
                  </Button>
                </div>
              </FormRow>
            </Card>

          {/* 世代管理 */}
          <SectionHeader>世代管理</SectionHeader>
            <Card>
              <FormRow label="保持世代数" hint="1以上">
                <Input type="number" value={config.generations.keep} onChange={(v) => update("generations", { keep: parseInt(v) || 1 })} />
              </FormRow>
              <FormRow label="詳細ログ保持数">
                <Input type="number" value={config.generations.detail_log_keep} onChange={(v) => update("generations", { detail_log_keep: parseInt(v) || 1 })} />
              </FormRow>
              <FormRow label="成功履歴保持数" hint="0以下で無効">
                <Input type="number" value={config.generations.success_history_keep} onChange={(v) => update("generations", { success_history_keep: parseInt(v) || 0 })} />
              </FormRow>
            </Card>

            {/* Trashbox */}
            <SectionHeader>ゴミ箱クリーンアップ</SectionHeader>
            <Card>
              <div className="mb-3">
                <CheckboxRow
                  label="trashbox クリーンアップを有効にする"
                  description="NAS ソースのみ対応"
                  checked={config.trashbox.enabled}
                  onChange={(v) => update("trashbox", { enabled: v })}
                />
              </div>
              <FormRow label="保持期間（日）">
                <Input type="number" value={config.trashbox.retention_days} onChange={(v) => update("trashbox", { retention_days: parseInt(v) || 1 })} disabled={!config.trashbox.enabled || config.source.kind !== "nas"} />
              </FormRow>
            </Card>

            {/* Robocopy */}
            <SectionHeader>Robocopy 設定</SectionHeader>
            <Card>
              <FormRow label="スレッド数 (/MT)">
                <Input type="number" value={config.robocopy.threads} onChange={(v) => update("robocopy", { threads: parseInt(v) || 1 })} />
              </FormRow>
              <FormRow label="リトライ回数 (/R)">
                <Input type="number" value={config.robocopy.retry_count} onChange={(v) => update("robocopy", { retry_count: parseInt(v) || 0 })} />
              </FormRow>
              <FormRow label="リトライ待機秒 (/W)">
                <Input type="number" value={config.robocopy.retry_wait} onChange={(v) => update("robocopy", { retry_wait: parseInt(v) || 0 })} />
              </FormRow>
              <FormRow label="追加フラグ" hint="スペース区切り">
                <Input
                  value={config.robocopy.extra_flags.join(" ")}
                  onChange={(v) => update("robocopy", { extra_flags: v.split(" ").map((s) => s.trim()).filter(Boolean) })}
                  placeholder="/XD tmp /XF *.tmp"
                />
              </FormRow>
            </Card>

            {/* Discord */}
            <SectionHeader>Discord 通知</SectionHeader>
            <Card>
              <div className="mb-3">
                <CheckboxRow
                  label="Discord Webhook 通知を有効にする"
                  checked={config.notification.discord.enabled}
                  onChange={(v) => update("notification", { discord: { ...config.notification.discord, enabled: v } })}
                />
              </div>
              <FormRow label="Webhook URL">
                <Input
                  value={config.notification.discord.webhook_url}
                  onChange={(v) => update("notification", { discord: { ...config.notification.discord, webhook_url: v } })}
                  placeholder="https://discord.com/api/webhooks/..."
                  disabled={!config.notification.discord.enabled}
                />
              </FormRow>
              <FormRow label="通知タイミング">
                <div className="flex flex-col gap-1.5">
                  <CheckboxRow
                    label="開始時"
                    checked={config.notification.discord.notify_start}
                    onChange={(v) => update("notification", { discord: { ...config.notification.discord, notify_start: v } })}
                    disabled={!config.notification.discord.enabled}
                  />
                  <CheckboxRow
                    label="正常終了時"
                    checked={config.notification.discord.notify_end}
                    onChange={(v) => update("notification", { discord: { ...config.notification.discord, notify_end: v } })}
                    disabled={!config.notification.discord.enabled}
                  />
                  <CheckboxRow
                    label="エラー時"
                    checked={config.notification.discord.notify_error}
                    onChange={(v) => update("notification", { discord: { ...config.notification.discord, notify_error: v } })}
                    disabled={!config.notification.discord.enabled}
                  />
                </div>
              </FormRow>
              <FormRow label="開始メッセージ">
                <Input
                  value={config.notification.discord.start_message}
                  onChange={(v) => update("notification", { discord: { ...config.notification.discord, start_message: v } })}
                  disabled={!config.notification.discord.enabled || !config.notification.discord.notify_start}
                />
              </FormRow>
              <FormRow label="正常終了メッセージ">
                <Input
                  value={config.notification.discord.end_message}
                  onChange={(v) => update("notification", { discord: { ...config.notification.discord, end_message: v } })}
                  disabled={!config.notification.discord.enabled || !config.notification.discord.notify_end}
                />
              </FormRow>
              <FormRow label="エラーメッセージ">
                <Input
                  value={config.notification.discord.error_message}
                  onChange={(v) => update("notification", { discord: { ...config.notification.discord, error_message: v } })}
                  disabled={!config.notification.discord.enabled || !config.notification.discord.notify_error}
                />
              </FormRow>
            </Card>

            {/* シャットダウン */}
            <SectionHeader>シャットダウン</SectionHeader>
            <Card>
              <div className="mb-3">
                <CheckboxRow
                  label="バックアップ完了後にシャットダウン"
                  checked={config.shutdown.enabled}
                  onChange={(v) => update("shutdown", { enabled: v })}
                  description="バックアップ完了後に指定秒数待ってシャットダウンします"
                />
              </div>
              <FormRow label="待機秒数">
                <Input type="number" value={config.shutdown.delay_seconds} onChange={(v) => update("shutdown", { delay_seconds: parseInt(v) || 0 })} disabled={!config.shutdown.enabled} />
              </FormRow>
            </Card>

            {/* テストモード */}
            <SectionHeader>テストモード</SectionHeader>
            <Card>
              <div className="mb-3">
                <CheckboxRow
                  label="テストモードを有効にする"
                  checked={config.test_mode.enabled}
                  onChange={(v) => update("test_mode", { enabled: v })}
                  description="実際のコピー・削除を行わず動作確認のみ行います"
                />
              </div>
              <FormRow label="Robocopy 表示行数">
                <Input type="number" value={config.test_mode.robocopy_lines} onChange={(v) => update("test_mode", { robocopy_lines: parseInt(v) || 1 })} disabled={!config.test_mode.enabled} />
              </FormRow>
              <FormRow label="Trashbox 表示件数">
                <Input type="number" value={config.test_mode.trashbox_lines} onChange={(v) => update("test_mode", { trashbox_lines: parseInt(v) || 1 })} disabled={!config.test_mode.enabled} />
              </FormRow>
            </Card>

          <div className="pt-3 flex justify-end">
            <Button variant="primary" onClick={handleSave} disabled={!dirty}>
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg>
              保存{dirty ? " *" : ""}
            </Button>
          </div>
        </div>
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
    </div>
  );
}

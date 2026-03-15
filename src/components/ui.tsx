import { useEffect } from "react";

// ============================================================
// トースト通知
// ============================================================

export function Toast({
  message,
  type,
  onClose,
}: {
  message: string;
  type: "success" | "error" | "info";
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  const styles = {
    success: "bg-emerald-600 border-emerald-500 text-white",
    error: "bg-red-700 border-red-600 text-white",
    info: "bg-blue-700 border-blue-600 text-white",
  }[type];

  const icon = { success: "✓", error: "✕", info: "ℹ" }[type];

  return (
    <div
      className={`fixed bottom-5 right-5 flex items-center gap-3 px-4 py-3 rounded-lg border shadow-2xl text-sm z-50 animate-fade-in ${styles}`}
    >
      <span className="text-base font-bold">{icon}</span>
      <span>{message}</span>
      <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100">✕</button>
    </div>
  );
}

// ============================================================
// バッジ
// ============================================================

export function Badge({
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: "default" | "success" | "error" | "warning" | "info";
}) {
  const styles = {
    default: "bg-gray-500 dark:bg-gray-600 text-gray-100 dark:text-gray-200",
    success: "bg-emerald-600 dark:bg-emerald-700 text-emerald-50 dark:text-emerald-100",
    error: "bg-red-700 dark:bg-red-800 text-red-100 dark:text-red-200",
    warning: "bg-amber-600 dark:bg-amber-700 text-amber-50 dark:text-amber-100",
    info: "bg-blue-600 dark:bg-blue-700 text-blue-50 dark:text-blue-100",
  }[variant];

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles}`}>
      {children}
    </span>
  );
}

// ============================================================
// カード
// ============================================================

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 ${className}`}>
      {children}
    </div>
  );
}

// ============================================================
// セクションヘッダー
// ============================================================

export function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3 mt-6 first:mt-0">
      {children}
    </h3>
  );
}

// ============================================================
// ページヘッダー
// ============================================================

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h2>
        {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

// ============================================================
// ボタン
// ============================================================

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export function Button({
  children,
  variant = "secondary",
  onClick,
  disabled = false,
  className = "",
  type = "button",
  title,
}: {
  children: React.ReactNode;
  variant?: ButtonVariant;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
  title?: string;
}) {
  const base = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-gray-900 disabled:opacity-40 disabled:cursor-not-allowed";
  const styles: Record<ButtonVariant, string> = {
    primary: "bg-blue-600 hover:bg-blue-500 text-white focus:ring-blue-500",
    secondary: "bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 focus:ring-gray-500",
    danger: "bg-red-700 hover:bg-red-600 text-white focus:ring-red-500",
    ghost: "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 focus:ring-gray-500",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${base} ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

// ============================================================
// 入力
// ============================================================

export function Input({
  value,
  onChange,
  type = "text",
  placeholder,
  disabled = false,
  className = "",
  autoFocus,
  onKeyDown,
}: {
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      onKeyDown={onKeyDown}
      className={`w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-40 ${className}`}
      style={{ backgroundColor: "var(--color-surface)" }}
    />
  );
}

// ============================================================
// セレクト
// ============================================================

export function Select({
  value,
  onChange,
  options,
  disabled = false,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-40 ${className}`}
      style={{ backgroundColor: "var(--color-surface)" }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// ============================================================
// チェックボックス行
// ============================================================

export function CheckboxRow({
  label,
  checked,
  onChange,
  description,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-start gap-3 group ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}>
      <div className="relative mt-0.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => !disabled && onChange(e.target.checked)}
          disabled={disabled}
          className="sr-only"
        />
        <div
          className={`w-4 h-4 rounded border-2 flex items-center justify-center transition ${
            checked ? "bg-blue-600 border-blue-600" : "border-gray-400 dark:border-gray-500 group-hover:border-gray-500 dark:group-hover:border-gray-400"
          }`}
        >
          {checked && <span className="text-white text-xs leading-none">✓</span>}
        </div>
      </div>
      <div>
        <span className="text-sm text-gray-800 dark:text-gray-200">{label}</span>
        {description && <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">{description}</p>}
      </div>
    </label>
  );
}

// ============================================================
// フォーム行
// ============================================================

export function FormRow({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-4 items-start mb-3">
      <div className="pt-1.5">
        <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
        {hint && <p className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">{hint}</p>}
      </div>
      <div>{children}</div>
    </div>
  );
}

// ============================================================
// テーブル
// ============================================================

export function Table({
  headers,
  rows,
  emptyMessage = "データがありません",
}: {
  headers: string[];
  rows: (string | React.ReactNode)[][];
  emptyMessage?: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700" style={{ backgroundColor: "var(--color-surface)" }}>
            {headers.map((h, i) => (
              <th key={i} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="px-4 py-8 text-center text-gray-500 dark:text-gray-500 text-sm">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i} className="border-t border-gray-200/60 dark:border-gray-700/60 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-2.5 text-gray-700 dark:text-gray-300">
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// スピナー
// ============================================================

export function Spinner({ size = "sm" }: { size?: "sm" | "md" }) {
  const s = size === "sm" ? "w-4 h-4" : "w-6 h-6";
  return (
    <span
      className={`inline-block ${s} border-2 border-gray-300 dark:border-gray-600 border-t-blue-500 rounded-full animate-spin`}
    />
  );
}

// ============================================================
// 空状態
// ============================================================

export function EmptyState({ icon, title, description }: { icon: string; title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-5xl mb-4 opacity-30">{icon}</div>
      <h3 className="text-gray-600 dark:text-gray-300 font-medium mb-1">{title}</h3>
      {description && <p className="text-gray-500 dark:text-gray-500 text-sm">{description}</p>}
    </div>
  );
}

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Tone } from "../lib/status";
import { DaemonError } from "../api/source";
import { Icon } from "./Icon";

export const Lamp = ({ tone, className }: { tone: Tone; className?: string }) => <i className={`lamp ${className ?? ""}`} data-tone={tone} aria-hidden="true" />;

export const Chip = ({ tone, children }: { tone: Tone | "info"; children: ReactNode }) => <span className="chip" data-tone={tone}>{children}</span>;

export function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return <dl className="facts">{rows.map(([k, v]) => [<dt key={k + "t"}>{k}</dt>, <dd key={k + "d"}>{v}</dd>])}</dl>;
}

export function Timeline({ items }: { items: { at: string; text: ReactNode; tone?: Tone }[] }) {
  return <ol className="tl">{items.map((x, i) => <li key={i} data-tone={x.tone}><b>{x.at}</b>{x.text}</li>)}</ol>;
}

/** A command to copy. Every cli-mode action lands here. */
export function Cmd({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); } catch { /* clipboard blocked; the text is selectable */ }
    setDone(true); setTimeout(() => setDone(false), 1400);
  };
  return (
    <div className="cmd">
      {/* Break only between tokens, so a flag never splits from itself; a token too long for any line may break anywhere. */}
      <code>{text.split(/(\s+)/).map((t, i) => (/^\s+$/.test(t) ? t : <span key={i} className={t.length > 36 ? "tok-long" : "tok"}>{t}</span>))}</code>
      <button type="button" onClick={copy} data-done={done || undefined} aria-label={`${label}: ${text}`}>{done ? "Copied" : label}</button>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: NoInfer<T>; label: ReactNode }[]; onChange(v: NoInfer<T>): void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><h3>{title}</h3>{children}</div>;
}

/** Loading, error and the daemon's "not set up" 503s, in one place. */
export function QueryState({ q, children, empty }: { q: { isPending: boolean; error: unknown; data?: unknown }; children: ReactNode; empty?: ReactNode }) {
  if (q.isPending) return <p className="loading" aria-busy="true">Reading the daemon…</p>;
  if (q.error) {
    const e = q.error as Error;
    if (e instanceof DaemonError && e.isSetup) return <Empty title="Not set up on this daemon"><p>{e.message}</p><Cmd text={e.hint!} /></Empty>;
    return <Empty title="The daemon didn't answer"><p>{e.message || "Request failed."} It retries on its own; check that the daemon is up.</p><Cmd text="rig status" /></Empty>;
  }
  if (empty && (q.data == null || (Array.isArray(q.data) && q.data.length === 0))) return <>{empty}</>;
  return <>{children}</>;
}

// ---------- Toast ----------
const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastHost({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const t = useRef<number>(undefined);
  const show = useCallback((m: string) => { setMsg(m); clearTimeout(t.current); t.current = window.setTimeout(() => setMsg(null), 2600); }, []);
  return <ToastCtx.Provider value={show}>{children}{msg && <div className="toast" role="status">{msg}</div>}</ToastCtx.Provider>;
}

// ---------- Drawer (right edge, desktop inline; phone sheet) ----------
export function Drawer({ open, onClose, label, children }: { open: boolean; onClose(): void; label: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [open, onClose]);
  return (
    <aside ref={ref} className="drawer" data-open={open || undefined} aria-label={label} aria-hidden={!open} inert={!open || undefined}>
      <div className="drawer-in">
        <button type="button" className="icon-btn drawer-close" onClick={onClose} aria-label={`Close ${label.toLowerCase()}`}><Icon name="close" /></button>
        {children}
      </div>
    </aside>
  );
}

/** Keyboard shortcuts scoped to a view; ignored while typing. */
export function useKeys(map: Record<string, () => void>, enabled = true) {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    if (!enabled) return;
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || t.closest("input, textarea, select, [contenteditable]")) return;
      const f = ref.current[e.key.toLowerCase()];
      if (f) { e.preventDefault(); f(); }
    };
    addEventListener("keydown", h);
    return () => removeEventListener("keydown", h);
  }, [enabled]);
}

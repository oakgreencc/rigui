import { useEffect, useRef, useState, type ReactNode } from "react";
import { DaemonError } from "../../api/source";
import { Cmd, Empty } from "../../components/primitives";
import { Glyph } from "../../components/Icon";
import { ago } from "../../lib/format";

export const GLYPH = {
  ci: "M6 4v10 M6 14a2 2 0 1 0 0 4a2 2 0 1 0 0-4 M18 8a2 2 0 1 0 0-4a2 2 0 1 0 0 4 M18 8c0 5-6 4-12 6 M14 18h6 M17 15v6",
  issues: "M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M15 15h3v3h-3z",
  external: "M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6",
  refresh: "M20 11a8 8 0 1 0-2.3 5.7 M20 5v6h-6",
};

/** Loading and failure for a bridge read, in GitHub's words rather than the daemon's. */
export function GhState({ q, what, children }: { q: { isPending: boolean; error: unknown; data?: unknown }; what: string; children: ReactNode }) {
  if (q.isPending) return <p className="loading" aria-busy="true">Reading {what} from GitHub…</p>;
  if (q.error && !q.data) {
    const e = q.error as Error;
    const hint = e instanceof DaemonError ? e.hint : null;
    return (
      <div className="gh-err">
        <Empty title={e instanceof DaemonError && e.code === "no_bridge" ? "These tabs need the dev server" : "GitHub didn't answer"}>
          <p>{e.message} {hint ? "Then reload this tab." : "It tries again every minute."}</p>
          {hint && <Cmd text={hint} />}
        </Empty>
      </div>
    );
  }
  return <>{children}</>;
}

/** The head every GitHub tab shares: name, repo, freshness, and the controls the tab adds. */
export function GhHead({ title, repo, fetchedAt, failing, refresh, children }: {
  title: string; repo: string; fetchedAt?: string; failing?: boolean; refresh: { busy: boolean; run(): void }; children?: ReactNode;
}) {
  return (
    <header className="view-h gh-h">
      <div className="gh-title">
        <h1>{title}</h1>
        <small>
          <a href={`https://github.com/${repo}`} target="_blank" rel="noreferrer" className="mono">{repo}</a>
          {fetchedAt && <> · {failing ? <b className="tone-warn">last read {ago(fetchedAt)}</b> : <>read {ago(fetchedAt)}</>}</>}
        </small>
      </div>
      <div className="gh-ctl">
        {children}
        <button type="button" className="btn" onClick={refresh.run} disabled={refresh.busy} aria-busy={refresh.busy}>
          <Glyph d={GLYPH.refresh} />{refresh.busy ? "Reading" : "Refresh"}
        </button>
      </div>
    </header>
  );
}

export const ExternalLink = ({ href, children }: { href: string; children: ReactNode }) => (
  <a className="btn" href={href} target="_blank" rel="noreferrer"><Glyph d={GLYPH.external} />{children}</a>
);

/** Width of an element, for SVG drawn in real pixels (text never stretches). */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e?.contentRect.width ?? 0)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** A clock that ticks once a minute, so "now" lines and ages move without a refetch. */
export function useNow(every = 60_000) {
  const [now, set] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => set(Date.now()), every); return () => clearInterval(t); }, [every]);
  return now;
}

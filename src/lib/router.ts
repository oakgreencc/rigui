// A pushState router small enough to read: /<view>/<id?>. The daemon's SPA fallback serves index.html for any path.
import { useSyncExternalStore } from "react";

export type ViewId = "topology" | "attention" | "backlog" | "projects" | "specs" | "terminals" | "system";
export const VIEWS: ViewId[] = ["topology", "attention", "backlog", "projects", "specs", "terminals", "system"];

export interface Route { view: ViewId; id: string | null; query: URLSearchParams }

function parse(): Route {
  const [, v = "", ...rest] = location.pathname.split("/");
  const view = (VIEWS as string[]).includes(v) ? (v as ViewId) : "topology";
  return { view, id: rest.length ? decodeURIComponent(rest.join("/")) : null, query: new URLSearchParams(location.search) };
}

let current = parse();
const subs = new Set<() => void>();
const emit = () => { current = parse(); subs.forEach((f) => f()); };
addEventListener("popstate", emit);

export function navigate(view: ViewId, id?: string | null, opts: { replace?: boolean; query?: Record<string, string | null> } = {}) {
  const q = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v == null) q.delete(k); else q.set(k, v);
  const url = `/${view}${id ? "/" + encodeURIComponent(id) : ""}${q.toString() ? "?" + q : ""}`;
  if (url === location.pathname + location.search) return;
  history[opts.replace ? "replaceState" : "pushState"](null, "", url);
  emit();
}

export function useRoute(): Route {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => current);
}

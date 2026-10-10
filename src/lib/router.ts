// A pushState router small enough to read: /<view>/<id?>. The daemon's SPA fallback serves index.html for any path.
// A view is a core view or a plugin's id; anything else lands on Topology.
import { useSyncExternalStore } from "react";
import { PLUGINS } from "../plugins";

export type CoreViewId = "topology" | "attention" | "backlog" | "projects" | "specs" | "terminals" | "system";
export type ViewId = CoreViewId | (string & {});
export const CORE_VIEWS: CoreViewId[] = ["topology", "attention", "backlog", "projects", "specs", "terminals", "system"];
const KNOWN = new Set<string>([...CORE_VIEWS, ...PLUGINS.map((p) => p.id)]);

export interface Route { view: ViewId; id: string | null; query: URLSearchParams }

function parse(): Route {
  const [, v = "", ...rest] = location.pathname.split("/");
  const view = KNOWN.has(v) ? v : "topology";
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

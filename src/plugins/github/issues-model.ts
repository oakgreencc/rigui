// Issues seen through their labels. A label "ns:value" belongs to namespace ns; bare labels listed in `kinds`
// form the "kind" namespace. Each issue also gets one hold: who or what it is waiting on, which colours its mote.
import type { Tone } from "../../lib/status";
import type { Issue } from "./types";

export interface Hold { id: string; label: string; hint: string; tone: Tone | "info" | "bone"; match: (labels: string[]) => boolean }

export interface IssueLens {
  /** Bare labels that name what an issue is. */
  kinds: string[];
  /** First match wins. Anything unmatched is "open". */
  holds: Hold[];
  /** Value order inside a namespace; unlisted values follow by count. */
  order: Record<string, string[]>;
  rows: string;
  cols: string;
}

const has = (...names: string[]) => (ls: string[]) => ls.some((l) => names.includes(l));
const prefixed = (...ns: string[]) => (ls: string[]) => ls.some((l) => ns.some((n) => l.startsWith(n + ":")));

export const DEFAULT_LENS: IssueLens = {
  kinds: ["bug", "feature", "enhancement", "chore", "documentation"],
  holds: [
    { id: "you", label: "On you", hint: "A hitl: or human: label: waiting for a human to act", tone: "human", match: prefixed("hitl", "human") },
    { id: "look", label: "Needs detail", hint: "triage:needs-detail or needs-validation", tone: "warn", match: has("triage:needs-detail", "needs-validation") },
    { id: "shipped", label: "On develop", hint: "Released on @develop, not yet promoted", tone: "info", match: has("released on @develop") },
    { id: "parked", label: "Parked", hint: "post-mvp or triage:deferred", tone: "idle", match: has("post-mvp", "triage:deferred", "wontfix") },
    { id: "ready", label: "Ready for an agent", hint: "ready-for-agent", tone: "ok", match: has("ready-for-agent") },
  ],
  order: {
    priority: ["critical", "high", "medium", "low", "p1", "p2", "p3"],
    kind: ["bug", "feature", "enhancement", "chore", "documentation"],
  },
  rows: "area",
  cols: "priority",
};

export const OPEN_HOLD: Hold = { id: "open", label: "Open", hint: "None of the above", tone: "bone", match: () => true };
export const NONE = "—";

export function holdOf(i: Issue, lens: IssueLens): Hold {
  return lens.holds.find((h) => h.match(i.labels)) ?? OPEN_HOLD;
}

/** The values an issue carries in a namespace; NONE when it carries none. */
export function valuesIn(i: Issue, ns: string, lens: IssueLens): string[] {
  const vs = ns === "kind" ? i.labels.filter((l) => lens.kinds.includes(l)) : i.labels.filter((l) => l.startsWith(ns + ":")).map((l) => l.slice(ns.length + 1));
  return vs.length ? vs : [NONE];
}

/** Namespaces worth slicing by: at least two values in use, most-used first. */
export function namespaces(issues: Issue[], lens: IssueLens) {
  const m = new Map<string, Set<string>>();
  for (const i of issues) for (const l of i.labels) {
    const ns = lens.kinds.includes(l) ? "kind" : l.includes(":") ? l.slice(0, l.indexOf(":")) : null;
    if (!ns) continue;
    m.set(ns, (m.get(ns) ?? new Set()).add(l));
  }
  return [...m.entries()].filter(([, v]) => v.size >= 2).map(([ns, v]) => ({ ns, values: v.size, issues: issues.filter((i) => valuesIn(i, ns, lens)[0] !== NONE).length }))
    .sort((a, b) => b.issues - a.issues);
}

/** Axis values for a namespace: ordered, with NONE last when anything lacks one. */
export function axis(issues: Issue[], ns: string, lens: IssueLens) {
  const n = new Map<string, number>();
  for (const i of issues) for (const v of valuesIn(i, ns, lens)) n.set(v, (n.get(v) ?? 0) + 1);
  const pref = lens.order[ns] ?? [];
  return [...n.keys()].sort((a, b) => {
    if (a === NONE) return 1; if (b === NONE) return -1;
    const pa = pref.indexOf(a), pb = pref.indexOf(b);
    if (pa >= 0 || pb >= 0) return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb);
    return n.get(b)! - n.get(a)! || a.localeCompare(b);
  });
}

export const label = (ns: string, v: string) => (v === NONE ? `no ${ns}` : ns === "kind" ? v : `${ns}:${v}`);

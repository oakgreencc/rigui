import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAttention, useFindings, useHealth, usePrompts, useQueue, useRigs, useSource, useTerminals, useTopology, useWatchdogs } from "../api/hooks";
import type { RigLifecycleState } from "../api/types";
import { navigate, useRoute, type ViewId } from "../lib/router";
import { ago } from "../lib/format";

const until = (at: number) => { const m = Math.round((at - Date.now()) / 60_000); return m <= 0 ? "due now" : m < 60 ? `in ${m}m` : `in ${Math.round(m / 60)}h`; };
import { seatStatus, type Tone } from "../lib/status";
import { Icon, Mark, type IconName } from "./Icon";
import { Lamp } from "./primitives";

// ---------- Rig selection: one rig in focus, remembered per viewer ----------
const RigCtx = createContext<{ rigId: string | null; setRigId(id: string): void }>({ rigId: null, setRigId() {} });
export const useRig = () => useContext(RigCtx);
export function RigProvider({ children }: { children: ReactNode }) {
  const rigs = useRigs();
  const [rigId, set] = useState<string | null>(() => { try { return localStorage.getItem("rigui.rig"); } catch { return null; } });
  useEffect(() => {
    const list = rigs.data;
    if (list?.length && !list.some((r) => r.rigId === rigId)) set((list.find((r) => r.status !== "stopped") ?? list[0])!.rigId);
  }, [rigs.data, rigId]);
  const setRigId = (id: string) => { set(id); try { localStorage.setItem("rigui.rig", id); } catch { /* storage blocked */ } };
  return <RigCtx.Provider value={{ rigId, setRigId }}>{children}</RigCtx.Provider>;
}

export const LIFECYCLE: Record<RigLifecycleState, { tone: Tone; label: string }> = {
  running: { tone: "ok", label: "running" },
  degraded: { tone: "warn", label: "degraded" },
  attention_required: { tone: "danger", label: "needs attention" },
  recoverable: { tone: "idle", label: "stopped · recoverable" },
  stopped: { tone: "idle", label: "stopped" },
};

const NAV: { id: ViewId; label: string; icon: IconName }[] = [
  { id: "topology", label: "Topology", icon: "topology" },
  { id: "attention", label: "Attention", icon: "attention" },
  { id: "backlog", label: "Backlog", icon: "backlog" },
  { id: "projects", label: "Projects", icon: "projects" },
  { id: "specs", label: "Specs", icon: "specs" },
  { id: "terminals", label: "Terminals", icon: "terminals" },
  { id: "system", label: "System", icon: "system" },
];

/** Everything waiting on the human: routed decisions plus seats sitting at an approval prompt. */
export function useWaiting() {
  const att = useAttention();
  const prompts = usePrompts();
  const actions = att.data?.items.filter((i) => i.kind === "action").length ?? 0;
  const atPrompt = prompts.data?.length ?? 0;
  return { ready: !!att.data, actions, atPrompt, total: actions + atPrompt };
}

function useCounts(rigId: string | null) {
  const topo = useTopology(rigId);
  const waiting = useWaiting();
  const queue = useQueue();
  const terms = useTerminals();
  const findings = useFindings();
  return useMemo(() => {
    const stalled = topo.data?.seats.filter((s) => seatStatus(s).tone === "danger").length ?? 0;
    const actions = waiting.total;
    const active = queue.data?.filter((q) => ["pending", "in-progress", "blocked"].includes(q.state)).length;
    const live = terms.data?.filter((t) => t.activity === "working" && !t.needsInput).length;
    const prompting = terms.data?.filter((t) => t.needsInput).length ?? 0;
    const bad = findings.data?.filter((f) => f.status === "active" && f.severity !== "info").length ?? 0;
    const c: Partial<Record<ViewId, { text: string; tone?: Tone }>> = {};
    if (stalled) c.topology = { text: `${stalled} stalled`, tone: "danger" };
    if (waiting.ready) c.attention = { text: String(actions || "clear"), tone: actions ? "human" : undefined };
    if (active != null) c.backlog = { text: `${active} open` };
    if (live != null) c.terminals = prompting ? { text: `${prompting} at a prompt`, tone: "warn" } : { text: `${live} live` };
    if (bad) c.system = { text: `${bad} findings`, tone: findings.data?.some((f) => f.status === "active" && f.severity === "critical") ? "danger" : undefined };
    return c;
  }, [topo.data, waiting.ready, waiting.total, queue.data, terms.data, findings.data]);
}

function Heartbeat() {
  const source = useSource();
  const health = useHealth();
  const rigs = useRigs();
  const wd = useWatchdogs();
  const prompts = usePrompts();
  const h = health.data;
  const running = rigs.data?.reduce((a, r) => a + r.runningCount, 0) ?? 0;
  const total = rigs.data?.reduce((a, r) => a + r.nodeCount, 0) ?? 0;
  const next = wd.data?.jobs
    .filter((j) => j.state === "active" && j.lastEvaluationAt)
    .map((j) => ({ j, at: new Date(j.lastEvaluationAt!).getTime() + j.intervalSeconds * 1000 }))
    .sort((a, b) => a.at - b.at)[0];
  const up = h?.uptimeSeconds != null ? `${Math.floor(h.uptimeSeconds / 3600)}h ${Math.floor((h.uptimeSeconds % 3600) / 60)}m` : null;
  return (
    <div className="heart" role="group" aria-label="Daemon heartbeat">
      <h2>Heartbeat</h2>
      {health.error
        ? <span data-bad><Lamp tone="danger" />Daemon unreachable</span>
        : <span><Lamp tone="ok" className="beat" />Daemon {h?.semver ?? ""}{up ? ` · up ${up}` : ""}</span>}
      <span><Lamp tone={running < total ? "warn" : "ok"} />{running} of {total} seats up{rigs.data && rigs.data.length > 1 ? ` · ${rigs.data.length} rigs` : ""}</span>
      {!!prompts.data?.length && <span data-bad><Lamp tone="warn" />{prompts.data.length} {prompts.data.length === 1 ? "seat" : "seats"} at an approval prompt</span>}
      {h?.stuckSweep && (h.stuckSweep.findingsRouted || h.stuckSweep.consecutiveFailures
        ? <span data-bad><Lamp tone="danger" />Stuck sweep: {h.stuckSweep.consecutiveFailures ? "failing" : `${h.stuckSweep.findingsRouted} routed`} · {ago(h.stuckSweep.lastSweepAt)}</span>
        : <span><Lamp tone="ok" />Stuck sweep clean{h.stuckSweep.lastSweepAt ? ` · ${ago(h.stuckSweep.lastSweepAt)}` : ""}</span>)}
      {next && <span><Lamp tone="idle" />Next watchdog {until(next.at)} · {next.j.policy.replace(/-/g, " ")}</span>}
      {source.kind === "sample"
        ? <span className="src"><Lamp tone="warn" /><em><b>Sample data</b> · no daemon found</em></span>
        : <span className="src"><Lamp tone="ok" /><em><b>Live</b> · {location.host}</em></span>}
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const route = useRoute();
  const { rigId, setRigId } = useRig();
  const rigs = useRigs();
  const counts = useCounts(rigId);
  const [drawer, setDrawer] = useState(false);
  const rig = rigs.data?.find((r) => r.rigId === rigId);
  const life = rig ? LIFECYCLE[rig.lifecycleState] : null;

  useEffect(() => {
    if (drawer) document.body.dataset.drawer = ""; else delete document.body.dataset.drawer;
  }, [drawer]);
  useEffect(() => { document.body.dataset.view = route.view; }, [route.view]);

  const go = (v: ViewId) => { navigate(v); setDrawer(false); };

  return (
    <div className="app">
      <div className="side" id="side" aria-label="Console navigation">
        <div className="side-top">
          <div className="brand-row">
            <a className="brand" href="/topology" onClick={(e) => { e.preventDefault(); go("topology"); }}>
              <Mark className="mark" /><b>Rigui</b>
            </a>
            <button type="button" className="icon-btn side-close" onClick={() => setDrawer(false)} aria-label="Close menu"><Icon name="close" /></button>
          </div>
          <div className="rig-pick">
            <label htmlFor="rig-select">Rig</label>
            <div className="sel">
              {life && <Lamp tone={life.tone} />}
              <select id="rig-select" value={rigId ?? ""} onChange={(e) => setRigId(e.target.value)}>
                {rigs.data?.map((r) => <option key={r.rigId} value={r.rigId}>{r.name}</option>)}
              </select>
              <Icon name="chevron" />
            </div>
            {rig && <small>{life?.label} · {rig.runningCount}/{rig.nodeCount} seats up{rig.uptime ? ` · ${rig.uptime.replace(/ /g, " ")}` : ""}</small>}
          </div>
        </div>
        <nav className="nav" aria-label="Views">
          {NAV.map((n, i) => (
            <div key={n.id} style={{ display: "contents" }}>
              {i === 3 && <hr />}
              <button type="button" aria-current={route.view === n.id ? "page" : undefined} onClick={() => go(n.id)}>
                <Icon name={n.icon} />{n.label}
                {counts[n.id] && <span className="n" data-tone={counts[n.id]!.tone}>{counts[n.id]!.text}</span>}
              </button>
            </div>
          ))}
        </nav>
        <Heartbeat />
      </div>
      <button type="button" className="scrim" onClick={() => setDrawer(false)} aria-label="Close menu" tabIndex={-1} />
      <div className="work">
        <header className="top">
          <button type="button" className="icon-btn" onClick={() => setDrawer(true)} aria-label="Open menu" aria-expanded={drawer} aria-controls="side"><Icon name="menu" /></button>
          <span className="brand"><Mark className="mark" /><b>Rigui</b></span>
          {rig && <span className="top-rig">{life && <Lamp tone={life.tone} />}{rig.name}</span>}
          {/* The primary action stays in the phone's first viewport. */}
          <button type="button" className="top-att" data-tone={counts.attention?.tone} onClick={() => go("attention")}
            aria-label={`Attention: ${counts.attention?.text ?? "loading"}`}>
            <Icon name="attention" /><span>{counts.attention?.text ?? ""}</span>
          </button>
        </header>
        <main id="main">{children}</main>
      </div>
    </div>
  );
}

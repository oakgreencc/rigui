import { useEffect, useMemo, useState } from "react";
import { useFindings, useHealth, useHosts, useSource, useWatchdogs } from "../api/hooks";
import { ACTIONS } from "../api/actions";
import type { WatchdogJob } from "../api/types";
import { Mark } from "../components/Icon";
import { Chip, Cmd, Empty, Facts, Lamp, QueryState, Segmented, useToast } from "../components/primitives";
import { age, clock, interval, shortSession } from "../lib/format";
import { navigate, useRoute } from "../lib/router";
import type { Tone } from "../lib/status";
import { useTheme, type Mode } from "../theme/ThemeProvider";
import { OGCC, TOKEN_DOCS, type Tokens } from "../theme/presets";
import "./system.css";

type Tab = "daemon" | "findings" | "automation" | "hosts" | "theme" | "connection";
const TABS: { value: Tab; label: string }[] = [
  { value: "daemon", label: "Daemon" }, { value: "findings", label: "Findings" }, { value: "automation", label: "Automation" },
  { value: "hosts", label: "Hosts" }, { value: "theme", label: "Theme" }, { value: "connection", label: "Connection" },
];

export default function System() {
  const route = useRoute();
  const tab = (TABS.find((t) => t.value === route.id)?.value ?? "daemon") as Tab;
  return (
    <div className="sys">
      <header className="view-h">
        <div><h1>System</h1><small>the daemon, what it watches, and how this console talks to it</small></div>
      </header>
      <nav className="sys-tabs" aria-label="System sections">
        <Segmented label="Section" value={tab} onChange={(t) => navigate("system", t, { replace: true })} options={TABS} />
      </nav>
      <div className="view-body sys-body">
        {tab === "daemon" && <Daemon />}
        {tab === "findings" && <Findings />}
        {tab === "automation" && <Automation />}
        {tab === "hosts" && <Hosts />}
        {tab === "theme" && <ThemeTab />}
        {tab === "connection" && <Connection />}
      </div>
    </div>
  );
}

function Daemon() {
  const h = useHealth();
  const d = h.data;
  return (
    <QueryState q={h}>
      {d && (
        <div className="sys-cols">
          <section>
            <h2 className="label">Daemon</h2>
            <Facts rows={[
              ["Status", <Chip tone="ok">ok · pid {d.pid}</Chip>],
              ["Version", <span className="mono">{d.semver ?? "—"}{d.commit ? ` · ${d.commit.slice(0, 8)}` : ""}</span>],
              ["Built", d.builtAt ? `${age(d.builtAt)} ago` : "—"],
              ["Host id", <span className="mono">{d.selfHostId ?? "—"}</span>],
              ["Bound to", d.bind ? <span className="mono">{d.bind.hosts.join(", ")}{d.bind.tailscaleDetected ? " · tailscale" : ""}</span> : "—"],
              ["Event loop", d.eventLoop ? <>{d.eventLoop.lagMeanMs.toFixed(1)}ms lag · p99 {d.eventLoop.lagP99Ms.toFixed(1)}ms · {Math.round(d.eventLoop.utilization * 100)}% busy</> : "—"],
            ]} />
          </section>
          <section>
            <h2 className="label">Background sweeps</h2>
            <Facts rows={[
              ["Stuck sweep", d.stuckSweep ? <><Lamp tone={d.stuckSweep.consecutiveFailures ? "danger" : d.stuckSweep.findingsRouted ? "warn" : "ok"} /> {d.stuckSweep.lastOutcome ?? "not yet run"}{d.stuckSweep.lastSweepAt ? ` · ${age(d.stuckSweep.lastSweepAt)} ago` : ""}{d.stuckSweep.findingsRouted ? ` · ${d.stuckSweep.findingsRouted} routed` : ""}</> : "—"],
              ["Wake ladder", d.wakeLadder ? <><Lamp tone={d.wakeLadder.escalationsOpen ? "danger" : d.wakeLadder.activeLadders ? "warn" : "ok"} /> {d.wakeLadder.activeLadders} climbing · {d.wakeLadder.escalationsOpen} escalated{d.wakeLadder.lastTickAt ? ` · tick ${age(d.wakeLadder.lastTickAt)} ago` : ""}</> : "—"],
            ]} />
            <h2 className="label">From the CLI</h2>
            <Cmd text="rig status" /><Cmd text="rig workspace doctor" />
          </section>
        </div>
      )}
    </QueryState>
  );
}

const SEV: Record<string, Tone> = { critical: "danger", warning: "warn", info: "idle" };
function Findings() {
  const f = useFindings();
  const [showCleared, setShowCleared] = useState(false);
  const rows = (f.data ?? []).filter((x) => showCleared || x.status === "active").sort((a, b) => ["critical", "warning", "info"].indexOf(a.severity) - ["critical", "warning", "info"].indexOf(b.severity));
  return (
    <QueryState q={f}>
      <div className="sys-bar">
        <p>What the daemon's detectors see across rigs, seats and missions. Material ones also reach Attention.</p>
        <label className="check"><input type="checkbox" checked={showCleared} onChange={(e) => setShowCleared(e.target.checked)} /> Show cleared</label>
      </div>
      {rows.length ? (
        <ul className="findings">
          {rows.map((x) => (
            <li key={x.id} data-tone={SEV[x.severity]}>
              <div className="f-h"><Lamp tone={SEV[x.severity] ?? "idle"} /><b>{x.summary}</b><Chip tone={SEV[x.severity] ?? "idle"}>{x.severity}{x.status !== "active" ? ` · ${x.status}` : ""}</Chip></div>
              <p>{x.explanation}</p>
              <p className="f-meta"><span className="mono">{x.detector}</span> · {x.category} · {x.scope} · since {age(x.startedAt)}</p>
              {x.suggestedInspection && <Cmd text={x.suggestedInspection} />}
            </li>
          ))}
        </ul>
      ) : <Empty title="No active findings"><p>The detectors are quiet. Absence is not proof of health: sources have retention limits.</p></Empty>}
    </QueryState>
  );
}

const POLICY: Record<string, string> = {
  "periodic-reminder": "Reminds a seat on a timer", "artifact-pool-ready": "Fires once a pool of artifacts is ready",
  "edge-artifact-required": "Waits for an artifact on an edge", "workflow-keepalive": "Nudges a workflow's frontier",
  "idle-gate-qitem": "Wakes an idle seat holding work", "context-usage-threshold": "Warns before a seat hits its context wall",
  "parked-owner-consumer": "Finds seats parked with obligations", "delivery-deferral": "Retries a deferred delivery",
  "delivery-digest-flush": "Flushes the human digest",
};
function Automation() {
  const w = useWatchdogs();
  const [sel, setSel] = useState<string | null>(null);
  const jobs = w.data?.jobs ?? [];
  const history = (w.data?.history ?? []).filter((h) => !sel || h.jobId === sel);
  const tone = (j: WatchdogJob): Tone => (j.state !== "active" ? "idle" : j.lastFireAt && (Date.now() - new Date(j.lastFireAt).getTime()) / 1000 < j.intervalSeconds * 1.5 ? "ok" : "idle");
  return (
    <QueryState q={w}>
      <p className="sys-lede">Watchdog jobs survive daemon restarts. Each evaluates on its interval and either sends a wake or skips, with a reason.</p>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Job</th><th>Watches</th><th>Interval</th><th>Last run</th><th>State</th><th><span className="sr">Stop</span></th></tr></thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.jobId} data-pick aria-current={sel === j.jobId ? "true" : undefined} onClick={() => setSel(sel === j.jobId ? null : j.jobId)}>
                <td className="fg wrap"><Lamp tone={tone(j)} /> {j.policy}<div className="sub">{POLICY[j.policy] ?? ""}</div></td>
                <td className="mono">{shortSession(j.targetSession)}</td>
                <td>{interval(j.intervalSeconds)}</td>
                <td>{j.lastEvaluationAt ? `${age(j.lastEvaluationAt)} ago${j.lastFireAt ? "" : " · never fired"}` : "—"}</td>
                <td><Chip tone={j.state === "active" ? "ok" : "idle"}>{j.state}{j.terminalReason ? ` · ${j.terminalReason}` : ""}</Chip></td>
                <td>{j.state === "active" && <CopyStop jobId={j.jobId} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="label sys-h">Recent evaluations{sel ? ` · ${jobs.find((j) => j.jobId === sel)?.policy}` : ""}</h2>
      {history.length ? (
        <div className="tablewrap"><table>
          <thead><tr><th>When</th><th>Job</th><th>Outcome</th><th>Note</th></tr></thead>
          <tbody>{history.slice(0, 30).map((h) => (
            <tr key={h.historyId}><td>{clock(h.evaluatedAt)}</td><td className="mono">{jobs.find((j) => j.jobId === h.jobId)?.policy ?? h.jobId}</td>
              <td><Chip tone={h.outcome === "sent" ? "ok" : h.outcome === "terminal" ? "idle" : "idle"}>{h.outcome}</Chip></td>
              <td className="wrap">{h.outcome === "sent" ? `woke ${shortSession(h.deliveryTargetSession)}${h.evaluationNotes ? ` · ${h.evaluationNotes}` : ""}` : h.skipReason ?? h.evaluationNotes ?? ""}</td></tr>
          ))}</tbody>
        </table></div>
      ) : <p className="sample">No evaluations recorded yet.</p>}
    </QueryState>
  );
}

function CopyStop({ jobId }: { jobId: string }) {
  const toast = useToast();
  return (
    <button type="button" className="btn quiet" onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(ACTIONS.stopWatchdog.cli({ jobId })).catch(() => {}); toast("Stop command copied"); }}>
      Copy stop command
    </button>
  );
}

function Hosts() {
  const h = useHosts();
  return (
    <QueryState q={h}>
      <p className="sys-lede">Every daemon this console can read through. Reads for another host are proxied by the local daemon.</p>
      <div className="tablewrap"><table>
        <thead><tr><th>Host</th><th>Transport</th><th>Target</th><th>Reach</th><th>Notes</th></tr></thead>
        <tbody>{(h.data ?? []).map((x) => (
          <tr key={x.id}><td className="fg"><Lamp tone={x.status === "reachable" ? "ok" : x.status === "unreachable" ? "danger" : "idle"} /> {x.id}{x.selected ? " · selected" : ""}</td>
            <td>{x.transport}</td><td className="mono">{x.target}</td>
            <td><Chip tone={x.status === "reachable" ? "ok" : x.status === "unreachable" ? "danger" : "idle"}>{x.status}</Chip></td><td className="wrap">{x.notes ?? ""}</td></tr>
        ))}</tbody>
      </table></div>
      <h2 className="label sys-h">Add a host</h2>
      <Cmd text="rig hosts add <id> --url http://<tailscale-ip>:7433" />
    </QueryState>
  );
}

function ThemeTab() {
  const t = useTheme();
  const toast = useToast();
  const preset = t.presets.find((p) => p.id === t.presetId)!;
  const base = { ...OGCC[t.resolved], ...preset[t.resolved] } as Tokens;
  const [draft, setDraft] = useState(() => JSON.stringify(t.overrides, null, 2));
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setDraft(JSON.stringify(t.overrides, null, 2)); }, [t.overrides]);
  const apply = () => {
    try {
      const v = JSON.parse(draft || "{}");
      if (typeof v !== "object" || Array.isArray(v) || Object.keys(v).some((k) => !k.startsWith("--"))) throw new Error("Use an object of --token: value pairs.");
      t.setOverrides(v); setErr(null); toast("Theme applied");
    } catch (e) { setErr((e as Error).message); }
  };
  const exportFile = useMemo(() => JSON.stringify({
    default: "custom",
    presets: [{ id: "custom", label: "Custom", extends: preset.id, [t.resolved]: t.overrides }],
  }, null, 2), [preset.id, t.resolved, t.overrides]);

  return (
    <div className="sys-cols theme">
      <section>
        <h2 className="label">Appearance</h2>
        <div className="field"><span>Mode</span>
          <Segmented<Mode> label="Mode" value={t.mode} onChange={t.setMode} options={[{ value: "system", label: "System" }, { value: "dark", label: "Dark" }, { value: "light", label: "Light" }]} />
        </div>
        <div className="field"><span>Preset</span>
          <div className="presets" role="radiogroup" aria-label="Preset">
            {t.presets.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={p.id === t.presetId} className="preset" onClick={() => t.setPreset(p.id)}>
                <span className="sw" style={{ background: p[t.resolved]["--bg"] }}><i style={{ background: p[t.resolved]["--accent-fill"] }} /><i style={{ background: p[t.resolved]["--surface-2"] }} /></span>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <h2 className="label sys-h">Override any token</h2>
        <p className="sys-lede">Overrides apply on top of the preset, for this browser only. To ship a theme to everyone, export it as <span className="mono">theme.json</span> and serve it beside the console.</p>
        <label className="sr" htmlFor="tok">Token overrides (JSON)</label>
        <textarea id="tok" className="tok" rows={10} spellCheck={false} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={'{\n  "--accent-fill": "oklch(60% 0.14 45)"\n}'} />
        {err && <p className="tone-danger" role="alert">{err}</p>}
        <div className="actions">
          <button type="button" className="btn primary" onClick={apply}>Apply</button>
          <button type="button" className="btn" onClick={() => { t.setOverrides({}); toast("Overrides cleared"); }}>Clear overrides</button>
          <button type="button" className="btn quiet" onClick={() => { navigator.clipboard?.writeText(exportFile).catch(() => {}); toast("theme.json copied"); }}>Copy as theme.json</button>
        </div>
      </section>
      <section>
        <h2 className="label">Tokens in use · {preset.label} {t.resolved}</h2>
        <div className="tokens">
          {Object.keys(TOKEN_DOCS).map((k) => {
            const v = (t.overrides as Tokens)[k as `--${string}`] ?? base[k as `--${string}`] ?? "";
            const kind = k === "--mark" ? "mark" : k.startsWith("--backdrop") ? "value" : k.includes("font") || k.includes("mono") ? "type" : "color";
            return (
              <button key={k} type="button" className="tok-row" title="Add to overrides" onClick={() => {
                const cur = (() => { try { return JSON.parse(draft || "{}"); } catch { return {}; } })();
                setDraft(JSON.stringify({ ...cur, [k]: v }, null, 2));
              }}>
                {kind === "color" ? <span className="swatch" style={{ background: `var(${k})` }} />
                  : kind === "mark" ? <span className="swatch"><Mark className="swatch-mark" /></span>
                  : <span className={kind === "type" ? "swatch type" : "swatch type val"}>{kind === "type" ? "Aa" : v}</span>}
                <span className="tok-k mono">{k}</span><span className="tok-d">{TOKEN_DOCS[k]}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Connection() {
  const source = useSource();
  const toast = useToast();
  const [actor, setActor] = useState(() => { try { return localStorage.getItem("rigui.actor") ?? "human@kernel"; } catch { return "human@kernel"; } });
  const [bearer, setBearer] = useState(() => { try { return localStorage.getItem("rigui.bearer") ?? ""; } catch { return ""; } });
  const save = () => {
    try { localStorage.setItem("rigui.actor", actor); if (bearer) localStorage.setItem("rigui.bearer", bearer); else localStorage.removeItem("rigui.bearer"); } catch { /* storage blocked */ }
    toast("Saved for this browser");
  };
  return (
    <div className="sys-cols">
      <section>
        <h2 className="label">Source</h2>
        <Facts rows={[
          ["Reading", source.kind === "live" ? <Chip tone="ok">live daemon · {location.host}</Chip> : <Chip tone="warn">sample data · no daemon</Chip>],
          ["Switch", <span className="links"><a href="?source=live">live</a> · <a href="?source=sample">sample</a></span>],
        ]} />
        <p className="sys-lede">With no daemon on this origin the console runs on sample data, labelled as such. Add <span className="mono">?source=</span> to force one.</p>
      </section>
      <form className="conn" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <h2 className="label">Acting as</h2>
        <label htmlFor="actor">Your seat</label>
        <input id="actor" className="mono" value={actor} onChange={(e) => setActor(e.target.value)} spellCheck={false} />
        <small>Recorded on every approval, denial and decision. Match the daemon's operator seat (<span className="mono">workspace.operator_seat_name</span>).</small>
        <label htmlFor="bearer">Write token</label>
        <input id="bearer" type="password" className="mono" value={bearer} onChange={(e) => setBearer(e.target.value)} autoComplete="off" placeholder="optional on loopback and Tailscale" />
        <small>Sent as <span className="mono">Authorization: Bearer</span> on writes only, when the daemon sets <span className="mono">OPENRIG_AUTH_BEARER_TOKEN</span>.</small>
        <div className="actions"><button type="submit" className="btn primary">Save</button></div>
      </form>
    </div>
  );
}

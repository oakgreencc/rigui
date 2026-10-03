import { useEffect, useMemo, useRef, useState } from "react";
import { useAttention, useMissionMap, usePrompts, useTopology } from "../api/hooks";
import { ACTIONS } from "../api/actions";
import type { MissionMap, RigTopology, Seat } from "../api/types";
import { useRig, useWaiting } from "../components/Shell";
import { Chip, Cmd, Drawer, Empty, Facts, Lamp, QueryState, Segmented } from "../components/primitives";
import { Icon } from "../components/Icon";
import { age, isHuman, plural, shortSession } from "../lib/format";
import { navigate, useRoute } from "../lib/router";
import { podStatus, seatStatus, stepStatus, TONE_LABEL } from "../lib/status";
import { Orrery } from "../orrery/Orrery";
import { buildScene, type Body, type Layer } from "../orrery/scene";
import "../orrery/orrery.css";
import "./topology.css";

const RUNTIME: Record<string, string> = { "claude-code": "Claude Code", codex: "Codex", pi: "Pi", terminal: "terminal" };

export default function Topology() {
  const { rigId } = useRig();
  const route = useRoute();
  const topo = useTopology(rigId);
  const mission = useMissionMap(rigId);
  const waiting = useWaiting();
  // The lit layer lives in the URL, so a link can open the map on either system.
  const lit: Layer = route.query.get("layer") === "mission" ? "mission" : "rig";
  const setLit = (l: Layer, id: string | null = route.id) => navigate("topology", id, { replace: true, query: { layer: l === "mission" ? "mission" : null } });
  const selected = route.id;
  const narrow = useNarrow();

  const scene = useMemo(() => (topo.data ? buildScene(topo.data, mission.data ?? null, lit, narrow.value) : null), [topo.data, mission.data, lit, narrow.value]);
  // The sun counts what waits on you from this rig: routed decisions, plus this rig's seats at a prompt.
  const prompts = usePrompts();
  const youCount = waiting.actions + (prompts.data?.filter((t) => t.rigName === topo.data?.name).length ?? 0);

  // Clicking the shadow brings its layer forward and opens what was clicked.
  const pick = (b: Body) => setLit(b.layer, b.id);
  const close = () => navigate("topology", null, { replace: true });

  const stalled = topo.data?.seats.filter((s) => seatStatus(s).tone === "danger") ?? [];
  const nobodySteps = mission.data?.steps.filter((s) => stepStatus(s, topo.data).nobody) ?? [];

  return (
    <div className="topo" data-drawer={selected ? "" : undefined}>
      <section className="topo-map" aria-label="Rig map" ref={narrow.ref}>
        <header className="topo-h">
          <div className="topo-title">
            <h1>{lit === "rig" ? topo.data?.name ?? "Rig" : mission.data?.title ?? "Mission"}</h1>
            <small>
              {lit === "rig"
                ? topo.data && `${plural(topo.data.pods.length, "pod")} · ${plural(topo.data.seats.length, "seat")}${stalled.length ? ` · ${stalled.length} stalled` : ""}`
                : mission.data && `${mission.data.workflow.name} v${mission.data.workflow.version} · ${mission.data.steps.filter((s) => s.state === "done").length}/${mission.data.steps.length} steps done`}
            </small>
          </div>
          <Segmented label="Lit layer" value={lit} onChange={(l) => setLit(l)}
            options={[{ value: "rig", label: "Rig" }, { value: "mission", label: <>Mission{nobodySteps.length ? <Lamp tone="danger" /> : null}</> }]} />
        </header>
        {lit === "mission" && mission.isSuccess && !mission.data && (
          <div className="topo-empty" role="status">
            <b>No workflow is running on this rig.</b>
            <span>The mission layer lights up once a workflow is instantiated; its steps become stations and the seats holding them link here.</span>
            <Cmd text={`rig workflow instantiate <spec.yaml> --objective "…"`} />
          </div>
        )}
        <QueryState q={topo}>
          {scene && (
            <Orrery scene={scene} narrow={narrow.value} selected={selected} youCount={youCount}
              onPick={pick} onSun={() => navigate("attention")} tooltip={(b, shadow) => <Tip b={b} shadow={shadow} topo={topo.data!} mission={mission.data ?? null} />} />
          )}
        </QueryState>
        <footer className="topo-legend" aria-hidden="true">
          <span><svg viewBox="0 0 28 10"><line x1="1" y1="5" x2="27" y2="5" className="lg-flow" /><circle cx="18" cy="5" r="2" className="lg-dot" /></svg>work moving</span>
          <span><svg viewBox="0 0 28 10"><line x1="1" y1="5" x2="27" y2="5" className="lg-holds" /></svg>holds a step</span>
          <span><svg viewBox="0 0 28 10"><line x1="1" y1="5" x2="27" y2="5" className="lg-you" /></svg>waits on you</span>
          <span><svg viewBox="0 0 12 12"><rect x="1" y="1" width="10" height="10" className="lg-stall" /></svg>stalled: nobody owns it</span>
          <span className="lg-hint">Dashed bodies are the other layer, in shadow. Click one to swap.</span>
        </footer>
        {topo.data && <PhoneList topo={topo.data} mission={mission.data ?? null} lit={lit} onPick={(id) => navigate("topology", id)} />}
      </section>
      <Drawer open={!!selected} onClose={close} label="Detail">
        {selected && topo.data && <Detail id={selected} topo={topo.data} mission={mission.data ?? null}
          onPick={(id) => setLit(id.startsWith("step:") ? "mission" : "rig", id)} />}
      </Drawer>
    </div>
  );
}

function useNarrow() {
  const ref = useRef<HTMLElement>(null);
  const [value, set] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => set((e?.contentRect.width ?? 1000) < 620));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, value };
}

function Tip({ b, shadow, topo, mission }: { b: Body; shadow: boolean; topo: RigTopology; mission: MissionMap | null }) {
  const hint = shadow ? `Click to light the ${b.layer} layer` : "Click for detail";
  if (b.kind === "seat") {
    const s = topo.seats.find((x) => `seat:${x.logicalId}` === b.id)!;
    return <><b>{s.canonicalSessionName}</b><span className="k">seat · {RUNTIME[s.runtime] ?? s.runtime}</span>{b.status.reason}{s.contextUsedPercentage != null ? ` · ctx ${s.contextUsedPercentage}%` : ""}<span className="hint">{hint}</span></>;
  }
  if (b.kind === "pod") {
    const p = topo.pods.find((x) => `pod:${x.id}` === b.id)!;
    const ps = podStatus(p, topo.seats);
    return <><b>{p.label}</b><span className="k">pod {p.namespace}</span>{ps.working} of {ps.total} seats working · {ps.reason}<span className="hint">{hint}</span></>;
  }
  const st = mission?.steps.find((x) => `step:${x.id}` === b.id);
  return <><b>{st?.id}</b><span className="k">step · {st?.role}</span>{st?.objective}<br />{shortSession(st?.ownerSession)} · {b.status.reason}<span className="hint">{hint}</span></>;
}

function Detail({ id, topo, mission, onPick }: { id: string; topo: RigTopology; mission: MissionMap | null; onPick(id: string): void }) {
  const [kind, key] = [id.split(":")[0], id.slice(id.indexOf(":") + 1)];
  if (kind === "seat") {
    const s = topo.seats.find((x) => x.logicalId === key);
    return s ? <SeatDetail s={s} topo={topo} mission={mission} onPick={onPick} /> : <Empty title="Seat not found" />;
  }
  if (kind === "pod") {
    const p = topo.pods.find((x) => x.id === key);
    if (!p) return <Empty title="Pod not found" />;
    const ps = podStatus(p, topo.seats);
    const seats = topo.seats.filter((s) => s.podId === p.id);
    return (
      <div className="detail">
        <header><h2><Lamp tone={ps.tone} />{p.label}</h2><p className="d-sub">pod <span className="mono">{p.namespace}</span> · continuity {p.continuity}</p></header>
        {p.summary && <p className="why">{p.summary}</p>}
        <h3 className="sec">Seats</h3>
        <ul className="d-list">{seats.map((s) => { const st = seatStatus(s); return (
          <li key={s.logicalId}><button type="button" onClick={() => onPick(`seat:${s.logicalId}`)}><Lamp tone={st.tone} /><b>{s.logicalId.split(".")[1]}</b><span>{st.reason}</span><Icon name="chevron" /></button></li>
        ); })}</ul>
        <h3 className="sec">From the CLI</h3>
        <Cmd text={`rig ps --nodes --rig ${topo.name}`} />
      </div>
    );
  }
  const step = mission?.steps.find((x) => x.id === key);
  if (!step || !mission) return <Empty title="Step not found" />;
  const st = stepStatus(step, topo);
  const owner = topo.seats.find((s) => s.canonicalSessionName === step.ownerSession);
  return (
    <div className="detail">
      <header><h2><Lamp tone={st.tone} />{step.id}</h2><p className="d-sub">step of {mission.workflow.name} · {step.objective}</p></header>
      {st.nobody && <p className="why tone-danger"><b>Nobody holds this step.</b> Its packet sits with a seat that is gone. Until a {step.role} seat picks it up, everything after {step.id} waits.</p>}
      <Facts rows={[
        ["State", <Chip tone={st.tone}>{step.state} · {TONE_LABEL[st.tone]}</Chip>],
        ["Role", step.role],
        ["Held by", owner ? <button type="button" className="linkish" onClick={() => onPick(`seat:${owner.logicalId}`)}>{owner.canonicalSessionName}</button> : step.ownerSession ?? <b className="tone-danger">nobody</b>],
        ["Since", step.since ? `${age(step.since)} ago` : "—"],
        ["Packet", step.packetQitemId ? <span className="mono">{step.packetQitemId}</span> : "—"],
        ["Next", step.next.join(", ") || "end of workflow"],
      ]} />
      {st.nobody && step.packetQitemId && <>
        <h3 className="sec">Hand the packet to a live seat</h3>
        <Cmd text={`rig workflow route ${mission.workflow.instanceId} --packet ${step.packetQitemId} --to ${topo.seats.find((s) => s.role === step.role && seatStatus(s).tone !== "danger")?.canonicalSessionName ?? "<seat>"}`} />
      </>}
      {isHuman(step.ownerSession) && <button type="button" className="btn primary" onClick={() => navigate("attention")}>Open Inbox</button>}
    </div>
  );
}

function SeatDetail({ s, topo, mission, onPick }: { s: Seat; topo: RigTopology; mission: MissionMap | null; onPick(id: string): void }) {
  const st = seatStatus(s);
  const pod = topo.pods.find((p) => p.id === s.podId);
  const holds = mission?.steps.filter((x) => x.ownerSession === s.canonicalSessionName && x.state !== "done" && x.state !== "pending") ?? [];
  const out = topo.flows.filter((f) => f.from === s.logicalId), inn = topo.flows.filter((f) => f.to === s.logicalId);
  const a = { session: s.canonicalSessionName, attach: s.tmuxAttachCommand ?? "", reason: st.reason };
  // The attention item about this seat, if there is one: a finding scoped to it, or its prompt.
  const att = useAttention();
  const ask = att.data?.items.find((i) => i.scope === `seat ${s.canonicalSessionName}`)?.id
    ?? (s.needsInput ? `prompt:${s.canonicalSessionName}` : null);
  return (
    <div className="detail">
      <header>
        <h2><Lamp tone={st.tone} />{s.logicalId.split(".")[1]}</h2>
        <p className="d-sub">seat in {pod?.label} · <span className="mono">{s.canonicalSessionName}</span></p>
      </header>
      {st.tone === "danger" && <p className="why tone-danger"><b>{st.reason}.</b> Its work is stuck with it until the seat is relaunched or the work is handed to another seat.</p>}
      {ask && <button type="button" className="btn primary" onClick={() => navigate("attention", ask)}>Open it in Inbox</button>}
      <Facts rows={[
        ["Status", <Chip tone={st.tone}>{st.reason}</Chip>],
        ["Runtime", `${RUNTIME[s.runtime] ?? s.runtime}${s.model ? ` · ${s.model}` : ""}`],
        ["Activity", `${s.activityDisplay}${s.lastActivityAt ? ` · last ${age(s.lastActivityAt)} ago` : ""}`],
        ["Context", s.contextUsedPercentage != null ? <Meter pct={s.contextUsedPercentage} /> : "no reading"],
        ["Work", `${s.inProgressWorkCount} in progress · ${s.pendingWorkCount} pending · ${s.blockedWorkCount} blocked`],
      ]} />
      {s.currentQitems.length > 0 && <><h3 className="sec">Holding</h3><ul className="d-plain">{s.currentQitems.map((q) => <li key={q.qitemId}><span>{q.bodyExcerpt}</span><span className="mono">{q.qitemId}</span></li>)}</ul></>}
      {holds.length > 0 && <><h3 className="sec">Holds steps</h3><ul className="d-list">{holds.map((h) => <li key={h.id}><button type="button" onClick={() => onPick(`step:${h.id}`)}><Lamp tone={stepStatus(h, topo).tone} /><b>{h.id}</b><span>{h.objective}</span><Icon name="chevron" /></button></li>)}</ul></>}
      {(out.length > 0 || inn.length > 0) && <><h3 className="sec">Handoffs this week</h3><ul className="d-plain">
        {inn.map((f) => <li key={"i" + f.from}><span>from {f.from}</span><span className="mono">{f.count}</span></li>)}
        {out.map((f) => <li key={"o" + f.to}><span>to {f.to}</span><span className="mono">{f.count}</span></li>)}
      </ul></>}
      <h3 className="sec">{st.tone === "danger" ? "Recover" : "Reach it"}</h3>
      {st.tone === "danger" && <Cmd text={ACTIONS.relaunchSeat.cli(a)} />}
      {s.startupStatus === "attention_required" && <Cmd text={ACTIONS.clearAttention.cli(a)} />}
      {s.session !== "exited" && <Cmd text={ACTIONS.attach.cli(a)} />}
      <Cmd text={ACTIONS.send.cli(a)} />
      <button type="button" className="btn quiet" onClick={() => navigate("terminals", s.canonicalSessionName)}><Icon name="terminals" />Show terminal</button>
    </div>
  );
}

function Meter({ pct }: { pct: number }) {
  const tone = pct >= 80 ? "danger" : pct >= 65 ? "warn" : "ok";
  return <span className="meter" data-tone={tone}><i style={{ width: `${pct}%` }} /><b>{pct}%</b></span>;
}

/** The map's accessible, phone-first twin: every body as a row. */
function PhoneList({ topo, mission, lit, onPick }: { topo: RigTopology; mission: MissionMap | null; lit: Layer; onPick(id: string): void }) {
  if (lit === "mission" && mission) {
    return (
      <ul className="topo-rows" aria-label="Steps">
        {mission.steps.map((s) => { const st = stepStatus(s, topo); return (
          <li key={s.id}><button type="button" onClick={() => onPick(`step:${s.id}`)}><Lamp tone={st.tone} /><b>{s.id}</b><span>{shortSession(s.ownerSession)} · {st.reason}</span><Icon name="chevron" /></button></li>
        ); })}
      </ul>
    );
  }
  return (
    <ul className="topo-rows" aria-label="Pods and seats">
      {topo.pods.map((p) => (
        <li key={p.id}>
          <button type="button" className="pod-row" onClick={() => onPick(`pod:${p.id}`)}><Lamp tone={podStatus(p, topo.seats).tone} /><b>{p.label}</b><span>{podStatus(p, topo.seats).reason}</span><Icon name="chevron" /></button>
          <ul>{topo.seats.filter((s) => s.podId === p.id).map((s) => { const st = seatStatus(s); return (
            <li key={s.logicalId}><button type="button" onClick={() => onPick(`seat:${s.logicalId}`)}><Lamp tone={st.tone} /><b>{s.logicalId.split(".")[1]}</b><span>{st.reason}</span><Icon name="chevron" /></button></li>
          ); })}</ul>
        </li>
      ))}
    </ul>
  );
}

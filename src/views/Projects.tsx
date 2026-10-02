import { useState } from "react";
import { useMissionMap, useProjects, useTopology } from "../api/hooks";
import type { Mission, Slice, SliceStatus } from "../api/types";
import { ListGroup, SplitView } from "../components/SplitView";
import { Chip, Cmd, Empty, Lamp, QueryState } from "../components/primitives";
import { useRig } from "../components/Shell";
import { Icon } from "../components/Icon";
import { age } from "../lib/format";
import { navigate, useRoute } from "../lib/router";
import { stepStatus, type Tone } from "../lib/status";
import "./projects.css";

const SLICE_TONE: Record<SliceStatus, Tone> = { active: "ok", blocked: "danger", draft: "idle", done: "idle" };

function missionTone(m: Mission): Tone {
  if (m.slices.some((s) => s.status === "blocked")) return "danger";
  if (m.slices.some((s) => s.needsYou)) return "human";
  if (m.slices.every((s) => s.status === "done")) return "idle";
  return "ok";
}

export default function Projects() {
  const q = useProjects();
  const route = useRoute();
  const [detail, setDetail] = useState(!!route.id);
  const all = q.data?.flatMap((p) => p.missions) ?? [];
  const sel = all.find((m) => m.id === route.id) ?? all.find((m) => m.status !== "shipped") ?? all[0] ?? null;

  const list = (
    <QueryState q={q}>
      {q.data?.map((p) => (
        <div key={p.id}>
          <ListGroup label={p.name} count={p.missions.length} />
          {p.missions.map((m) => {
            const done = m.slices.filter((s) => s.status === "done").length;
            const you = m.slices.reduce((a, s) => a + s.needsYou, 0);
            return (
              <button key={m.id} type="button" className="li li-proj" aria-current={sel?.id === m.id ? "true" : undefined} onClick={() => { navigate("projects", m.id, { replace: true }); setDetail(true); }}>
                <span className="li-title"><Lamp tone={missionTone(m)} />{m.title}</span>
                <span className="age">{done}/{m.slices.length} slices</span>
                <span className="li-ref">{m.status || "mission"} · {m.id}{you ? ` · ${you} on you` : ""}</span>
              </button>
            );
          })}
          {!p.missions.length && (
            <div className="list-empty proj-empty">
              <p>No missions in {p.name} yet.</p>
              <Cmd text={`mkdir -p ${p.root || "<workspace>"}/missions/<mission>/slices`} />
            </div>
          )}
        </div>
      ))}
    </QueryState>
  );

  return (
    <SplitView id="projects" title="Projects" count={q.data ? `${all.length} missions` : undefined} list={list}
      detail={detail && !!sel} onBack={() => setDetail(false)}
      pane={sel ? <MissionPane key={sel.id} m={sel} /> : (
        <Empty title="No missions yet">
          <p>A mission is a folder under the project's <span className="mono">missions/</span> with a README or SPEC; its slices are folders under <span className="mono">slices/</span>. Slices tie to queue items through <span className="mono">mission:</span> and <span className="mono">slice:</span> tags.</p>
          <Cmd text="rig scopes ls" />
        </Empty>
      )} />
  );
}

function MissionPane({ m }: { m: Mission }) {
  const { rigId } = useRig();
  const map = useMissionMap(rigId);
  const topo = useTopology(rigId);
  const [open, setOpen] = useState<string | null>(null);
  const proof = [m.slices.reduce((a, s) => a + s.proof.passed, 0), m.slices.reduce((a, s) => a + s.proof.total, 0)];
  const onMap = map.data?.missionId === m.id;
  return (
    <article>
      <header className="pane-h">
        <h2>{m.title}</h2>
        <p className="pane-meta">
          <Chip tone={missionTone(m)}>{m.status || "mission"}</Chip>
          <span className="mono">{m.id}</span>
          {m.workflow && <span>workflow {m.workflow.name} v{m.workflow.version}</span>}
          <span>proof {proof[0]}/{proof[1]}</span>
        </p>
      </header>

      {onMap && map.data && (
        <section className="mstrip" aria-label="Workflow steps">
          <ol>
            {map.data.steps.map((s) => { const st = stepStatus(s, topo.data); return (
              <li key={s.id} data-tone={st.tone} data-state={s.state}>
                <button type="button" onClick={() => navigate("topology", `step:${s.id}`, { query: { layer: "mission" } })} title={`${s.id}: ${st.reason}`}>
                  <Lamp tone={st.tone} /><b>{s.id}</b><span>{st.reason}</span>
                </button>
              </li>
            ); })}
          </ol>
          <button type="button" className="btn quiet" onClick={() => navigate("topology", null, { query: { layer: "mission" } })}>
            <Icon name="topology" />Show on the map
          </button>
        </section>
      )}

      <h3 className="sec">Slices</h3>
      <ul className="slices">
        {m.slices.map((s) => <SliceRow key={s.id} s={s} open={open === s.id} onToggle={() => setOpen(open === s.id ? null : s.id)} />)}
      </ul>
    </article>
  );
}

function SliceRow({ s, open, onToggle }: { s: Slice; open: boolean; onToggle(): void }) {
  const tone = s.needsYou ? "human" : SLICE_TONE[s.status];
  const pct = s.proof.total ? s.proof.passed / s.proof.total : 0;
  return (
    <li className="slice" data-open={open || undefined}>
      <button type="button" className="slice-row" aria-expanded={open} onClick={onToggle}>
        <Lamp tone={tone} />
        <span className="s-main"><b>{s.displayName}</b><span className="mono">{s.id}</span></span>
        <span className="s-proof" aria-label={`proof ${s.proof.passed} of ${s.proof.total}`}>
          <span className="pips">{Array.from({ length: s.proof.total }, (_, i) => <i key={i} data-on={i < s.proof.passed || undefined} />)}</span>
          <small>{s.proof.passed}/{s.proof.total}</small>
        </span>
        <span className="s-state"><Chip tone={tone}>{s.needsYou ? "needs you" : s.status}</Chip></span>
        <span className="s-age">{age(s.lastActivityAt)}</span>
        <Icon name="chevron" className="ico s-chev" />
      </button>
      {open && (
        <div className="slice-body">
          <p className="why">{s.description}</p>
          {/* The review's bands, as counts: what needs you, what agents still hold, what is settled. */}
          <div className="bands">
            <div data-tone={s.needsYou ? "human" : undefined}><span className="label">Needs you</span><b>{s.needsYou}</b></div>
            <div><span className="label">Agents hold</span><b>{Math.max(0, s.qitemCount - s.needsYou)}</b></div>
            <div><span className="label">Settled proof</span><b>{s.proof.passed}<small>/{s.proof.total}</small></b></div>
          </div>
          <div className="meter-line"><i style={{ width: `${pct * 100}%` }} /></div>
          <div className="actions">
            {s.needsYou > 0 && <button type="button" className="btn primary" onClick={() => navigate("attention")}>Open Attention</button>}
            <Cmd text={`rig review slice ${s.name}`} />
          </div>
        </div>
      )}
    </li>
  );
}

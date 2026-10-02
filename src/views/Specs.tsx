import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSource, useSpecs } from "../api/hooks";
import type { SpecEntry, SpecKind } from "../api/types";
import { ListGroup, SplitView } from "../components/SplitView";
import { Chip, Cmd, Empty, Facts, QueryState } from "../components/primitives";
import { Icon } from "../components/Icon";
import { navigate, useRoute } from "../lib/router";
import { evenAngles, polar } from "../orrery/geometry";
import "./specs.css";

const KINDS: { id: SpecKind; label: string }[] = [
  { id: "rig", label: "Rig specs" }, { id: "workflow", label: "Workflow specs" }, { id: "agent", label: "Agent specs" },
];
const keyOf = (s: SpecEntry) => `${s.kind}:${s.name}@${s.version}`;

export default function Specs() {
  const q = useSpecs();
  const route = useRoute();
  const [find, setFind] = useState("");
  const [origin, setOrigin] = useState<"all" | "local" | "builtin">("all");
  const [detail, setDetail] = useState(!!route.id);
  const shown = useMemo(() => (q.data ?? []).filter((s) =>
    (origin === "all" || (origin === "builtin") === s.isBuiltIn) &&
    (!find || `${s.name} ${s.purpose}`.toLowerCase().includes(find.toLowerCase()))), [q.data, find, origin]);
  const sel = shown.find((s) => keyOf(s) === route.id) ?? shown[0] ?? null;

  const list = (
    <>
      <div className="spec-filter">
        <label className="sr" htmlFor="spec-find">Filter specs</label>
        <input id="spec-find" type="search" placeholder="Filter by name or purpose" value={find} onChange={(e) => setFind(e.target.value)} />
        <div className="seg" role="group" aria-label="Origin">
          {(["all", "local", "builtin"] as const).map((o) => <button key={o} type="button" aria-pressed={origin === o} onClick={() => setOrigin(o)}>{o === "builtin" ? "built-in" : o}</button>)}
        </div>
      </div>
      <QueryState q={q}>
        {KINDS.map((k) => {
          const xs = shown.filter((s) => s.kind === k.id);
          if (!xs.length) return null;
          return (
            <div key={k.id}>
              <ListGroup label={k.label} count={xs.length} />
              {xs.map((s) => (
                <button key={keyOf(s)} type="button" className="li" aria-current={sel && keyOf(sel) === keyOf(s) ? "true" : undefined}
                  onClick={() => { navigate("specs", keyOf(s), { replace: true }); setDetail(true); }}>
                  <span className="li-title spec-t">{s.name}</span>
                  <span className="age mono">v{s.version}</span>
                  <span className="li-ref spec-p">{s.purpose || "no summary"}</span>
                </button>
              ))}
            </div>
          );
        })}
        {!shown.length && <p className="list-empty">No specs match.</p>}
      </QueryState>
    </>
  );

  return (
    <SplitView id="specs" title="Specs" count={q.data ? `${q.data.length} in the library` : undefined} list={list}
      detail={detail && !!sel} onBack={() => setDetail(false)}
      pane={sel ? <SpecPane key={keyOf(sel)} s={sel} /> : <Empty title="No spec selected"><p>Rig specs describe a team; agent specs one seat; workflow specs a sequence of steps.</p></Empty>} />
  );
}

function SpecPane({ s }: { s: SpecEntry }) {
  const source = useSource();
  const yaml = useQuery({ queryKey: ["spec-yaml", keyOf(s)], queryFn: () => (s.yaml ? Promise.resolve(s.yaml) : source.specYaml(s)), staleTime: 5 * 60_000 });
  const cmds = s.kind === "rig" ? [`rig specs preview ${s.name}`, `rig up ${s.name}`] : s.kind === "workflow" ? [`rig workflow instantiate ${s.sourcePath} --objective "…"`] : [`rig specs preview ${s.name}`];
  return (
    <article>
      <header className="pane-h">
        <h2>{s.name}</h2>
        <p className="pane-meta"><span>{s.kind} spec</span><span className="mono">v{s.version}</span><Chip tone={s.isBuiltIn ? "idle" : "ok"}>{s.isBuiltIn ? "built-in" : "local"}</Chip></p>
      </header>
      {s.purpose && <p className="why">{s.purpose}</p>}
      <Facts rows={[["Source", <span className="mono">{s.sourcePath}</span>]]} />

      {s.pods && s.pods.length > 0 && <><h3 className="sec">What it boots</h3><MiniRig pods={s.pods} /></>}
      {s.steps && s.steps.length > 0 && (
        <><h3 className="sec">Steps</h3>
          <ol className="chain">{s.steps.map((st, i) => (
            <li key={st.id}><b>{st.id}</b><span>{st.role}</span>{i < s.steps!.length - 1 && <Icon name="arrow" className="ico chain-arrow" />}</li>
          ))}</ol></>
      )}

      <h3 className="sec">Run it</h3>
      {cmds.map((c) => <Cmd key={c} text={c} />)}

      <h3 className="sec">Source</h3>
      <QueryState q={yaml}>
        {yaml.data ? <Code text={yaml.data} /> : <p className="sample">The daemon returned no source for this spec.</p>}
      </QueryState>
    </article>
  );
}

function Code({ text }: { text: string }) {
  const lines = text.replace(/\n$/, "").split("\n");
  return (
    <div className="code">
      <pre><code>{lines.map((l, i) => <span key={i} className="ln"><i aria-hidden="true">{i + 1}</i>{hl(l)}{"\n"}</span>)}</code></pre>
    </div>
  );
}

/** YAML, lightly: keys, comments, and the rest. */
function hl(line: string) {
  const c = line.indexOf("#");
  const body = c >= 0 && !/["'].*#/.test(line.slice(0, c)) ? line.slice(0, c) : line;
  const comment = body === line ? "" : line.slice(c);
  const m = body.match(/^(\s*-?\s*)([\w.-]+)(:)(.*)$/);
  return (
    <>
      {m ? <>{m[1]}<span className="k">{m[2]}</span>{m[3]}<span className="v">{m[4]}</span></> : <span className="v">{body}</span>}
      {comment && <span className="c">{comment}</span>}
    </>
  );
}

/** A spec's pods as a small, still orrery: pods on the ring, members as bodies beside them. */
function MiniRig({ pods }: { pods: NonNullable<SpecEntry["pods"]> }) {
  const angles = evenAngles(pods.length, pods.length === 1 ? -90 : -90 + 180 / pods.length);
  const R = pods.length === 1 ? 0 : 108;
  return (
    <svg className="minirig" viewBox="-230 -170 460 340" role="img" aria-label={pods.map((p) => `${p.label}: ${p.members.map((m) => m.id).join(", ")}`).join("; ")}>
      {R > 0 && <circle className="orbit" r={R} />}
      {pods.map((p, i) => {
        const c = polar(R, angles[i]!);
        return (
          <g key={p.namespace} transform={`translate(${c.x} ${c.y})`}>
            <rect className="mr-pod" x="-44" y="-17" width="88" height="34" />
            <text className="mr-name" y="-1">{p.namespace}</text>
            <text className="mr-sub" y="12">{p.members.length} {p.members.length === 1 ? "seat" : "seats"}</text>
            {p.members.map((m, j) => {
              // Members fan outward from the ring, labels on the far side so they never sit on the pod.
              const spread = pods.length === 1 ? 44 : 38;
              const a = (pods.length === 1 ? -90 : angles[i]!) + (j - (p.members.length - 1) / 2) * spread;
              const o = polar(66, a), l = polar(84, a);
              return (
                <g key={m.id}>
                  <rect className="mr-seat" data-rt={m.runtime} x={o.x - 5} y={o.y - 5} width="10" height="10" />
                  <text className="mr-seat-n" x={l.x} y={l.y + 3} textAnchor={Math.abs(l.x) < 12 ? "middle" : l.x > 0 ? "start" : "end"}>{m.id}</text>
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

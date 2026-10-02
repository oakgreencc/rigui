import { useMemo, useState } from "react";
import { useQueue, useRates } from "../api/hooks";
import type { QueueItem, QueueRates } from "../api/types";
import { Empty, Lamp, QueryState, Segmented } from "../components/primitives";
import { Icon, Mark } from "../components/Icon";
import { age, isHuman, minutesSince, shortSession } from "../lib/format";
import type { Tone } from "../lib/status";
import "./backlog.css";

// The stock of open work, in the order it travels. Arcs stay neutral until the balance around them breaks.
type SegId = "pending" | "progress" | "overdue" | "blockedSeat" | "blockedYou";
const SEGS: { id: SegId; label: string; hint: string }[] = [
  { id: "pending", label: "Pending", hint: "Waiting for a seat to claim it" },
  { id: "progress", label: "In progress", hint: "Claimed, inside its closure window" },
  { id: "overdue", label: "Overdue", hint: "Claimed, past its closure deadline" },
  { id: "blockedSeat", label: "Blocked on seats", hint: "Parked on another item or seat" },
  { id: "blockedYou", label: "Blocked on you", hint: "Parked on a human seat" },
];

function segOf(q: QueueItem): SegId | null {
  if (q.state === "pending") return "pending";
  if (q.state === "in-progress") return q.closureRequiredAt && (minutesSince(q.closureRequiredAt) ?? -1) > 0 ? "overdue" : "progress";
  if (q.state === "blocked") return isHuman(q.blockedOn) ? "blockedYou" : "blockedSeat";
  return null;
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

function balances(r: QueueRates, weeks: number) {
  const w = (xs: number[]) => avg(xs.slice(-weeks));
  const mk = (id: SegId, name: string, inName: string, inV: number, outName: string, outV: number) => {
    const d = inV - outV, rel = inV ? d / inV : 0;
    const tone: Tone = rel > 0.2 ? "danger" : rel > 0.08 ? "warn" : "idle";
    return { id, name, inName, inV, outName, outV, d, rel, tone };
  };
  return [
    mk("pending", "Pending", "created", w(r.created), "claimed", w(r.claimed)),
    mk("progress", "In progress", "claimed", w(r.claimed), "closed or handed off", w(r.closed) + w(r.handedOff)),
  ];
}

export default function Backlog() {
  const queue = useQueue();
  const rates = useRates();
  const [weeks, setWeeks] = useState<"1" | "4" | "12">("4");
  const [pick, setPick] = useState<SegId | null>(null);
  const [hover, setHover] = useState<SegId | null>(null);

  const open = useMemo(() => (queue.data ?? []).filter((q) => segOf(q)), [queue.data]);
  const bySeg = useMemo(() => {
    const m = new Map<SegId, QueueItem[]>(SEGS.map((s) => [s.id, []]));
    for (const q of open) m.get(segOf(q)!)!.push(q);
    return m;
  }, [open]);
  const bal = rates.data ? balances(rates.data, Number(weeks)) : [];
  const tone = (id: SegId): Tone => {
    const n = bySeg.get(id)!.length;
    if (!n) return "idle";
    if (id === "overdue") return "danger";
    if (id === "blockedYou") return "human";
    return bal.find((b) => b.id === id)?.tone ?? "idle";
  };

  return (
    <div className="bl">
      <figure className="bl-map" aria-label="Open work by state">
        <QueryState q={queue}>
          {open.length
            ? <Ring segs={SEGS.map((s) => ({ ...s, n: bySeg.get(s.id)!.length, tone: tone(s.id) }))} total={open.length} pick={pick} hover={hover} onPick={(id) => setPick(pick === id ? null : id)} onHover={setHover} />
            : <Empty title="No open work"><p>Nothing is pending, in progress or blocked. Queue items appear here the moment a seat or you create one.</p></Empty>}
        </QueryState>
        <figcaption className="bl-legend" aria-hidden="true">
          <span><i data-k="even" />in balance</span><span><i data-k="warn" />filling</span><span><i data-k="danger" />piling up or overdue</span><span><i data-k="human" />on you</span>
        </figcaption>
      </figure>

      <aside className="bl-panel" aria-label="Backlog rates">
        <header className="bl-head">
          <h1>Backlog</h1>
          <span className="win"><span>average over</span>
            <Segmented label="Average over" value={weeks} onChange={setWeeks} options={[{ value: "1", label: "1w" }, { value: "4", label: "4w" }, { value: "12", label: "12w" }]} />
          </span>
        </header>

        {pick && <Picked seg={SEGS.find((s) => s.id === pick)!} items={bySeg.get(pick)!} tone={tone(pick)} onClose={() => setPick(null)} />}

        <section className="bl-sec" aria-labelledby="bal-h">
          <h2 id="bal-h" className="label">Where work piles up</h2>
          <p>Each queue sits between two rates. When what leaves falls behind what arrives, it grows.</p>
          {bal.map((b) => (
            <div key={b.id} className="bal" data-hl={hover === b.id || pick === b.id || undefined} onMouseEnter={() => setHover(b.id)} onMouseLeave={() => setHover(null)}>
              <div className="bal-h"><b>{b.name}</b>
                <span className="chip" data-tone={b.tone === "idle" ? "idle" : b.tone}>{b.tone === "idle" ? "even" : b.d > 0 ? `+${b.d.toFixed(1)}/wk` : `${b.d.toFixed(1)}/wk`}</span>
              </div>
              <p><b>{b.inV.toFixed(1)}</b> {b.inName} a week, <b>{b.outV.toFixed(1)}</b> {b.outName}. {b.d > 0.5 ? `About ${Math.round(b.d)} more pile up each week.` : b.d < -0.5 ? "It is draining." : "Holding steady."}</p>
              <div className="dv" role="img" aria-label={`${b.name}: ${b.rel > 0 ? "piling up" : "draining"} by ${Math.abs(Math.round(b.rel * 100))}%`}>
                <i data-tone={b.tone} style={b.rel >= 0 ? { left: "50%", width: `${Math.min(50, b.rel * 100)}%` } : { right: "50%", width: `${Math.min(50, -b.rel * 100)}%` }} />
              </div>
            </div>
          ))}
          <div className="dv-axis" aria-hidden="true"><span>draining</span><span>even</span><span>piling up</span></div>
        </section>

        <section className="bl-sec" aria-labelledby="rate-h">
          <h2 id="rate-h" className="label">Weekly rates</h2>
          <p>Twelve weeks, one scale. Weeks inside the average are solid.</p>
          <QueryState q={rates}>{rates.data && <Rates r={rates.data} weeks={Number(weeks)} />}</QueryState>
        </section>

        <section className="bl-sec" aria-labelledby="seat-h">
          <h2 id="seat-h" className="label">By seat</h2>
          <SeatTable items={open} />
        </section>
      </aside>
    </div>
  );
}

// ---------- Ring ----------
function Ring({ segs, total, pick, hover, onPick, onHover }: {
  segs: { id: SegId; label: string; hint: string; n: number; tone: Tone }[]; total: number; pick: SegId | null; hover: SegId | null;
  onPick(id: SegId): void; onHover(id: SegId | null): void;
}) {
  const R0 = 250, R1 = 310, GAP = 0.9; // degrees of surface between arcs
  const shown = segs.filter((s) => s.n > 0);
  let a = -90;
  const arcs = shown.map((s) => {
    const span = Math.max(6, (360 * s.n) / total);
    const x = { ...s, a1: a + GAP / 2, a2: a + span - GAP / 2 };
    a += span;
    return x;
  });
  // Renormalize when the minimum span pushed us past a full turn.
  const k = 360 / (a + 90);
  arcs.forEach((x) => { x.a1 = -90 + (x.a1 + 90) * k; x.a2 = -90 + (x.a2 + 90) * k; });
  const P = (r: number, d: number) => [r * Math.cos((d * Math.PI) / 180), r * Math.sin((d * Math.PI) / 180)] as const;
  const path = (a1: number, a2: number) => {
    const [x1, y1] = P(R1, a1), [x2, y2] = P(R1, a2), [x3, y3] = P(R0, a2), [x4, y4] = P(R0, a1);
    const L = a2 - a1 > 180 ? 1 : 0;
    return `M${x1},${y1} A${R1},${R1} 0 ${L} 1 ${x2},${y2} L${x3},${y3} A${R0},${R0} 0 ${L} 0 ${x4},${y4}Z`;
  };
  return (
    <div className="ring-wrap">
      <Mark className="bl-backdrop" />
      <svg viewBox="-470 -400 940 800" role="group" aria-label="Open queue items by state">
        {arcs.map((s) => {
          const mid = (s.a1 + s.a2) / 2;
          const [lx, ly] = P(R1 + 34, mid), [t1x, t1y] = P(R1 + 6, mid), [t2x, t2y] = P(R1 + 22, mid);
          const right = Math.cos((mid * Math.PI) / 180) >= 0;
          return (
            <g key={s.id} className="seg" data-tone={s.tone} data-sel={pick === s.id || undefined} data-dim={(hover && hover !== s.id) || (pick && pick !== s.id) || undefined}
              role="button" tabIndex={0} aria-label={`${s.label}: ${s.n}. ${s.hint}.`}
              onClick={() => onPick(s.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(s.id); } }}
              onMouseEnter={() => onHover(s.id)} onMouseLeave={() => onHover(null)} onFocus={() => onHover(s.id)} onBlur={() => onHover(null)}>
              <path className="arc" d={path(s.a1, s.a2)} />
              <line className="tick" x1={t1x} y1={t1y} x2={t2x} y2={t2y} />
              <text className="sl-name" x={lx} y={ly - 4} textAnchor={right ? "start" : "end"}>{s.label}</text>
              <text className="sl-n" x={lx} y={ly + 14} textAnchor={right ? "start" : "end"}>{s.n} {s.n === 1 ? "item" : "items"}</text>
            </g>
          );
        })}
        <text className="c-num" y={8}>{total}</text>
        <text className="c-name" y={36}>open items</text>
      </svg>
    </div>
  );
}

function Picked({ seg, items, tone, onClose }: { seg: { label: string; hint: string }; items: QueueItem[]; tone: Tone; onClose(): void }) {
  const sorted = [...items].sort((a, b) => a.tsCreated.localeCompare(b.tsCreated));
  return (
    <section className="bl-sec bl-pick" aria-live="polite">
      <div className="pick-h"><h2><Lamp tone={tone} />{seg.label}</h2><button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button></div>
      <p>{seg.hint}. Oldest first.</p>
      <ul className="pick-list">
        {sorted.slice(0, 12).map((q) => (
          <li key={q.qitemId}><span className="t">{q.summary ?? q.body}</span><span className="w">{shortSession(q.destinationSession)} · {age(q.tsCreated)}</span></li>
        ))}
      </ul>
      {sorted.length > 12 && <p className="sample">and {sorted.length - 12} more · <code className="mono">rig queue list --state {seg.label.toLowerCase().includes("block") ? "blocked" : seg.label === "Pending" ? "pending" : "in-progress"}</code></p>}
    </section>
  );
}

// ---------- Rates: small multiples, one shared scale ----------
function Rates({ r, weeks }: { r: QueueRates; weeks: number }) {
  const series: { id: keyof QueueRates; label: string }[] = [
    { id: "created", label: "Created" }, { id: "claimed", label: "Claimed" }, { id: "closed", label: "Closed" }, { id: "handedOff", label: "Handed off" },
  ];
  const max = Math.max(1, ...series.flatMap((s) => r[s.id] as number[]));
  const top = Math.ceil(max / 10) * 10;
  const [tip, setTip] = useState<{ s: string; i: number; x: number } | null>(null);
  const W = 360, H = 64, n = r.weekOf.length, bw = W / n;
  return (
    <div className="rates">
      {series.map((s) => {
        const xs = r[s.id] as number[];
        const mean = avg(xs.slice(-weeks));
        return (
          <div key={s.id} className="rate">
            <div className="rate-h"><b>{s.label}</b><span className="rate-v">{mean.toFixed(1)}<small>/wk</small></span></div>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${s.label} per week: ${xs.join(", ")}`}>
              <line className="gridl" x1="0" x2={W} y1={H - (H * (top / 2)) / top} y2={H - (H * (top / 2)) / top} />
              {xs.map((v, i) => {
                const h = (H * v) / top, inWin = i >= n - weeks;
                return (
                  <g key={i} className="bar-col" onMouseEnter={() => setTip({ s: s.id, i, x: (i + 0.5) * bw })} onMouseLeave={() => setTip(null)}>
                    <rect className="bar-hit" x={i * bw} y="0" width={bw} height={H} />
                    <rect className="bar" data-out={!inWin || undefined} x={i * bw + 2} y={H - h} width={bw - 4} height={Math.max(1, h)} />
                  </g>
                );
              })}
              <line className="base" x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} />
            </svg>
            {tip?.s === s.id && <div className="bar-tip" style={{ left: `${(tip.x / W) * 100}%` }}><b>{xs[tip.i]}</b> week of {r.weekOf[tip.i]}</div>}
          </div>
        );
      })}
      <div className="rate-x" aria-hidden="true"><span>{r.weekOf[0]}</span><span>scale 0–{top}</span><span>{r.weekOf[n - 1]}</span></div>
      <details className="or-run"><summary>Show as table</summary>
        <div className="tablewrap"><table><thead><tr><th>Week of</th>{series.map((s) => <th key={s.id} className="n">{s.label}</th>)}</tr></thead>
          <tbody>{r.weekOf.map((w, i) => <tr key={w}><td>{w}</td>{series.map((s) => <td key={s.id} className="n">{(r[s.id] as number[])[i]}</td>)}</tr>)}</tbody></table></div>
      </details>
    </div>
  );
}

function SeatTable({ items }: { items: QueueItem[] }) {
  const rows = useMemo(() => {
    const m = new Map<string, { p: number; ip: number; b: number; oldest: string }>();
    for (const q of items) {
      const r = m.get(q.destinationSession) ?? { p: 0, ip: 0, b: 0, oldest: q.tsCreated };
      if (q.state === "pending") r.p++; else if (q.state === "in-progress") r.ip++; else r.b++;
      if (q.tsCreated < r.oldest) r.oldest = q.tsCreated;
      m.set(q.destinationSession, r);
    }
    return [...m.entries()].sort((a, b) => b[1].p + b[1].ip + b[1].b - (a[1].p + a[1].ip + a[1].b));
  }, [items]);
  return (
    <div className="tablewrap">
      <table>
        <thead><tr><th>Seat</th><th className="n">Pending</th><th className="n">Doing</th><th className="n">Blocked</th><th className="n">Oldest</th></tr></thead>
        <tbody>{rows.map(([s, r]) => (
          <tr key={s}><td className="fg">{shortSession(s)}</td><td className="n">{r.p}</td><td className="n">{r.ip}</td><td className="n">{r.b || "—"}</td><td className="n" data-old={(minutesSince(r.oldest) ?? 0) > 60 * 48 || undefined}>{age(r.oldest)}</td></tr>
        ))}</tbody>
      </table>
    </div>
  );
}

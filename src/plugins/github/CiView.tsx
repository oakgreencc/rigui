import { useEffect, useMemo, useRef, useState } from "react";
import { Chip, Cmd, Drawer, Empty, Facts, Lamp, Segmented } from "../../components/primitives";
import { age, ago, clock, plural } from "../../lib/format";
import { navigate, useRoute } from "../../lib/router";
import type { Tone } from "../../lib/status";
import { branches, busy, conclusionWord, depth, lanes, LONG_WAIT_MS, runnerName, stalled, timeRun, trunkHealth, workflowStats, type Timed } from "./ci-model";
import { dur, ms, useCi, useRefresh } from "./data";
import type { CiJob, CiSnapshot } from "./types";
import { ExternalLink, GhHead, GhState, useNow, useWidth } from "./ui";
import "./github.css";

type Win = "6h" | "24h" | "3d";
const WIN_MS: Record<Win, number> = { "6h": 6 * 3600e3, "24h": 24 * 3600e3, "3d": 72 * 3600e3 };
const TICK_MS: Record<Win, number> = { "6h": 3600e3, "24h": 3 * 3600e3, "3d": 12 * 3600e3 };

export default function CiView({ repo, pluginId }: { repo: string; pluginId: string }) {
  const q = useCi(repo);
  const refresh = useRefresh(repo, "ci");
  const route = useRoute();
  const now = useNow();
  const win = (["6h", "24h", "3d"] as Win[]).find((w) => w === route.query.get("w")) ?? "24h";
  const setWin = (w: Win) => navigate(pluginId, route.id, { replace: true, query: { w: w === "24h" ? null : w } });
  const open = (runId: number | null) => navigate(pluginId, runId ? String(runId) : null, { replace: !!route.id && !!runId });

  const timed = useMemo(() => (q.data ? q.data.runs.map((r) => timeRun(r, now)) : []), [q.data, now]);
  const picked = route.id ? timed.find((t) => String(t.run.id) === route.id) ?? null : null;

  return (
    <div className="gh-ci" data-drawer={picked ? "" : undefined}>
      <section className="gh-main" aria-label="CI">
        <GhHead title="CI" repo={repo} fetchedAt={q.data?.fetchedAt} failing={!!q.error} refresh={refresh}>
          <Segmented label="Window" value={win} onChange={setWin} options={[{ value: "6h", label: "6h" }, { value: "24h", label: "24h" }, { value: "3d", label: "3d" }]} />
        </GhHead>
        <GhState q={q} what="Actions runs">
          {q.data && <Body snap={q.data} timed={timed} now={now} win={win} picked={picked?.run.id ?? null} onPick={open} />}
        </GhState>
      </section>
      <Drawer open={!!picked} onClose={() => open(null)} label="Run">
        {picked && <RunDetail t={picked} repo={repo} />}
      </Drawer>
    </div>
  );
}

function Body({ snap, timed, now, win, picked, onPick }: { snap: CiSnapshot; timed: Timed[]; now: number; win: Win; picked: number | null; onPick(id: number): void }) {
  const from = now - WIN_MS[win];
  const inWin = useMemo(() => timed.filter((t) => (Number.isFinite(t.endedAt) ? t.endedAt : now) >= from), [timed, from, now]);
  const ls = useMemo(() => lanes(inWin, now), [inWin, now]);
  const trunks = useMemo(() => trunkHealth(timed), [timed]);
  const flight = timed.filter((t) => t.phase !== "done").sort((a, b) => a.queuedAt - b.queuedAt);
  const waiting = flight.filter((t) => t.phase === "waiting");
  const running = flight.filter((t) => t.phase === "running");
  const longest = waiting[0];
  const top = ls[0];
  const topBusy = top ? busy(top.bars, from, now) : 0;
  const stall = stalled(timed, now);

  if (!timed.length) return <div className="view-body"><Empty title={`No runs in ${snap.days} days`}><p>Nothing has triggered a workflow on {snap.repo} lately. Runs appear here as soon as a push, pull request or schedule starts one.</p></Empty></div>;

  return (
    <div className="gh-ci-body">
      {/* What is true right now, in sentences: trunk, the work in hand, the queue, the machine doing it. */}
      {/* The one loud thing: work is queued and no runner has moved. Nobody is picking it up. */}
      {stall && (
        <p className="gh-stall" role="alert">
          <Lamp tone="danger" />
          <span><b>No runner has moved in {dur(stall.quiet)}</b> while {plural(stall.waiting, "run")} {stall.waiting === 1 ? "waits" : "wait"}. A self-hosted runner is likely offline or hung; nothing here will start until it is back.</span>
        </p>
      )}
      <ul className="gh-now" aria-label="Right now">
        {trunks.map((tr) => (
          <li key={tr.branch} data-bad={tr.red.length > 0 || undefined}>
            <Lamp tone={tr.red.length ? "danger" : "ok"} />
            <span><b>{tr.branch}</b> {tr.red.length ? <>is red: <button type="button" className="linkish" onClick={() => onPick(tr.red[0]!.run.id)}>{tr.red[0]!.run.workflow} failed</button> {ago(tr.red[0]!.run.updatedAt)}</> : <>is green · {tr.runs.map((t) => t.run.workflow).join(", ")} passed</>}</span>
          </li>
        ))}
        <li>
          <Lamp tone={running.length ? "ok" : "idle"} />
          <span>{running.length
            ? <><b>Running</b> {running.map((t, i) => <span key={t.run.id}>{i ? ", " : ""}<button type="button" className="linkish" onClick={() => onPick(t.run.id)}>{t.run.workflow} · {short(t.run.branch)}</button> {dur(t.ran)}</span>)}</>
            : <><b>Nothing running</b></>}</span>
        </li>
        <li data-bad={(longest && longest.wait > LONG_WAIT_MS) || undefined}>
          <Lamp tone={!waiting.length ? "idle" : longest!.wait > LONG_WAIT_MS ? "warn" : "idle"} />
          <span>{waiting.length
            ? <><b>{waiting.length} waiting</b> for a runner · longest <button type="button" className="linkish" onClick={() => onPick(longest!.run.id)}>{longest!.run.workflow} · {short(longest!.run.branch)}</button> {dur(longest!.wait)}</>
            : <><b>Queue empty</b></>}</span>
        </li>
        {top && (
          <li data-bad={topBusy > 0.85 || undefined}>
            <Lamp tone={topBusy > 0.85 ? "warn" : "idle"} />
            <span><b>{ls.length === 1 ? top.runner : `${ls.length} runners`}</b> {ls.length === 1 ? "busy" : `· busiest ${pct(topBusy)}`} {ls.length === 1 ? `${pct(topBusy)} of the last ${win}` : `of the last ${win}`}</span>
          </li>
        )}
      </ul>

      <Lanes timed={inWin} lanes={ls} from={from} now={now} win={win} picked={picked} onPick={onPick} />

      <div className="gh-cols">
        <section aria-labelledby="flight-h">
          <h2 id="flight-h" className="label">In flight</h2>
          {flight.length
            ? <RunTable rows={flight} onPick={onPick} picked={picked} cols="flight" />
            : <p className="gh-quiet">Nothing queued or running.</p>}
          <h2 id="br-h" className="label">Branches</h2>
          <p className="gh-note">Latest run on each branch in the last {snap.days} days. Red first.</p>
          <RunTable rows={branches(timed).slice(0, 14)} onPick={onPick} picked={picked} cols="branch" />
        </section>
        <section aria-labelledby="wf-h">
          <h2 id="wf-h" className="label">Workflows</h2>
          <p className="gh-note">Over {snap.days} days. Wait is time from trigger to a runner picking it up.</p>
          <Workflows snap={snap} timed={timed} onPick={onPick} />
          <h2 className="label">Failures</h2>
          {timed.some((t) => t.tone === "danger")
            ? <RunTable rows={timed.filter((t) => t.tone === "danger").sort((a, b) => b.queuedAt - a.queuedAt).slice(0, 10)} onPick={onPick} picked={picked} cols="fail" />
            : <p className="gh-quiet">No failures in {snap.days} days.</p>}
        </section>
      </div>
    </div>
  );
}

// ---------- The lanes: queue depth above, one lane per runner, time left to right ----------
const AXIS = 30, BAND = 64, LANE = 44, BAR = 22, PAD_R = 20;

function Lanes({ timed, lanes: ls, from, now, win, picked, onPick }: {
  timed: Timed[]; lanes: ReturnType<typeof lanes>; from: number; now: number; win: Win; picked: number | null; onPick(id: number): void;
}) {
  const [ref, width] = useWidth<HTMLElement>();
  const scroller = useRef<HTMLDivElement>(null);
  // When the lanes overflow (phone), open on "now", not on the oldest hour.
  useEffect(() => { const el = scroller.current; if (el && width) el.scrollLeft = el.scrollWidth; }, [width, win]);
  const [hover, setHover] = useState<{ t: Timed; job?: CiJob; x: number; y: number } | null>(null);
  // The label column is HTML pinned over the SVG's left edge, so names stay put while time scrolls under them.
  const GUTTER = width < 560 ? 112 : 176;
  const W = Math.max(width, 640);
  const plotW = W - GUTTER - PAD_R;
  const x = (at: number) => GUTTER + ((Math.min(Math.max(at, from), now) - from) / (now - from)) * plotW;
  const H = AXIS + BAND + 12 + Math.max(1, ls.length) * LANE + 8;

  const steps = useMemo(() => depth(timed), [timed]);
  const before = steps.filter(([at]) => at < from).at(-1)?.[1] ?? 0;
  const shown = [[from, before] as [number, number], ...steps.filter(([at]) => at >= from && at <= now)];
  const maxD = Math.max(3, ...shown.map(([, d]) => d));
  const bandY = AXIS, bandBottom = AXIS + BAND;
  const y = (d: number) => bandBottom - (d / maxD) * (BAND - 8);
  let area = `M${x(from)},${bandBottom}`;
  shown.forEach(([at, d], i) => { const nx = i + 1 < shown.length ? shown[i + 1]![0] : now; area += ` L${x(at)},${y(d)} L${x(nx)},${y(d)}`; });
  area += ` L${x(now)},${bandBottom} Z`;
  const nowDepth = shown.at(-1)?.[1] ?? 0;

  const ticks: number[] = [];
  const step = TICK_MS[win];
  // Ticks give way to the "now" label rather than collide with it.
  for (let t = Math.ceil(from / step) * step; x(now) - x(t) > 40; t += step) ticks.push(t);
  const tickLabel = (t: number) => {
    const d = new Date(t);
    return d.getHours() === 0 ? d.toLocaleDateString([], { weekday: "short", day: "numeric" }) : clock(d.toISOString());
  };
  const focus = hover?.t.run.id ?? null;
  const lanesTop = bandBottom + 12;

  return (
    <figure className="gh-lanes" ref={ref} aria-label={`Runs over the last ${win}: queue depth and runner lanes`}>
      <div className="gl-scroll" ref={scroller}>
      {width > 0 && (
        <div className="gl-inner" style={{ width: W, height: H }}>
        <div className="gl-gutter" style={{ width: GUTTER, height: H }}>
          <span style={{ top: bandY + 6 }}>
            <b>Waiting</b>
            <small data-tone={nowDepth ? "warn" : undefined}>{nowDepth ? `${nowDepth} now` : "none now"} · peak {Math.max(...shown.map(([, d]) => d))}</small>
          </span>
          {ls.map((lane, i) => (
            <span key={lane.runner} style={{ top: lanesTop + i * LANE + 4 }} title={lane.runner}>
              <b>{lane.runner}</b>
              <small>busy {pct(busy(lane.bars, from, now))}</small>
            </span>
          ))}
        </div>
        <svg width={W} height={H} role="group" onMouseLeave={() => setHover(null)}>
          {/* Time grid */}
          {ticks.map((t) => (
            <g key={t}>
              <line className="gl-grid" x1={x(t)} x2={x(t)} y1={AXIS - 6} y2={H} />
              <text className="gl-tick" x={x(t)} y={AXIS - 12}>{tickLabel(t)}</text>
            </g>
          ))}

          {/* Queue band */}
          <line className="gl-base" x1={GUTTER} x2={GUTTER + plotW} y1={bandBottom + 0.5} y2={bandBottom + 0.5} />
          <path className="gl-depth" d={area} />
          {hover && (
            <g className="gl-wait" aria-hidden="true">
              <line x1={x(hover.t.queuedAt)} x2={x(Number.isFinite(hover.t.startedAt) ? hover.t.startedAt : now)} y1={bandBottom - 4} y2={bandBottom - 4} />
              <line x1={x(hover.t.queuedAt)} x2={x(hover.t.queuedAt)} y1={bandBottom - 10} y2={bandBottom + 2} />
            </g>
          )}

          {/* Runner lanes */}
          {ls.map((lane, i) => {
            const ly = lanesTop + i * LANE;
            return (
              <g key={lane.runner}>
                <rect className="gl-track" x={GUTTER} y={ly + (LANE - BAR) / 2 - 4} width={plotW} height={BAR + 8} />
                {lane.bars.filter((b) => b.end >= from).map((b) => {
                  const x1 = x(b.start), x2 = Math.max(x1 + 2, x(b.end));
                  const tone = barTone(b.t, b.job);
                  return (
                    <g key={b.job.id} className="gl-bar" data-tone={tone} data-focus={focus === b.t.run.id || picked === b.t.run.id || undefined} data-dim={(focus && focus !== b.t.run.id) || undefined}
                      role="button" tabIndex={0} aria-label={`${b.t.run.workflow} on ${b.t.run.branch}: ${b.job.name}, ${conclusionWord(b.t)}, ran ${dur(b.end - b.start)}`}
                      onMouseEnter={() => setHover({ t: b.t, job: b.job, x: (x1 + x2) / 2, y: ly })} onFocus={() => setHover({ t: b.t, job: b.job, x: (x1 + x2) / 2, y: ly })}
                      onBlur={() => setHover(null)} onClick={() => onPick(b.t.run.id)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(b.t.run.id); } }}>
                      <rect x={x1} y={ly + (LANE - BAR) / 2} width={x2 - x1} height={BAR} />
                      {x2 - x1 > 46 && <text x={x1 + 6} y={ly + LANE / 2 + 4}>{fit(`${b.t.run.workflow} ${short(b.t.run.branch)}`, Math.floor((x2 - x1 - 10) / 6.6))}</text>}
                    </g>
                  );
                })}
              </g>
            );
          })}
          {!ls.length && <text className="gl-sub" x={GUTTER + 8} y={lanesTop + LANE / 2 + 4}>No runner picked up a job in this window.</text>}

          {/* Now */}
          <line className="gl-now" x1={x(now)} x2={x(now)} y1={AXIS - 6} y2={H} />
          <text className="gl-now-t" x={x(now)} y={AXIS - 12}>now</text>
        </svg>
        {hover && (
          <div className="gl-tip" role="status" style={{ left: Math.min(Math.max(hover.x, GUTTER + 110), W - 120), top: hover.y - 6 }}>
            <b>{hover.t.run.workflow} · {short(hover.t.run.branch)}</b>
            <span>{hover.job?.name ? `${hover.job.name} · ` : ""}{conclusionWord(hover.t)}</span>
            <span>waited {dur(hover.t.wait)} · ran {dur(hover.t.ran)}</span>
          </div>
        )}
        </div>
      )}
      </div>
      <figcaption className="gl-legend" style={{ paddingLeft: width < 560 ? 0 : GUTTER }}>
        <span><i data-k="ok" />passed</span><span><i data-k="danger" />failed</span><span><i data-k="run" />running</span><span><i data-k="cancel" />cancelled</span><span><i data-k="wait" />queue depth</span>
      </figcaption>
    </figure>
  );
}

/** A job's own outcome, so one failing job stands out inside a run that other jobs passed. */
function barTone(t: Timed, j: CiJob): "pass" | "danger" | "run" | "cancel" {
  if (!j.completedAt) return "run";
  if (j.conclusion === "failure" || j.conclusion === "timed_out") return "danger";
  if (j.conclusion === "cancelled" || t.run.conclusion === "cancelled") return "cancel";
  return "pass";
}

// ---------- Tables ----------
function RunTable({ rows, cols, picked, onPick }: { rows: Timed[]; cols: "flight" | "branch" | "fail"; picked: number | null; onPick(id: number): void }) {
  return (
    <div className="tablewrap gh-table">
      <table>
        <thead><tr>
          <th>{cols === "branch" ? "Branch" : "Run"}</th>
          {cols === "flight" && <><th>State</th><th className="n">Waited</th><th className="n">Ran</th></>}
          {cols === "branch" && <><th>Latest</th><th className="n">Age</th></>}
          {cols === "fail" && <><th>Failed at</th><th className="n">Age</th></>}
        </tr></thead>
        <tbody>{rows.map((t) => {
          const failed = t.run.jobs.find((j) => j.conclusion === "failure");
          return (
            <tr key={t.run.id} data-pick aria-current={picked === t.run.id || undefined} tabIndex={0} onClick={() => onPick(t.run.id)}
              onKeyDown={(e) => { if (e.key === "Enter") onPick(t.run.id); }}>
              <td className="gh-run">
                <b>{cols === "branch" ? short(t.run.branch, 44) : t.run.workflow}</b>
                <span>{cols === "branch" ? `${t.run.workflow} · ${t.run.title}` : `${short(t.run.branch, 40)} · ${t.run.title}`}</span>
              </td>
              {cols === "flight" && <>
                <td><Verdict t={t} /></td>
                <td className="n" data-old={t.wait > LONG_WAIT_MS || undefined}>{dur(t.wait)}</td>
                <td className="n">{dur(t.ran)}</td>
              </>}
              {cols === "branch" && <><td><Verdict t={t} /></td><td className="n">{age(t.run.createdAt)}</td></>}
              {cols === "fail" && <><td className="gh-step">{failed ? <>{failed.name}{failed.failedStep && <span> › {failed.failedStep}</span>}</> : t.verdict}</td><td className="n">{age(t.run.updatedAt)}</td></>}
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}

const Verdict = ({ t }: { t: Timed }) => (
  <span className="gh-verdict" data-tone={t.phase === "done" && t.tone === "idle" && t.run.conclusion === "success" ? "pass" : t.tone}>
    <Lamp tone={t.phase === "done" && t.run.conclusion === "success" ? "ok" : t.tone} />{conclusionWord(t)}
  </span>
);

function Workflows({ snap, timed, onPick }: { snap: CiSnapshot; timed: Timed[]; onPick(id: number): void }) {
  const rows = workflowStats(snap, timed);
  const dupes = new Set(rows.map((r) => r.name).filter((n, i, a) => a.indexOf(n) !== i));
  return (
    <div className="tablewrap gh-table">
      <table>
        <thead><tr><th>Workflow</th><th className="n">Runs</th><th className="n">Failed</th><th className="n">Wait</th><th className="n">Run</th><th>Last</th></tr></thead>
        <tbody>{rows.map((w) => (
          <tr key={w.id} data-pick={w.last ? true : undefined} tabIndex={w.last ? 0 : undefined} onClick={() => w.last && onPick(w.last.run.id)}
            onKeyDown={(e) => { if (e.key === "Enter" && w.last) onPick(w.last.run.id); }}>
            <td className="gh-run"><b>{w.name}</b>{dupes.has(w.name) && <span className="mono">{w.path.split("/").pop()}</span>}</td>
            <td className="n">{w.runs}</td>
            <td className="n" data-old={w.failRate > 0.25 || undefined}>{w.failed ? `${w.failed} · ${pct(w.failRate)}` : "—"}</td>
            <td className="n" data-old={w.wait > LONG_WAIT_MS || undefined}>{dur(w.wait)}</td>
            <td className="n">{dur(w.ran)}</td>
            <td>{w.last && <Verdict t={w.last} />}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

// ---------- Drawer ----------
function RunDetail({ t, repo }: { t: Timed; repo: string }) {
  const r = t.run;
  const failed = r.jobs.filter((j) => j.conclusion === "failure" || j.conclusion === "timed_out");
  const chipTone: Tone = t.tone === "idle" && r.conclusion === "success" ? "ok" : t.tone;
  return (
    <div className="detail">
      <header>
        <h2><Lamp tone={chipTone} />{r.workflow}</h2>
        {r.title !== r.workflow && <p className="d-sub">{r.title}</p>}
      </header>
      {t.phase === "waiting" && t.wait > LONG_WAIT_MS && <p className="why"><b className="tone-warn">Waiting {dur(t.wait)} for a runner.</b> Every job ahead of it on the same runner has to finish first.</p>}
      {failed.length > 0 && <p className="why tone-danger"><b>{failed.map((j) => j.name).join(", ")} failed</b>{failed[0]!.failedStep ? <> at <q>{failed[0]!.failedStep}</q></> : null}.</p>}
      <Facts rows={[
        ["Result", <Chip tone={chipTone}>{conclusionWord(t)}</Chip>],
        ["Branch", <span className="mono">{r.branch}</span>],
        ["Trigger", `${r.event.replace(/_/g, " ")}${r.actor ? ` by ${r.actor}` : ""}`],
        ["Queued", `${clock(r.createdAt)} · ${ago(r.createdAt)}`],
        ["Waited", dur(t.wait)],
        ["Ran", Number.isFinite(t.ran) ? dur(t.ran) : "not started"],
        ["Run", <span className="mono">#{r.number}{r.attempt > 1 ? ` · attempt ${r.attempt}` : ""} · {r.sha.slice(0, 7)}</span>],
      ]} />
      {r.jobs.length > 0 && <>
        <h3 className="sec">{plural(r.jobs.length, "job")}</h3>
        <ul className="d-plain gh-jobs">{r.jobs.map((j) => {
          const tone: Tone = !j.completedAt ? (j.startedAt ? "ok" : "idle") : j.conclusion === "failure" || j.conclusion === "timed_out" ? "danger" : "idle";
          return (
            <li key={j.id}>
              <Lamp tone={tone} />
              <span className="gh-jn"><a href={j.url} target="_blank" rel="noreferrer">{j.name}</a>{j.failedStep && <small>{j.failedStep}</small>}</span>
              <span className="gh-jw">{j.conclusion === "skipped" ? "skipped" : j.startedAt ? <>{dur((j.completedAt ? ms(j.completedAt) : Date.now()) - ms(j.startedAt))}{j.runner && <small>{runnerName(j.runner)}</small>}</> : "waiting"}</span>
            </li>
          );
        })}</ul>
      </>}
      <h3 className="sec">{failed.length ? "Read the failure" : "From the CLI"}</h3>
      <Cmd text={`gh run view ${r.id} -R ${repo}${failed.length ? " --log-failed" : ""}`} />
      <ExternalLink href={r.url}>Open on GitHub</ExternalLink>
    </div>
  );
}

// ---------- Small helpers ----------
const pct = (x: number) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : "—");
/** "agent/2413-data-stats-seat" stays readable; long ones keep their head. */
function short(branch: string, n = 28) { return fit(branch.replace(/^agent\//, ""), n); }
function fit(s: string, n: number) { return n < 4 ? "" : s.length > n ? s.slice(0, n - 1) + "…" : s; }

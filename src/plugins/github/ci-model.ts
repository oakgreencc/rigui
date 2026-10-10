// What the CI tab says, derived from a snapshot: when each run waited and ran, which runner did the work,
// how deep the queue was, and whether the long-lived branches are green. Pure; `now` is passed in.
import type { Tone } from "../../lib/status";
import { median, ms } from "./data";
import type { CiJob, CiRun, CiSnapshot } from "./types";

/** A run waiting longer than this is the thing to look at. */
export const LONG_WAIT_MS = 20 * 60_000;
export const TRUNKS = ["develop", "main", "master"];

export interface Timed {
  run: CiRun;
  queuedAt: number;
  /** First job picked up by a runner; NaN while nothing has. */
  startedAt: number;
  /** Last job finished; NaN while running or waiting. */
  endedAt: number;
  wait: number;
  ran: number;
  phase: "waiting" | "running" | "done";
  tone: Tone;
  verdict: string;
}

const isWaiting = (s: string) => ["queued", "pending", "waiting", "requested"].includes(s);
const ran = (j: CiJob) => !!j.runner && !!j.startedAt;

export function timeRun(run: CiRun, now: number): Timed {
  const queuedAt = ms(run.createdAt);
  const worked = run.jobs.filter(ran);
  const startedAt = worked.length ? Math.min(...worked.map((j) => ms(j.startedAt))) : NaN;
  const done = run.status === "completed";
  const endedAt = done ? Math.max(ms(run.updatedAt), ...worked.map((j) => ms(j.completedAt)).filter(Number.isFinite)) : NaN;
  const live = worked.some((j) => !j.completedAt);
  const phase = done ? "done" : live || (Number.isFinite(startedAt) && !isWaiting(run.status)) ? "running" : "waiting";
  // Waiting now means since the run last had a job in hand: a multi-job run waits again between jobs.
  // A run cancelled before any runner took it waited until it was cancelled.
  const lastEnd = Math.max(queuedAt, ...worked.map((j) => ms(j.completedAt)).filter(Number.isFinite));
  const wait = phase === "waiting" ? now - lastEnd : (Number.isFinite(startedAt) ? startedAt : endedAt) - queuedAt;
  const ranFor = worked.length ? union(worked.map((j) => ({ start: ms(j.startedAt), end: j.completedAt ? ms(j.completedAt) : now }))) : NaN;
  const { tone, verdict } = judge(run, phase, wait);
  return { run, queuedAt, startedAt, endedAt, wait, ran: ranFor, phase, tone, verdict };
}

function judge(run: CiRun, phase: Timed["phase"], wait: number): { tone: Tone; verdict: string } {
  if (phase === "running") return { tone: "ok", verdict: "running" };
  if (phase === "waiting") return wait > LONG_WAIT_MS ? { tone: "warn", verdict: "waiting long" } : { tone: "idle", verdict: "waiting" };
  switch (run.conclusion) {
    case "failure": case "timed_out": case "startup_failure": return { tone: "danger", verdict: run.conclusion.replace(/_/g, " ") };
    case "action_required": return { tone: "human", verdict: "needs approval" };
    case "cancelled": return { tone: "idle", verdict: "cancelled" };
    case "skipped": return { tone: "idle", verdict: "skipped" };
    default: return { tone: "idle", verdict: run.conclusion ?? "done" };
  }
}

/** GitHub names each hosted VM once ("GitHub Actions 1000001131"); they share one lane. */
export const runnerName = (r: string) => (/^GitHub Actions \d+$/.test(r) ? "GitHub-hosted" : r);

/** Job bars per runner, busiest runner first. */
export function lanes(timed: Timed[], now: number) {
  const m = new Map<string, { job: CiJob; t: Timed; start: number; end: number }[]>();
  for (const t of timed) for (const job of t.run.jobs) {
    if (!ran(job)) continue;
    const start = ms(job.startedAt);
    const end = job.completedAt ? ms(job.completedAt) : now;
    const name = runnerName(job.runner!);
    const lane = m.get(name) ?? [];
    lane.push({ job, t, start, end: Math.max(end, start) });
    m.set(name, lane);
  }
  return [...m.entries()].map(([runner, bars]) => ({ runner, bars })).sort((a, b) => b.bars.length - a.bars.length);
}

/** Total time covered by spans, overlaps merged. */
function union(spans: { start: number; end: number }[]) {
  const xs = spans.filter((s) => s.end > s.start).sort((a, b) => a.start - b.start);
  let total = 0, cur: [number, number] | null = null;
  for (const { start: a, end: b } of xs) {
    if (!cur || a > cur[1]) { if (cur) total += cur[1] - cur[0]; cur = [a, b]; } else cur[1] = Math.max(cur[1], b);
  }
  return cur ? total + cur[1] - cur[0] : total;
}

/** Share of [from, to] a lane spent running jobs. */
export function busy(bars: { start: number; end: number }[], from: number, to: number) {
  return union(bars.map((b) => ({ start: Math.max(from, b.start), end: Math.min(to, b.end) }))) / Math.max(1, to - from);
}

/** When any runner last started or finished a job: a queue with no motion since then is a stall, not a backlog. */
export function lastMotion(timed: Timed[]) {
  let at = -Infinity;
  for (const t of timed) for (const j of t.run.jobs) {
    if (!ran(j)) continue;
    at = Math.max(at, ms(j.startedAt), j.completedAt ? ms(j.completedAt) : -Infinity);
  }
  return at;
}

/** Work is waiting, nothing is running, and no runner has moved for a while: the runner is likely down. */
export function stalled(timed: Timed[], now: number) {
  const waiting = timed.filter((t) => t.phase === "waiting");
  if (!waiting.length || timed.some((t) => t.phase === "running")) return null;
  const quiet = now - lastMotion(timed);
  return quiet > 10 * 60_000 ? { waiting: waiting.length, quiet } : null;
}

/** Queue depth as steps: [time, depth] after each change. */
export function depth(timed: Timed[]) {
  const ev: [number, number][] = [];
  for (const t of timed) {
    ev.push([t.queuedAt, 1]);
    const out = Number.isFinite(t.startedAt) ? t.startedAt : Number.isFinite(t.endedAt) ? t.endedAt : NaN;
    if (Number.isFinite(out)) ev.push([out, -1]);
  }
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let d = 0;
  return ev.map(([at, k]) => [at, (d += k)] as [number, number]);
}

/** Per trunk branch, each workflow's latest push run that reached a verdict. Red if any of them failed. */
export function trunkHealth(timed: Timed[]) {
  const latest = new Map<string, Timed>();
  for (const t of timed) {
    const r = t.run;
    if (!TRUNKS.includes(r.branch) || r.event !== "push" || t.phase !== "done" || ["cancelled", "skipped"].includes(r.conclusion ?? "")) continue;
    const k = `${r.branch}:${r.workflow}`;
    const had = latest.get(k);
    if (!had || had.queuedAt < t.queuedAt) latest.set(k, t);
  }
  const by = new Map<string, Timed[]>();
  for (const t of latest.values()) by.set(t.run.branch, [...(by.get(t.run.branch) ?? []), t]);
  return [...by.entries()]
    .map(([branch, runs]) => ({ branch, runs, red: runs.filter((t) => t.tone === "danger") }))
    .sort((a, b) => TRUNKS.indexOf(a.branch) - TRUNKS.indexOf(b.branch));
}

/** The latest run per feature branch, red first, then most recent. */
export function branches(timed: Timed[]) {
  const latest = new Map<string, Timed>();
  for (const t of timed) {
    if (TRUNKS.includes(t.run.branch) || t.run.event === "schedule") continue;
    const had = latest.get(t.run.branch);
    if (!had || had.queuedAt < t.queuedAt) latest.set(t.run.branch, t);
  }
  const rank = (t: Timed) => (t.tone === "danger" ? 0 : t.phase !== "done" ? 1 : 2);
  return [...latest.values()].sort((a, b) => rank(a) - rank(b) || b.queuedAt - a.queuedAt);
}

export function workflowStats(snap: CiSnapshot, timed: Timed[]) {
  return snap.workflows
    .map((w) => {
      const runs = timed.filter((t) => t.run.workflowId === w.id);
      const done = runs.filter((t) => t.phase === "done");
      const verdicts = done.filter((t) => !["cancelled", "skipped"].includes(t.run.conclusion ?? ""));
      const failed = verdicts.filter((t) => t.tone === "danger").length;
      const last = runs.reduce<Timed | null>((a, t) => (!a || t.queuedAt > a.queuedAt ? t : a), null);
      return {
        id: w.id, name: w.name, path: w.path, runs: runs.length, failed, cancelled: done.length - verdicts.length,
        failRate: verdicts.length ? failed / verdicts.length : NaN,
        wait: median(runs.filter((t) => Number.isFinite(t.startedAt)).map((t) => t.wait)),
        ran: median(done.map((t) => t.ran)),
        last,
      };
    })
    .filter((w) => w.runs > 0)
    .sort((a, b) => b.runs - a.runs);
}

export const conclusionWord = (t: Timed) => (t.phase === "done" ? t.verdict : t.phase === "running" ? "running" : "waiting");

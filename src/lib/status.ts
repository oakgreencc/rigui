// One vocabulary for "how is this doing", shared by the map, lists and drawers.
// Tone maps to tokens: ok→accent, warn, danger, human, idle. The reason is what the UI says out loud.
import type { MissionStep, Pod, RigTopology, Seat } from "../api/types";
import { isHuman, minutesSince } from "./format";

export type Tone = "ok" | "warn" | "danger" | "human" | "idle";
export interface Status { tone: Tone; reason: string; nobody?: boolean }

const PARKED_MIN = 30;

export function seatStatus(s: Seat): Status {
  if (isHuman(s.canonicalSessionName)) return { tone: "human", reason: "your seat" };
  const holding = s.inProgressWorkCount + s.blockedWorkCount;
  if (s.session === "exited" || s.session === "absent") {
    return holding ? { tone: "danger", reason: `exited holding ${holding}`, nobody: true } : { tone: "idle", reason: "no session" };
  }
  if (s.startupStatus === "failed") return { tone: "danger", reason: "startup failed" };
  if (s.startupStatus === "attention_required") return { tone: "warn", reason: "startup needs attention" };
  if (s.blockedWorkCount && s.activityDisplay.includes("you")) return { tone: "human", reason: "blocked on you" };
  if (s.needsInput) return { tone: "warn", reason: "needs input" };
  const idle = minutesSince(s.lastActivityAt) ?? 0;
  if (s.activity === "idle-at-prompt" && holding && idle >= PARKED_MIN) return { tone: "warn", reason: `parked · idle ${Math.floor(idle)}m` };
  if (s.activity === "working") return { tone: "ok", reason: s.nodeKind === "infrastructure" ? "output flowing" : "working" };
  return { tone: "idle", reason: s.activityDisplay || "idle" };
}

const RANK: Record<Tone, number> = { danger: 4, human: 3, warn: 2, ok: 1, idle: 0 };
export const worst = (xs: Status[]): Status => xs.reduce((a, b) => (RANK[b.tone] > RANK[a.tone] ? b : a), { tone: "idle", reason: "quiet" } as Status);

export function podStatus(p: Pod, seats: Seat[]): Status & { working: number; total: number } {
  const mine = seats.filter((s) => s.podId === p.id);
  const st = mine.map(seatStatus);
  const working = st.filter((x) => x.tone === "ok").length;
  const w = worst(st);
  const reason = w.tone === "danger" || w.tone === "warn" || w.tone === "human"
    ? `${mine[st.indexOf(w)]?.role ?? ""} ${w.reason}`.trim()
    : working ? `${working} working` : "quiet";
  return { ...w, reason, working, total: mine.length };
}

export function stepStatus(step: MissionStep, topo: RigTopology | undefined): Status {
  const owner = step.ownerSession;
  const seat = topo?.seats.find((s) => s.canonicalSessionName === owner);
  if (step.state === "failed" || (step.packetQitemId && !owner)) return { tone: "danger", reason: owner ? "failed" : "nobody holds it", nobody: !owner };
  if (step.state === "done") return { tone: "idle", reason: "done" };
  if (step.state === "pending") return { tone: "idle", reason: isHuman(owner) ? "yours, after the steps before it" : "not yet" };
  if (isHuman(owner)) return { tone: "human", reason: "yours now" };
  if (seat) { const s = seatStatus(seat); if (s.tone !== "ok") return s; }
  if (step.state === "waiting") return { tone: "warn", reason: "waiting" };
  return { tone: "ok", reason: "in progress" };
}

export const TONE_VAR: Record<Tone, string> = { ok: "var(--accent)", warn: "var(--warn)", danger: "var(--danger)", human: "var(--human)", idle: "var(--idle)" };
export const TONE_LABEL: Record<Tone, string> = { ok: "moving", warn: "needs a look", danger: "stalled", human: "on you", idle: "quiet" };

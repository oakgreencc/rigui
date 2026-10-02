// Sample data. Shapes match the daemon; every name, id, count and line here is synthetic.
// Pods and members follow OpenRig's demo/rig.yaml; the mission follows its release-train naming.
import type {
  AttentionDetail, AttentionRead, HealthFinding, Healthz, HostEntry, MissionMap, Project, PsEntry,
  QueueItem, QueueRates, QueueTransition, RigTopology, Seat, SpecEntry, TerminalView, WatchdogHistoryEntry, WatchdogJob,
} from "./types";

const now = Date.now();
export const ago = (min: number) => new Date(now - min * 60_000).toISOString();

const seat = (s: Partial<Seat> & Pick<Seat, "logicalId" | "podId" | "role" | "runtime">): Seat => ({
  canonicalSessionName: `${s.logicalId.replace(".", "-")}@demo-rig`,
  model: null,
  nodeKind: "agent",
  session: "present",
  activity: "working",
  activityDisplay: "working",
  needsInput: 0,
  startupStatus: "ready",
  contextUsedPercentage: null,
  lastActivityAt: ago(1),
  pendingWorkCount: 0,
  inProgressWorkCount: 0,
  blockedWorkCount: 0,
  heldReason: null,
  currentQitems: [],
  tmuxAttachCommand: `tmux attach -t ${s.logicalId.replace(".", "-")}@demo-rig`,
  ...s,
});

export const topology: RigTopology = {
  rigId: "01JRIG0DEMO",
  name: "demo-rig",
  lifecycleState: "attention_required",
  pods: [
    { id: "pod-orch", namespace: "orch", label: "Orchestration", summary: "Plans the release and routes work.", continuity: "healthy" },
    { id: "pod-dev", namespace: "dev", label: "Development", summary: "Builds and tests slices.", continuity: "healthy" },
    { id: "pod-rev", namespace: "rev", label: "Review", summary: "Adversarial pair review.", continuity: "degraded" },
    { id: "pod-infra", namespace: "infra", label: "Infrastructure", summary: "Long-running terminals.", continuity: "healthy" },
  ],
  seats: [
    seat({ logicalId: "orch.lead", podId: "pod-orch", role: "lead", runtime: "claude-code", model: "opus-5.5", contextUsedPercentage: 64,
      inProgressWorkCount: 1, pendingWorkCount: 2, currentQitems: [{ qitemId: "qitem-20260930101200-a1b2c3d4", bodyExcerpt: "fold receipt for 0.5.2 cut" }] }),
    seat({ logicalId: "dev.impl", podId: "pod-dev", role: "impl", runtime: "claude-code", model: "sonnet-5.5", contextUsedPercentage: 41,
      inProgressWorkCount: 1, pendingWorkCount: 3, currentQitems: [{ qitemId: "qitem-20260930113005-5e6f7a8b", bodyExcerpt: "gateway-m1: land migration 090" }] }),
    seat({ logicalId: "dev.qa", podId: "pod-dev", role: "qa", runtime: "codex", model: "gpt-5.6", activity: "idle-at-prompt", activityDisplay: "idle · blocked on you",
      contextUsedPercentage: 28, lastActivityAt: ago(38), blockedWorkCount: 1, currentQitems: [{ qitemId: "qitem-20260930093011-0c9d8e7f", bodyExcerpt: "sign-off: crash-cart restore test plan" }] }),
    seat({ logicalId: "dev.design", podId: "pod-dev", role: "design", runtime: "claude-code", model: "sonnet-5.5", activity: "idle-at-prompt", activityDisplay: "parked · idle 47m",
      contextUsedPercentage: 19, lastActivityAt: ago(47), inProgressWorkCount: 1, currentQitems: [{ qitemId: "qitem-20260930104400-77aa11bb", bodyExcerpt: "pulse-view empty states" }] }),
    seat({ logicalId: "rev.r1", podId: "pod-rev", role: "reviewer", runtime: "claude-code", model: "opus-5.5", activity: "idle-at-prompt", activityDisplay: "needs input · permission prompt",
      needsInput: 1, contextUsedPercentage: 72, lastActivityAt: ago(12), pendingWorkCount: 1 }),
    seat({ logicalId: "rev.r2", podId: "pod-rev", role: "reviewer", runtime: "codex", model: "gpt-5.6", session: "exited", activity: "unknown", activityDisplay: "session exited",
      startupStatus: "attention_required", contextUsedPercentage: null, lastActivityAt: ago(131), inProgressWorkCount: 1,
      currentQitems: [{ qitemId: "qitem-20260930090455-de4d0000", bodyExcerpt: "review: routing-pixels diff" }] }),
    seat({ logicalId: "infra.daemon", podId: "pod-infra", role: "daemon", runtime: "terminal", nodeKind: "infrastructure", activityDisplay: "output 2m ago", lastActivityAt: ago(2) }),
    seat({ logicalId: "infra.ui", podId: "pod-infra", role: "ui", runtime: "terminal", nodeKind: "infrastructure", activity: "idle-at-prompt", activityDisplay: "quiet", lastActivityAt: ago(26) }),
  ],
  edges: [
    { id: "e1", sourceId: "orch.lead", targetId: "dev.impl", kind: "delegates_to" },
    { id: "e2", sourceId: "orch.lead", targetId: "dev.design", kind: "delegates_to" },
    { id: "e3", sourceId: "dev.qa", targetId: "dev.impl", kind: "can_observe" },
    { id: "e4", sourceId: "rev.r1", targetId: "rev.r2", kind: "collaborates_with" },
    { id: "e5", sourceId: "rev.r2", targetId: "orch.lead", kind: "escalates_to" },
  ],
  flows: [
    { from: "orch.lead", to: "dev.impl", count: 9 },
    { from: "dev.impl", to: "dev.qa", count: 5 },
    { from: "dev.qa", to: "rev.r1", count: 3 },
    { from: "dev.impl", to: "rev.r2", count: 2 },
    { from: "rev.r1", to: "orch.lead", count: 4 },
    { from: "orch.lead", to: "dev.design", count: 2 },
  ],
};

export const ps: PsEntry[] = [
  { rigId: "01JRIG0DEMO", name: "demo-rig", nodeCount: 8, runningCount: 7, activeCount: 2, hasWorkCount: 6, status: "partial",
    lifecycleState: "attention_required", uptime: "6h 12m", latestSnapshot: ago(4), attentionCount: 5 },
  { rigId: "01JRIG0RSCH", name: "research", nodeCount: 3, runningCount: 0, activeCount: 0, hasWorkCount: 0, status: "stopped",
    lifecycleState: "recoverable", uptime: null, latestSnapshot: ago(60 * 20), attentionCount: 0 },
];

export const healthz: Healthz = {
  status: "ok", pid: 48211, semver: "0.5.14", selfHostId: "studio", uptimeSeconds: 6 * 3600 + 12 * 60,
  eventLoop: { lagMeanMs: 10.8, lagP99Ms: 11.6, utilization: 0.03, healthy: true },
  bind: { mode: "default", hosts: ["127.0.0.1", "100.64.1.7"], tailscaleDetected: true },
  stuckSweep: { lastSweepAt: ago(3), lastOutcome: "findings", lastError: null, consecutiveFailures: 0, findingsRouted: 1 },
  wakeLadder: { lastTickAt: ago(1), lastOutcome: "retrying", activeLadders: 1, escalationsOpen: 0, exhaustedTotal: 0 },
};

export const mission: MissionMap = {
  missionId: "release-0.5.2",
  title: "Release 0.5.2",
  workflow: { name: "release-train", version: "3", instanceId: "wf-01JWF052", status: "active" },
  steps: [
    { id: "intake", role: "lead", objective: "Collect slices for the cut", state: "done", ownerSession: "orch-lead@demo-rig", packetQitemId: null, since: ago(60 * 30), next: ["plan"] },
    { id: "plan", role: "lead", objective: "Lock scope and order slices", state: "done", ownerSession: "orch-lead@demo-rig", packetQitemId: null, since: ago(60 * 22), next: ["build"] },
    { id: "build", role: "impl", objective: "Land each slice behind its proof", state: "active", ownerSession: "dev-impl@demo-rig", packetQitemId: "qitem-20260930113005-5e6f7a8b", since: ago(95), next: ["test"] },
    { id: "test", role: "qa", objective: "Run scenario suite, get sign-off", state: "waiting", ownerSession: "dev-qa@demo-rig", packetQitemId: "qitem-20260930093011-0c9d8e7f", since: ago(38), next: ["review"] },
    { id: "review", role: "reviewer", objective: "Two-seat adversarial review", state: "failed", ownerSession: null, packetQitemId: "qitem-20260930090455-de4d0000", since: ago(131), next: ["verify"] },
    { id: "verify", role: "human", objective: "Human verifies the proof packet", state: "pending", ownerSession: "human@kernel", packetQitemId: null, since: null, next: ["ship"] },
    { id: "ship", role: "lead", objective: "Tag, publish, fold receipt", state: "pending", ownerSession: "orch-lead@demo-rig", packetQitemId: null, since: null, next: [] },
  ],
};

const q = (x: Partial<QueueItem> & Pick<QueueItem, "qitemId" | "sourceSession" | "destinationSession" | "state" | "body">): QueueItem => ({
  tsCreated: ago(60), tsUpdated: ago(10), priority: "routine", tier: null, tags: ["mission:release-0.5.2"], blockedOn: null, summary: null,
  humanIntent: "decision", humanDetail: null, closureReason: null, closureRequiredAt: null, handedOffTo: null, ...x,
});

export const queue: QueueItem[] = [
  q({ qitemId: "qitem-20260930141502-9c1e4a7b", sourceSession: "dev-impl@demo-rig", destinationSession: "human@kernel", state: "pending", priority: "urgent", tier: "human-gate",
    tsCreated: ago(22), summary: "Approve schema migration 090 before merge",
    body: "Migration 090 adds a NOT NULL `closure_required_at` default to queue_items and backfills 41k rows. It is reversible (down migration included) and runs in 3.2s on a copy of the production database. The build step is parked on this approval.",
    tags: ["mission:release-0.5.2", "slice:OPR.0.5.2.9"] }),
  q({ qitemId: "qitem-20260930093011-0c9d8e7f", sourceSession: "dev-qa@demo-rig", destinationSession: "dev-qa@demo-rig", state: "blocked", blockedOn: "human@kernel", tsCreated: ago(38),
    summary: "Sign off the crash-cart restore test plan",
    body: "QA wrote a 14-scenario plan for whole-fleet restore. Two scenarios need a decision before the suite runs.",
    humanDetail: "Q1|Should the suite restore against a live daemon or a cold one?|Cold daemon, from a snapshot taken for the run*|Live daemon, with seats stopped first\nQ2|What happens when one seat fails to restore?|Report partial and continue the rest*|Abort the whole restore",
    tags: ["mission:release-0.5.2", "slice:OPR.0.5.2.5"] }),
  q({ qitemId: "qitem-20260930120040-hostpair", sourceSession: "daemon@kernel", destinationSession: "human@kernel", state: "pending", tier: "human-gate", tsCreated: ago(64),
    summary: "Pair host vps-fra1 and release its bearer token",
    body: "vps-fra1 (100.88.12.4 over Tailscale) asked to pair. Approving writes it to hosts.yaml and releases the bearer token it will use for reads.", tags: ["cross-host", "from-host:vps-fra1"] }),
  q({ qitemId: "qitem-20260930115500-scope0c2", sourceSession: "orch-lead@demo-rig", destinationSession: "orch-lead@demo-rig", state: "blocked", blockedOn: "human@kernel", tsCreated: ago(9 * 60),
    summary: "Drop docs-refresh from the 0.5.2 cut?",
    body: "docs-refresh (OPR.0.5.2.8) is still a draft with 0/3 proofs. Holding the cut for it adds about two days. The lead suggests moving it to 0.5.3.",
    tags: ["mission:release-0.5.2", "slice:OPR.0.5.2.8"] }),
  q({ qitemId: "qitem-20260930090455-de4d0000", sourceSession: "dev-impl@demo-rig", destinationSession: "rev-r2@demo-rig", state: "in-progress", tsCreated: ago(150),
    summary: "review: routing-pixels diff", body: "Adversarial review of routing-pixels (+418 −96).", closureRequiredAt: ago(40), tags: ["mission:release-0.5.2", "slice:OPR.0.5.2.7"] }),
  q({ qitemId: "qitem-20260930113005-5e6f7a8b", sourceSession: "orch-lead@demo-rig", destinationSession: "dev-impl@demo-rig", state: "in-progress", tsCreated: ago(95),
    summary: "gateway-m1: land migration 090", body: "Implement slice gateway-m1 against spec lock." }),
  q({ qitemId: "qitem-20260930104400-77aa11bb", sourceSession: "orch-lead@demo-rig", destinationSession: "dev-design@demo-rig", state: "in-progress", tsCreated: ago(70),
    summary: "pulse-view empty states", body: "Design empty and setup states for the pulse view." }),
];

// Backlog stock: routine work spread over the seats, so the ring has something to weigh.
const STOCK: [string, QueueItem["state"], number, string][] = [
  ["dev-impl@demo-rig", "pending", 5, "slice"], ["dev-qa@demo-rig", "pending", 4, "scenario"], ["dev-design@demo-rig", "pending", 2, "screen"],
  ["rev-r1@demo-rig", "pending", 3, "review"], ["rev-r2@demo-rig", "pending", 2, "review"], ["orch-lead@demo-rig", "pending", 2, "plan"],
  ["dev-qa@demo-rig", "in-progress", 1, "scenario"], ["rev-r1@demo-rig", "in-progress", 1, "review"],
  ["dev-impl@demo-rig", "blocked", 2, "slice"], ["rev-r1@demo-rig", "blocked", 1, "review"],
];
let n = 0;
for (const [dest, state, count, what] of STOCK) {
  for (let i = 0; i < count; i++) {
    n++;
    queue.push(q({
      qitemId: `qitem-2026093008${String(n).padStart(4, "0")}-${(0x1000 + n * 977).toString(16).slice(-8).padStart(8, "0")}`,
      sourceSession: "orch-lead@demo-rig", destinationSession: dest, state, tsCreated: ago(60 * (3 + n * 5)),
      summary: `${what} ${n}`, body: `${what} ${n}`, blockedOn: state === "blocked" ? "qitem-20260930090455-de4d0000" : null,
      closureRequiredAt: state === "in-progress" ? ago(-60) : null,
    }));
  }
}

export const attention: AttentionRead = {
  readAt: new Date(now).toISOString(),
  sources: [
    { source: "queue", state: "available", detail: null },
    { source: "proof", state: "available", detail: null },
    { source: "mission-outcomes", state: "available", detail: null },
    { source: "health", state: "available", detail: null },
  ],
  items: [
    { id: "health:f-seat-exited-r2", kind: "update", summary: "rev-r2 exited holding a review that is 40m overdue", unblocks: "review step of release-0.5.2", urgency: "critical", at: ago(131), scope: "seat rev-r2@demo-rig", source: "/api/health" },
    { id: "queue:qitem-20260930141502-9c1e4a7b", kind: "action", summary: "Approve schema migration 090 before merge", unblocks: "dev-impl: land migration 090", urgency: "urgent", at: ago(22), scope: "mission release-0.5.2 · slice gateway-m1", recipient: "human@kernel", source: "/api/queue/qitem-20260930141502-9c1e4a7b" },
    { id: "queue:qitem-20260930093011-0c9d8e7f", kind: "action", summary: "Sign off the crash-cart restore test plan", unblocks: "dev-qa: run the restore suite", urgency: "routine", at: ago(38), scope: "mission release-0.5.2 · slice crash-cart", recipient: "human@kernel", source: "/api/queue/qitem-20260930093011-0c9d8e7f" },
    { id: "queue:qitem-20260930115500-scope0c2", kind: "action", summary: "Drop docs-refresh from the 0.5.2 cut?", unblocks: "orch-lead: freeze the cut", urgency: "routine", at: ago(9 * 60), scope: "mission release-0.5.2", recipient: "human@kernel", source: "/api/queue/qitem-20260930115500-scope0c2" },
    { id: "queue:qitem-20260930120040-hostpair", kind: "action", summary: "Pair host vps-fra1 and release its bearer token", unblocks: "cross-host reads from vps-fra1", urgency: "routine", at: ago(64), scope: "fleet", recipient: "human@kernel", source: "/api/queue/qitem-20260930120040-hostpair" },
    { id: "health:f-parked-design", kind: "update", summary: "dev-design is parked: idle 47m while holding 1 item", unblocks: null, urgency: "warning", at: ago(47), scope: "seat dev-design@demo-rig", source: "/api/activity/parked" },
    { id: "proof:openrig:release-0.5.2/crash-cart:all", kind: "update", summary: "crash-cart proof passed 4 of 4", unblocks: null, urgency: "outcome", at: ago(180), scope: "slice OPR.0.5.2.5", source: "missions/release-0.5.2/slices/crash-cart/proof" },
  ],
};

const transitions: Record<string, QueueTransition[]> = {
  "qitem-20260930141502-9c1e4a7b": [
    { ts: ago(22), state: "pending", note: "created by dev-impl · tier human-gate", actor: "dev-impl@demo-rig" },
  ],
  "qitem-20260930093011-0c9d8e7f": [
    { ts: ago(52), state: "pending", note: "created", actor: "dev-qa@demo-rig" },
    { ts: ago(50), state: "in-progress", note: "claimed", actor: "dev-qa@demo-rig" },
    { ts: ago(38), state: "blocked", note: "blocked on human@kernel: two plan decisions", actor: "dev-qa@demo-rig" },
  ],
  "qitem-20260930115500-scope0c2": [
    { ts: ago(9 * 60 + 5), state: "in-progress", note: "claimed", actor: "orch-lead@demo-rig" },
    { ts: ago(9 * 60), state: "blocked", note: "blocked on human@kernel: scope call", actor: "orch-lead@demo-rig" },
  ],
  "qitem-20260930120040-hostpair": [{ ts: ago(64), state: "pending", note: "pair request from vps-fra1", actor: "daemon@kernel" }],
};

export function attentionDetail(id: string): AttentionDetail | null {
  const item = attention.items.find((i) => i.id === id);
  if (!item) return null;
  const qid = id.startsWith("queue:") ? id.slice(6) : null;
  const qitem = qid ? queue.find((x) => x.qitemId === qid) ?? null : null;
  const questions = qitem?.humanDetail
    ? qitem.humanDetail.split("\n").map((row) => {
        const [qn = "", text = "", ...opts] = row.split("|");
        return { id: qn, text, options: opts.map((o) => ({ label: o.replace(/\*$/, ""), recommended: o.endsWith("*") })) };
      })
    : undefined;
  const lines: string[] = [];
  if (id === "health:f-seat-exited-r2") {
    lines.push("rev-r2@demo-rig session exited 2h 11m ago (codex, exit 137).", "It holds qitem-20260930090455-de4d0000 in progress; closure was due 40m ago.", "No other reviewer seat is assigned to the review step.");
  }
  if (id === "health:f-parked-design") lines.push("Last output 47m ago; prompt idle; 1 item in progress (pulse-view empty states).", "Threshold: 30m idle while holding work.");
  if (id.startsWith("proof:")) lines.push("4 of 4 proof items judged pass by rev-r1@demo-rig.", "Slice is ready to freeze.");
  return { item, qitem, transitions: (qid && transitions[qid]) || [], lines, questions };
}

export const rates: QueueRates = {
  weekOf: ["07-14", "07-21", "07-28", "08-04", "08-11", "08-18", "08-25", "09-01", "09-08", "09-15", "09-22", "09-29"],
  created: [18, 22, 19, 25, 31, 28, 24, 30, 34, 29, 33, 21],
  claimed: [17, 21, 20, 23, 29, 27, 25, 28, 30, 27, 28, 17],
  closed: [12, 15, 16, 18, 22, 21, 20, 22, 23, 19, 20, 11],
  handedOff: [5, 6, 4, 6, 7, 6, 5, 7, 8, 7, 7, 5],
};

export const projects: Project[] = [
  {
    id: "openrig", name: "openrig", root: "~/work/openrig",
    missions: [
      {
        id: "release-0.5.2", projectId: "openrig", title: "Release 0.5.2", status: "building", workflow: { name: "release-train", version: "3" },
        slices: [
          { name: "gateway-m1", id: "OPR.0.5.2.9", missionId: "release-0.5.2", displayName: "Gateway milestone 1", status: "active", description: "Slack gateway: human seats as @external routes.", qitemCount: 6, proof: { passed: 2, total: 9 }, lastActivityAt: ago(4), needsYou: 1 },
          { name: "routing-pixels", id: "OPR.0.5.2.7", missionId: "release-0.5.2", displayName: "Routing pixels", status: "blocked", description: "Handoff edges animate queue movement in the map.", qitemCount: 4, proof: { passed: 3, total: 5 }, lastActivityAt: ago(131), needsYou: 0 },
          { name: "crash-cart", id: "OPR.0.5.2.5", missionId: "release-0.5.2", displayName: "Crash cart", status: "active", description: "Whole-fleet restore when the daemon was down.", qitemCount: 3, proof: { passed: 4, total: 4 }, lastActivityAt: ago(38), needsYou: 1 },
          { name: "pulse-view", id: "OPR.0.5.2.4", missionId: "release-0.5.2", displayName: "Pulse view", status: "active", description: "Lanes: needs you, blocked, parked, now, up next, finished.", qitemCount: 5, proof: { passed: 1, total: 6 }, lastActivityAt: ago(47), needsYou: 0 },
          { name: "docs-refresh", id: "OPR.0.5.2.8", missionId: "release-0.5.2", displayName: "Docs refresh", status: "draft", description: "Getting-started and coordination docs for 0.5.", qitemCount: 1, proof: { passed: 0, total: 3 }, lastActivityAt: ago(60 * 26), needsYou: 1 },
        ],
      },
      {
        id: "release-0.5.1", projectId: "openrig", title: "Release 0.5.1", status: "shipped", workflow: { name: "release-train", version: "3" },
        slices: [
          { name: "queue-closure", id: "OPR.0.5.1.3", missionId: "release-0.5.1", displayName: "Hot-potato closure", status: "done", description: "Queue items cannot close without a reason.", qitemCount: 7, proof: { passed: 5, total: 5 }, lastActivityAt: ago(60 * 24 * 6), needsYou: 0 },
          { name: "wake-ladder", id: "OPR.0.5.1.4", missionId: "release-0.5.1", displayName: "Wake ladder", status: "done", description: "Failed wakes retry, then escalate.", qitemCount: 4, proof: { passed: 3, total: 3 }, lastActivityAt: ago(60 * 24 * 7), needsYou: 0 },
        ],
      },
    ],
  },
];

export const specs: SpecEntry[] = [
  {
    name: "demo-rig", version: "1", kind: "rig", purpose: "Orchestrator, three developers, a review pair and two terminals.", sourcePath: "demo/rig.yaml", isBuiltIn: false,
    pods: [
      { namespace: "orch", label: "Orchestration", members: [{ id: "lead", runtime: "claude-code" }] },
      { namespace: "dev", label: "Development", members: [{ id: "impl", runtime: "claude-code" }, { id: "qa", runtime: "codex" }, { id: "design", runtime: "claude-code" }] },
      { namespace: "rev", label: "Review", members: [{ id: "r1", runtime: "claude-code" }, { id: "r2", runtime: "codex" }] },
      { namespace: "infra", label: "Infrastructure", members: [{ id: "daemon", runtime: "terminal" }, { id: "ui", runtime: "terminal" }] },
    ],
    yaml: `version: "0.2"
name: demo-rig
summary: Orchestrator, developers, a review pair and two terminals.
pods:
  - id: orch
    label: Orchestration
    members:
      - id: lead
        agent_ref: local:agents/lead
        runtime: claude-code
  - id: dev
    label: Development
    members:
      - { id: impl,   agent_ref: local:agents/impl,   runtime: claude-code }
      - { id: qa,     agent_ref: local:agents/qa,     runtime: codex }
      - { id: design, agent_ref: local:agents/design, runtime: claude-code }
    edges:
      - { kind: can_observe, from: qa, to: impl }
  - id: rev
    label: Review
    members:
      - { id: r1, agent_ref: local:agents/reviewer, runtime: claude-code }
      - { id: r2, agent_ref: local:agents/reviewer, runtime: codex }
    edges:
      - { kind: collaborates_with, from: r1, to: r2 }
  - id: infra
    label: Infrastructure
    members:
      - { id: daemon, agent_ref: builtin:terminal, runtime: terminal }
      - { id: ui,     agent_ref: builtin:terminal, runtime: terminal }
edges:
  - { kind: delegates_to, from: orch.lead, to: dev.impl }
`,
  },
  {
    name: "conveyor", version: "1", kind: "rig", purpose: "Four pods in a line: intake, plan, build, review.", sourcePath: "builtin:starters/conveyor", isBuiltIn: true,
    pods: [
      { namespace: "intake", label: "Intake", members: [{ id: "triage", runtime: "claude-code" }] },
      { namespace: "plan", label: "Plan", members: [{ id: "planner", runtime: "claude-code" }] },
      { namespace: "build", label: "Build", members: [{ id: "builder", runtime: "codex" }] },
      { namespace: "review", label: "Review", members: [{ id: "reviewer", runtime: "codex" }] },
    ],
    yaml: `version: "0.2"
name: conveyor
summary: A visible handoff path, one seat per stage.
pods:
  - { id: intake, members: [{ id: triage,   runtime: claude-code }] }
  - { id: plan,   members: [{ id: planner,  runtime: claude-code }] }
  - { id: build,  members: [{ id: builder,  runtime: codex }] }
  - { id: review, members: [{ id: reviewer, runtime: codex }] }
edges:
  - { kind: delegates_to, from: intake.triage, to: plan.planner }
  - { kind: delegates_to, from: plan.planner,  to: build.builder }
  - { kind: delegates_to, from: build.builder, to: review.reviewer }
`,
  },
  {
    name: "first-project", version: "1", kind: "rig", purpose: "One pod, two Codex seats. The first run.", sourcePath: "builtin:starters/first-project", isBuiltIn: true,
    pods: [{ namespace: "main", label: "Main", members: [{ id: "lead", runtime: "codex" }, { id: "dev", runtime: "codex" }] }],
    yaml: `version: "0.2"
name: first-project
pods:
  - id: main
    members:
      - { id: lead, runtime: codex }
      - { id: dev,  runtime: codex }
`,
  },
  {
    name: "reviewer", version: "4", kind: "agent", purpose: "Adversarial reviewer: reads the diff, argues, judges proof.", sourcePath: "agents/reviewer/agent.yaml", isBuiltIn: false,
    yaml: `name: reviewer
version: 4
runtime: claude-code
profile: review
resources:
  skills: [adversarial-review, proof-judge]
startup:
  context_packs: [review-rubric, repo-map]
lifecycle:
  restore_policy: resume_if_possible
  compaction: at 80%
`,
  },
  {
    name: "impl", version: "7", kind: "agent", purpose: "Implements one slice at a time against its spec lock.", sourcePath: "agents/impl/agent.yaml", isBuiltIn: false,
    yaml: `name: impl
version: 7
runtime: claude-code
profile: build
resources:
  skills: [tdd, slice-contract]
lifecycle:
  restore_policy: resume_if_possible
`,
  },
  {
    name: "release-train", version: "3", kind: "workflow", purpose: "Intake to ship for one release, with a human verify gate.", sourcePath: "workflows/release-train.yaml", isBuiltIn: false,
    steps: mission.steps.map((s) => ({ id: s.id, role: s.role })),
    yaml: `name: release-train
version: 3
steps:
  - { id: intake, actor_role: lead,     next_hop: plan }
  - { id: plan,   actor_role: lead,     next_hop: build }
  - { id: build,  actor_role: impl,     next_hop: test,   acceptance: proof }
  - { id: test,   actor_role: qa,       next_hop: review }
  - { id: review, actor_role: reviewer, next_hop: verify, re_present_after_seconds: 3600 }
  - { id: verify, actor_role: human,    next_hop: ship,   gate: human }
  - { id: ship,   actor_role: lead }
`,
  },
];

export const terminals: TerminalView[] = [
  { sessionName: "orch-lead@demo-rig", logicalId: "orch.lead", rigName: "demo-rig", runtime: "claude-code", activity: "working", lastOutputAt: ago(0.5), attachCommand: "tmux attach -t orch-lead@demo-rig",
    lines: ["⏺ Reading missions/release-0.5.2/README.md", "⏺ rig queue list --state pending --rig demo-rig --json", "  3 pending · 1 blocked on human@kernel", "⏺ Folding receipt for gateway-m1 (2/9 proofs)…", "  ✻ Thinking…"] },
  { sessionName: "dev-impl@demo-rig", logicalId: "dev.impl", rigName: "demo-rig", runtime: "claude-code", activity: "working", lastOutputAt: ago(0.2), attachCommand: "tmux attach -t dev-impl@demo-rig",
    lines: ["⏺ Update(packages/daemon/src/db/migrations/090_closure_default.ts)", "  ⎿  Added 38 lines", "⏺ Bash(npm test -- queue-repository)", "  ⎿  PASS  queue-repository.test.ts (41 tests)", "⏺ rig queue create --to human@kernel --tier human-gate …"] },
  { sessionName: "dev-qa@demo-rig", logicalId: "dev.qa", rigName: "demo-rig", runtime: "codex", activity: "idle-at-prompt", lastOutputAt: ago(38), attachCommand: "tmux attach -t dev-qa@demo-rig",
    lines: ["• Wrote test-plan/crash-cart.md (14 scenarios)", "• rig queue update qitem-…0c9d8e7f --state blocked --blocked-on human@kernel", "  Waiting for sign-off on Q1, Q2.", "", "› "] },
  { sessionName: "rev-r1@demo-rig", logicalId: "rev.r1", rigName: "demo-rig", runtime: "claude-code", activity: "idle-at-prompt", lastOutputAt: ago(12), attachCommand: "tmux attach -t rev-r1@demo-rig", needsInput: 1,
    lines: ["⏺ Bash(npm publish --dry-run)", "", "  Do you want to proceed?", "  ❯ 1. Yes", "    2. No, and tell Claude what to do differently"] },
  { sessionName: "rev-r2@demo-rig", logicalId: "rev.r2", rigName: "demo-rig", runtime: "codex", activity: "unknown", lastOutputAt: ago(131), attachCommand: "rig seat launch rev-r2@demo-rig",
    lines: ["• Reviewing routing-pixels (+418 −96)", "• Reading packages/ui/src/topology/HotPotatoEdge.tsx", "Killed: 9", "[exited 137]"] },
  { sessionName: "infra-daemon@demo-rig", logicalId: "infra.daemon", rigName: "demo-rig", runtime: "terminal", activity: "working", lastOutputAt: ago(2), attachCommand: "tmux attach -t infra-daemon@demo-rig",
    lines: ["[daemon] GET /api/rigs/01JRIG0DEMO/graph 200 84ms", "[daemon] stuck-sweep: 1 overdue (qitem-…de4d0000)", "[daemon] watchdog wd-keepalive fired → orch-lead@demo-rig", "[daemon] snapshot auto-periodic 01JSNAP… ok"] },
  { sessionName: "infra-ui@demo-rig", logicalId: "infra.ui", rigName: "demo-rig", runtime: "terminal", activity: "idle-at-prompt", lastOutputAt: ago(26), attachCommand: "tmux attach -t infra-ui@demo-rig",
    lines: ["  VITE v8.3.1  ready in 412 ms", "  ➜  Local:   http://localhost:5178/", "", "$ "] },
];

export const hosts: HostEntry[] = [
  { id: "local", transport: "http", target: "http://127.0.0.1:7433", selected: true, status: "reachable", notes: "this machine (studio)" },
  { id: "vps-fra1", transport: "http", target: "http://100.88.12.4:7433", selected: false, status: "unreachable", notes: "pairing pending" },
  { id: "mm2", transport: "ssh", target: "op@mm2.tail", selected: false, status: "reachable" },
];

export const findings: HealthFinding[] = [
  { id: "f-seat-exited-r2", detector: "seat-liveness", category: "process", scope: "seat rev-r2@demo-rig", severity: "critical", status: "active",
    summary: "Seat exited holding in-progress work", explanation: "rev-r2 exited (137) with qitem-…de4d0000 in progress. The stuck sweep marked it overdue 40m ago.", suggestedInspection: "rig seat launch rev-r2@demo-rig --reason \"exited holding review\"", startedAt: ago(131) },
  { id: "f-parked-design", detector: "parked-owner", category: "process", scope: "seat dev-design@demo-rig", severity: "warning", status: "active",
    summary: "Parked with open obligations", explanation: "Idle at prompt 47m while holding 1 in-progress item.", suggestedInspection: "rig send dev-design@demo-rig \"status on pulse-view empty states?\"", startedAt: ago(47) },
  { id: "f-context-r1", detector: "context-usage", category: "context", scope: "seat rev-r1@demo-rig", severity: "warning", status: "active",
    summary: "Context at 72%", explanation: "Compaction policy triggers at 80%.", suggestedInspection: null, startedAt: ago(15) },
  { id: "f-cli-drift", detector: "cli-drift", category: "governance", scope: "rig research", severity: "info", status: "cleared",
    summary: "CLI 0.5.12 on research rig", explanation: "Cleared after upgrade.", suggestedInspection: null, startedAt: ago(60 * 30) },
];

export const watchdogs: WatchdogJob[] = [
  { jobId: "wd-keepalive", policy: "workflow-keepalive", targetSession: "orch-lead@demo-rig", intervalSeconds: 900, lastEvaluationAt: ago(2), lastFireAt: ago(2), state: "active", terminalReason: null, registeredBySession: "orch-lead@demo-rig" },
  { jobId: "wd-context", policy: "context-usage-threshold", targetSession: "rev-r1@demo-rig", intervalSeconds: 300, lastEvaluationAt: ago(4), lastFireAt: null, state: "active", terminalReason: null, registeredBySession: "human@kernel" },
  { jobId: "wd-idle-gate", policy: "idle-gate-qitem", targetSession: "dev-design@demo-rig", intervalSeconds: 600, lastEvaluationAt: ago(6), lastFireAt: ago(6), state: "active", terminalReason: null, registeredBySession: "orch-lead@demo-rig" },
  { jobId: "wd-digest", policy: "delivery-digest-flush", targetSession: "human@kernel", intervalSeconds: 3600, lastEvaluationAt: ago(31), lastFireAt: ago(31), state: "active", terminalReason: null, registeredBySession: "daemon@kernel" },
  { jobId: "wd-remind-r2", policy: "periodic-reminder", targetSession: "rev-r2@demo-rig", intervalSeconds: 1800, lastEvaluationAt: ago(11), lastFireAt: ago(41), state: "active", terminalReason: null, registeredBySession: "orch-lead@demo-rig" },
  { jobId: "wd-pool-051", policy: "artifact-pool-ready", targetSession: "orch-lead@demo-rig", intervalSeconds: 600, lastEvaluationAt: ago(60 * 24 * 6), lastFireAt: ago(60 * 24 * 6), state: "terminal", terminalReason: "pool ready: 0.5.1 artifacts", registeredBySession: "orch-lead@demo-rig" },
];

export const watchdogHistory: WatchdogHistoryEntry[] = [
  { historyId: "h1", jobId: "wd-keepalive", evaluatedAt: ago(2), outcome: "sent", skipReason: null, deliveryTargetSession: "orch-lead@demo-rig", evaluationNotes: "frontier: build, test, review" },
  { historyId: "h2", jobId: "wd-context", evaluatedAt: ago(4), outcome: "skipped", skipReason: "below threshold (72% < 80%)", deliveryTargetSession: null, evaluationNotes: null },
  { historyId: "h3", jobId: "wd-idle-gate", evaluatedAt: ago(6), outcome: "sent", skipReason: null, deliveryTargetSession: "dev-design@demo-rig", evaluationNotes: "idle 41m holding 1" },
  { historyId: "h4", jobId: "wd-remind-r2", evaluatedAt: ago(11), outcome: "skipped", skipReason: "target session absent", deliveryTargetSession: null, evaluationNotes: "rev-r2 exited" },
  { historyId: "h5", jobId: "wd-keepalive", evaluatedAt: ago(17), outcome: "sent", skipReason: null, deliveryTargetSession: "orch-lead@demo-rig", evaluationNotes: null },
  { historyId: "h6", jobId: "wd-digest", evaluatedAt: ago(31), outcome: "sent", skipReason: null, deliveryTargetSession: "human@kernel", evaluationNotes: "3 updates" },
  { historyId: "h7", jobId: "wd-remind-r2", evaluatedAt: ago(41), outcome: "sent", skipReason: null, deliveryTargetSession: "rev-r2@demo-rig", evaluationNotes: "review overdue" },
];

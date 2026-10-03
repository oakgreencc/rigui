// OpenRig daemon shapes the console reads. Field names follow the daemon (docs/openrig-domain.md);
// only what the console renders is declared. Enums are verbatim.

export type RigLifecycleState = "running" | "recoverable" | "stopped" | "degraded" | "attention_required";
export type QueueState = "pending" | "in-progress" | "done" | "blocked" | "failed" | "denied" | "canceled" | "handed-off";
export type QueuePriority = "routine" | "urgent" | "critical";
export type ClosureReason = "handed_off_to" | "blocked_on" | "denied" | "canceled" | "no-follow-on" | "escalation";
export type Runtime = "claude-code" | "codex" | "pi" | "terminal" | (string & {});
export type Activity = "working" | "idle-at-prompt" | "unknown";
export type SessionPresence = "present" | "detached" | "exited" | "absent";
export type StartupStatus = "pending" | "ready" | "attention_required" | "failed";
export type EdgeKind = "delegates_to" | "spawned_by" | "can_observe" | "collaborates_with" | "escalates_to";
export type MissionControlVerb = "approve" | "deny" | "route" | "annotate" | "hold" | "drop" | "handoff" | "resolve";

/** GET /healthz */
export interface Healthz {
  status: "ok";
  pid: number;
  semver?: string;
  selfHostId?: string;
  commit?: string;
  builtAt?: string;
  /** Console-derived (the daemon reports rig uptime on /api/ps, not its own). */
  uptimeSeconds?: number;
  eventLoop?: { lagMeanMs: number; lagP99Ms: number; utilization: number; healthy: boolean };
  bind?: { mode: string; hosts: string[]; tailscaleDetected: boolean };
  stuckSweep?: { lastSweepAt: string | null; lastOutcome: string | null; lastError: string | null; consecutiveFailures: number; findingsRouted: number };
  wakeLadder?: { lastTickAt: string | null; lastOutcome: string | null; activeLadders: number; escalationsOpen: number; exhaustedTotal: number };
}

/** GET /api/ps */
export interface PsEntry {
  rigId: string;
  name: string;
  nodeCount: number;
  runningCount: number;
  activeCount: number;
  hasWorkCount: number;
  status: "running" | "partial" | "stopped";
  lifecycleState: RigLifecycleState;
  uptime: string | null;
  latestSnapshot: string | null;
  attentionCount: number;
}

/** A seat, as NodeInventoryEntry trims to for the console. */
export interface Seat {
  logicalId: string; // "dev.impl"
  podId: string;
  role: string;
  canonicalSessionName: string; // "dev-impl@demo-rig"
  runtime: Runtime;
  model: string | null;
  nodeKind: "agent" | "infrastructure";
  session: SessionPresence;
  activity: Activity;
  activityDisplay: string; // activityState.display — server-derived; never re-derive
  needsInput: number;
  startupStatus: StartupStatus;
  contextUsedPercentage: number | null;
  lastActivityAt: string | null;
  pendingWorkCount: number;
  inProgressWorkCount: number;
  blockedWorkCount: number;
  heldReason: string | null;
  currentQitems: { qitemId: string; bodyExcerpt: string }[];
  tmuxAttachCommand: string | null;
}

export interface Pod {
  id: string;
  namespace: string; // "dev"
  label: string; // "Development"
  summary: string | null;
  continuity: "healthy" | "degraded" | "restoring";
}

export interface Edge {
  id: string;
  sourceId: string; // logicalId
  targetId: string;
  kind: EdgeKind;
}

/** GET /api/rigs/:id/graph, normalized. */
export interface RigTopology {
  rigId: string;
  name: string;
  lifecycleState: RigLifecycleState;
  pods: Pod[];
  seats: Seat[];
  edges: Edge[];
  /** Recent handoffs between seats (from queue.handed_off events), used to draw flow. */
  flows: { from: string; to: string; count: number }[];
}

export interface QueueItem {
  qitemId: string;
  tsCreated: string;
  tsUpdated: string;
  sourceSession: string;
  destinationSession: string;
  state: QueueState;
  priority: QueuePriority;
  tier: string | null;
  tags: string[] | null;
  blockedOn: string | null;
  body: string;
  summary: string | null;
  humanIntent?: "decision" | "update" | null;
  humanDetail?: string | null;
  closureReason: ClosureReason | null;
  closureRequiredAt: string | null;
  handedOffTo: string | null;
}

export interface QueueTransition {
  ts: string;
  state: QueueState;
  note: string | null;
  actor: string;
}

/** GET /api/attention → items[] */
export interface AttentionItem {
  id: string; // "queue:<qitemId>" | "proof:..." | "workflow:<id>" | "health:<id>"
  kind: "action" | "update";
  summary: string;
  unblocks: string | null;
  urgency: string;
  at: string | null;
  scope: string;
  recipient?: string | null;
  source: string;
  /** Console join: the state of the qitem behind a queue item, so the list can group without a detail fetch. */
  qitemState?: QueueState;
}

export interface AttentionSource {
  source: string;
  state: "available" | "unavailable" | "partial";
  detail: string | null;
}

export interface AttentionRead {
  readAt: string;
  items: AttentionItem[];
  sources: AttentionSource[];
}

/** The console's reading of one attention item: the qitem behind it plus what the human can do. */
/**
 * Finished human work: a Mission Control action on an item for (or blocked on) a human seat, or a human-bound item
 * that closed without one. Folded by the console from /api/mission-control/audit and closed queue items.
 */
export interface HumanDone {
  id: string;                // actionId, or "closed:<qitemId>"
  at: string;
  verb: string;              // approve | deny | route | resolve | … or the closing state
  actor: string | null;      // null when the item closed without a console action
  byAgent: boolean;          // an agent acted on a human's item
  humanSeat: string | null;  // the human seat it was addressed to or blocked on
  qitemId: string;
  subject: string;
  from: string | null;
  note: string | null;
  after: string | null;      // the item's state once the action landed
}

export interface AttentionDetail {
  item: AttentionItem;
  qitem: QueueItem | null;
  transitions: QueueTransition[];
  lines: string[];
  /** Questions a seat posted for the human (humanDetail parsed), if any. */
  questions?: { id: string; text: string; options: { label: string; recommended?: boolean }[] }[];
}

export interface ActionResult {
  actionId: string;
  verb: MissionControlVerb;
  qitemId: string;
  createdQitemId: string | null;
  auditedAt: string;
}

export type WorkflowStatus = "active" | "waiting" | "completed" | "failed" | "aborted";
export type StepState = "done" | "active" | "waiting" | "pending" | "failed";

export interface MissionStep {
  id: string;
  role: string; // actor_role — matched to seats by role
  objective: string;
  state: StepState;
  ownerSession: string | null; // the seat holding the step's packet; null = nobody
  packetQitemId: string | null;
  since: string | null;
  next: string[]; // next_hop step ids
}

/** One mission's workflow as a map: steps are stations; owners are seats. */
export interface MissionMap {
  missionId: string;
  title: string;
  workflow: { name: string; version: string; instanceId: string; status: WorkflowStatus };
  steps: MissionStep[];
}

export type SliceStatus = "active" | "done" | "blocked" | "draft";
export interface Slice {
  name: string;
  id: string; // "OPR.0.5.2.9"
  missionId: string;
  displayName: string;
  status: SliceStatus;
  description: string;
  qitemCount: number;
  proof: { passed: number; total: number };
  lastActivityAt: string | null;
  needsYou: number;
}

export interface Mission {
  id: string;
  projectId: string;
  title: string;
  status: string;
  workflow: { name: string; version: string } | null;
  slices: Slice[];
}

export interface Project {
  id: string;
  name: string;
  root: string;
  missions: Mission[];
}

export type SpecKind = "rig" | "agent" | "workflow";
export interface SpecEntry {
  id?: string; // library entry id (live)
  name: string;
  version: string;
  kind: SpecKind;
  purpose: string;
  sourcePath: string;
  isBuiltIn: boolean;
  yaml: string;
  /** For rig specs: pods and members, for the mini map. */
  pods?: { namespace: string; label: string; members: { id: string; runtime: Runtime }[] }[];
  /** For workflow specs: step ids in order. */
  steps?: { id: string; role: string }[];
}

export interface TerminalView {
  sessionName: string;
  logicalId: string;
  rigName: string;
  runtime: Runtime;
  activity: Activity;
  lines: string[];
  attachCommand: string;
  lastOutputAt: string | null;
  /** The daemon's needs-input count for the seat, when it has one. */
  needsInput?: number;
}

export interface HostEntry {
  id: string;
  transport: "ssh" | "http";
  target: string;
  selected: boolean;
  status: "reachable" | "unreachable" | "unknown";
  notes?: string;
}

export interface HealthFinding {
  id: string;
  detector: string;
  category: "process" | "governance" | "context";
  scope: string;
  severity: "info" | "warning" | "critical";
  status: "active" | "cleared" | "indeterminate";
  summary: string;
  explanation: string;
  suggestedInspection: string | null;
  startedAt: string;
}

export type WatchdogPolicy =
  | "periodic-reminder" | "artifact-pool-ready" | "edge-artifact-required" | "workflow-keepalive"
  | "idle-gate-qitem" | "context-usage-threshold" | "parked-owner-consumer" | "delivery-deferral" | "delivery-digest-flush";

export interface WatchdogJob {
  jobId: string;
  policy: WatchdogPolicy;
  targetSession: string;
  intervalSeconds: number;
  lastEvaluationAt: string | null;
  lastFireAt: string | null;
  state: "active" | "stopped" | "terminal";
  terminalReason: string | null;
  registeredBySession: string;
}

export interface WatchdogHistoryEntry {
  historyId: string;
  jobId: string;
  evaluatedAt: string;
  outcome: "sent" | "skipped" | "terminal";
  skipReason: string | null;
  deliveryTargetSession: string | null;
  evaluationNotes: string | null;
}

/** Weekly queue counts for Backlog rates, oldest first. */
export interface QueueRates {
  weekOf: string[];
  created: number[];
  claimed: number[];
  closed: number[];
  handedOff: number[];
}

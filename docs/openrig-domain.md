# OpenRig daemon: domain + API brief for a web console

Source: `github.com/mvschwarz/openrig` @ HEAD (fetched 2026-09-30). All paths are repo-relative.
Notation: `?` = optional field, `|` = exact enum. "Verbatim" means types were copied from source; "derived"
means reconstructed from route code or SQL.

---

## 0. TL;DR for the console builder

- **Base URL**: `http://127.0.0.1:7433` (`OPENRIG_PORT`, legacy `RIGGED_PORT`; `packages/daemon/src/index.ts:236`).
  Default bind = loopback + the active Tailscale IP if present (`domain/bind-plan.ts`; override `OPENRIG_BIND_HOST`).
  Clients use `OPENRIG_URL` (UI vite proxy default `http://localhost:7433`, `packages/ui/vite.config.ts`;
  TUI default `http://127.0.0.1:7433`, `packages/tui/src/daemon-client.ts:65`).
- **Framework**: Hono on `@hono/node-server`. All JSON under `/api/*`. Unknown `/api/*` = `404 {error:"not_found", path}`.
  Non-API `GET *` serves the built UI (`packages/ui/dist`) with SPA fallback (`server.ts:814-844`).
- **Health probe**: `GET /healthz` returns `{status:"ok", pid, semver?, commit?, dirty?, builtAt?, selfHostId?, selfHostIdSource?, eventLoop?, routeTimings?, slowOperations?, bind?, stuckSweep?, wakeLadder?}` (`server.ts:633-690`).
- **Auth** (3 separate knobs, none are per-user):
  1. `OPENRIG_AUTH_BEARER_TOKEN`, checked as `Authorization: Bearer <t>` **only on writes** for mission-control
     (`POST /api/mission-control/action`, `/notifications/test`), `/api/hosts/{add,pair,pair/:id}`, `/api/rig-mode`.
     When unset, the middleware passes everything through. The daemon refuses to start on a non-loopback,
     non-Tailscale bind with no token (`middleware/auth-bearer-token.ts`, `assertBindAuthInvariant`).
     401 body: `{what_failed, why_it_matters, what_to_do}`.
  2. `OPENRIG_TERMINAL_BEARER_TOKEN`, covering terminal preview, transport send, compaction, session admin, and the terminal websocket.
     The daemon injects it into the served `index.html` as `localStorage["openrig.terminalBearerToken"]` (`server.ts:839-842`).
  3. **Actor identity header** `X-OpenRig-Session: <member>@<rig>`. Most queue, stream, chat, and proof writes need an actor.
     Without the header, the body claim (`actorSession`, `sourceSession`, `sender`, ...) is recorded as `claimed:v1`.
     With neither: `400 {error:"actor_required"}` (`routes/require-sender-identity.ts`). The browser UI sends
     headerless requests with a body actor on purpose, so the write records as `claimed:v1` (mission-control, review freeze).
     Related headers: `x-openrig-origin-unknown`, `x-openrig-provenance`, `x-openrig-relay`.
- **Live updates**: Server-Sent Events only. There is no websocket for events; the websocket is for terminals.
  The firehose is `GET /api/events` with `Last-Event-ID` resume. See §3.
- **Multi-host reads**: append `?host=<hostId>` to allowlisted GETs and the daemon proxies the read to that
  registered host (`hostReadThrough()` middleware, `server.ts:631`). Writes take a body `hostId` on queue create/handoff and mission-control action.
- **Canonical seat address**: `{pod}-{member}@{rig}` (e.g. `dev-impl@demo-rig`); logical id is `{pod}.{member}` (e.g. `dev.impl`).
  Human seats match `/^human(?:-[A-Za-z0-9._-]+)?@(kernel|host)$/` or `<id>@external` (`domain/session-name.ts`).
  Anything addressed to a human seat is "attention".

---

## 1. Domain model

### 1.1 Host
Registry file `hosts.yaml` (`domain/hosts/hosts-registry-reader.ts`).
```ts
type HostEntry =
  | { id: string; hostId?: string; transport: "ssh"; target: string; user?: string; notes?: string }
  | { id: string; hostId?: string; transport: "http"; url: string; bearer_env?: string; bearer_file?: string; notes?: string };
// GET /api/hosts adds per row: selected: boolean; status: "reachable"|"unreachable"|"unknown"
```
The local host is `"local"` (`LOCAL_HOST_ID`). `GET /healthz.selfHostId` gives the daemon's own id.

### 1.2 Rig (a team of agents)
```ts
interface Rig { id: string; name: string; createdAt: string; updatedAt: string }            // domain/types.ts
// + archived_at (042_rig_archive). Rig lifecycle (derived, types.ts):
type RigLifecycleState = "running" | "recoverable" | "stopped" | "degraded" | "attention_required";
//   running=all nodes running; recoverable=none running + usable snapshot token;
//   stopped=none running, no token; degraded=mixed; attention_required=any node attention (wins)
```
The special rig `kernel` hosts the operator/human seats and has boot state (`GET /api/kernel`).

### 1.3 Pod (group inside a rig)
```ts
interface Pod { id; rigId; namespace: string; label: string; summary: string|null; continuityPolicyJson: string|null; createdAt }
interface ContinuityState { podId; nodeId; status: "healthy"|"degraded"|"restoring"; artifactsJson; lastSyncAt; updatedAt }
```

### 1.4 Node / Seat (a durable slot in a rig; the occupant = the current agent process)
`Node` (`types.ts:28`): `id, rigId, logicalId, role, runtime, model, codexConfigProfile?, permissionPolicy?, cwd,
surfaceHint, workspace, restorePolicy, packageRefs[], podId, agentRef, profile, label, sessionSource?,
resolvedSpecName/Version/Hash, occupantLifecycle, continuityOutcome, handoverResult, previousOccupant, handoverAt, createdAt`.

Enums (verbatim, `types.ts`):
```ts
type OccupantLifecycle = "active"|"retiring"|"retired"|"context_walled"|"compacted"|"crashed"|"unknown";
type ContinuityOutcome = "resumed"|"rebuilt"|"forked"|"fresh"|"failed";
type HandoverResult    = "complete"|"unchanged"|"partial"|"failed"|null;
type NodeLifecycleState = "running"|"detached"|"recoverable"|"attention_required";
type NodeRestoreOutcome = "resumed"|"rebuilt"|"fresh"|"fresh-primed"|"awaiting-decision"|"failed"|"attention_required"|"operator_recovered"|"n-a";
type NodeOriented = "verified"|"missing"|"rejected"|"n-a";     // startup-proof, NOT the same as startupStatus
type startupStatus = "pending"|"ready"|"attention_required"|"failed";
type nodeKind = "agent"|"infrastructure";                       // infrastructure = runtime "terminal"
runtime: "claude-code" | "codex" | "pi" | "terminal" | string
restorePolicy: "resume_if_possible" | "relaunch_fresh" | "checkpoint_only"  // one-way narrowing
```

**Activity** is its own axis. Never derive it from queue state (`docs/reference/agent-state-taxonomy.md`):
```ts
type AgentActivityState = "running"|"needs_input"|"idle"|"unknown";           // legacy agentActivity
type AgentActivityEvidenceSource = "runtime_hook"|"pane_heuristic"|"terminal_activity"|"tmux_session"|"external_cli"|"session_registry";
interface AgentActivity { state; reason: string; evidenceSource; sampledAt: string; evidence: string|null;
  eventAt?; rawEvent?; rawSubtype?; runtime?; fallback?: boolean; stale?: boolean; generation?: string|null;
  generationProvenance?: "resolved"|"unresolved" }
// Newer arbitrated oracle (S19), on inventory as activityState:
activityState?: { activity: string /* "working"|"idle-at-prompt"|"unknown" */; display: string /* server-derived label; use this */;
  needsInput: { count: number; reason: string|null }; decidedBy: string|null; seq: number;
  lastSwap: { generation: string; at: string } | null } | null
```
The taxonomy has three axes that never blend:
- session: `present | detached | exited | absent`
- activity: `working | idle-at-prompt | unknown`, plus needs-input as a count and reason
- resumability: `live | resumable | context-walled`

Derived diagnoses are computed at read time:
- **PARKED**: idle or needs-input while the seat has open obligations. `GET /api/activity/parked`.
- **HELD**: a deliberate queue hold with a named owner and an armed wake.
- **DONE-UNSEEN**: finished work that nobody has looked at.

**Identity verdict** (third axis; `types.ts`):
`"verified"|"mismatch"|"pane_missing"|"binding_absent"|"tmux_unavailable"`. `mismatch` and `pane_missing` downgrade a seat that would otherwise show as running.

**Work counters** come from the queue and are independent of activity: `hasAssignedWork`, `assignedWorkCount`, `pendingWorkCount`, `inProgressWorkCount`, `blockedWorkCount`.
`terminalActive: boolean|null` means tmux output within the silence window; `null` means no signal, which is not the same as idle. `lastActivityAt: string|null` is the raw fact the UI ages.

**NodeInventoryEntry** (`GET /api/rigs/:rigId/nodes`; verbatim field list, `types.ts:622-760`):
```ts
{ nodeId; rigId; rigName; logicalId; podId; podNamespace?; role; canonicalSessionName; attachmentType?: "tmux"|"external_cli"|null;
  nodeKind; runtime; sessionStatus: string|null; startupStatus; restoreOutcome; oriented; lifecycleState; occupantLifecycle;
  continuityOutcome; handoverResult; previousOccupant; handoverAt; tmuxAttachCommand; resumeCommand;
  recoveryGuidance: {summary; commands: string[]; notes: string[]}|null; latestError; model; agentRef; profile;
  codexConfigProfile?; permissionPolicy?; resolvedSpecName; resolvedSpecVersion; resolvedSpecHash; cwd; restorePolicy;
  resumeType; resumeToken; startupCompletedAt; agentActivity?; contextUsage?; transcriptIngest?; terminalActive?;
  activityState?; lastActivityAt?; hasAssignedWork?; assignedWorkCount?; pendingWorkCount?; inProgressWorkCount?;
  blockedWorkCount?; identityVerdict?; heldReason?; workspace?: {workspaceRoot; activeRepo; kind}|null }
```
`contextUsage` includes `usedPercentage`, `fresh`, `availability`, `totalInputTokens`, `totalOutputTokens`.

### 1.5 Session and Binding
```ts
interface Session { id; nodeId; sessionName; status: string /* observed: running|idle|stopped|exited|detached */;
  resumeType; resumeToken; resumeProvenance?; resumeLastVerified?; resumeLastProbeStatus?; restorePolicy;
  lastSeenAt; createdAt; origin: "launched"|"claimed"; startupStatus: "pending"|"ready"|"attention_required"|"failed"; startupCompletedAt }
interface Binding { id; nodeId; attachmentType?: "tmux"|"external_cli"; tmuxSession; tmuxWindow; tmuxPane;
  externalSessionName?; cmuxWorkspace; cmuxSurface; updatedAt }
```
Session ids are monotonic ULIDs, so the newest id is the current occupant. Resume states: `resumed | rebuilt | fresh`.

### 1.6 Edge
```ts
interface Edge { id; rigId; sourceId; targetId; kind: string; createdAt }   // 001_core_schema
kind: "delegates_to"|"spawned_by"|"can_observe"|"collaborates_with"|"escalates_to"  // docs/reference/edge-types.md
```
`delegates_to` and `spawned_by` affect launch order; the other kinds are informational.

### 1.7 Queue item ("qitem"; the hot-potato baton, which is the unit of work)
Table `queue_items` (`024` plus later migrations). TypeScript type is verbatim from `domain/queue-repository.ts`:
```ts
type QueueState    = "pending"|"in-progress"|"done"|"blocked"|"failed"|"denied"|"canceled"|"handed-off";
type QueuePriority = "routine"|"urgent"|"critical";
// ACTIVE = pending|in-progress|blocked ; TERMINAL = done|handed-off  (failed/denied/canceled are also closures)
type ClosureReason = "handed_off_to"|"blocked_on"|"denied"|"canceled"|"no-follow-on"|"escalation";
interface QueueItem {
  qitemId: string;            // "qitem-YYYYMMDDHHMMSS-<8hex>"
  tsCreated; tsUpdated; sourceSession; destinationSession; state: QueueState; priority: QueuePriority;
  tier: string|null;          // e.g. "human-gate" (tier alone never makes it attention)
  deliveryOutcome?: "posted"|"transport-failed"|"never-posted"|null; deliveryFailureClass?; deliveryFailureDetail?;
  tags: string[]|null;        // conventions: "project:<id>", "mission:<id>", "slice:<id>", "cross-host", "from-host:<h>"
  blockedOn: string|null;     // a qitemId OR a session (human seat = human blocker)
  pickup?: PickupReceipt; waiting?: WaitingView;
  handedOffTo; handedOffFrom; expiresAt; chainOfRecord: string[]|null; body: string;
  humanIntent?: "decision"|"update"|null;   // 081; "update" = FYI, not attention
  humanDetail?: string|null; summary: string|null; evidenceRef: string|null;
  fieldsElided?: Array<"body"|"summary"|"evidenceRef"|"humanDetail"|"waiting">;  // compact=1
  closureReason: ClosureReason|null; closureTarget; closureRequiredAt; claimedAt;
  lastNudgeAttempt; lastNudgeResult; lastHeartbeat; resolution; targetRepo }
```
Transitions table `queue_transitions` (`025`): `{transition_id, qitem_id, ts, state, transition_note, actor_session, closure_reason, closure_target}`. Delivery is not approval.

Lifecycle: `create` → `pending` → `claim` → `in-progress` → one of:
- `update state=done` with a closureReason
- `handoff`: the source becomes `handed-off` and a new qitem is created for the next seat (transactional)
- `handoff-and-complete`: the source becomes `done`
- `blocked` (blockedOn + optional wake)
- `failed`, `denied`, or `canceled`

`unclaim` returns the item to pending. `fallback` reroutes. The stuck sweep emits `qitem.closure_overdue` past `closureRequiredAt`.

### 1.8 Inbox / Outbox (mailbox in front of the queue)
`inbox_entries` (`026`): `{inbox_id, destination_session, sender_session, body, tags, urgency='routine', ts_dropped,
state: "pending"|"absorbed"|"denied", absorbed_at, absorbed_qitem_id, denied_at, denied_reason, audit_pointer}`.
When an entry is absorbed, it is promoted to a qitem. The outbox is the sender-side record.

### 1.9 Stream item (append-only observation log)
```ts
interface StreamItem { streamItemId; tsEmitted; streamSortKey; sourceSession; body; format;
  hintType: string|null; hintUrgency: string|null; hintDestination: string|null; hintTags: string[]|null; interrupt: boolean; archivedAt }
```
The classifier seat projects stream items into "projects" (a classification, not the project catalog) via `/api/projects/*` leases.

### 1.10 Handoff / Seat handover
- **Queue handoff**: see qitem above. Event `queue.handed_off`.
- **Seat handover** means replacing an occupant in the same seat: `POST /api/seat/handover/:seatRef {reason, source, operator, dryRun}`.
  Event `seat.handover_completed{previousOccupant,currentOccupant,sourceOutcome:{mode:"fork"|"rebuild",...}}`.

### 1.11 Workflow (spec → instance → step packets)
```ts
type WorkflowInstanceStatus = "active"|"waiting"|"completed"|"failed"|"aborted";
interface WorkflowInstance { instanceId; workflowName; workflowVersion; createdBySession; createdAt; status;
  currentFrontier: string[] /* qitemIds of live step packets */; currentStepId: string|null; hopCount;
  fallbackSynthesis: null; lastContinuationDecision; completedAt; version /* optimistic lock */; resumeCount;
  hopsBaseline; boundRig: string|null; lifecycleOperationKey; compiledInputDigest; lifecycleBinding }
interface WorkflowStepTrailEntry { trailId; instanceId; stepId; stepRole; closedAt;
  closureReason: WorkflowExitKind /* "handoff"|"waiting"|"done"|"failed" */; closureEvidence; actorSession; nextQitemId; priorQitemId }
WorkflowStepSpec { id; actor_role; objective?; allowed_exits?; re_present_after_seconds?; next_hop?; harness?; host?; gate?; depends_on?; acceptance? }
```
Each step is carried by a qitem ("packet"). Closing a packet with `POST /api/workflow/project` projects the next qitem in the same transaction.
`GET /api/workflow/:id` also returns `frontierPackets, failureOccurrences, unknowns, boundaryObligations, guidance, exceptionReadiness`, plus a deadline verdict.

### 1.12 Watchdog job (automation / supervision)
```ts
type WatchdogJobState = "active"|"stopped"|"terminal";
type WatchdogPolicyName = "periodic-reminder"|"artifact-pool-ready"|"edge-artifact-required"|"workflow-keepalive"
  |"idle-gate-qitem"|"context-usage-threshold"|"parked-owner-consumer"|"delivery-deferral"|"delivery-digest-flush";
interface WatchdogJob { jobId; policy; specYaml; targetSession; intervalSeconds; activeWakeIntervalSeconds: number|null;
  scanIntervalSeconds: number|null; lastEvaluationAt; lastFireAt; actionable: boolean; lastActionableAt; state;
  registeredBySession; registeredAt; terminalReason; registeredByGeneration; targetGeneration; watchedFilePath;
  watchedFileGeneration; bindingState: "pending-binding"|"bound"|null; thresholdBytes; requiresJobId; lastFiredGeneration }
interface WatchdogHistoryEntry { historyId; jobId; evaluatedAt; outcome: "sent"|"skipped"|"terminal"; skipReason;
  deliveryTargetSession; deliveryStatus; deliveryMessage; evaluationNotes }
```
Other automation reported in `/healthz`:
- `stuckSweep`: claimed items that were never closed
- `wakeLadder`: failed wakes get retried, then escalate to the orchestrator and then to the operator
- periodic snapshots (`snapshots.periodic.*` settings, default 300s, keep 10)

### 1.13 Snapshot and Restore
```ts
Snapshot { id; rigId; kind: "manual"|"auto-pre-down"|"auto-periodic"|"pre_restore"|"auto-rehydrate"; status: string; data: SnapshotData; createdAt }
RestoreOutcome error codes: snapshot_not_found|snapshot_wrong_rig|snapshot_unusable|no_usable_snapshot|rig_not_found|
  rig_not_stopped|restore_error|restore_in_progress|service_boot_failed|pre_restore_validation_failed
```
Restore is asynchronous. `attemptId` is the `seq` of the `restore.started` event. Poll `/api/rigs/:rigId/restore/status/:attemptId` or watch the events.
A failed restore is reported as failed. The daemon never falls back to a fresh launch on its own.

### 1.14 Project / Mission / Slice (file-backed workspace)
- **Project** (catalog): `ProjectRead { id; root; name; sourcePath: string|null; missionsRoot; error? }`. Layout: `missions/<mission>/slices/<slice>`.
- **Mission**: a folder with a README or SPEC frontmatter carrying `status` (free string; `"complete"` hides it) and `workflow_spec: {name, version}`.
- **Slice**: `SliceStatus = "active"|"done"|"blocked"|"draft"`;
  `SliceListEntry { name; missionId; displayName; railItem; workflowSpec; status; rawStatus; description; qitemCount; hasProofPacket; lastActivityAt; slicePath }`.
  Slices tie to qitems through `slice:`/`mission:` tags. Slice ids look like `OPR.0.5.2.9`.

### 1.15 Proof / Review ("Living Notes")
- **Proof items** are a slice's outcome contract: `proof/` drops plus judgments recorded via `POST /api/proof/judge`, which emits `proof.judged`.
  Readiness is computed at project, mission, and slice scope. It never closes a mission on its own.
- **Review** is a composed read at `/api/review/{slice,mission}/:name`, `/api/review/rig`, `/api/review/fleet`, and `/api/review/agents?scope=`.
  It is organized in bands: NEEDS YOU → AGENTS → INTENT/PLAN/DELIVERED → verify-lineage → SETTLED.
  There are two locks (plan-lock and delivery-lock), and an unaudited lock renders as UNVERIFIED.

### 1.16 Chat (rig-scoped chatroom)
`ChatMessage { id; rigId; sender; kind: "message"|"topic"; body; topic: string|null; createdAt }`. There are no cross-rig channels.

### 1.17 Attention item (the human inbox; a passive projection, not stored)
```ts
// packages/daemon/src/attention-surface.ts (verbatim)
interface AttentionItem { id: string /* "queue:<qitemId>" | "proof:<proj>:<scope>:<item>" | "workflow:<instanceId>" | "health:<id>" (+TUI "human-update:<qitemId>") */;
  kind: "action"|"update"; summary; unblocks: string|null; urgency: string /* qitem priority | "outcome" | health severity */;
  at: string|null; scope: string; project: {id; root}|null; source: string /* API path or file */; recipient?: string|null }
interface AttentionRead { scope: "instance"; readAt; items: AttentionItem[];
  sources: Array<{source; state: "available"|"unavailable"|"partial"; detail}>; detail: AttentionDetail|null; detailError: string|null }
interface AttentionDetail { item; lines: string[]; files: Array<{label; path}> }
```

### 1.18 Mission Control audit action
`mission_control_actions`: `{action_id, action_verb, qitem_id, actor_session, acted_at, before_state_json, after_state_json,
reason, annotation, notify_attempted, notify_result, audit_notes_json, identity_provenance}`. The table is append-only.

### 1.19 Health finding
```ts
{ findingId/id; detector; category: "process"|"governance"|"context"; scope: {type:"instance"|"rig"|"seat"|"mission"|"slice", ...};
  severity: "info"|"warning"|"critical"; status: "active"|"cleared"|"indeterminate"; confidence: "high"|"medium";
  startedAt; lastObservedAt; summary; threshold; explanation; suggestedInspection; source;
  freshness: {state: "fresh"|"stale"|"unavailable"|"contradictory"};
  ceremony?: {stage: "needs-diagnosis"|"confirmed"|"cleared"|"indeterminate", ...}; operatingPosture? }
```

---

## 2. HTTP API

Legend for the column "View":
- **F**: fleet/topology
- **A**: human attention inbox
- **Q**: queue/work
- **W**: automation/watchdog/workflow
- **E**: activity/event stream
- **X**: human action (write)

### 2.1 Fleet / topology (F)

| Method | Path | Purpose | View |
|---|---|---|---|
| GET | `/api/rigs/summary[?includeArchived=true\|archived=only]` | rig list with lifecycle + presence | F |
| GET | `/api/ps[?includeArchived=true]` | per-rig counts incl. `attentionCount` | F |
| GET | `/api/rigs` / `/api/rigs/:id` | raw `Rig[]` / `{rig, nodes, edges}` | F |
| GET | `/api/rigs/:id/graph[?full=true]` | ReactFlow graph with inventory overlay | F |
| GET | `/api/rigs/:rigId/nodes[?refresh=true&full=true]` | `NodeInventoryEntry[]` | F |
| GET | `/api/rigs/:rigId/nodes/:logicalId` | seat detail (peers, activity, work, permission drift) | F |
| GET | `/api/rigs/:id/status` | composed rig status (lifecycle, restore plan, readiness, kernel) | F |
| GET | `/api/rigs/:rigId/sessions` | `Session[]` | F |
| GET | `/api/rigs/:rigId/nodes/:logicalId/preview?lines=N` | terminal tail (terminal bearer) | F |
| GET | `/api/sessions/:sessionName/preview?lines=N` | same, by session name | F |
| GET | `/api/health-summary/{nodes,context,version,gateway}` | cross-rig rollups; `version` → `{version}` | F |
| GET | `/api/kernel` | kernel boot state | F |
| GET | `/api/hosts` | `{ownName, selected, hosts: HostEntry&{selected,status}[]}` | F |
| GET | `/api/review/fleet` | fleet-wide union of each host's rig review | F |
| GET | `/api/info` | `{installRoot}` | – |
| GET | `/api/whoami` | caller identity/workspace | – |

Shapes:
```ts
// GET /api/rigs/summary
Array<{ id; name; nodeCount: number; latestSnapshotAt: string|null; latestSnapshotId: string|null;
  hasServices: boolean; archivedAt: string|null; lifecycleState: RigLifecycleState; hasLiveAgents: boolean|null }>
// GET /api/ps  (domain/ps-projection.ts, verbatim)
Array<{ rigId; name; rigName; nodeCount; runningCount; activeCount; hasWorkCount;
  status: "running"|"partial"|"stopped"; lifecycleState: RigLifecycleState; uptime: string|null; latestSnapshot: string|null;
  archivedAt; isArchived; periodicSnapshotActive; periodicSnapshotIntervalSeconds; autoPeriodicSnapshotCount; attentionCount: number }>
// GET /api/rigs/:id/graph  (domain/graph-projection.ts)
{ nodes: Array<{ id; type: "rigNode"|"podGroup"; position?; parentId?; data: RFNodeData }>; edges: Array<{ id; source; target; label }> }
RFNodeData = { logicalId; podLabel; podNamespace; rigId; role; runtime; model; status; binding; nodeKind; startupStatus;
  canonicalSessionName; podId; restoreOutcome; oriented; resumeToken; resolvedSpecName; profile; edgeCount;
  contextUsedPercentage; contextFresh; contextAvailability; contextTotalInputTokens; contextTotalOutputTokens;
  agentActivity; currentQitems: {qitemId; bodyExcerpt /*<=80ch*/; tier}[] /*<=3*/; terminalActive; hasAssignedWork;
  assignedWorkCount; pendingWorkCount; inProgressWorkCount; blockedWorkCount; identityVerdict; heldReason }
```
The UI polls the graph about every 30s and colors dots from it. `?full=true` enables per-node needs-input capture, which is expensive.

### 2.2 Human attention inbox (A)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/attention[?item=<attentionId>]` | canonical inbox: `AttentionRead` (§1.17). `item=` fills `detail` |
| GET | `/api/queue/list?attention=1[&destinationSession=&sourceSession=&targetRepo=&limit=]` | open human-addressed qitems (`QueueItem[]`) |
| GET | `/api/queue/attention-aggregate` | same across subscribed hosts: `{items, hosts}` (fanned out daemon-side) |
| GET | `/api/queue/human-updates?limit=1..100` | delivered FYI updates `{items:[{qitemId, summary, body, humanDetail, destinationSession, sourceSession, tags, evidenceRef, deliveredAt, deliveryReceipt}], limit, truncated}` |
| GET | `/api/mission-control/views/human-gate[?operatorSession=]` | compact rows (see below) |
| GET | `/api/mission-control/views/my-queue` | operator's queue |
| GET | `/api/mission-control/destinations` | route/handoff picker `{destinations:[{sessionName,label,source:"topology"\|"queue",rigName?,logicalId?,runtime?,status?}]}` |
| GET | `/api/mission-control/audit?qitem_id=&action_verb=&actor_session=&since=&until=&limit=&before_id=` | action history |
| GET | `/api/review/rig` | NEEDS YOU / AGENTS / SETTLED for this host |

`/api/attention` merges four sources, each with its own `sources[]` availability:
1. **queue**: open qitems where the destination is a human seat, or the item is `blocked` with a human `blockedOn` (and `humanIntent !== "update"`). `kind:"action"`.
2. **proof** judgments per project/mission/slice. `kind:"update"`, `urgency:"outcome"`.
3. **mission outcomes**: manifest-bound workflow terminal receipts. `kind:"update"`.
4. **health** findings with severity other than info. `kind:"update"`, urgency = severity.

Items sort by kind, then by `at` descending. `detail.lines` contains the request body, state, to/from, blockedOn, posture, evidence, and the full transition history.

Mission Control views (`domain/mission-control/mission-control-read-layer.ts`, verbatim):
```ts
MISSION_CONTROL_VIEWS = ["my-queue","human-gate","fleet","active-work","recent-ships","recently-active","recent-observations"]
interface MissionControlReadResult { viewName; rows: CompactStatusRow[]; meta: { rowCount; rigsRunningStaleCli?; degradedFields?; sourceFallback? } }
interface CompactStatusRow { rigOrMissionName: string; currentPhase: string|null;
  state: "active"|"idle"|"attention"|"blocked"|"degraded"; nextAction: string|null; pendingHumanDecision: string|null;
  readCost: "full"|"skim/approve"|"summary-only"|null; lastUpdate: string; confidenceFreshness: string|null;
  evidenceLink: string|null; qitemId?; rawSourceRef?; qitemSummary?; qitemBody? }
```

### 2.3 Queue / work (Q)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/queue/list?destinationSession=&sourceSession=&state=a,b&targetRepo=&limit=&as=&compact=1&rig=&activeOnly=1` | `QueueItem[]` (state is comma list) |
| GET | `/api/queue/:qitemId` | one `QueueItem` (404 `{error:"qitem_not_found"}`) |
| GET | `/api/queue/:qitemId/transitions` | transition rows |
| GET | `/api/queue/whoami?session=&recentLimit=` | `{session, asDestination:{pending,inProgress,blocked,recent[]}, asSource:{total}, ...currentWork}` |
| GET | `/api/queue/overdue?rig=&limit=&compact=1` | in-progress past `closureRequiredAt` |
| GET | `/api/queue/undelivered?rig=&limit=&compact=1` | nudge/delivery failures (+`deliveryFailureClass`) |
| GET | `/api/queue/recent-transitions?scope=instance\|rig&rig=&limit=20` | chronology |
| GET | `/api/queue/inbox/pending?destinationSession=` / `inbox/list` / `outbox/list?senderSession=` | mailbox |
| GET | `/api/mission-control/views/{active-work,recent-ships,recently-active}` | compact rows |
| GET | `/api/activity/parked?rig=\|seat=name@rig` | parked diagnosis (rig-scoped; 400 `rig_scope_unresolvable`) |
| GET | `/api/stream/list?limit=&direction=latest\|chronological&afterSortKey=&sourceSession=&hintDestination=&hintTag=&since=&until=` | `StreamItem[]` |
| GET | `/api/slices?filter=all\|active\|done\|blocked[&boundToWorkflow=name:ver&refresh=1]` | `{slices:(SliceListEntry&{readiness})[], totalCount, filter, boundToWorkflow, missions}` |
| GET | `/api/slices/:name` | per-tab payload |
| GET | `/api/missions/:missionId` | `{missionId, missionPath, readiness, slices, workflow_spec, topology:{specGraph}\|null, status}` |
| GET | `/api/review/slice/:name`, `/api/review/mission/:name`, `/api/review/agents?scope=slice:<id>\|mission:<id>\|rig` | composed review |
| GET | `/api/proof[?scope=<mission>\|<mission>/slices/<slice>]` | readiness (+`sourceObservation`) |
| GET | `/api/progress/tree` | PROGRESS.md hierarchy (503 if `OPENRIG_PROGRESS_SCAN_ROOTS` unset) |
| GET | `/api/rigs/:rigId/chat/history?topic=&limit=&after=&since=&sender=` | `ChatMessage[]` |
| GET | `/api/files/roots`, `/api/files/read?root=&path=` | allowlisted file reads `{content, absolutePath, mtime, contentHash, truncated}` |

Common 503s for workspace-backed routes: `slices_indexer_unavailable` and `slices_root_not_configured` (with a `hint`). Render these as setup empty-states.

### 2.4 Automation / watchdog / workflow (W)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/watchdog/list` | `WatchdogJob[]` |
| GET | `/api/watchdog/:job_id` / `:job_id/status` | job / `{job, recentHistory: WatchdogHistoryEntry[] /*20*/}` |
| POST | `/api/watchdog/register` | `{policy, specYaml, targetSession, intervalSeconds, registeredBySession, activeWakeIntervalSeconds?, scanIntervalSeconds?, watchedFilePath?, thresholdBytes?, requiresJobId?}` → 201 job |
| POST | `/api/watchdog/:job_id/stop` | `{reason?}` (409 `job_terminal`) |
| GET | `/api/workflow/list[?status=active\|waiting\|completed\|failed\|aborted]` | instances + deadline verdict |
| GET | `/api/workflow/specs` | `{specs:[{name,version,purpose,targetRig,coordinationTerminalTurnRule,sourcePath,cachedAt,isBuiltIn}]}` |
| GET | `/api/workflow/:id`, `/:id/trace`, `/:id/guidance`, `/:id/revision` | instance detail / instance+trail |
| POST | `/api/workflow/instantiate` | `{specPath, rootObjective, createdBySession, entryOwnerSession?, targetRig?}` |
| POST | `/api/workflow/project` | close packet: `{instanceId, currentPacketId, exit:"handoff"\|"waiting"\|"done"\|"failed", actorSession, resultNote?, blockedOn?, closureEvidence?, nextOwnerSession?}` |
| POST | `/api/workflow/:id/resume` | `{actorSession, occurrenceId?, decision?}` (failed instance) |
| POST | `/api/workflow/:id/abort` | `{reason, actorSession}` |
| POST | `/api/workflow/:id/route` | re-route frontier step `{toSession, actorSession, packetId?, reason?}` |
| GET | `/api/mission-control/cli-capabilities` | per-rig CLI drift rollup |
| GET | `/healthz` → `stuckSweep`, `wakeLadder` | background sweeps heartbeat |

### 2.5 Human actions (X)

The primary answer to a human request is **`POST /api/mission-control/action`** (bearer when configured).
```ts
body: { verb: "approve"|"deny"|"route"|"annotate"|"hold"|"drop"|"handoff"|"resolve"; qitemId: string;
        actorSession?: string /* e.g. "human@kernel"; recorded claimed:v1 if no X-OpenRig-Session */;
        destinationSession? /* route, handoff */; body?; annotation? /* annotate */; reason? /* hold (req), drop, deny, approve */;
        decision? /* resolve (req) */; notify?: boolean; auditNotes?: object; hostId?: string /* forward to origin host */ }
→ 200 { actionId; verb; qitemId; closedQitem: QueueItem|null; createdQitemId: string|null; notifyAttempted: boolean; notifyResult: string|null; auditedAt }
errors: 400 verb_unknown|annotation_required|reason_required|destination_required|decision_required; 404 qitem_not_found;
        409 qitem_already_terminal|qitem_not_leg1_parked; 502 remote_action_failed{hostId,failureClass,detail}
```
Verb effects (`docs/as-built/architecture/mission-control.md` §2 plus the write contract):

| verb | effect on qitem |
|---|---|
| approve | `done`, closure `no-follow-on` |
| deny | `done`, closure `denied` |
| route | `done`, closure `handed_off_to`, plus a new qitem at the destination |
| handoff | source update, destination create, optional notify, audit row |
| annotate | no mutation; audit row only |
| hold | `blocked`, closure `blocked_on` |
| drop | `done`, closure `canceled` |
| resolve | unparks a qitem that is `blocked` on a human seat. `decision` text goes to the transition note |

Every verb runs as one transaction covering the qitem, the audit row, and a `mission_control.action_executed` event.

Other human-action endpoints:

| Method | Path | Action |
|---|---|---|
| POST | `/api/queue/create` | `{destinationSession, body, priority?, tier?, tags?, summary?, evidenceRef?, humanIntent?, humanDetail?, expiresAt?, nudge?, hostId?}` + actor header/`sourceSession` |
| POST | `/api/queue/:id/claim` \| `unclaim` | `{destinationSession}` / `{reason?}` |
| POST | `/api/queue/:id/update` | `{state?, closureReason?, closureTarget?, blockedOn?, wakeWatchdogId?, wakeAfterSeconds?, transitionNote?, reopen?, summary?, evidenceRef?}` (409 `terminal_reopen_requires_ack`) |
| POST | `/api/queue/:id/handoff` \| `handoff-and-complete` | `{toSession, body?, transitionNote?, priority?, tags?, nudge?, hostId?}` → 201 `{closed, created}` |
| POST | `/api/queue/:id/fallback` | `{fallbackDestination, reason?}` |
| POST | `/api/queue/inbox/:inboxId/absorb` \| `deny` | `{reason}` for deny |
| POST | `/api/proof/judge` | record a proof verdict `{scope, item, expectedRevision, expectedPrevious, reason, evidence?[], subject?, operationId?}` |
| POST | `/api/review/freeze` | `{scope:"slice", name, actor}` after approval |
| POST | `/api/scope/approve` | frontmatter stamp + audit (lock) |
| POST | `/api/missions/:id/complete` | mark mission complete |
| POST | `/api/rigs/:rigId/snapshots` | `{kind?:"manual", intendedSeats?: string[]}` → 201 Snapshot |
| GET | `/api/rigs/:rigId/snapshots[/:id]` | list/show |
| POST | `/api/rigs/:rigId/restore/:snapshotId` | → 202 `{ok, attemptId, status:"started", rigId}` |
| GET | `/api/rigs/:rigId/restore/status/:attemptId` | receipt |
| POST | `/api/rigs/:id/launch-plan` | read-only per-seat plan `{freshLogicalIds?}` |
| POST | `/api/rigs/:id/up` | power on from snapshot `{plan?:true, freshLogicalIds?}` (409 on validation) |
| POST | `/api/down` / `/api/up` | CLI-parity up/down |
| POST | `/api/rigs/:id/archive` \| `unarchive` | `{force?}` (409 if running) |
| POST | `/api/rigs/:rigId/nodes/:logicalId/launch` | launch a seat |
| POST | `/api/seat/{launch,stop,clean,handover,set-model,set-permissions}/:seatRef` | `{reason, operator, fresh?, stop?, dryRun?, model?, mode?}` |
| POST | `/api/sessions/:sessionName/clear-attention` | `{reason?}` (terminal bearer); clears a seat's `attention_required` |
| POST | `/api/sessions/:sessionName/reconcile` | adopt a hand-resumed session |
| POST | `/api/transport/*` | send text into a seat (terminal bearer) |
| POST | `/api/ask` | `{rig, question, seat?\|session?}` → gathered evidence (no LLM) |
| POST | `/api/rigs/:rigId/chat/send` \| `topic` \| `clear` | `{body}` / `{topic, body?}` |
| POST | `/api/watchdog/:id/stop`, `/api/workflow/:id/{resume,abort,route}` | see §2.4 |
| POST | `/api/crash-cart/restore-fleet` (+ `GET/POST .../:id[/cancel]`) | whole-fleet restore |
| POST | `/api/terminal/open {view}` | open tmux/cmux tiles |

Error convention: `{error: "<code>", message, ...meta}` with 400/404/409, or a 3-part `{fact, consequence, action}` or `{what_failed, why_it_matters, what_to_do}`.

---

## 3. Event stream

**Transport**: SSE (`text/event-stream`, Hono `streamSSE`). Each message is `id: <seq>` with `data: <JSON PersistedEvent>`.
No `event:` name is set, so listen on `onmessage`. The one exception is `/api/activity/events`, which uses named events. There is no heartbeat.

```ts
type PersistedEvent = RigEvent & { seq: number; createdAt: string }   // events table: seq INTEGER PK, rig_id, node_id, type, payload, created_at
```

| Endpoint | Filter | Replay |
|---|---|---|
| `GET /api/events[?rigId=]` | all events (or one rig) | **Yes.** Replays every event with `seq > Last-Event-ID` (header; default 0 = the entire log). Subscribes before replaying so there is no gap, then dedupes by seq (`routes/events.ts`). |
| `GET /api/queue/watch` (= `/sse`) | `queue.created, queue.handed_off, queue.claimed, queue.unclaimed, qitem.fallback_routed, qitem.closure_overdue, inbox.absorbed, inbox.denied` (not `queue.updated`) | live only |
| `GET /api/mission-control/sse` (= `/watch`) | `mission_control.action_executed, .cli_drift_detected, .view_refreshed` | live only |
| `GET /api/watchdog/sse` (= `/watch`) | `watchdog.*` (5) | live only |
| `GET /api/workflow/sse` (= `/watch`) | `workflow.*` (8) | live only |
| `GET /api/stream/watch` | new stream items | live |
| `GET /api/rigs/:rigId/chat/watch` | `chat.message`; sends the last 20 first, then live (data = `ChatMessage`, id = messageId) | 20 |
| `GET /api/activity/events` | named events `seat.activity_changed`, `seat.rung_health`, `proof.judged`, `proof.sources_changed`. Change notifications only: **re-fetch `/api/ps` or nodes** | none |
| `GET /api/views/:name/sse` | view deltas (`view.changed`) | – |
| WS `/api/rigs/:rigId/terminal...` | live terminal (terminal bearer) | – |

**Caution**: a fresh `EventSource('/api/events')` without `Last-Event-ID` replays the whole event log.
The old UI does exactly this: it opens one shared EventSource and keeps a 100-event client ring buffer (`packages/ui/src/lib/topology-events.ts`).
For a new console, prefer seeding `Last-Event-ID` from a recent seq, or close the stream after catching up. Also note: `EventSource` cannot send custom headers, so `/api/events` has no auth.

**RigEvent union** (`packages/daemon/src/domain/types.ts:105-313`, key payload fields):
- rig: `rig.created{rigId}`, `rig.deleted`, `rig.imported{specName,specVersion}`, `rig.stopped`, `rig.archived`, `rig.unarchived`, `rig.expanded{podId,podNamespace,nodes[{logicalId,status}],status}`
- pod: `pod.created{podId,namespace,label}`, `pod.deleted`
- node: `node.added{nodeId,logicalId}`, `node.removed`, `node.launched{sessionName}`, `node.claimed{discoveredId}`, `node.reconciled`,
  `node.held{reason}`, `node.model_changed{from,to,reason,operator}`, `node.permissions_changed`,
  `node.startup_pending`, `node.startup_ready`, `node.startup_failed{error}`, `node.startup_challenged`,
  `node.startup_proof_{skipped,verified,rejected}`
- session: `session.status_changed{status}`, `session.detached{sessionName}`, `session.stopped{reason,operator}`, `session.cleaned`,
  `session.discovered{tmuxSession,runtimeHint,confidence}`, `session.vanished`, `session.resume_token_set`, `session.resume_token_captured{outcome}`
- seat: `seat.model_divergence`, `seat.fresh_launched{status:"ready"|"attention_required"}`, `seat.fresh_launch_failed{errors[]}`,
  `seat.handover_completed`, `seat.attention_cleared{clearedBy:"evidence"|"operator_attestation"}`.
  `seat.activity_changed` and `seat.rung_health` appear on `/api/activity/events` (bus-level; not in the union declaration).
- agent: `agent.activity{nodeId,sessionName,runtime,activity:AgentActivity}`, `agent.session_identity{provenance:"hook"|"scrape"|"rpc"}`
- transport: `transport.prompt_override`, `binding.updated`
- topology: `topology.roster_recorded`
- snapshot/restore: `snapshot.created{snapshotId,kind}`, `restore.started{snapshotId}` (seq = attemptId), `restore.completed{result}`, `restore.subset_completed`,
  `restore.outcome_reconciled{from,to:"operator_recovered"}`
- continuity: `continuity.sync`, `continuity.degraded{reason}`
- kernel: `kernel.agent.degraded{agents[],firstUnreadySince}`
- chat: `chat.message{rigId,messageId,sender,kind,body,topic?}`
- stream: `stream.emitted{streamItemId,sourceSession,hintDestination,hintType,hintUrgency,interrupt}`
- queue (all carry `summary`):
  - `queue.created{qitemId,sourceSession,destinationSession,priority,tier}`
  - `queue.handed_off{fromSession,toSession}`
  - `queue.claimed{destinationSession,claimedAt,closureRequiredAt}`
  - `queue.unclaimed{reason}`
  - `queue.updated{fromState,toState,closureReason,closureTarget,actorSession}`
  - `qitem.fallback_routed`, `qitem.closure_overdue{overdueSince}`
  - `inbox.absorbed{promotedQitemId}`, `inbox.denied{reason}`
- classifier: `project.classified`, `classifier.lease_acquired|lease_expired|dead|reclaimed`
- view: `view.changed{viewName,cause}`
- watchdog: `watchdog.evaluation_fired{jobId,policy,targetSession,deliveryStatus}`, `watchdog.evaluation_skipped{skipReason}`, `watchdog.evaluation_terminal{terminalReason}`,
  `watchdog.job_registered{registeredBy}`, `watchdog.job_stopped{reason}`
- workflow: `workflow.instantiated`, `workflow.revised`, `workflow.step_closed{stepId,closureReason,actorSession,priorQitemId}`,
  `workflow.next_qitem_projected{nextQitemId,nextOwner,nextStepId}`, `workflow.completed`, `workflow.failed{reason}`,
  `workflow.resumed{decision,resumeCount}`, `workflow.routing_table_changed`, `workflow_spec.removed`
- mission control: `mission_control.action_executed{actionId,actionVerb,qitemId,actorSession}`, `.cli_drift_detected`, `.view_refreshed`,
  `.notification_sent{mechanism,target}`, `.notification_failed{error}`
- proof: `proof.judged{scope,revision}`, `proof.sources_changed`
- package/bootstrap/bundle (legacy install): `package.validated|planned|installed|rolledback|install_failed`, `bootstrap.planned|started|completed|partial|failed`, `bundle.created`
- meta: `event.delivery_poisoned{poisonedSeq,error,payloadSha}`

**Old UI invalidation map** (`packages/ui/src/hooks/useGlobalEvents.ts`, 150ms debounce). This is a good template:

| Events | Refetch |
|---|---|
| `node.startup_*` | rig nodes |
| `rig.{created,deleted,stopped,imported}`, `bootstrap.{completed,partial}`, `restore.completed`, `node.claimed`, `session.detached`, `node.removed`, `pod.deleted`, `rig.expanded`, `rig.{archived,unarchived}` | `/api/rigs/summary` and `/api/ps` |
| `proof.*` | review, slices, mission |

---

## 4. What the old web UI and the TUI show

### 4.1 Web UI (`packages/ui`, React + TanStack Router/Query + React Flow + Tailwind; `docs/as-built/ui/*.md`)

The shell (`components/AppShell.tsx`) has:
- a 48px icon rail
- a contextual Explorer sidebar
- the center workspace
- a shared right-edge detail drawer (`SharedDetailDrawer`)
- a preview stack

Rail destinations: Dashboard `/`, Topology `/topology`, For You `/for-you`, Project `/project`, Library `/specs`, Settings `/settings`.

- **Dashboard `/`**: vellum landing with totals (rigs, agents, active agents, library size) from `useRigSummary`, `usePsEntries`, and `useSpecLibrary`.
- **Topology `/topology`, `/topology/rig/$rigId`, `/topology/pod/$rigId/$podName`, `/topology/seat/$rigId/$logicalId`**.
  View tabs: **graph | table | terminal | tree**.
  - Graph pieces: `HostMultiRigGraph` (all rigs on one canvas; node ids prefixed per rig), `RigGroupNode` (rig frames), `HybridPodGroupNode` (dashed pod frames), and `HybridAgentNode` cards. Cards show a runtime badge, context %, token totals, activity tint, a terminal preview popover (black glass), and a CMUX launch action.
  - `ActivityRing` marks active, needs-input, or blocked. `HotPotatoEdge` animates queue movement between seats. Both honor reduced-motion.
  - Graph data for a rig is fetched only when that rig is expanded.
- **For You `/for-you`** (the attention feed; this replaced `/mission-control`, now a redirect):
  - Every `/api/events` event is classified client-side (`lib/feed-classifier.ts`) into `action-required | approval | shipped | progress | observation`.
  - Rules: tier `human-gate` means approval; a human-seat destination, `qitem.closure_overdue`, or `inbox.denied` means action-required; `done` means shipped; `workflow.*` means progress; `stream.*`, `watchdog.*`, and everything else means observation.
  - The feed keeps the latest 50 cards, fills them in from `/api/queue/:id`, and adds a proof thumbnail for shipped cards.
  - Filtering: subscription filter (settings `feed.subscriptions.*`; action-required is always on), lens chips (All / Action req / Approvals / Shipped / Progress / Audit), and per-card soft-dismiss with undo.
  - Actionable cards show a one-tap **APPROVE** (`verb:"approve"`) and **CHAT**. CHAT opens a terminal to the sending agent seeded with a preamble; it is not a chat panel.
  - The optimistic receipt comes from the action result; the audit log confirms it later.
  - Above the cards is a storytelling band with mission progress cards and shipped/incident slice cards.
- **Project `/project`, `/project/mission/$id`, `/project/slice/$id`**:
  - Tabs: overview, story, progress, artifacts, tests, queue, topology, and **review**. The slice page puts story first but defaults to overview.
  - The workspace overview shows missions with Current Work and Archive columns.
  - The mission page shows README, a progress heatmap, and a topology from the workflow spec graph.
  - The slice review tab shows the NEEDS YOU / AGENTS / INTENT / PLAN / DELIVERED / verify-lineage / SETTLED bands, with media playing inline.
- **Library `/specs`**: specs, applications, skills, plugins.
- **Files `/files`**.
- **Settings `/settings`**: policies, log, status.
- **Search `/search`**: audit/history.
- Legacy routes: `/rigs/$rigId`, `/packages`, `/bootstrap`, `/discovery`, `/bundles/*`.

The design system is `docs/DESIGN.md`, described as "operator's tactical dossier: precise, technical, calm".
- **Paper palette**: `#faf9f5` base, `#ffffff` cards, `#f2f1ed` / `#ebe9e4` / `#e0dcd7` grays.
- **Ink**: `#2e342e`, `#5b615a`, `#0d0d0c`.
- **Accent and status**: accent `#5a6c91`, success `#3d8b40`, warning `#ffb81c`, critical `#c23b22`, error `#9e3e3e`, outline `#767673` / `#aca9a3`.
- **Type**: Inter for body, Space Grotesk for headlines, JetBrains Mono for technical text. Labels are uppercase mono with about `0.10em` tracking.
- **Vellum surfaces**: `bg-white/25`–`/40` with `backdrop-blur-[8px]`, 1px lines, square geometry, corner-bracket marks.
- **Black glass**: `bg-stone-950/65` for overlays, with no borders.
- **Marks**: centralized runtime marks (claude, codex, terminal, unknown) and a human "climber mask" actor mark.
- **Motion**: explains state; use slow pulses; respect reduced-motion.
- **Don't**: emojis, pill walls, gradients, one-off card styles, or letting the terminal look dominate.

### 4.2 TUI (`packages/tui`, "k9s for rigs"; observe, navigate, and drive structure only)

Sections (`src/sections.ts`) and the reads each uses:

| Section | Reads | Drill path |
|---|---|---|
| **topology** | `/api/rigs/:id/graph`, `/api/ps`, `/api/rigs/summary` | host > rig > pod > agent |
| **specs** | `/api/specs/library` | – |
| **scopes** | `/api/scopes/projects`, `/api/scopes?detail=1`, `/api/views/execution`, `/api/slices/:dir` | project > mission > execution-row > slice |
| **terminals** | `/api/terminal/views?detail=1`, `/api/terminal/preview` | – |
| **needs** (Feed) | `/api/attention` + `/api/queue/human-updates?limit=20` | flat |
| **system** | `/api/health` | – |
| **config** | `/healthz`, `/api/config?view=browser` | – |
| **connections** | `/api/gateway/connections` | – |

Other TUI features:
- A **PULSE** view with lanes NEEDS YOU, BLOCKED, PARKED WITH BATON, NOW, UP NEXT, and JUST FINISHED. They are built from `/api/queue/list?state=...` joined with per-seat `terminalActive`/`lastActivityAt`.
- A crash-cart (daemon-down restore), a command bar (`:topology`, `/filter`, `rig <name>`), and a control socket.
- The only writes are `POST /api/terminal/open` and seat launch. The TUI deliberately does **not** approve anything: its needs view ends with "Viewing is not approval. Required Slack decisions still apply."

### 4.3 The "human route" and attention concept

- A human is a seat address: `human@kernel`, `human-<name>@kernel|@host`, or a gateway-registered `<entity>@external`, which routes to Slack via the gateway subsystem.
  The operator seat name is the setting `workspace.operator_seat_name`.
- **An item needs a human** when any of these hold:
  1. A qitem's `destinationSession` is a human seat.
  2. A qitem is `state=blocked` with `blockedOn` = a human seat ("leg-1 park").
  3. Tier `human-gate` on its own is only a label: the UI classifies it as an approval, but it is not an obligation.
  4. `humanIntent:"update"` marks an FYI, which is excluded from action items and appears in `human-updates`.
- **Other signals** that surface in attention as `kind:"update"`: proof judgments, workflow terminal receipts, and material health findings.
  Seat-level `attention_required` (startup/resume prompt) appears in topology via `lifecycleState`, `PsEntry.attentionCount`, and `NodeInventoryEntry.startupStatus`.
- **How to answer**:
  - **Approve/deny/route/hold/drop/handoff/annotate/resolve**: `POST /api/mission-control/action` with `qitemId`.
  - Equivalent raw queue edit: `POST /api/queue/:id/update`. The pair-request body shows the canonical CLI:
    `APPROVE: rig queue update <id> --state done --closure-reason no-follow-on`; `DENY: --state denied`.
  - **Unpark a blocked-on-human item**: verb `resolve` with `decision` text.
  - **Seat attention**: `POST /api/sessions/:name/clear-attention`, or relaunch via `/api/seat/launch/:seatRef`.
  - **Failed workflow**: `POST /api/workflow/:id/resume {decision}`.
  - **Proof**: `POST /api/proof/judge`, then `POST /api/scope/approve` and `POST /api/review/freeze`.
  - Humans may also answer in Slack; delivery state appears in `/api/queue/undelivered` and `human-updates` receipts.
- Pairing a new host creates a `human-gate` qitem for the registered human. Approving it releases the bearer token (`routes/hosts.ts:151-221`). This is a good real example of an attention item.

---

## 5. Sample fixture data (realistic, from repo)

Rig `demo-rig` (`demo/rig.yaml`):

| Pod | Label | Members |
|---|---|---|
| `orch` | Orchestration | `lead` (claude-code) |
| `dev` | Development | `impl` (claude-code), `qa` (codex), `design` (claude-code) |
| `rev` | Review | `r1` (claude-code), `r2` (codex) |
| `infra` | Infrastructure | `daemon`, `ui` (runtime `terminal`, agent_ref `builtin:terminal`) |

Edges: `qa can_observe impl`, `r1 collaborates_with r2`, `orch.lead delegates_to dev.impl`.
Session names: `orch-lead@demo-rig`, `dev-impl@demo-rig`, `dev-qa@demo-rig`, `rev-r1@demo-rig`, `infra-ui@demo-rig`.

TUI demo fixture (`packages/tui/src/demo-data.ts`):
- Hosts: `vm-host` (reachable) and `remote-host` (unreachable, "read timed out").
- Rig `openrig-build`, pod `dev50`:
  - `dev50.driver`: claude-code / model `fable-5.1`, ctx 62%, 118k tokens, active, session `dev50-driver@openrig-build`
  - `dev50.guard`: codex / `gpt-5.6`, ctx 31%, idle
  - `dev50.qa`: codex, unknown, not live
- Pod `orch`: `orch.lead` (codex, 88% ctx, needs-attention).
- Other seats: `dev50-planner@openrig-build`, `review50-r1@openrig-build`.
- Human seat: `human-yeah@kernel`. PM seat: `pm-openrig@openrig-pm`.
- Attention qitems (tier `human-gate`, dest `human-yeah@kernel`):
  - `"0.5.0 cut packet ready · waiting on you"` (in-progress)
  - `"slice-20 routing pixels · waiting on you"` (pending)
- Blocked:
  - `dev50-driver@openrig-build` blockedOn `qitem-20260805-review` (owner `review-r1@openrig-build`), summary "terminal verdict for 51209941", tags `mission:release-0.5.2`, `slice:OPR.0.5.2.4`
  - `dev50-qa@openrig-build` blockedOn `human-yeah@kernel`, "human sign-off pending"
- In-progress:
  - `qitem-20260806-8f3a1b2c` "slice 51-06 D2 atom" → dev50-guard (parked: idle 47m)
  - `qitem-20260806-drv0aa11` "pulse-view incr build" → dev50-driver
  - `qitem-20260806-led0d442` "fold receipt 0.5.2" → orch-lead
- Pending: `qitem-20260806-up000001` "RM ceremony 0.5.2" → orch-lead, "51-02 scenario runner" → dev50-qa, "incr-5 live refresh-seam" → dev50-driver.
- Finished: `qitem-20260806-fin00002` handed-off dev50-driver → review50-r1 "field fold receipt".
- Mission `release-0.5.2`:
  - slice `gateway-m1` (id `OPR.0.5.2.9`, stage building, proof 2/9, spec-lock by `pm-openrig@openrig-pm`)
  - slice `crash-cart` (`OPR.0.5.2.5`, done, 4/4)
- Stream items:
  - `dev50-guard@v-openrig-build`: "gate cleared: slice-11 spike verdict PASS"
  - `orch-lead@...`: "provider re-auth completed on mm2"
- Needs derived item: "dev50.guard looks stuck — idle 42m >= 30m default · holds 1".

Synthetic but shape-correct examples:
```jsonc
// PersistedEvent (SSE data)
{"type":"queue.created","qitemId":"qitem-20260930141502-9c1e4a7b","sourceSession":"dev-impl@demo-rig",
 "destinationSession":"human@kernel","priority":"urgent","tier":"human-gate",
 "summary":"Approve schema migration 090 before merge","seq":48213,"createdAt":"2026-09-30 14:15:02"}
{"type":"agent.activity","rigId":"01J...","nodeId":"01J...","sessionName":"dev-qa@demo-rig","runtime":"codex",
 "activity":{"state":"needs_input","reason":"permission prompt","evidenceSource":"runtime_hook","sampledAt":"2026-09-30T14:16:10Z","evidence":null},"seq":48214,"createdAt":"..."}
// AttentionItem
{"id":"queue:qitem-20260930141502-9c1e4a7b","kind":"action","recipient":"human@kernel","summary":"Approve schema migration 090 before merge",
 "urgency":"urgent","unblocks":"dev-impl: land migration 090","at":"2026-09-30T14:15:02.000Z","scope":"project openrig · ...",
 "project":{"id":"openrig","root":"/Users/op/work/openrig"},"source":"/api/queue/qitem-20260930141502-9c1e4a7b"}
// approve
POST /api/mission-control/action {"verb":"approve","qitemId":"qitem-20260930141502-9c1e4a7b","actorSession":"human@kernel","reason":"LGTM"}
```
Note: `events.created_at` is SQLite `datetime('now')` format (`YYYY-MM-DD HH:MM:SS`, UTC, no `T`/`Z`). Queue timestamps are ISO. Normalize both.

---

## 6. Gotchas

1. `/api/projects/*` is the **stream classifier** lease API, not a project list. The project catalog comes through `/api/scopes/projects` (TUI) or the attention/slices reads.
2. `queue/watch` does not stream `queue.updated`. Use `/api/events` for state changes.
3. Mission Control reads have no auth; only writes use the bearer. Plan a token field in settings. It is optional on loopback and Tailscale.
4. Canonical ids must be kept in full in API calls. Human-readable ids are only for display.
5. `terminalActive: null` means "no signal", not idle. `activityState.display` is already the server-derived label; do not re-derive it.
6. The daemon uses honest-absence 503s with a `hint` (workspace, progress roots, gateway). Render them as setup states, not as errors.
7. The rigs summary, ps, and graph endpoints are expensive and are serialized through a projection lane. Keep polling at 30s or slower and let SSE drive refreshes.

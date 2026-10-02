// The one seam between the console and OpenRig. Views never fetch; they ask a DataSource.
// `live` talks to the daemon (same origin, /api/*); `sample` serves the fixtures. main.tsx picks one at boot.
import * as fx from "./fixtures";
import type {
  ActionResult, AttentionDetail, AttentionRead, HealthFinding, Healthz, HostEntry, MissionControlVerb, MissionMap,
  Project, PsEntry, QueueItem, QueueRates, RigTopology, Seat, SpecEntry, TerminalView, WatchdogHistoryEntry, WatchdogJob,
} from "./types";

export interface ActInput {
  verb: MissionControlVerb;
  qitemId: string;
  reason?: string;
  decision?: string;
  annotation?: string;
  destinationSession?: string;
  body?: string;
}

export interface DataSource {
  readonly kind: "live" | "sample";
  health(): Promise<Healthz>;
  rigs(): Promise<PsEntry[]>;
  topology(rigId: string): Promise<RigTopology>;
  missionMap(rigId: string): Promise<MissionMap | null>;
  attention(): Promise<AttentionRead>;
  attentionDetail(id: string): Promise<AttentionDetail | null>;
  act(input: ActInput): Promise<ActionResult>;
  queue(rigName?: string): Promise<QueueItem[]>;
  rates(): Promise<QueueRates>;
  projects(): Promise<Project[]>;
  specs(): Promise<SpecEntry[]>;
  /** The spec's source, fetched when opened (the library list carries none). */
  specYaml(spec: SpecEntry): Promise<string>;
  terminals(): Promise<TerminalView[]>;
  hosts(): Promise<HostEntry[]>;
  findings(): Promise<HealthFinding[]>;
  watchdogs(): Promise<{ jobs: WatchdogJob[]; history: WatchdogHistoryEntry[] }>;
}

const later = <T,>(v: T, ms = 120) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), ms));

export function sampleSource(): DataSource {
  // Actions mutate the fixtures so the console behaves end to end without a daemon.
  const resolved = new Set<string>();
  return {
    kind: "sample",
    health: () => later(fx.healthz),
    rigs: () => later(fx.ps),
    topology: () => later(fx.topology),
    missionMap: () => later(fx.mission),
    attention: () => later({
      ...fx.attention,
      items: fx.attention.items.filter((i) => !resolved.has(i.id)).map((i) => ({ ...i, qitemState: fx.queue.find((q) => `queue:${q.qitemId}` === i.id)?.state })),
    }),
    attentionDetail: (id) => later(fx.attentionDetail(id)),
    act: async (input) => {
      resolved.add(`queue:${input.qitemId}`);
      return later({ actionId: `mca-${Date.now()}`, verb: input.verb, qitemId: input.qitemId, createdQitemId: null, auditedAt: new Date().toISOString() }, 200);
    },
    queue: () => later(fx.queue),
    rates: () => later(fx.rates),
    projects: () => later(fx.projects),
    specs: () => later(fx.specs),
    specYaml: (spec) => later(spec.yaml, 60),
    terminals: () => later(fx.terminals),
    hosts: () => later(fx.hosts),
    findings: () => later(fx.findings),
    watchdogs: () => later({ jobs: fx.watchdogs, history: fx.watchdogHistory }),
  };
}

export class DaemonError extends Error {
  constructor(public status: number, public code: string, public hint: string | null, message: string) { super(message); }
  /** 503 with a hint is the daemon saying "not set up", not "broken". Views render a setup state. */
  get isSetup() { return this.status === 503 && !!this.hint; }
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { accept: "application/json" } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new DaemonError(res.status, body.error ?? "http_" + res.status, body.hint ?? null, body.message ?? body.what_failed ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

/** Operator identity + write bearer. Both live in settings; the bearer is optional on loopback/Tailscale. */
export const identity = {
  get actor() { return safeGet("rigui.actor") ?? "human@kernel"; },
  get bearer() { return safeGet("rigui.bearer"); },
};
function safeGet(k: string) { try { return localStorage.getItem(k); } catch { return null; } }

export function liveSource(): DataSource {
  const post = async <T,>(path: string, body: unknown): Promise<T> => {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (identity.bearer) headers.authorization = `Bearer ${identity.bearer}`;
    const res = await fetch(path, { method: "POST", headers, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new DaemonError(res.status, json.error ?? "http_" + res.status, json.hint ?? null, json.message ?? json.what_failed ?? res.statusText);
    return json as T;
  };

  return {
    kind: "live",
    health: () => get<Healthz>("/healthz"),
    rigs: () => get<PsEntry[]>("/api/ps"),
    topology: async (rigId) => {
      // /nodes carries the inventory; /api/rigs/:id the edges; /graph the pod labels (podGroup nodes).
      const [rig, nodes, graph, ps] = await Promise.all([
        get<{ rig: { id: string; name: string }; edges: any[] }>(`/api/rigs/${rigId}`),
        get<any[]>(`/api/rigs/${rigId}/nodes`),
        get<{ nodes: any[] }>(`/api/rigs/${rigId}/graph`).catch(() => ({ nodes: [] })),
        get<PsEntry[]>("/api/ps").catch(() => [] as PsEntry[]),
      ]);
      const session = (s: string | null): Seat["session"] =>
        !s ? "absent" : s === "exited" || s === "stopped" ? "exited" : s === "detached" ? "detached" : "present";
      const seats: Seat[] = nodes.map((n) => ({
        logicalId: n.logicalId, podId: n.podId, role: n.role ?? n.logicalId.split(".")[1] ?? n.logicalId,
        canonicalSessionName: n.canonicalSessionName, runtime: n.runtime, model: n.model ?? null, nodeKind: n.nodeKind,
        session: session(n.sessionStatus),
        activity: n.activityState?.activity ?? "unknown",
        activityDisplay: (n.activityState?.display ?? n.agentActivity?.state ?? "unknown").replace(/-/g, " "),
        needsInput: n.activityState?.needsInput?.count ?? 0, startupStatus: n.startupStatus, contextUsedPercentage: n.contextUsage?.usedPercentage ?? null,
        lastActivityAt: n.lastActivityAt ?? null, pendingWorkCount: n.pendingWorkCount ?? 0, inProgressWorkCount: n.inProgressWorkCount ?? 0,
        blockedWorkCount: n.blockedWorkCount ?? 0, heldReason: n.heldReason ?? null, currentQitems: n.currentQitems ?? [], tmuxAttachCommand: n.tmuxAttachCommand ?? null,
      }));
      const podIds = [...new Set(seats.map((s) => s.podId))];
      const pods = podIds.map((id) => {
        const group = graph.nodes.find((g) => g.type === "podGroup" && (g.data?.podId === id || g.id === `pod-${id}`));
        const member = graph.nodes.find((g) => g.type === "rigNode" && g.data?.podId === id);
        const ns = nodes.find((n) => n.podId === id)?.podNamespace ?? id;
        return { id, namespace: ns, label: group?.data?.podLabel ?? member?.data?.podLabel ?? ns, summary: null, continuity: "healthy" as const };
      });
      const byId = new Map(nodes.map((n) => [n.nodeId, n.logicalId as string]));
      const edges = rig.edges.map((e) => ({ id: e.id, sourceId: byId.get(e.sourceId) ?? e.sourceId, targetId: byId.get(e.targetId) ?? e.targetId, kind: e.kind }));
      // The daemon keeps no per-edge handoff counts; delegation edges are the paths work travels.
      const flows = edges.filter((e) => e.kind === "delegates_to").map((e) => ({ from: e.sourceId, to: e.targetId, count: 0 }));
      const me = ps.find((p) => p.rigId === rigId);
      return { rigId, name: rig.rig.name, lifecycleState: me?.lifecycleState ?? "running", pods, seats, edges, flows };
    },
    missionMap: async () => {
      const list = await get<{ instances?: any[] } | any[]>("/api/workflow/list?status=active").catch(() => []);
      const instances = Array.isArray(list) ? list : list.instances ?? [];
      const first = instances[0];
      if (!first) return null;
      const wf = await get<any>(`/api/workflow/${first.instanceId}/trace`);
      // Steps come from the spec; state from the trail and the frontier packets.
      const steps = (wf.spec?.steps ?? []).map((s: any) => {
        const closed = wf.trail?.find((t: any) => t.stepId === s.id);
        const live = wf.frontierPackets?.find((p: any) => p.stepId === s.id);
        return {
          id: s.id, role: s.actor_role, objective: s.objective ?? "", next: [].concat(s.next_hop ?? []),
          state: live ? (live.state === "blocked" ? "waiting" : "active") : closed ? (closed.closureReason === "failed" ? "failed" : "done") : "pending",
          ownerSession: live?.destinationSession ?? closed?.actorSession ?? null, packetQitemId: live?.qitemId ?? null, since: live?.tsUpdated ?? closed?.closedAt ?? null,
        };
      });
      return { missionId: first.boundRig ?? first.workflowName, title: first.workflowName, workflow: { name: first.workflowName, version: first.workflowVersion, instanceId: first.instanceId, status: first.status }, steps };
    },
    attention: async () => {
      const [read, open] = await Promise.all([
        get<AttentionRead>("/api/attention"),
        get<QueueItem[]>("/api/queue/list?attention=1&compact=1&limit=200").catch(() => [] as QueueItem[]),
      ]);
      const state = new Map(open.map((q) => [`queue:${q.qitemId}`, q.state]));
      return { ...read, items: read.items.map((i) => ({ ...i, qitemState: state.get(i.id) })) };
    },
    attentionDetail: async (id) => {
      const read = await get<AttentionRead & { detail: { item: any; lines: string[] } | null }>(`/api/attention?item=${encodeURIComponent(id)}`);
      const item = read.detail?.item ?? read.items.find((i) => i.id === id);
      if (!item) return null;
      const qid = id.startsWith("queue:") ? id.slice(6) : null;
      const qitem = qid ? await get<QueueItem>(`/api/queue/${qid}`).catch(() => null) : null;
      const tr = qid ? await get<any[]>(`/api/queue/${qid}/transitions`).catch(() => []) : [];
      return {
        item, qitem, lines: read.detail?.lines ?? [],
        transitions: tr.map((t) => ({ ts: t.ts, state: t.state, note: t.transition_note ?? null, actor: t.actor_session })),
      };
    },
    act: (input) => post<ActionResult>("/api/mission-control/action", { ...input, actorSession: identity.actor }),
    queue: (rig) => get<QueueItem[]>(`/api/queue/list?activeOnly=1${rig ? `&rig=${rig}` : ""}`),
    // The daemon has no rates endpoint; the console folds recent transitions into weeks.
    rates: async () => foldRates(await get<any[]>("/api/queue/recent-transitions?scope=instance&limit=2000").catch(() => [])),
    projects: async () => {
      // The catalog is /api/scopes/projects; missions and slices come from the slices index (missions is a map by id).
      const [cat, r] = await Promise.all([
        get<{ projects: { id: string; name: string; root: string }[] }>("/api/scopes/projects").catch(() => ({ projects: [] })),
        get<{ slices: any[]; missions: Record<string, any> | any[] }>("/api/slices?filter=all").catch(() => ({ slices: [], missions: {} })),
      ]);
      const missionList = Array.isArray(r.missions) ? r.missions : Object.entries(r.missions).map(([id, m]) => ({ id, ...m }));
      const missions = missionList.map((m: any) => ({
        id: m.id ?? m.missionId, projectId: m.projectId ?? cat.projects[0]?.id ?? "workspace", title: m.displayName ?? m.title ?? m.id, status: m.status ?? "", workflow: m.workflow_spec ?? null,
        slices: r.slices.filter((s) => s.missionId === (m.id ?? m.missionId)).map((s) => ({
          name: s.name, id: s.railItem ?? s.name, missionId: s.missionId, displayName: s.displayName, status: s.status, description: s.description ?? "",
          qitemCount: s.qitemCount, proof: { passed: s.readiness?.passed ?? 0, total: s.readiness?.total ?? 0 }, lastActivityAt: s.lastActivityAt, needsYou: 0,
        })),
      }));
      const projects = cat.projects.length ? cat.projects : [{ id: "workspace", name: "workspace", root: "" }];
      return projects.map((p) => ({ id: p.id, name: p.name, root: p.root, missions: missions.filter((m) => m.projectId === p.id) }));
    },
    specs: async () => {
      // The library lists entries; YAML comes per entry. Workflow specs live in their own registry.
      const [lib, wf] = await Promise.all([
        get<any[]>("/api/specs/library"),
        get<{ specs: any[] }>("/api/workflow/specs").catch(() => ({ specs: [] })),
      ]);
      const entries: SpecEntry[] = lib.map((e) => ({
        id: e.id, name: e.name, version: String(e.version ?? ""), kind: e.kind === "rig" ? "rig" : "agent", purpose: e.summary ?? "",
        sourcePath: e.relativePath ?? e.sourcePath, isBuiltIn: e.sourceType === "builtin", yaml: "",
      }));
      for (const s of wf.specs) entries.push({ name: s.name, version: String(s.version), kind: "workflow", purpose: (s.purpose ?? "").trim(), sourcePath: s.sourcePath, isBuiltIn: s.isBuiltIn, yaml: "" });
      return entries;
    },
    specYaml: async (spec) => {
      if (spec.kind === "workflow") return (await get<{ content: string }>(`/api/files/read?root=specs&path=${encodeURIComponent(spec.sourcePath)}`).catch(() => ({ content: "" }))).content;
      return spec.id ? (await get<{ yaml: string }>(`/api/specs/library/${spec.id}`)).yaml : "";
    },
    terminals: async () => {
      // Views list who has a terminal; each rig's inventory says what the seat is doing; previews are the tails.
      const [v, ps] = await Promise.all([
        get<{ catalog: { view: string; name: string; members: string[] }[] }>("/api/terminal/views?detail=1"),
        get<PsEntry[]>("/api/ps").catch(() => [] as PsEntry[]),
      ]);
      const inv = (await Promise.all(ps.map((r) => get<any[]>(`/api/rigs/${r.rigId}/nodes`).catch(() => [])))).flat();
      const bySession = new Map(inv.map((n) => [n.canonicalSessionName as string, n]));
      const members = v.catalog.flatMap((c) => c.members.map((m) => ({ rig: c.name, session: m })));
      return Promise.all(members.map(async ({ rig, session }) => {
        const p = await get<{ content: string }>(`/api/sessions/${encodeURIComponent(session)}/preview?lines=14`).catch(() => ({ content: "" }));
        const lines = p.content.split("\n").map((l) => l.replace(/\s+$/, "")).filter((l, i, a) => l || (i > 0 && a[i - 1]));
        const n = bySession.get(session);
        return {
          sessionName: session, logicalId: n?.logicalId ?? session.split("@")[0]!.replace("-", "."), rigName: rig, runtime: n?.runtime ?? "",
          activity: (n?.activityState?.activity ?? "unknown") as TerminalView["activity"], lines: lines.slice(-12),
          attachCommand: n?.tmuxAttachCommand ?? `tmux attach -t ${session}`, lastOutputAt: n?.lastActivityAt ?? null,
          needsInput: n?.activityState?.needsInput?.count ?? 0,
        };
      }));
    },
    hosts: async () => {
      const r = await get<{ ownName: string; selected: string; hosts: HostEntry[] }>("/api/hosts");
      // The local daemon is implicit in the registry; show it first.
      return [{ id: "local", transport: "http", target: location.host, selected: r.selected === "local", status: "reachable", notes: `this machine (${r.ownName})` }, ...r.hosts];
    },
    findings: async () => {
      const r = await get<{ records?: any[] }>("/api/health");
      return (r.records ?? []).map((f) => ({
        id: f.findingId ?? f.id, detector: f.detector, category: f.category, severity: f.severity, status: f.status, summary: f.summary,
        explanation: f.explanation ?? "", suggestedInspection: f.suggestedInspection ?? null, startedAt: f.startedAt,
        scope: typeof f.scope === "string" ? f.scope : `${f.scope?.type ?? ""} ${f.scope?.id ?? f.scope?.name ?? ""}`.trim(),
      }));
    },
    watchdogs: async () => {
      const jobs = await get<WatchdogJob[]>("/api/watchdog/list");
      const statuses = await Promise.all(jobs.slice(0, 12).map((j) => get<{ recentHistory: WatchdogHistoryEntry[] }>(`/api/watchdog/${j.jobId}/status`).catch(() => ({ recentHistory: [] }))));
      return { jobs, history: statuses.flatMap((s) => s.recentHistory).sort((a, b) => b.evaluatedAt.localeCompare(a.evaluatedAt)) };
    },
  };
}

function foldRates(rows: { ts: string; state: string }[]): QueueRates {
  const weeks = 12, out: QueueRates = { weekOf: [], created: [], claimed: [], closed: [], handedOff: [] };
  const monday = (d: Date) => { const x = new Date(d); x.setUTCHours(0, 0, 0, 0); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x; };
  const start = monday(new Date(Date.now() - (weeks - 1) * 7 * 864e5));
  for (let i = 0; i < weeks; i++) {
    const d = new Date(start.getTime() + i * 7 * 864e5);
    out.weekOf.push(`${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`);
    out.created.push(0); out.claimed.push(0); out.closed.push(0); out.handedOff.push(0);
  }
  for (const r of rows) {
    const i = Math.floor((new Date(r.ts.replace(" ", "T") + (r.ts.includes("Z") ? "" : "Z")).getTime() - start.getTime()) / (7 * 864e5));
    if (i < 0 || i >= weeks) continue;
    if (r.state === "pending") out.created[i]!++;
    else if (r.state === "in-progress") out.claimed[i]!++;
    else if (r.state === "handed-off") out.handedOff[i]!++;
    else if (["done", "failed", "denied", "canceled"].includes(r.state)) out.closed[i]!++;
  }
  return out;
}

/** Probe the daemon; fall back to sample data when there is none. `?source=sample|live` forces one. */
export async function pickSource(): Promise<DataSource> {
  const forced = new URLSearchParams(location.search).get("source");
  if (forced === "sample") return sampleSource();
  if (forced === "live") return liveSource();
  try {
    const res = await fetch("/healthz", { signal: AbortSignal.timeout(1500) });
    const body = res.ok ? await res.json() : null;
    if (body?.status === "ok") return liveSource();
  } catch { /* no daemon */ }
  return sampleSource();
}

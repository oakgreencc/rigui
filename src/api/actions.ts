// What a human can do from the console, in one registry. An action is either `api` (the console performs it
// through the daemon, with a receipt) or `cli` (the console shows the exact `rig` command to copy). Today only
// attention verbs are `api`; flipping a structural action to `api` is a one-line change here plus its call in source.ts.
import type { MissionControlVerb } from "./types";

export type ActionMode = "api" | "cli";

export interface ActionDef {
  id: string;
  label: string;
  mode: ActionMode;
  verb?: MissionControlVerb;
  /** What the receipt says once it lands. */
  receipt?: (subject: string) => string;
  /** The equivalent command, shown for cli actions and as "or run" for api ones. */
  cli: (a: Record<string, string>) => string;
  needs?: "reason" | "decision" | "destination";
}

export const ACTIONS = {
  approve: { id: "approve", label: "Approve", mode: "api", verb: "approve", receipt: (s) => `Approved · ${s}`, cli: (a) => `rig queue update ${a.qitemId} --state done --closure-reason no-follow-on` },
  deny: { id: "deny", label: "Deny", mode: "api", verb: "deny", needs: "reason", receipt: (s) => `Denied · ${s}`, cli: (a) => `rig queue update ${a.qitemId} --state denied --reason "${a.reason ?? "…"}"` },
  route: { id: "route", label: "Route to…", mode: "api", verb: "route", needs: "destination", receipt: (s) => `Routed · ${s}`, cli: (a) => `rig queue handoff ${a.qitemId} --to ${a.destinationSession ?? "<seat>"}` },
  hold: { id: "hold", label: "Hold", mode: "api", verb: "hold", needs: "reason", receipt: (s) => `Held · ${s}`, cli: (a) => `rig queue update ${a.qitemId} --state blocked --blocked-on human@kernel` },
  drop: { id: "drop", label: "Drop", mode: "api", verb: "drop", receipt: (s) => `Dropped · ${s}`, cli: (a) => `rig queue update ${a.qitemId} --state canceled` },
  resolve: { id: "resolve", label: "Send decision", mode: "api", verb: "resolve", needs: "decision", receipt: (s) => `Decision sent · ${s}`, cli: (a) => `rig queue update ${a.qitemId} --state in-progress --note "${a.decision ?? "…"}"` },
  annotate: { id: "annotate", label: "Add note", mode: "api", verb: "annotate", receipt: (s) => `Note added · ${s}`, cli: (a) => `rig mission-control annotate ${a.qitemId} "…"` },
  // Structural: cli until the daemon guards these writes with the bearer.
  relaunchSeat: { id: "relaunchSeat", label: "Relaunch seat", mode: "cli", cli: (a) => `rig seat launch ${a.session} --reason "${a.reason ?? "recover"}"` },
  clearAttention: { id: "clearAttention", label: "Clear seat attention", mode: "cli", cli: (a) => `rig session clear-attention ${a.session}` },
  send: { id: "send", label: "Ask the seat", mode: "cli", cli: (a) => `rig send ${a.session} "${a.body ?? "status?"}"` },
  attach: { id: "attach", label: "Attach terminal", mode: "cli", cli: (a) => a.attach ?? `tmux attach -t ${a.session}` },
  snapshot: { id: "snapshot", label: "Snapshot rig", mode: "cli", cli: (a) => `rig snapshot ${a.rig}` },
  restore: { id: "restore", label: "Restore rig", mode: "cli", cli: (a) => `rig restore ${a.rig}` },
  up: { id: "up", label: "Start rig", mode: "cli", cli: (a) => `rig up ${a.rig}` },
  resumeWorkflow: { id: "resumeWorkflow", label: "Resume workflow", mode: "cli", cli: (a) => `rig workflow resume ${a.instanceId} --decision "…"` },
  stopWatchdog: { id: "stopWatchdog", label: "Stop job", mode: "cli", cli: (a) => `rig watchdog stop ${a.jobId}` },
} satisfies Record<string, ActionDef>;

export type ActionId = keyof typeof ACTIONS;

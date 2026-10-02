// Turns a rig and its mission into bodies on orbits. Pure: same inputs, same sky.
import type { MissionMap, RigTopology } from "../api/types";
import { podStatus, seatStatus, stepStatus, type Status } from "../lib/status";
import { isHuman, shortSession } from "../lib/format";
import { evenAngles, polar, R, sectors, SIZE, type Pt } from "./geometry";

export type Layer = "rig" | "mission";
export type BodyKind = "pod" | "seat" | "step";
/** mote: a seat in shadow — a small body just inside the track beside its pod, so it is never missing. */
export type Place = "station" | "satellite" | "track" | "mote" | "hidden";

export interface Body {
  id: string; // "pod:pod-dev" | "seat:dev.impl" | "step:build"
  kind: BodyKind;
  layer: Layer;
  place: Place;
  at: Pt;
  angle: number;
  w: number; h: number;
  name: string; // big line
  sub: string; // second line
  aside?: string; // right-aligned figure (count, age)
  status: Status;
  parent?: string;
}

export interface Link { id: string; from: Pt; to: Pt; kind: "spoke" | "holds" | "you"; ends: [string, string]; tone?: Status["tone"] }
export interface Flow {
  id: string; d: string; moving: boolean; label?: string; ends: [string, string];
  along?: { r: number; a1: number; a2: number };
  /** Seats whose handoffs make up this flow; hovering one lights it. */
  via?: string[];
}

export interface Scene { bodies: Body[]; links: Link[]; flows: Flow[]; lit: Layer }

export const SUN_ID = "sun";

export function buildScene(topo: RigTopology, mission: MissionMap | null, lit: Layer, narrow: boolean): Scene {
  const k = narrow ? 1.55 : 1;
  const st = { w: SIZE.station.w * k, h: SIZE.station.h * k };
  const tr = { w: SIZE.track.w * k, h: SIZE.track.h * k };
  const sat = narrow ? { w: SIZE.dot.w * 1.4, h: SIZE.dot.h * 1.4 } : SIZE.satellite;
  const bodies: Body[] = [];

  // --- Rig layer ---
  const podSeats = topo.pods.map((p) => topo.seats.filter((s) => s.podId === p.id));
  const sec = sectors(podSeats.map((x) => x.length));
  const podTrack = evenAngles(topo.pods.length, -90 + 180 / Math.max(1, topo.pods.length));
  topo.pods.forEach((p, i) => {
    const ps = podStatus(p, topo.seats);
    const angle = lit === "rig" ? sec[i]!.centre : podTrack[i]!;
    const r = lit === "rig" ? R.station : R.track;
    const size = lit === "rig" ? st : tr;
    bodies.push({
      id: `pod:${p.id}`, kind: "pod", layer: "rig", place: lit === "rig" ? "station" : "track", at: polar(r, angle), angle, ...size,
      name: p.namespace, sub: lit === "rig" ? ps.reason : p.label, aside: `${ps.working}/${ps.total}`, status: ps,
    });
    const count = podSeats[i]!.length;
    podSeats[i]!.forEach((s, j) => {
      const a = sec[i]!.members[j]!;
      const status = seatStatus(s);
      const moteAngle = podTrack[i]! + (j - (count - 1) / 2) * (narrow ? 5.5 : 4);
      const mote = { w: narrow ? 16 : 10, h: narrow ? 16 : 10 };
      bodies.push({
        id: `seat:${s.logicalId}`, kind: "seat", layer: "rig", place: lit === "rig" ? "satellite" : "mote",
        at: lit === "rig" ? polar(R.satellite, a) : polar(R.track - (narrow ? 62 : 38), moteAngle), angle: a, ...(lit === "rig" ? sat : mote),
        name: s.logicalId.split(".")[1] ?? s.logicalId, sub: status.reason, status, parent: `pod:${p.id}`,
      });
    });
  });

  // --- Mission layer ---
  const steps = mission?.steps ?? [];
  const stepAngles = evenAngles(steps.length, -90);
  steps.forEach((s, i) => {
    const status = stepStatus(s, topo);
    const angle = stepAngles[i]!;
    bodies.push({
      id: `step:${s.id}`, kind: "step", layer: "mission", place: lit === "mission" ? "station" : "track",
      at: polar(lit === "mission" ? R.station : R.track, angle), angle, ...(lit === "mission" ? st : tr),
      // "you · yours" says it twice; a human-held step carries its reason alone.
      name: s.id, sub: lit === "mission" && s.ownerSession && !isHuman(s.ownerSession) ? `${shortSession(s.ownerSession)} · ${status.reason}` : status.reason, status,
    });
  });

  const byId = new Map(bodies.map((b) => [b.id, b]));
  const center: Pt = { x: 0, y: 0 };
  const links: Link[] = [];
  const flows: Flow[] = [];
  const seatBySession = new Map(topo.seats.map((s) => [s.canonicalSessionName, s]));

  if (lit === "rig") {
    // Spokes: each pod to its satellites.
    for (const b of bodies) if (b.kind === "seat" && b.parent) links.push({ id: `sp:${b.id}`, from: byId.get(b.parent)!.at, to: b.at, kind: "spoke", ends: [b.parent, b.id] });
    // Seats reach out to the steps they hold on the shadow track.
    for (const s of steps) {
      const step = byId.get(`step:${s.id}`)!;
      const seat = s.ownerSession ? seatBySession.get(s.ownerSession) : null;
      if (seat && s.state !== "done" && s.state !== "pending") links.push({ id: `h:${s.id}`, from: byId.get(`seat:${seat.logicalId}`)!.at, to: step.at, kind: "holds", ends: [`seat:${seat.logicalId}`, step.id], tone: step.status.tone });
      if (isHuman(s.ownerSession) && s.state !== "done") links.push({ id: `y:${s.id}`, from: step.at, to: center, kind: "you", ends: [step.id, SUN_ID] });
    }
    // Anything blocked on you draws a line to the sun.
    for (const b of bodies) if (b.kind === "seat" && b.status.tone === "human") links.push({ id: `y:${b.id}`, from: b.at, to: center, kind: "you", ends: [b.id, SUN_ID] });
    // Handoffs travel between pods, along the station orbit. Seat-level pairs fold into their pods;
    // hops inside one pod stay off the map (the drawer lists them).
    const podOf = new Map(topo.seats.map((s) => [s.logicalId, s.podId]));
    const pairs = new Map<string, { from: string; to: string; count: number; moving: boolean; seats: string[] }>();
    for (const f of topo.flows) {
      const pa = podOf.get(f.from), pb = podOf.get(f.to);
      if (!pa || !pb || pa === pb) continue;
      const key = `${pa}>${pb}`;
      const src = byId.get(`seat:${f.from}`);
      const e = pairs.get(key) ?? { from: pa, to: pb, count: 0, moving: false, seats: [] };
      e.count += f.count;
      e.moving ||= src?.status.tone === "ok";
      e.seats.push(`seat:${f.from}`, `seat:${f.to}`);
      pairs.set(key, e);
    }
    const podAngle = new Map(topo.pods.map((p, i) => [p.id, sec[i]!.centre]));
    for (const [key, e] of pairs) {
      // A pair flowing both ways splits onto two lanes so the arrows don't sit on each other.
      const lane = pairs.has(`${e.to}>${e.from}`) && e.from > e.to ? 16 : 0;
      flows.push({
        id: `f:${key}`, d: "", moving: e.moving, label: e.count ? String(e.count) : undefined, ends: [`pod:${e.from}`, `pod:${e.to}`],
        along: { r: R.station + lane, a1: podAngle.get(e.from)!, a2: podAngle.get(e.to)! }, via: e.seats,
      });
    }
  } else {
    // Steps reach out to the pod whose seat holds them.
    for (const s of steps) {
      const step = byId.get(`step:${s.id}`)!;
      const seat = s.ownerSession ? seatBySession.get(s.ownerSession) : null;
      if (seat && s.state !== "done") links.push({ id: `h:${s.id}`, from: step.at, to: byId.get(`pod:${seat.podId}`)!.at, kind: "holds", ends: [step.id, `pod:${seat.podId}`], tone: step.status.tone });
      if (isHuman(s.ownerSession) && s.state !== "done") links.push({ id: `y:${s.id}`, from: step.at, to: center, kind: "you", ends: [step.id, SUN_ID] });
    }
    // The workflow's hops run along the station orbit.
    steps.forEach((s, i) => {
      for (const n of s.next) {
        const j = steps.findIndex((x) => x.id === n);
        if (j < 0) continue;
        const a = byId.get(`step:${s.id}`)!;
        flows.push({ id: `hop:${s.id}>${n}`, d: "", moving: a.status.tone === "ok", ends: [a.id, `step:${n}`], along: { r: R.station, a1: stepAngles[i]!, a2: stepAngles[j]! } });
      }
    });
  }
  return { bodies, links, flows, lit };
}

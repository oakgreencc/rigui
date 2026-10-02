// Orrery geometry. One square sky, centre (0,0), radius 500 user units.
// The lit layer owns the inner orbit (stations) and, for the rig, a satellite orbit (seats).
// The shadow layer collapses onto the outer track. Angles are degrees, 0 = three o'clock, clockwise.

export const R = { station: 228, satellite: 350, track: 452 } as const;
export const SIZE = {
  station: { w: 140, h: 74 },
  satellite: { w: 104, h: 40 },
  dot: { w: 16, h: 16 },
  track: { w: 78, h: 30 },
} as const;

export interface Pt { x: number; y: number }
export const rad = (d: number) => (d * Math.PI) / 180;
export const polar = (r: number, deg: number): Pt => ({ x: r * Math.cos(rad(deg)), y: r * Math.sin(rad(deg)) });

/** Evenly around the circle, first body at `start` degrees. */
export function evenAngles(n: number, start = -90): number[] {
  return Array.from({ length: n }, (_, i) => start + (360 / Math.max(1, n)) * i);
}

/**
 * Sectors sized by weight (seat count), so a big pod gets room for its satellites.
 * Returns each group's centre angle and the angles of its members.
 */
export function sectors(weights: number[], start = -90, minWeight = 1.4): { centre: number; members: number[] }[] {
  const w = weights.map((x) => Math.max(minWeight, x));
  const total = w.reduce((a, b) => a + b, 0) || 1;
  let a = start - (360 * w[0]!) / total / 2;
  return w.map((wi, i) => {
    const span = (360 * wi) / total;
    const n = weights[i]!;
    const step = n > 0 ? Math.min(span / n, 19) : 0;
    const centre = a + span / 2;
    const members = Array.from({ length: n }, (_, k) => centre + (k - (n - 1) / 2) * step);
    a += span;
    return { centre, members };
  });
}

/** Where a segment from a box's centre toward `p` leaves the box. */
export function boxEdge(c: Pt, w: number, h: number, p: Pt, pad = 3): Pt {
  const dx = p.x - c.x, dy = p.y - c.y;
  if (!dx && !dy) return c;
  const sx = (w / 2 + pad) / Math.abs(dx || 1e-9), sy = (h / 2 + pad) / Math.abs(dy || 1e-9);
  const s = Math.min(sx, sy);
  return { x: c.x + dx * s, y: c.y + dy * s };
}

/** A curve between two bodies that bows toward the centre (inner flows). */
export function bowPath(a: Pt, b: Pt, bow = 0.42): string {
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const c = { x: m.x * (1 - bow), y: m.y * (1 - bow) };
  return `M${a.x.toFixed(1)},${a.y.toFixed(1)} Q${c.x.toFixed(1)},${c.y.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
}

/** An arc along a circle of radius r from angle a1 to a2 (clockwise), trimmed by `trim` degrees at each end. */
export function orbitArc(r: number, a1: number, a2: number, trim: number): string {
  let s = a1 + trim, e = a2 - trim;
  while (e < s) e += 360;
  const p = polar(r, s), q = polar(r, e);
  const large = e - s > 180 ? 1 : 0;
  return `M${p.x.toFixed(1)},${p.y.toFixed(1)} A${r},${r} 0 ${large} 1 ${q.x.toFixed(1)},${q.y.toFixed(1)}`;
}

/**
 * An arc along the orbit from a1 to a2 the short way round, trimmed off both boxes, with its arrowhead at a2.
 * Travel direction is preserved: a counter-clockwise hop draws counter-clockwise.
 */
export function arcBetween(r: number, a1: number, a2: number, trim: number, size = 7): { d: string; head: string } {
  let delta = (((a2 - a1) % 360) + 540) % 360 - 180; // -180..180, sign = direction
  if (delta === -180) delta = 180;
  const dir = Math.sign(delta) || 1;
  const s = a1 + dir * trim, e = a2 - dir * trim;
  const p = polar(r, s), q = polar(r, e);
  const d = `M${p.x.toFixed(1)},${p.y.toFixed(1)} A${r},${r} 0 0 ${dir > 0 ? 1 : 0} ${q.x.toFixed(1)},${q.y.toFixed(1)}`;
  const back = polar(r, e - dir * 2.6);
  const dx = q.x - back.x, dy = q.y - back.y, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux, bx = q.x - ux * size, by = q.y - uy * size;
  const head = `M${q.x.toFixed(1)},${q.y.toFixed(1)} L${(bx + nx * size * 0.55).toFixed(1)},${(by + ny * size * 0.55).toFixed(1)} L${(bx - nx * size * 0.55).toFixed(1)},${(by - ny * size * 0.55).toFixed(1)}Z`;
  return { d, head };
}

/** Degrees a box of half-width hw occupies on an orbit, for trimming arcs off its edges. */
export const trimFor = (r: number, hw: number) => (Math.asin(Math.min(0.99, hw / r)) * 180) / Math.PI + 1.5;

/** Arrowhead at the end of an arc, pointing along the direction of travel. */
export function arcHead(r: number, a: number, trim: number, size = 7): string {
  const tip = polar(r, a - trim), back = polar(r, a - trim - 2.6);
  const dx = tip.x - back.x, dy = tip.y - back.y, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  const bx = tip.x - ux * size, by = tip.y - uy * size;
  return `M${tip.x.toFixed(1)},${tip.y.toFixed(1)} L${(bx + nx * size * 0.55).toFixed(1)},${(by + ny * size * 0.55).toFixed(1)} L${(bx - nx * size * 0.55).toFixed(1)},${(by - ny * size * 0.55).toFixed(1)}Z`;
}

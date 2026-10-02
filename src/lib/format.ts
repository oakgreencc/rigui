/** Normalizes both daemon time formats: ISO, and SQLite "YYYY-MM-DD HH:MM:SS" (UTC, no zone). */
export function toDate(ts: string | null | undefined): Date | null {
  if (!ts) return null;
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(ts) ? ts.replace(" ", "T") + "Z" : ts;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function minutesSince(ts: string | null | undefined): number | null {
  const d = toDate(ts);
  return d ? Math.max(0, (Date.now() - d.getTime()) / 60_000) : null;
}

const NB = " "; // ages never break across lines

/** "now", "4m", "2h 11m", "3d". */
export function age(ts: string | null | undefined): string {
  const m = minutesSince(ts);
  if (m === null) return "—";
  if (m < 1) return "now";
  if (m < 60) return `${Math.floor(m)}m`;
  if (m < 60 * 24) { const h = Math.floor(m / 60), r = Math.floor(m % 60); return r && h < 10 ? `${h}h${NB}${r}m` : `${h}h`; }
  return `${Math.floor(m / 1440)}d`;
}

export function clock(ts: string | null | undefined): string {
  const d = toDate(ts);
  return d ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : "—";
}

export function interval(sec: number): string {
  if (sec % 3600 === 0) return `every ${sec / 3600}h`;
  if (sec % 60 === 0) return `every ${sec / 60}m`;
  return `every ${sec}s`;
}

/**
 * A human seat: `human@kernel`, `human-<name>@host`, `<pod>-human@kernel` (the operator seat a real install
 * boots, e.g. operator-human@kernel), or a gateway `<id>@external`.
 */
export function isHuman(s: string | null | undefined): boolean {
  if (!s) return false;
  const [member = "", host = ""] = s.split("@");
  return host === "external" || /(^|-)human($|-)/.test(member);
}

/** "dev-impl@demo-rig" → "dev-impl"; humans read as "you". */
export function shortSession(s: string | null | undefined): string {
  if (!s) return "nobody";
  if (isHuman(s)) return "you";
  return s.split("@")[0] ?? s;
}

/** "4m ago" that stays on one line. */
export const ago = (ts: string | null | undefined) => { const a = age(ts); return a === "now" ? `just${NB}now` : `${a}${NB}ago`; };

export const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

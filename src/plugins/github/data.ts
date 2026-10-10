// Reads from the dev server's GitHub bridge. One query per repo and kind, shared by the tab and its nav count.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { DaemonError } from "../../api/source";
import type { CiSnapshot, IssuesSnapshot } from "./types";

const EVERY = 60_000;

async function read<T>(repo: string, kind: "ci" | "issues", fresh = false): Promise<T> {
  const res = await fetch(`/__gh/${repo}/${kind}${fresh ? "?fresh" : ""}`, { headers: { accept: "application/json" } });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) {
    // A static build has no bridge: the SPA fallback answers with HTML, which fails to parse.
    if (!body) throw new DaemonError(503, "no_bridge", "npm run dev", "The GitHub tabs read through the dev server's bridge, and this build has none.");
    throw new DaemonError(res.status, body.error ?? "github", body.hint ?? null, body.message ?? res.statusText);
  }
  return body as T;
}

const keyOf = (repo: string, kind: string) => ["github", repo, kind];

export const useCi = (repo: string) =>
  useQuery({ queryKey: keyOf(repo, "ci"), queryFn: () => read<CiSnapshot>(repo, "ci"), refetchInterval: EVERY, staleTime: 30_000, retry: 0 });

export const useIssues = (repo: string) =>
  useQuery({ queryKey: keyOf(repo, "issues"), queryFn: () => read<IssuesSnapshot>(repo, "issues"), refetchInterval: EVERY * 2, staleTime: 60_000, retry: 0 });

/** Skip the bridge's cache and write the answer straight into the shared query. */
export function useRefresh(repo: string, kind: "ci" | "issues") {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try { qc.setQueryData(keyOf(repo, kind), await read(repo, kind, true)); }
    catch { await qc.invalidateQueries({ queryKey: keyOf(repo, kind) }); }
    finally { setBusy(false); }
  };
  return { busy, run };
}

export const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : NaN);

/** "42s", "12m", "1h 05m". Durations, not ages. */
export function dur(msec: number): string {
  if (!Number.isFinite(msec) || msec < 0) return "—";
  const s = Math.round(msec / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

export const median = (xs: number[]) => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const h = v.length >> 1;
  return v.length % 2 ? v[h]! : (v[h - 1]! + v[h]!) / 2;
};

import { createContext, useContext, useEffect } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { ActInput, DataSource } from "./source";

export const SourceContext = createContext<DataSource | null>(null);
export function useSource() {
  const s = useContext(SourceContext);
  if (!s) throw new Error("useSource outside SourceContext");
  return s;
}

// The daemon's projection endpoints are expensive; SSE drives freshness, polling is the slow fallback.
const SLOW = 30_000;

export const useHealth = () => { const s = useSource(); return useQuery({ queryKey: ["health"], queryFn: () => s.health(), refetchInterval: SLOW }); };
export const useRigs = () => { const s = useSource(); return useQuery({ queryKey: ["rigs"], queryFn: () => s.rigs(), refetchInterval: SLOW }); };
export const useTopology = (rigId: string | null) => {
  const s = useSource();
  return useQuery({ queryKey: ["topology", rigId], queryFn: () => s.topology(rigId!), enabled: !!rigId, refetchInterval: SLOW });
};
export const useMissionMap = (rigId: string | null) => {
  const s = useSource();
  return useQuery({ queryKey: ["mission", rigId], queryFn: () => s.missionMap(rigId!), enabled: !!rigId, refetchInterval: SLOW });
};
export const useAttention = () => { const s = useSource(); return useQuery({ queryKey: ["attention"], queryFn: () => s.attention(), refetchInterval: SLOW }); };
export const useAttentionDetail = (id: string | null) => {
  const s = useSource();
  return useQuery({ queryKey: ["attention", "detail", id], queryFn: () => s.attentionDetail(id!), enabled: !!id });
};
/** Under the "attention" key so every event and action that refreshes the inbox refreshes this too. */
export const useHumanDone = (enabled = true) => {
  const s = useSource();
  return useQuery({ queryKey: ["attention", "done"], queryFn: () => s.humanDone(), enabled, refetchInterval: SLOW });
};
export const useQitemTrail = (qitemId: string | null) => {
  const s = useSource();
  return useQuery({ queryKey: ["attention", "trail", qitemId], queryFn: () => s.qitemTrail(qitemId!), enabled: !!qitemId });
};
export const useQueue = (rig?: string) => { const s = useSource(); return useQuery({ queryKey: ["queue", rig], queryFn: () => s.queue(rig) }); };
export const useRates = () => { const s = useSource(); return useQuery({ queryKey: ["rates"], queryFn: () => s.rates(), staleTime: 5 * 60_000 }); };
export const useProjects = () => { const s = useSource(); return useQuery({ queryKey: ["projects"], queryFn: () => s.projects() }); };
export const useSpecs = () => { const s = useSource(); return useQuery({ queryKey: ["specs"], queryFn: () => s.specs(), staleTime: 5 * 60_000 }); };
export const useTerminals = () => { const s = useSource(); return useQuery({ queryKey: ["terminals"], queryFn: () => s.terminals(), refetchInterval: 5_000 }); };
/**
 * Seats sitting at an approval prompt, across every rig. The daemon doesn't route these to Attention (no qitem),
 * but a seat waiting on a keypress is waiting on a human, so the console counts it as waiting on you.
 */
export const usePrompts = () => {
  const t = useTerminals();
  return { ...t, data: t.data?.filter((x) => (x.needsInput ?? 0) > 0) };
};
export const useHosts = () => { const s = useSource(); return useQuery({ queryKey: ["hosts"], queryFn: () => s.hosts(), refetchInterval: SLOW }); };
export const useFindings = () => { const s = useSource(); return useQuery({ queryKey: ["findings"], queryFn: () => s.findings(), refetchInterval: SLOW }); };
export const useWatchdogs = () => { const s = useSource(); return useQuery({ queryKey: ["watchdogs"], queryFn: () => s.watchdogs(), refetchInterval: SLOW }); };

export function useAct() {
  const s = useSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ActInput) => s.act(input),
    onSettled: () => { qc.invalidateQueries({ queryKey: ["attention"] }); qc.invalidateQueries({ queryKey: ["queue"] }); },
  });
}

// Event type prefix → the queries it makes stale. After the old UI's invalidation map, widened to the console's reads.
const INVALIDATES: [RegExp, string[]][] = [
  [/^(queue|qitem|inbox)\./, ["attention", "queue", "topology", "mission"]],
  [/^mission_control\./, ["attention", "queue"]],
  [/^(node|session|seat|agent)\./, ["topology", "rigs", "terminals"]],
  [/^(rig|pod|restore|snapshot)\./, ["rigs", "topology"]],
  [/^workflow/, ["mission", "projects"]],
  [/^proof\./, ["attention", "projects"]],
  [/^watchdog\./, ["watchdogs"]],
];

/**
 * One EventSource on /api/events. Seeded with Last-Event-ID from the last seen seq, so a reload never replays
 * the whole log (a bare EventSource would). EventSource can't set headers, so the seq rides as a query param
 * fallback too; the daemon reads the header on reconnects the browser makes itself.
 */
export function useLiveEvents(qc: QueryClient, source: DataSource) {
  useEffect(() => {
    if (source.kind !== "live" || typeof EventSource === "undefined") return;
    let last = Number(sessionStorageGet("rigui.lastSeq") ?? 0);
    const es = new EventSource(`/api/events${last ? `?since=${last}` : ""}`);
    let timer: number | undefined;
    const stale = new Set<string>();
    es.onmessage = (m) => {
      const seq = Number(m.lastEventId);
      if (seq) { last = seq; sessionStorageSet("rigui.lastSeq", String(seq)); }
      let type = "";
      try { type = JSON.parse(m.data).type ?? ""; } catch { return; }
      for (const [re, keys] of INVALIDATES) if (re.test(type)) keys.forEach((k) => stale.add(k));
      clearTimeout(timer);
      timer = window.setTimeout(() => { stale.forEach((k) => qc.invalidateQueries({ queryKey: [k] })); stale.clear(); }, 150);
    };
    return () => { es.close(); clearTimeout(timer); };
  }, [qc, source]);
}

function sessionStorageGet(k: string) { try { return sessionStorage.getItem(k); } catch { return null; } }
function sessionStorageSet(k: string, v: string) { try { sessionStorage.setItem(k, v); } catch { /* private mode */ } }

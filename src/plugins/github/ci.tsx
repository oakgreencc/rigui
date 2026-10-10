import { lazy, useMemo } from "react";
import { definePlugin, type NavCount } from "../types";
import { stalled, timeRun, trunkHealth, LONG_WAIT_MS } from "./ci-model";
import { useCi } from "./data";
import { GLYPH } from "./ui";

export interface GithubCiOptions { repo: string; id?: string; label?: string }

/** A tab that reads a repository's Actions runs: who is waiting, what the runners did, whether the trunk is green. */
export function githubCi({ repo, id = "ci", label = "CI" }: GithubCiOptions) {
  const View = lazy(() => import("./CiView").then((m) => ({ default: () => <m.default repo={repo} pluginId={id} /> })));
  return definePlugin({
    id, label, icon: GLYPH.ci, view: View,
    useCount(): NavCount | undefined {
      const q = useCi(repo);
      return useMemo(() => {
        if (!q.data) return q.error ? { text: "offline" } : undefined;
        const now = Date.now();
        const timed = q.data.runs.map((r) => timeRun(r, now));
        const red = trunkHealth(timed).find((t) => t.red.length);
        if (red) return { text: `${red.branch} red`, tone: "danger" };
        const stall = stalled(timed, now);
        if (stall) return { text: `${stall.waiting} stuck`, tone: "danger" };
        const waiting = timed.filter((t) => t.phase === "waiting");
        if (waiting.length) return { text: `${waiting.length} waiting`, tone: waiting.some((t) => t.wait > LONG_WAIT_MS) ? "warn" : undefined };
        const running = timed.filter((t) => t.phase === "running").length;
        return { text: running ? `${running} running` : "green" };
      }, [q.data, q.error]);
    },
  });
}

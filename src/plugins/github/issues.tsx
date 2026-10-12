import { lazy, useMemo } from "react";
import { definePlugin, type NavCount } from "../types";
import { useIssues } from "./data";
import { DEFAULT_LENS, holdOf, type IssueLens } from "./issues-model";
import { GLYPH } from "./ui";

export interface GithubIssuesOptions { repo: string; id?: string; label?: string; lens?: Partial<IssueLens> }

/** A tab that lays a repository's open issues out by label: one namespace down, one across, each issue a mote. */
export function githubIssues({ repo, id = "issues", label = "Issues", lens: over }: GithubIssuesOptions) {
  const lens: IssueLens = { ...DEFAULT_LENS, ...over };
  const View = lazy(() => import("./IssuesView").then((m) => ({ default: () => <m.default repo={repo} pluginId={id} lens={lens} /> })));
  return definePlugin({
    id, label, icon: GLYPH.issues, view: View,
    useCount(): NavCount | undefined {
      const q = useIssues(repo);
      return useMemo(() => {
        if (!q.data) return q.error ? { text: "offline" } : undefined;
        const you = q.data.open.filter((i) => holdOf(i, lens).id === "you").length;
        return you ? { text: `${you} on you`, tone: "human" } : { text: `${q.data.open.length} open` };
      }, [q.data, q.error]);
    },
  });
}

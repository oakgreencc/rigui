// The tabs this console carries beyond the core views. Add a plugin here and it gets a route, a nav row and a title.
import { githubCi } from "./plugins/github/ci";
import { githubIssues } from "./plugins/github/issues";
import type { RiguiPlugin } from "./plugins/types";

export const PLUGINS: RiguiPlugin[] = [
  githubCi({ repo: "sektorapp/monorepo" }),
  githubIssues({ repo: "sektorapp/monorepo" }),
];

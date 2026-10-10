// The GitHub bridge's snapshots (server/github.ts shapes them). Times are ISO strings from GitHub.

export interface CiJob {
  id: number; name: string; status: string; conclusion: string | null;
  startedAt: string | null; completedAt: string | null; runner: string | null; url: string; failedStep: string | null;
}

export interface CiRun {
  id: number; workflow: string; workflowId: number; title: string; branch: string; event: string;
  status: string; conclusion: string | null; createdAt: string; updatedAt: string; attempt: number; number: number;
  url: string; actor: string | null; sha: string; jobs: CiJob[];
}

export interface CiSnapshot {
  repo: string; fetchedAt: string; days: number;
  workflows: { id: number; name: string; path: string; state: string }[];
  runs: CiRun[];
}

export interface Issue {
  number: number; title: string; state: "open" | "closed"; labels: string[];
  createdAt: string; updatedAt: string; closedAt: string | null; comments: number; url: string;
  author: string | null; assignees: string[]; excerpt: string;
}

export interface IssuesSnapshot {
  repo: string; fetchedAt: string;
  labels: { name: string; description: string | null }[];
  open: Issue[];
  /** Closed in the last 28 days. */
  closed: Issue[];
}

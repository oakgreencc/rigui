// The GitHub bridge for the dev server: read-only GETs against the REST API, shaped into the small
// snapshots the GitHub plugins render. Auth is a GitHub App installation token (RIGUI_GITHUB_APP: a directory
// holding app-id + private-key.pem) or a plain token (GITHUB_TOKEN). Nothing here ever writes to GitHub.
import { createSign } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Plugin } from "vite";

const API = "https://api.github.com";
const CI_DAYS = 3;
const TTL_MS = 45_000;

// ---------- Auth ----------
type Auth = { kind: "app"; appId: string; key: string } | { kind: "token"; token: string } | { kind: "none" };

function resolveAuth(env: Record<string, string | undefined>): Auth {
  const dir = env.RIGUI_GITHUB_APP?.replace(/^~(?=\/|$)/, homedir());
  if (dir && existsSync(join(dir, "app-id")) && existsSync(join(dir, "private-key.pem"))) {
    return { kind: "app", appId: readFileSync(join(dir, "app-id"), "utf8").trim(), key: readFileSync(join(dir, "private-key.pem"), "utf8") };
  }
  if (env.GITHUB_TOKEN) return { kind: "token", token: env.GITHUB_TOKEN };
  return { kind: "none" };
}

const b64url = (s: string) => Buffer.from(s).toString("base64url");
function appJwt(appId: string, key: string) {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }))}`;
  return `${body}.${createSign("RSA-SHA256").update(body).sign(key, "base64url")}`;
}

class BridgeError extends Error {
  constructor(public status: number, message: string, public hint?: string) { super(message); }
}

function client(auth: Auth) {
  const tokens = new Map<string, { token: string; until: number }>();
  async function tokenFor(repo: string): Promise<string> {
    if (auth.kind === "token") return auth.token;
    if (auth.kind === "none") throw new BridgeError(503, "The dev server has no GitHub credentials.", "echo 'RIGUI_GITHUB_APP=~/path/to/app-credentials' >> .env.local");
    const hit = tokens.get(repo);
    if (hit && hit.until > Date.now() + 60_000) return hit.token;
    const h = { authorization: `Bearer ${appJwt(auth.appId, auth.key)}`, accept: "application/vnd.github+json" };
    const inst = await fetch(`${API}/repos/${repo}/installation`, { headers: h });
    if (!inst.ok) throw new BridgeError(inst.status, `The GitHub App is not installed on ${repo}.`);
    const { id } = (await inst.json()) as { id: number };
    const tok = await fetch(`${API}/app/installations/${id}/access_tokens`, { method: "POST", headers: h });
    if (!tok.ok) throw new BridgeError(tok.status, `Could not mint an installation token for ${repo}.`);
    const j = (await tok.json()) as { token: string; expires_at: string };
    tokens.set(repo, { token: j.token, until: new Date(j.expires_at).getTime() });
    return j.token;
  }
  async function get(repo: string, path: string): Promise<{ data: unknown; next: string | null }> {
    const url = path.startsWith("http") ? path : `${API}${path}`;
    const headers = { authorization: `Bearer ${await tokenFor(repo)}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" };
    // A dropped connection is retried twice; an HTTP refusal is not.
    let res: Response | undefined;
    for (let attempt = 0; !res; attempt++) {
      try { res = await fetch(url, { headers }); }
      catch (e) { if (attempt >= 2) throw new BridgeError(502, `Could not reach GitHub: ${(e as Error).message}`); await new Promise((r) => setTimeout(r, 400 * 2 ** attempt)); }
    }
    if (!res.ok) throw new BridgeError(res.status, `GitHub answered ${res.status} for ${url.replace(API, "")}`);
    const next = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get("link") ?? "")?.[1] ?? null;
    return { data: await res.json(), next };
  }
  /** Every page (up to `max`), flattened. `pick` pulls the list out of wrapped responses. */
  async function all(repo: string, path: string, pick: (page: any) => any[] = (p) => p, max = 10): Promise<any[]> {
    const out: any[] = [];
    let next: string | null = path;
    for (let i = 0; next && i < max; i++) {
      const page = await get(repo, next);
      out.push(...pick(page.data));
      next = page.next;
    }
    return out;
  }
  return { all };
}

async function pool<T, R>(xs: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, async () => { while (i < xs.length) { const k = i++; out[k] = await f(xs[k]!); } }));
  return out;
}

// ---------- Shapes: mirrored in src/plugins/github/types.ts ----------
const shapeJob = (j: any) => ({
  id: j.id as number, name: j.name as string, status: j.status as string, conclusion: j.conclusion as string | null,
  startedAt: j.started_at as string | null, completedAt: j.completed_at as string | null,
  // A skipped job has no runner; the lane view draws nothing for it.
  runner: (j.runner_name || null) as string | null, url: j.html_url as string,
  failedStep: (j.steps?.find((s: any) => s.conclusion === "failure")?.name ?? null) as string | null,
});
type CiJob = ReturnType<typeof shapeJob>;

const shapeIssue = (i: any) => ({
  number: i.number, title: i.title, state: i.state, labels: i.labels.map((l: any) => l.name), createdAt: i.created_at, updatedAt: i.updated_at,
  closedAt: i.closed_at, comments: i.comments, url: i.html_url, author: i.user?.login ?? null,
  assignees: (i.assignees ?? []).map((a: any) => a.login), excerpt: (i.body ?? "").slice(0, 700),
});

// ---------- The middleware ----------
export function githubBridge(env: Record<string, string | undefined>): Plugin {
  const gh = client(resolveAuth(env));
  const cache = new Map<string, { at: number; body?: unknown; pending?: Promise<unknown> }>();
  // Jobs of a finished run attempt never change; keep them for the life of the server.
  const jobsDone = new Map<string, CiJob[]>();

  async function ci(repo: string) {
    const since = new Date(Date.now() - CI_DAYS * 86_400_000).toISOString().slice(0, 10);
    const [workflows, raw] = await Promise.all([
      gh.all(repo, `/repos/${repo}/actions/workflows?per_page=100`, (p) => p.workflows, 2),
      gh.all(repo, `/repos/${repo}/actions/runs?per_page=100&created=%3E%3D${since}`, (p) => p.workflow_runs, 6),
    ]);
    const runs = await pool(raw, 8, async (r: any) => {
      const key = `${r.id}:${r.run_attempt}`;
      let jobs = jobsDone.get(key);
      if (!jobs) {
        jobs = (await gh.all(repo, `/repos/${repo}/actions/runs/${r.id}/jobs?per_page=100`, (p) => p.jobs, 2)).map(shapeJob);
        if (r.status === "completed") jobsDone.set(key, jobs);
      }
      return {
        id: r.id, workflow: r.name, workflowId: r.workflow_id, title: r.display_title, branch: r.head_branch, event: r.event, status: r.status,
        conclusion: r.conclusion, createdAt: r.created_at, updatedAt: r.updated_at, attempt: r.run_attempt, number: r.run_number,
        url: r.html_url, actor: r.triggering_actor?.login ?? r.actor?.login ?? null, sha: r.head_sha, jobs,
      };
    });
    return {
      repo, fetchedAt: new Date().toISOString(), days: CI_DAYS,
      workflows: workflows.map((w) => ({ id: w.id, name: w.name, path: w.path, state: w.state })),
      runs,
    };
  }

  async function issues(repo: string) {
    const recent = new Date(Date.now() - 28 * 86_400_000).toISOString();
    const [open, closed, labels] = await Promise.all([
      gh.all(repo, `/repos/${repo}/issues?state=open&per_page=100`),
      gh.all(repo, `/repos/${repo}/issues?state=closed&per_page=100&since=${recent}`, undefined, 6),
      gh.all(repo, `/repos/${repo}/labels?per_page=100`),
    ]);
    const notPr = (i: any) => !i.pull_request;
    return {
      repo, fetchedAt: new Date().toISOString(),
      labels: labels.map((l) => ({ name: l.name, description: l.description || null })),
      open: open.filter(notPr).map(shapeIssue),
      closed: closed.filter((i) => notPr(i) && i.closed_at >= recent).map(shapeIssue),
    };
  }

  const KINDS: Record<string, (repo: string) => Promise<unknown>> = { ci, issues };

  return {
    name: "rigui-github-bridge",
    configureServer(server) {
      // GET /__gh/<owner>/<repo>/<ci|issues>[?fresh]
      server.middlewares.use("/__gh", async (req, res) => {
        const url = new URL(req.url ?? "/", "http://x");
        const m = /^\/([\w.-]+)\/([\w.-]+)\/(ci|issues)$/.exec(url.pathname);
        const send = (status: number, body: unknown) => { res.statusCode = status; res.setHeader("content-type", "application/json"); res.end(JSON.stringify(body)); };
        if (req.method !== "GET" || !m) return send(404, { error: "not_found", message: "GET /__gh/<owner>/<repo>/<ci|issues>" });
        const repo = `${m[1]}/${m[2]}`, key = `${repo}:${m[3]}`;
        const hit = cache.get(key);
        if (hit?.body && !url.searchParams.has("fresh") && Date.now() - hit.at < TTL_MS) return send(200, hit.body);
        // One fetch in flight per snapshot; concurrent tabs share it.
        const pending = hit?.pending ?? KINDS[m[3]!]!(repo);
        cache.set(key, { at: hit?.at ?? 0, body: hit?.body, pending });
        try {
          const body = await pending;
          cache.set(key, { at: Date.now(), body });
          send(200, body);
        } catch (e) {
          cache.set(key, { at: hit?.at ?? 0, body: hit?.body });
          const err = e instanceof BridgeError ? e : new BridgeError(502, (e as Error).message);
          send(err.status, { error: "github", message: err.message, hint: err.hint ?? null });
        }
      });
    },
  };
}

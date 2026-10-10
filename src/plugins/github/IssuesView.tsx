import { useMemo, useState } from "react";
import { Chip, Cmd, Empty, Facts } from "../../components/primitives";
import { ListGroup } from "../../components/SplitView";
import { Icon } from "../../components/Icon";
import { age, ago, plural } from "../../lib/format";
import { navigate, useRoute } from "../../lib/router";
import { useIssues, useRefresh } from "./data";
import { axis, holdOf, label, namespaces, NONE, OPEN_HOLD, valuesIn, type Hold, type IssueLens } from "./issues-model";
import type { Issue, IssuesSnapshot } from "./types";
import { ExternalLink, GhHead, GhState } from "./ui";
import "./github.css";

// Motes sort loudest first inside a cell, so "on you" always reads first.
const DISPLAY = ["you", "look", "ready", "open", "shipped", "parked"];
const FLOW_DAYS = 28;

interface Pick { r?: string; c?: string }

export default function IssuesView({ repo, pluginId, lens }: { repo: string; pluginId: string; lens: IssueLens }) {
  const q = useIssues(repo);
  const refresh = useRefresh(repo, "issues");
  const route = useRoute();
  const nss = useMemo(() => (q.data ? namespaces(q.data.open, lens) : []), [q.data, lens]);
  const has = (ns: string | null | undefined) => !!ns && nss.some((n) => n.ns === ns);
  const rows = [route.query.get("rows"), lens.rows, nss[0]?.ns].find(has) ?? lens.rows;
  const cols = [route.query.get("cols"), lens.cols, nss.find((n) => n.ns !== rows)?.ns].find((ns) => has(ns) && ns !== rows) ?? lens.cols;
  const setAxis = (k: "rows" | "cols", ns: string) => navigate(pluginId, route.id, { replace: true, query: { [k]: ns === lens[k] ? null : ns } });
  const nsOptions = nss.map((n) => <option key={n.ns} value={n.ns}>{n.ns} · {n.values} labels</option>);

  return (
    <div className="gh-is">
      <GhHead title="Issues" repo={repo} fetchedAt={q.data?.fetchedAt} failing={!!q.error} refresh={refresh}>
        {nss.length > 1 && (
          <div className="gh-axes">
            <label><span>Rows</span><select value={rows} onChange={(e) => setAxis("rows", e.target.value)}>{nsOptions}</select></label>
            <span aria-hidden="true">×</span>
            <label><span>Columns</span><select value={cols} onChange={(e) => setAxis("cols", e.target.value)}>{nss.filter((n) => n.ns !== rows).map((n) => <option key={n.ns} value={n.ns}>{n.ns} · {n.values} labels</option>)}</select></label>
          </div>
        )}
      </GhHead>
      <GhState q={q} what="issues">
        {q.data && <Board snap={q.data} lens={lens} rows={rows} cols={cols} repo={repo} pluginId={pluginId} openId={route.id} />}
      </GhState>
    </div>
  );
}

function Board({ snap, lens, rows, cols, repo, pluginId, openId }: { snap: IssuesSnapshot; lens: IssueLens; rows: string; cols: string; repo: string; pluginId: string; openId: string | null }) {
  const [pick, setPick] = useState<Pick>({});
  const [holds, setHolds] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<Issue | null>(null);

  const holdById = useMemo(() => new Map([...lens.holds, OPEN_HOLD].map((h) => [h.id, h])), [lens]);
  const withHold = useMemo(() => snap.open.map((i) => ({ i, h: holdOf(i, lens) })), [snap.open, lens]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const { h } of withHold) m.set(h.id, (m.get(h.id) ?? 0) + 1);
    return m;
  }, [withHold]);
  const shown = withHold.filter(({ h }) => !holds.size || holds.has(h.id));
  const rAxis = axis(snap.open, rows, lens), cAxis = axis(snap.open, cols, lens);
  const multi = snap.open.filter((i) => valuesIn(i, rows, lens).length > 1).length;

  const cell = (r: string, c: string) => shown.filter(({ i }) => valuesIn(i, rows, lens).includes(r) && valuesIn(i, cols, lens).includes(c))
    .sort((a, b) => DISPLAY.indexOf(a.h.id) - DISPLAY.indexOf(b.h.id) || b.i.number - a.i.number);
  const inPick = ({ i }: { i: Issue }) => (!pick.r || valuesIn(i, rows, lens).includes(pick.r)) && (!pick.c || valuesIn(i, cols, lens).includes(pick.c));
  const listed = shown.filter(inPick);

  const since = Date.now() - FLOW_DAYS * 86_400_000;
  const flow = (r: string) => {
    const all = [...snap.open, ...snap.closed].filter((i) => valuesIn(i, rows, lens).includes(r));
    return { opened: all.filter((i) => new Date(i.createdAt).getTime() >= since).length, closed: snap.closed.filter((i) => valuesIn(i, rows, lens).includes(r)).length };
  };
  const toggle = (p: Pick) => setPick((cur) => (cur.r === p.r && cur.c === p.c ? {} : p));
  const open = (n: number | null) => navigate(pluginId, n ? String(n) : null, { replace: !!openId && !!n });
  const openIssue = openId ? snap.open.find((i) => String(i.number) === openId) ?? snap.closed.find((i) => String(i.number) === openId) : undefined;
  const totalOpened = [...snap.open, ...snap.closed].filter((i) => new Date(i.createdAt).getTime() >= since).length;

  if (!snap.open.length) return <div className="view-body"><Empty title="No open issues"><p>{snap.repo} has nothing open. {snap.closed.length ? `${plural(snap.closed.length, "issue")} closed in the last ${FLOW_DAYS} days.` : ""}</p></Empty></div>;

  return (
    <div className="gh-is-body" data-detail={openIssue ? "" : undefined}>
      <section className="gh-board" aria-label={`Open issues by ${rows} and ${cols}`}>
        <div className="gh-holds" role="group" aria-label="Filter by what the issue is waiting on">
          {[...lens.holds, OPEN_HOLD].filter((h) => counts.get(h.id)).sort((a, b) => DISPLAY.indexOf(a.id) - DISPLAY.indexOf(b.id)).map((h) => (
            <button key={h.id} type="button" aria-pressed={holds.has(h.id)} title={h.hint}
              onClick={() => setHolds((s) => { const n = new Set(s); if (n.has(h.id)) n.delete(h.id); else n.add(h.id); return n; })}>
              <i className="mote" data-hold={h.id} data-tone={h.tone} />{h.label}<b>{counts.get(h.id)}</b>
            </button>
          ))}
          <span className="gh-flow-sum">{FLOW_DAYS} days: <b>{totalOpened}</b> opened · <b>{snap.closed.length}</b> closed</span>
        </div>

        <p className="gh-readout" aria-live="polite">
          {hover
            ? <><span className="mono">#{hover.number}</span> <b>{hover.title}</b> <span>· {holdById.get(holdOf(hover, lens).id)?.label.toLowerCase()} · {age(hover.createdAt)} old</span></>
            : <span>{plural(shown.length, "open issue")}{multi ? ` · ${multi} carry more than one ${rows} label and appear in each row` : ""}. Point at a square to read it; pick a cell to list it.</span>}
        </p>

        <div className="gh-matrix-wrap">
          <table className="gh-matrix" style={{ minWidth: 220 + cAxis.length * 92 + 160 }}>
            <colgroup><col className="c-row" />{cAxis.map((c) => <col key={c} />)}<col className="c-n" /><col className="c-flow" /></colgroup>
            <thead><tr>
              <th scope="col" className="gm-corner">{rows} <span>×</span> {cols}</th>
              {cAxis.map((c) => (
                <th key={c} scope="col" aria-sort={undefined}>
                  <button type="button" className="gm-h" aria-pressed={pick.c === c && !pick.r} onClick={() => toggle({ c })}>{c === NONE ? `no ${cols}` : c}</button>
                </th>
              ))}
              <th scope="col" className="n">Open</th>
              <th scope="col" className="n" title={`Opened and closed in the last ${FLOW_DAYS} days`}>{FLOW_DAYS}d</th>
            </tr></thead>
            <tbody>{rAxis.map((r) => {
              const f = flow(r);
              const n = shown.filter(({ i }) => valuesIn(i, rows, lens).includes(r)).length;
              return (
                <tr key={r} data-on={pick.r === r || undefined}>
                  <th scope="row"><button type="button" className="gm-h" aria-pressed={pick.r === r && !pick.c} onClick={() => toggle({ r })}>{r === NONE ? `no ${rows}` : r}</button></th>
                  {cAxis.map((c) => {
                    const xs = cell(r, c);
                    const on = pick.r === r && pick.c === c;
                    return (
                      <td key={c} className="gm-cell" data-on={on || undefined} data-dim={(pick.r || pick.c) && !on && !(pick.r === r && !pick.c) && !(pick.c === c && !pick.r) || undefined}>
                        {xs.length > 0 && (
                          <button type="button" className="gm-hit" aria-pressed={on} aria-label={`${label(rows, r)}, ${label(cols, c)}: ${plural(xs.length, "issue")}`} onClick={() => toggle({ r, c })}>
                            <span className="gm-motes">{xs.map(({ i, h }) => (
                              <i key={i.number} className="mote" data-hold={h.id} data-tone={h.tone} data-hot={hover?.number === i.number || openIssue?.number === i.number || undefined}
                                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                                onClick={(e) => { e.stopPropagation(); open(i.number); }} />
                            ))}</span>
                            <small>{xs.length}</small>
                          </button>
                        )}
                      </td>
                    );
                  })}
                  <td className="n gm-n">{n || "—"}</td>
                  <td className="n gm-flow"><span data-more={f.opened > f.closed || undefined}>+{f.opened}</span> <span data-more={f.closed > f.opened || undefined}>−{f.closed}</span></td>
                </tr>
              );
            })}</tbody>
            <tfoot><tr>
              <th scope="row">All</th>
              {cAxis.map((c) => <td key={c} className="n">{shown.filter(({ i }) => valuesIn(i, cols, lens).includes(c)).length}</td>)}
              <td className="n gm-n">{shown.length}</td>
              <td className="n gm-flow"><span>+{totalOpened}</span> <span>−{snap.closed.length}</span></td>
            </tr></tfoot>
          </table>
        </div>
      </section>

      <aside className="gh-panel" aria-label={openIssue ? "Issue" : "Issue list"}>
        {openIssue
          ? <IssueDetail i={openIssue} h={holdOf(openIssue, lens)} repo={repo} lens={lens} onBack={() => open(null)} backLabel={listed.length ? plural(listed.length, "issue") : "Issues"} />
          : <IssueList key={`${pick.r}|${pick.c}|${[...holds].join()}`} items={listed} pick={pick} rows={rows} cols={cols} holdOrder={DISPLAY} holdById={holdById} onClear={() => setPick({})} onOpen={open} />}
      </aside>
    </div>
  );
}

function IssueList({ items, pick, rows, cols, holdOrder, holdById, onClear, onOpen }: {
  items: { i: Issue; h: Hold }[]; pick: Pick; rows: string; cols: string; holdOrder: string[]; holdById: Map<string, Hold>; onClear(): void; onOpen(n: number): void;
}) {
  const groups = holdOrder.map((id) => ({ h: holdById.get(id)!, xs: items.filter((x) => x.h.id === id).sort((a, b) => b.i.number - a.i.number) })).filter((g) => g.h && g.xs.length);
  const scope = [pick.r && label(rows, pick.r), pick.c && label(cols, pick.c)].filter(Boolean).join(" × ");
  // The loudest 40 first; the rest on request, so an unfiltered list stays a list and not a page.
  const [all, setAll] = useState(false);
  let budget = all ? Infinity : 40;
  const capped = groups.map((g) => { const xs = g.xs.slice(0, Math.max(0, budget)); budget -= xs.length; return { ...g, shown: xs }; }).filter((g) => g.shown.length);
  const hidden = items.length - capped.reduce((a, g) => a + g.shown.length, 0);
  return (
    <>
      <header className="list-head gh-list-h">
        <h2>{scope || "All open"}</h2>
        <small>{plural(items.length, "issue")}</small>
        {scope && <button type="button" className="btn quiet" onClick={onClear}>Show all</button>}
      </header>
      <div className="gh-list">
        {capped.map((g) => (
          <div key={g.h.id}>
            <ListGroup label={g.h.label} count={g.xs.length} />
            {g.shown.map(({ i }) => (
              <button key={i.number} type="button" className="li" onClick={() => onOpen(i.number)}>
                <span className="li-title">{i.title}</span>
                <span className="li-ref">#{i.number} · {i.labels.filter((l) => !l.startsWith(rows + ":") && !l.startsWith(cols + ":")).slice(0, 3).join(", ")}</span>
                <span className="age">{age(i.createdAt)}</span>
              </button>
            ))}
          </div>
        ))}
        {hidden > 0 && <button type="button" className="gh-more" onClick={() => setAll(true)}>Show {hidden} more</button>}
        {!items.length && <p className="list-empty">No open issues match. Clear a filter above.</p>}
      </div>
    </>
  );
}

function IssueDetail({ i, h, repo, lens, onBack, backLabel }: { i: Issue; h: Hold; repo: string; lens: IssueLens; onBack(): void; backLabel: string }) {
  const grouped = new Map<string, string[]>();
  for (const l of i.labels) {
    const ns = lens.kinds.includes(l) ? "kind" : l.includes(":") ? l.slice(0, l.indexOf(":")) : "flag";
    grouped.set(ns, [...(grouped.get(ns) ?? []), ns === "kind" || ns === "flag" ? l : l.slice(ns.length + 1)]);
  }
  return (
    <div className="gh-issue">
      <button type="button" className="gh-back" onClick={onBack}><Icon name="back" />{backLabel}</button>
      <div className="detail">
        <header>
          <h2>{i.title}</h2>
          <p className="d-sub"><span className="mono">#{i.number}</span> · opened {ago(i.createdAt)}{i.author ? ` by ${i.author}` : ""}{i.state === "closed" && i.closedAt ? ` · closed ${ago(i.closedAt)}` : ""}</p>
        </header>
        <Facts rows={[
          ["State", <Chip tone={h.tone === "bone" ? "idle" : h.tone}>{h.label}</Chip>],
          ...[...grouped.entries()].map(([ns, vs]) => [ns, <span className="gh-labels">{vs.map((v) => <span key={v} className="chip" data-tone="idle">{v}</span>)}</span>] as [string, React.ReactNode]),
          ["Updated", ago(i.updatedAt)],
          ["Comments", String(i.comments)],
          ["Assigned", i.assignees.length ? i.assignees.join(", ") : "nobody"],
        ]} />
        {i.excerpt.trim() && <><h3 className="sec">Opening</h3><p className="gh-excerpt">{i.excerpt.trim()}{i.excerpt.length >= 700 ? "…" : ""}</p></>}
        <h3 className="sec">From the CLI</h3>
        <Cmd text={`gh issue view ${i.number} -R ${repo}`} />
        <ExternalLink href={i.url}>Open on GitHub</ExternalLink>
      </div>
    </div>
  );
}

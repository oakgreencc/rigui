import { useEffect, useMemo, useRef, useState } from "react";
import { useAct, useAttention, useAttentionDetail, usePrompts, useTopology } from "../api/hooks";
import { ACTIONS, type ActionDef } from "../api/actions";
import type { ActInput } from "../api/source";
import type { AttentionDetail, AttentionItem, MissionControlVerb, TerminalView } from "../api/types";
import { ListGroup, SplitView } from "../components/SplitView";
import { Chip, Cmd, Empty, Facts, QueryState, Timeline, useKeys, useToast } from "../components/primitives";
import { useRig } from "../components/Shell";
import { age, clock, isHuman, minutesSince, shortSession } from "../lib/format";
import { navigate, useRoute } from "../lib/router";
import type { Tone } from "../lib/status";
import "./attention.css";

const UNDO_MS = 8000;

type Group = "decide" | "blocked" | "prompt" | "update";
const GROUPS: Record<Group, string> = { decide: "Waiting on your decision", blocked: "Blocked on you", prompt: "Waiting at a prompt", update: "Updates" };
const ORDER: Group[] = ["decide", "blocked", "prompt", "update"];

function groupOf(i: AttentionItem): Group {
  if (i.id.startsWith("prompt:")) return "prompt";
  if (i.kind === "update") return "update";
  return i.qitemState === "blocked" ? "blocked" : "decide";
}

/** A seat at an approval prompt, as an attention item. The daemon has no qitem for it; the console does. */
function promptItem(t: TerminalView): AttentionItem {
  return {
    id: `prompt:${t.sessionName}`, kind: "action", summary: `${shortSession(t.sessionName)} is waiting for a yes or no`,
    unblocks: `${shortSession(t.sessionName)}: everything it is doing`, urgency: "prompt", at: t.lastOutputAt,
    scope: `seat ${t.sessionName}`, source: `/api/sessions/${t.sessionName}/preview`,
  };
}

const KIND: Record<string, { label: string; tone: Tone | "info" }> = {
  decide: { label: "Decision", tone: "human" },
  approval: { label: "Approval", tone: "human" },
  blocked: { label: "Blocked on you", tone: "human" },
  critical: { label: "Stall", tone: "danger" },
  warning: { label: "Needs a look", tone: "warn" },
  outcome: { label: "Outcome", tone: "ok" },
  info: { label: "Note", tone: "info" },
};
function kindOf(i: AttentionItem, g: Group) {
  if (g === "update") return KIND[i.urgency] ?? KIND.info!;
  if (g === "blocked") return KIND.blocked!;
  if (g === "prompt") return { label: "At a prompt", tone: "warn" as const };
  return i.urgency === "urgent" || i.urgency === "critical" ? { label: i.urgency, tone: "human" as const } : KIND.decide!;
}

interface Pending { item: AttentionItem; input: ActInput | null; receipt: string; at: number }

const seenKey = "rigui.seen";
const readSeen = (): string[] => { try { return JSON.parse(localStorage.getItem(seenKey) || "[]"); } catch { return []; } };
const writeSeen = (v: string[]) => { try { localStorage.setItem(seenKey, JSON.stringify(v.slice(-200))); } catch { /* storage blocked */ } };

export default function Attention() {
  const q = useAttention();
  const prompts = usePrompts();
  const route = useRoute();
  const act = useAct();
  const toast = useToast();
  const [done, setDone] = useState<string[]>([]); // resolved in this session, hidden while the write lands
  const [seen, setSeen] = useState<string[]>(readSeen);
  const [pending, setPending] = useState<Pending | null>(null);
  const [detailOpen, setDetailOpen] = useState(!!route.id);
  const timer = useRef<number>(undefined);

  const live = useMemo(() => {
    const items = [...(q.data?.items ?? []), ...(prompts.data ?? []).map(promptItem)].filter((i) => !done.includes(i.id) && !seen.includes(i.id));
    return items.map((i) => ({ i, g: groupOf(i) })).sort((a, b) => ORDER.indexOf(a.g) - ORDER.indexOf(b.g));
  }, [q.data, prompts.data, done, seen]);

  const selId = route.id && live.some((x) => x.i.id === route.id) ? route.id : live[0]?.i.id ?? null;
  const selIdx = live.findIndex((x) => x.i.id === selId);
  const detail = useAttentionDetail(selId?.startsWith("prompt:") ? null : selId);

  const pick = (id: string, open = true) => { navigate("attention", id, { replace: true }); if (open) setDetailOpen(true); };
  const move = (d: number) => { const n = live[Math.max(0, Math.min(live.length - 1, selIdx + d))]; if (n) pick(n.i.id, false); };

  const commit = (p: Pending) => {
    if (p.input) act.mutate(p.input, { onError: (e) => { toast(`Didn't land: ${(e as Error).message}`); setDone((d) => d.filter((x) => x !== p.item.id)); } });
    else { const next = [...readSeen(), p.item.id]; writeSeen(next); setSeen(next); }
  };
  // One write in flight at a time: resolving the next item commits the previous one.
  const resolve = (item: AttentionItem, input: ActInput | null, receipt: string) => {
    if (pending) { clearTimeout(timer.current); commit(pending); }
    const p = { item, input, receipt, at: Date.now() };
    setPending(p);
    setDone((d) => [...d, item.id]);
    timer.current = window.setTimeout(() => { commit(p); setPending(null); }, UNDO_MS);
    const next = live[selIdx + 1] ?? live[selIdx - 1];
    if (next) navigate("attention", next.i.id, { replace: true }); else navigate("attention", null, { replace: true });
  };
  const undo = () => {
    if (!pending) return;
    clearTimeout(timer.current);
    setDone((d) => d.filter((x) => x !== pending.item.id));
    navigate("attention", pending.item.id, { replace: true });
    setPending(null);
    toast("Undone. Nothing was sent.");
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const primary = useRef<() => void>(undefined);
  const hold = useRef<() => void>(undefined);
  useKeys({ j: () => move(1), k: () => move(-1), e: () => primary.current?.(), h: () => hold.current?.(), u: undo, enter: () => setDetailOpen(true) });

  const actions = live.filter((x) => x.g !== "update").length;
  let last: Group | null = null;
  const list = (
    <QueryState q={q}>
      {pending && (
        <div className="receipt" role="status" key={pending.at} style={{ ["--undo" as string]: `${UNDO_MS}ms` }}>
          <span>{pending.receipt}</span>
          <button type="button" onClick={undo}>Undo <kbd>U</kbd></button>
        </div>
      )}
      {live.map(({ i, g }) => {
        const head = g !== last ? <ListGroup key={"g" + g} label={GROUPS[g]} count={live.filter((x) => x.g === g).length} /> : null;
        last = g;
        const k = kindOf(i, g);
        const old = (minutesSince(i.at) ?? 0) > 60 * 4;
        return [head, (
          <button key={i.id} type="button" className="li li-att" aria-current={i.id === selId ? "true" : undefined} onClick={() => pick(i.id)}>
            <span className="li-title">{i.summary}</span>
            <span className="age" data-old={old || undefined}>{age(i.at)}</span>
            <span className="li-ref"><span className="li-k" data-tone={k.tone}>{k.label}</span>{i.scope}</span>
          </button>
        )];
      })}
      {!live.length && !pending && <p className="list-empty">Nothing waiting on you.</p>}
    </QueryState>
  );

  const sel = live[selIdx];
  return (
    <SplitView id="attention" title="Attention" count={q.data ? (actions ? `${actions} waiting on you` : "clear") : undefined}
      list={list} detail={detailOpen && !!sel} onBack={() => setDetailOpen(false)}
      foot={<><span><kbd>J</kbd><kbd>K</kbd> move</span><span><kbd>E</kbd> primary</span><span><kbd>H</kbd> hold</span><span><kbd>U</kbd> undo</span></>}
      pane={sel?.g === "prompt"
        ? <PromptPane key={sel.i.id} t={prompts.data!.find((t) => `prompt:${t.sessionName}` === sel.i.id)!} primaryRef={primary} />
        : sel
        ? <Pane key={sel.i.id} item={sel.i} group={sel.g} detail={detail.data ?? null} loading={detail.isPending} onResolve={resolve} primaryRef={primary} holdRef={hold} />
        : <AllClear sources={q.data?.sources ?? []} />} />
  );
}

function PromptPane({ t, primaryRef }: { t: TerminalView; primaryRef: React.RefObject<(() => void) | undefined> }) {
  primaryRef.current = () => navigate("terminals", t.sessionName);
  return (
    <article className="att-pane">
      <header className="pane-h">
        <h2>{shortSession(t.sessionName)} is waiting for a yes or no</h2>
        <p className="pane-meta"><Chip tone="warn">at a prompt</Chip><span className="mono">{t.sessionName}</span>{t.lastOutputAt && <span>for {age(t.lastOutputAt)}</span>}</p>
      </header>
      <p className="why">The seat stopped at an approval prompt in its terminal. Nothing it holds moves until someone answers there. The console can show the prompt, not answer it.</p>
      <pre className="prompt-tail" tabIndex={0} aria-label={`Last lines from ${t.sessionName}`}>{t.lines.join("\n")}</pre>
      <h3 className="sec">Answer it in the terminal</h3>
      <Cmd text={t.attachCommand} />
      <div className="actions att-actions">
        <button type="button" className="btn primary" onClick={() => navigate("terminals", t.sessionName)}>Show terminal <kbd>E</kbd></button>
        <button type="button" className="btn quiet" onClick={() => navigate("topology", `seat:${t.logicalId}`)}>Show on map</button>
      </div>
    </article>
  );
}

function AllClear({ sources }: { sources: { source: string; state: string; detail: string | null }[] }) {
  const down = sources.filter((s) => s.state !== "available");
  return (
    <Empty title="Nothing is waiting on you.">
      <p>The daemon routes anything addressed to a human seat here: approvals, questions a seat is blocked on, stalls nobody owns, and proof outcomes.</p>
      {down.length > 0 && <p className="tone-warn">Not every source answered: {down.map((s) => s.source).join(", ")}. Something may be missing.</p>}
    </Empty>
  );
}

function Pane({ item, group, detail, loading, onResolve, primaryRef, holdRef }: {
  item: AttentionItem; group: Group; detail: AttentionDetail | null; loading: boolean;
  onResolve(item: AttentionItem, input: ActInput | null, receipt: string): void;
  primaryRef: React.RefObject<(() => void) | undefined>; holdRef: React.RefObject<(() => void) | undefined>;
}) {
  const { rigId } = useRig();
  const topo = useTopology(rigId);
  const qitem = detail?.qitem ?? null;
  const k = kindOf(item, group);
  const [asking, setAsking] = useState<ActionDef | null>(null);
  const [text, setText] = useState("");
  const [dest, setDest] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const questions = detail?.questions ?? [];
  useEffect(() => {
    setAnswers(Object.fromEntries(questions.map((qq) => [qq.id, qq.options.find((o) => o.recommended)?.label ?? ""])));
  }, [detail]); // eslint-disable-line react-hooks/exhaustive-deps

  const subject = item.summary.length > 48 ? item.summary.slice(0, 47) + "…" : item.summary;
  const run = (a: ActionDef, extra: Partial<ActInput> = {}) => {
    if (!qitem) return;
    onResolve(item, { verb: a.verb as MissionControlVerb, qitemId: qitem.qitemId, ...extra }, a.receipt!(subject));
  };
  const start = (a: ActionDef) => {
    if (a.needs) { setAsking(a); setText(""); setDest(""); return; }
    run(a);
  };
  const decision = questions.length ? questions.map((qq) => `${qq.id}: ${answers[qq.id] ?? ""}`).join("\n") : "";

  let primary: { label: string; go(): void } | null = null;
  let others: ActionDef[] = [];
  if (group === "decide" && qitem) {
    primary = { label: item.summary.startsWith("Pair host") ? "Approve pairing" : "Approve", go: () => run(ACTIONS.approve, { reason: "approved in console" }) };
    others = [ACTIONS.deny, ACTIONS.route, ACTIONS.hold, ACTIONS.drop];
  } else if (group === "blocked" && qitem) {
    primary = questions.length
      ? { label: "Send answers", go: () => run(ACTIONS.resolve, { decision }) }
      : { label: "Send decision", go: () => start(ACTIONS.resolve) };
    others = [ACTIONS.annotate, ACTIONS.drop];
  } else if (group === "update") {
    primary = { label: "Mark seen", go: () => onResolve(item, null, `Marked seen · ${subject}`) };
  }
  primaryRef.current = primary?.go;
  holdRef.current = group === "decide" && qitem ? () => start(ACTIONS.hold) : undefined;

  const seats = topo.data?.seats.filter((s) => s.nodeKind === "agent" && !isHuman(s.canonicalSessionName)) ?? [];
  const facts: [string, React.ReactNode][] = [];
  if (qitem) {
    facts.push(["From", <span className="mono">{qitem.sourceSession}</span>]);
    if (item.unblocks) facts.push(["Unblocks", item.unblocks]);
    facts.push(["Priority", <>{qitem.priority}{qitem.tier ? <> · <span className="mono">{qitem.tier}</span></> : null}</>]);
    if (qitem.tags?.length) facts.push(["Tags", <span className="tags">{qitem.tags.map((t) => <span key={t} className="mono">{t}</span>)}</span>]);
  } else if (item.unblocks) facts.push(["Unblocks", item.unblocks]);
  facts.push(["Scope", item.scope]);

  return (
    <article className="att-pane" aria-busy={loading || undefined}>
      <header className="pane-h">
        <h2>{item.summary}</h2>
        <p className="pane-meta">
          <Chip tone={k.tone}>{k.label}</Chip>
          <span className="mono">{qitem?.qitemId ?? item.id}</span>
          <span data-late={(minutesSince(item.at) ?? 0) > 240 || undefined}>waiting {age(item.at)}</span>
          {item.recipient && <span>to {shortSession(item.recipient)}</span>}
        </p>
      </header>

      {qitem?.body && <p className="why">{qitem.body}</p>}
      {!qitem && detail?.lines.map((l, i) => <p key={i} className="why">{l}</p>)}
      <Facts rows={facts} />

      {group === "blocked" && questions.length > 0 && (
        <fieldset className="qs">
          <legend className="sr">Questions from {shortSession(qitem?.sourceSession)}</legend>
          {questions.map((qq) => (
            <div key={qq.id} className="q" role="radiogroup" aria-labelledby={`q-${qq.id}`}>
              <p id={`q-${qq.id}`}><span className="mono">{qq.id}</span>{qq.text}</p>
              {qq.options.map((o) => (
                <label key={o.label}>
                  <input type="radio" name={qq.id} checked={answers[qq.id] === o.label} onChange={() => setAnswers((a) => ({ ...a, [qq.id]: o.label }))} />
                  <span>{o.label}</span>{o.recommended && <small>recommended</small>}
                </label>
              ))}
            </div>
          ))}
        </fieldset>
      )}

      {detail && detail.transitions.length > 0 && (
        <>
          <h3 className="sec">History</h3>
          <Timeline items={detail.transitions.map((t) => ({ at: clock(t.ts), text: <>{t.state} · {t.note ?? ""} <span className="mono">{shortSession(t.actor)}</span></>, tone: t.state === "blocked" ? "human" : undefined }))} />
        </>
      )}

      {asking ? (
        <form className="ask" onSubmit={(e) => {
          e.preventDefault();
          if (asking.needs === "destination") run(asking, { destinationSession: dest, body: text || undefined });
          else if (asking.needs === "decision") run(asking, { decision: text });
          else run(asking, { reason: text });
          setAsking(null);
        }}>
          <label htmlFor="ask-in">{asking.needs === "destination" ? "Route to" : asking.needs === "decision" ? "Your decision" : `Why ${asking.label.toLowerCase()}?`}</label>
          {asking.needs === "destination" ? (
            <select id="ask-in" value={dest} onChange={(e) => setDest(e.target.value)} required>
              <option value="" disabled>Pick a seat…</option>
              {seats.map((s) => <option key={s.canonicalSessionName} value={s.canonicalSessionName}>{s.canonicalSessionName}</option>)}
            </select>
          ) : (
            <textarea id="ask-in" rows={3} value={text} onChange={(e) => setText(e.target.value)} required autoFocus
              placeholder={asking.needs === "decision" ? "What the seat should do next" : "One line for the audit log and the seat"} />
          )}
          <div className="actions">
            <button type="submit" className="btn primary">{asking.label}</button>
            <button type="button" className="btn quiet" onClick={() => setAsking(null)}>Cancel</button>
          </div>
        </form>
      ) : (
        <div className="actions att-actions">
          {primary && <button type="button" className="btn primary" onClick={primary.go}>{primary.label} <kbd>E</kbd></button>}
          {others.map((a) => <button key={a.id} type="button" className="btn" onClick={() => start(a)}>{a.label}{a.id === "hold" && <kbd>H</kbd>}</button>)}
          {item.scope.startsWith("seat ") && <button type="button" className="btn quiet" onClick={() => navigate("topology", `seat:${seatLogical(item.scope)}`)}>Show on map</button>}
        </div>
      )}

      {item.id.startsWith("health:") && <Recovery item={item} />}
      {qitem && primary && group !== "update" && (
        <details className="or-run">
          <summary>Or run it yourself</summary>
          <Cmd text={(group === "blocked" ? ACTIONS.resolve : ACTIONS.approve).cli({ qitemId: qitem.qitemId, decision: decision || "…" })} />
        </details>
      )}
    </article>
  );
}

const seatLogical = (scope: string) => scope.replace(/^seat\s+/, "").split("@")[0]!.replace("-", ".");

function Recovery({ item }: { item: AttentionItem }) {
  const session = item.scope.replace(/^seat\s+/, "");
  if (!item.scope.startsWith("seat ")) return null;
  const exited = /exited/.test(item.summary);
  return (
    <>
      <h3 className="sec">{exited ? "Recover the seat" : "Nudge the seat"}</h3>
      <Cmd text={exited ? ACTIONS.relaunchSeat.cli({ session, reason: "exited holding work" }) : ACTIONS.send.cli({ session, body: "status?" })} />
      <p className="sample">Structural actions run from the CLI for now; the console will run them once the daemon guards those writes.</p>
    </>
  );
}


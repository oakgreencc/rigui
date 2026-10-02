import { useEffect, useMemo, useRef, useState } from "react";
import { useTerminals } from "../api/hooks";
import type { TerminalView } from "../api/types";
import { Cmd, Empty, Lamp, QueryState, Segmented } from "../components/primitives";
import { age } from "../lib/format";
import { navigate, useRoute } from "../lib/router";
import type { Tone } from "../lib/status";
import "./terminals.css";

const TONE: Record<TerminalView["activity"], Tone> = { working: "ok", "idle-at-prompt": "idle", unknown: "idle" };
const RT: Record<string, string> = { "claude-code": "Claude Code", codex: "Codex", pi: "Pi", terminal: "terminal" };

export default function Terminals() {
  const q = useTerminals();
  const route = useRoute();
  const rigs = useMemo(() => [...new Set((q.data ?? []).map((t) => t.rigName))], [q.data]);
  const [rig, setRig] = useState<string>("all");
  const shown = (q.data ?? []).filter((t) => rig === "all" || t.rigName === rig);
  const focus = route.id;

  return (
    <div className="terms">
      <header className="view-h">
        <div><h1>Terminals</h1><small>{q.data ? `${shown.length} seats · tails refresh every 5s` : ""}</small></div>
        {rigs.length > 1 && <Segmented label="Rig" value={rig} onChange={setRig} options={[{ value: "all", label: "All rigs" }, ...rigs.map((r) => ({ value: r, label: r }))]} />}
      </header>
      <div className="view-body">
        <QueryState q={q} empty={<Empty title="No terminals"><p>No seat has a terminal the daemon can read. Boot a rig and its seats show up here.</p><Cmd text="rig up first-project" /></Empty>}>
          <div className="term-grid">
            {shown.map((t) => <Term key={t.sessionName} t={t} focus={focus === t.sessionName} />)}
          </div>
        </QueryState>
        <p className="sample term-note">Previews are read-only tails. Typing into a seat happens in its terminal: attach, or <span className="mono">rig send</span>.</p>
      </div>
    </div>
  );
}

function Term({ t, focus }: { t: TerminalView; focus: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const body = useRef<HTMLPreElement>(null);
  useEffect(() => { if (focus) ref.current?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [focus]);
  useEffect(() => { const b = body.current; if (b) b.scrollTop = b.scrollHeight; }, [t.lines]);
  const exited = t.lines.some((l) => /\[exited \d+\]/.test(l));
  // The daemon's needs-input count wins; the tail is the fallback for sources that don't report one.
  const prompt = !!t.needsInput || t.lines.slice(-8).some((l) => /Do you want to proceed\?|Press enter to confirm|\[y\/n\]|\(y\)\s*$|requires approval/i.test(l));
  const tone: Tone = exited ? "danger" : prompt ? "warn" : TONE[t.activity];
  const state = exited ? "exited" : prompt ? "waiting at a prompt" : t.activity === "working" ? "output flowing" : t.activity === "idle-at-prompt" ? "idle at prompt" : "no signal";
  return (
    <section ref={ref} className="term" data-focus={focus || undefined} data-tone={tone} aria-label={`Terminal ${t.sessionName}`}>
      <header>
        <Lamp tone={tone} />
        <button type="button" className="term-name" onClick={() => navigate("topology", `seat:${t.logicalId}`)} title="Show on the map">{t.sessionName}</button>
        <span className="term-meta">{t.runtime ? `${RT[t.runtime] ?? t.runtime} · ` : ""}{state}{t.lastOutputAt ? ` · ${age(t.lastOutputAt)}` : ""}</span>
      </header>
      <pre ref={body} tabIndex={0} aria-label={`Last lines from ${t.sessionName}`}>{t.lines.join("\n") || " "}</pre>
      <Cmd text={t.attachCommand} />
    </section>
  );
}

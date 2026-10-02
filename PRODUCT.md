# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: Vite + TypeScript, no UI framework. Views render from typed state with small DOM helpers; one `api` module owns every daemon call so fixtures and the live daemon are interchangeable. Chosen because the console must stay light enough to be served by (or beside) the OpenRig daemon, and the starting artifact is already vanilla DOM + inline SVG.

## Users

Primary: a solo maintainer who runs one or more OpenRig rigs on their own machines and directs the work. They are away from the terminal most of the time, return in short bursts, and need to see in seconds what is moving, what is stuck, and what is waiting on them, then clear it.

Later (design for, don't build yet): small teams sharing one fleet, where several humans split attention items and need to see who holds what.

The coding agent is OpenRig's other user; it drives the CLI (`--json`). The console is for the human.

## Product Purpose

Rigui is a web console for OpenRig, a meta-agent orchestration engine (https://openrig.dev, github.com/mvschwarz/openrig). OpenRig runs a daemon and SQLite database, and launches tmux-backed Claude Code / Codex / Pi sessions into seats inside pods inside rigs.

The console answers three questions, in order:
1. Is anything stuck, and does anyone own getting it unstuck?
2. What is waiting on me, and can I answer it here?
3. Is the machine keeping up (queues, rates, automation)?

Success: the maintainer clears everything that needs them without opening a terminal, and never learns about a stall from its downstream damage.

It generalizes a personal console built for the SeKtor factory (claude.ai/artifact/HPwMYurbM9gSvbj7d7maZA): a station map, an inbox of asks, an automation list, and a backlog ring. SeKtor-specific terms (Broker, Fleet, Primitive, Job names, issue numbers) do not ship.

## Positioning

OpenRig's own TUI is an explorer: hosts → rigs → pods → seats, with tabs. The console is a supervisor: it leads with state and ownership (who is working, who is not, what nobody owns), and it is where a human answers what the daemon routes to humans. The old OpenRig web UI (`rig ui open`) is unmaintained; this is not a port of it.

## Operating Context

- Data comes from the local OpenRig daemon's HTTP API (routes include `ps`, `rigs`, `queue`, `attention`, `ask`, `mission-control`, `missions`, `events`, `activity`, `health-summary`, `review`, `chat`, `hosts`). Until wired, the console runs on typed fixtures shaped like those responses, labelled as sample data.
- Vocabulary is OpenRig's: rig, pod, seat (`role@rig`, e.g. `dev-ui@factory`), session, edge, queue item, handoff, workflow, mission, slice, packet, chatroom, watchdog, snapshot, fleet, host.
- Queue item states: pending, in-progress, done, blocked, failed, denied, canceled, handed-off. A queue item cannot close as done without a reason ("hot-potato closure").
- The human's actions are judgment calls: answer a question, approve/deny, unblock, resume or cancel, re-route a handoff, snapshot or restore a rig. The console never starts agents itself unless the daemon exposes that as a human action.
- Used on a laptop at a desk and on a phone between other things. Keyboard-first on desktop (J/K/E/S/U triage, as in the source artifact).

## Capabilities and Constraints

- Views carried from the source artifact, generalized: Topology (the ring map of pods/seats with flow and stalls), Attention (inbox of items routed to the human, with receipt + undo), Automation (watchdog jobs and workflows, with their runs), Backlog (queue stock by state, arrival vs. completion rates).
- Heartbeat: daemon up/uptime, sessions occupied / seats, hosts reachable, next scheduled watchdog job.
- Multi-rig and multi-host (fleet) must be navigable; solo single-rig is the default case.
- Undecided: exact daemon endpoint shapes (being mapped), auth model for remote daemons, whether the console is served by the daemon or standalone.

## Brand Commitments

- Oak Green Cloud Consulting (oakgreen.cc) branding, from the OGCC site's design system (`~/OGCC/website/DESIGN.md`, `.impeccable/design.json`): Signal Green `#3c9057` is the one brand hue; Void Green `#0b190f` and Shadow Orbit `#173620` are its grounds; the OGCC concentric-ring mark.
- Themeable by users, with OGCC green as the default theme.
- Voice: playful, nerdy, low-key; words minimal. In an operating tool, plain and exact first.
- Sektor's `#41ff19` is a guest mark and never stands for OGCC.

## Evidence on Hand

- Source artifact HTML (SeKtor Factory Console): interaction model, motion, layouts, copy patterns.
- OGCC brand assets: `~/OGCC/website/static/favicon.svg` (mark), `~/OGCC/logo/`.
- OpenRig docs and repo (public). No real rig data yet: all fixture data is synthetic and must be labelled so.

## Product Principles

1. Ownership before activity: every stuck thing shows who owns recovery, and "nobody" is the loudest state on screen.
2. Answer where you read: anything routed to the human can be resolved in the console, with a receipt and an undo window.
3. The daemon is the truth: the console holds no state the daemon doesn't; fixtures mirror real response shapes.
4. Quiet when healthy: progress is small and slow; a stall is the one loud thing.
5. Solo first, team-ready: one human by default; ownership fields leave room for many.

## Accessibility & Inclusion

WCAG 2.2 AA contrast in every shipped theme; full keyboard operation; `prefers-reduced-motion` drops travel and loops but keeps state; status never carried by color alone.

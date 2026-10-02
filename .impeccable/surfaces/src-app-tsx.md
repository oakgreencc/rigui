---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/views"]
---

# Surface: OpenRig console (rigui), whole app

Scope: every route of the console — Topology (default), Attention, Backlog, Projects, Specs, Terminals, System. Mode: Operate.
Audience: solo OpenRig maintainer returning in short bursts, desk + phone. Job: see what's stuck and who owns it; answer what's routed to the human; confirm the rig keeps up.
Constraints: replaces the daemon-served UI (same origin, /api/*, SSE /api/events). Acts on attention only (mission-control verbs, receipt + undo); structural ops render as copyable `rig` commands via an action registry that can flip to api mode later. Full token override theming, OGCC default. Synthetic fixtures labelled as sample data.
Source: SeKtor Factory Console artifact (IA, motion, triage keys, receipt/undo) — its brand does not ship.

## Direction contract

THESIS: The rig is a quiet orrery. Two systems share one sky: the rig (pods on the inner orbit, seats as bodies around them) and the mission (workflow steps on their own track), each seen through the other — one lit, one in shadow. Clicking a shadowed body swaps which system is lit. Refuses the boxes-and-arrows node canvas and the dashboard of equal cards.

OWN-WORLD: Void Green ground (#0b190f) with Shadow Orbit (#173620) as the shadow layer and deep panels; Signal Green (#3c9057) is the only brand hue: selection, focus, "you", flow. Status speaks in the OGCC toy inks — brick (stall/danger), brass (warn), cobalt (info), dusk lavender (human), pewter (idle), bone (neutral). Square everything, hairline rules in shadow tone, no shadows, no glow, no gradients. system-ui throughout, weight and case for hierarchy; ui-monospace only for ids, commands, terminal text. A giant OGCC mark turns linearly in shadow behind the map (clockwork: never eases). Daylight theme derived from the same ramps.

STORY: The maintainer opens the console and sees the orrery at rest; one body is brick and throws a slow alarm ring — a pod or step nobody owns. Hover names it; click opens the drawer: owner, blocked items, the command to run. The sidebar count leads to Attention, where they approve, deny, route, hold or resolve with J/K/E and a receipt that can be undone. Backlog confirms the rig is keeping up.

FIRST VIEWPORT: 232px sidebar left (OGCC mark + "rig" wordmark, rig switcher, seven views with counts, heartbeat pinned bottom). Work area: the orrery fills it, centred; pods as square stations on the inner orbit (name, working/seats, oldest item), seats fanned on the outer orbit, qitem dots travelling handoff edges; mission steps on the far track in shadow with hairline leader lines to the pods holding their packets. Top-left of map: layer switch "Rig / Mission". Centre: hover readout. Bottom-left: legend. Right: detail drawer on pick. Primary action = the stalled body + Attention count.

FORM: user-pinned — the source artifact's station map translated to the OGCC orrery with a dual-layer swap (user specified); no concept roll, seed key: none (user-pinned direction beats the roll). Signature interaction: orbit swap — layers exchange lit/shadow with a 480ms crossfade and radius exchange, reduced-motion = instant.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

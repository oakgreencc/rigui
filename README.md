# rigui — a web console for OpenRig

A supervisor's console for [OpenRig](https://openrig.dev): see what is stuck and who owns it, answer what the daemon routes to a human, and check that the rig keeps up. It is meant to replace the daemon's unmaintained served UI (`rig ui open`).

Seven views:

| View | What it answers | Daemon reads |
|---|---|---|
| **Topology** | The rig as an orrery. Two layers share one sky: the **rig** (pods on the inner orbit, seats around them) and the **mission** (workflow steps). The lit layer holds the inner orbits and the other waits in shadow on the outer track. Click a shadowed body to swap which layer is lit. You are the sun at the centre; anything waiting on you draws a line to it. | `/api/rigs/:id`, `/nodes`, `/graph`, `/api/workflow/list`, `/trace` |
| **Attention** | Items routed to a human seat. You can approve, deny, route, hold, drop, resolve or annotate them, and each action gives a receipt with an 8s undo window. Keys: J/K move, E primary, H hold, U undo. | `/api/attention`, `/api/queue/*`, `POST /api/mission-control/action` |
| **Backlog** | Open work by state (pending, in progress, overdue, blocked on seats, blocked on you). Shows where it piles up, and weekly rates on one shared scale. | `/api/queue/list`, `/api/queue/recent-transitions` |
| **Projects** | Project, then mission, then slices, with proof readiness. Shows the mission's workflow as a strip, linked to the map. | `/api/scopes/projects`, `/api/slices` |
| **Specs** | Rig, agent and workflow specs. Each has a mini map of what it boots, its source, and `rig` commands. | `/api/specs/library[/:id]`, `/api/workflow/specs` |
| **Terminals** | Read-only tails of every seat. Flags seats waiting at a prompt, and gives the attach command for each. | `/api/terminal/views`, `/api/sessions/:name/preview` |
| **System** | Daemon health, findings, automation (watchdog jobs and evaluations), hosts, theme, and connection. | `/healthz`, `/api/health`, `/api/watchdog/*`, `/api/hosts` |

## Run it

```sh
npm install
npm run dev            # http://localhost:5178, proxies /api and /healthz to OPENRIG_URL (default http://127.0.0.1:7433)
npm run build          # dist/ — static; serve it from the daemon's UI dir or any static host on the same origin
```

At boot the console probes `/healthz`:

- If a daemon answers, the console reads it live. The heartbeat panel says **Live**.
- If not, the console runs on **sample data**. That data is synthetic but shaped like real responses (`src/api/fixtures.ts`), and it is labelled as sample data everywhere it shows.
- Add `?source=sample` or `?source=live` to the URL to force one or the other.

## Architecture

```
src/api/types.ts      daemon shapes the console renders (enums verbatim from OpenRig)
src/api/source.ts     DataSource interface; liveSource() maps daemon responses, sampleSource() serves fixtures
src/api/hooks.ts      TanStack Query hooks + one SSE stream (/api/events) that invalidates by event family
src/api/actions.ts    the action registry: every human action, api- or cli-mode
src/lib/status.ts     one status vocabulary (tone + reason) shared by map, lists and drawers
src/orrery/           the map: geometry (pure), scene (pure: data → bodies/links/flows), Orrery (render)
src/views/            one file per view, each with its own CSS
src/theme/            presets (tokens) and the provider that applies them
```

Views never fetch directly. Each view asks a `DataSource`. To wire a new endpoint, add a method to the interface, then implement it in both sources.

The daemon's full domain and API are mapped in [`docs/openrig-domain.md`](docs/openrig-domain.md).

### Acting vs. showing a command

`src/api/actions.ts` is the one list of what a human can do. Each action has one of two modes:

- **`api`**: the console performs the action through the daemon. Today only the attention verbs are `api` (they go through `mission-control/action`, which is bearer-guarded and audited).
- **`cli`**: the console shows the exact `rig …` command to copy. Structural operations use this mode: relaunching a seat, snapshot, restore, stopping a watchdog, and routing a workflow.

To let the console perform a structural action, set its mode to `api` and add the call in `source.ts`.

## Theming

Every colour is a token. OGCC ("Oak Green", from oakgreen.cc) is the default preset, with dark and light variants. There are three ways to change the look:

1. **In the app:** System → Theme. Pick a mode and a preset, and override any token as JSON. This only applies in your browser.
2. **For everyone:** serve a `theme.json` next to the build. It can add presets, extend or override existing ones, and choose the default preset. See [`themes/example.theme.json`](themes/example.theme.json):
   ```json
   { "default": "acme", "presets": [{ "id": "acme", "label": "Acme", "extends": "ogcc", "dark": { "--accent-fill": "#e4572e" } }] }
   ```
3. **At build time:** add a `Preset` to `src/theme/presets.ts`.

`TOKEN_DOCS` in `presets.ts` lists every token and what it paints. You can copy a working `theme.json` from the Theme panel.

## Notes on the live daemon

These notes were checked against OpenRig 0.6.3:

- The human seat on a default install is `operator-human@kernel`. `isHuman()` in `src/lib/format.ts` also matches `human@…`, `human-<name>@…` and `<id>@external`.
- The Connection panel sets which seat you act as. Match it to `workspace.operator_seat_name`.
- A write bearer is only needed if the daemon sets `OPENRIG_AUTH_BEARER_TOKEN`.
- `/api/events` replays the whole log when the browser gives no `Last-Event-ID`. The console remembers the last sequence number it saw for the session. The `?since=` fallback has not been confirmed against the daemon.
- The daemon has no endpoint for weekly rates, so the Backlog view derives them from `recent-transitions`.
- There are no per-edge handoff counts. On a live rig, flow is drawn along `delegates_to` edges.

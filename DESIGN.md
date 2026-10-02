---
name: OpenRig Console
description: The rig is a quiet orrery; the OGCC night sky turned into an operating console.
colors:
  void-green: "oklch(19.5% 0.03 152)"
  panel-green: "oklch(22% 0.033 152)"
  well-green: "oklch(25.5% 0.038 151)"
  shadow-orbit: "oklch(31% 0.06 150)"
  hairline: "oklch(29% 0.035 152)"
  hairline-strong: "oklch(38% 0.04 152)"
  moonlight: "oklch(95% 0.015 150)"
  body-text: "oklch(86% 0.02 150)"
  muted-text: "oklch(70% 0.03 152)"
  signal-green: "oklch(58.5% 0.115 150)"
  signal-green-lit: "oklch(73% 0.115 150)"
  on-signal: "oklch(15% 0.03 152)"
  signal-tint: "oklch(27% 0.06 150)"
  brick: "oklch(72% 0.1 35)"
  brick-tint: "oklch(26% 0.05 35)"
  brass: "oklch(77% 0.08 80)"
  brass-tint: "oklch(26% 0.04 80)"
  cobalt: "oklch(74% 0.07 240)"
  cobalt-tint: "oklch(26% 0.035 240)"
  dusk-lavender: "oklch(75% 0.07 305)"
  lavender-tint: "oklch(26% 0.04 305)"
  pewter: "oklch(62% 0.018 250)"
  bone: "oklch(85% 0.02 85)"
  terminal-ground: "oklch(15% 0.03 152)"
  terminal-text: "oklch(85% 0.03 152)"
  daylight-ground: "oklch(95.5% 0.012 150)"
  daylight-panel: "oklch(98.5% 0.006 150)"
  daylight-shadow: "oklch(86% 0.03 150)"
  daylight-ink: "oklch(19.5% 0.03 152)"
  daylight-signal: "oklch(45% 0.115 150)"
  daylight-signal-fill: "oklch(50% 0.115 150)"
typography:
  wordmark:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "15px"
    fontWeight: 300
    letterSpacing: "0.25em"
  count-display:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "56px"
    fontWeight: 800
    letterSpacing: "-0.03em"
    fontFeature: "\"tnum\""
  headline:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  map-title:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "20px"
    fontWeight: 700
    letterSpacing: "-0.01em"
  title:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "15px"
    fontWeight: 700
  body:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "\"tnum\""
  label:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.1em"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  none: "0"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  head: "58px"
  sidebar: "232px"
  drawer: "400px"
components:
  button:
    backgroundColor: "{colors.panel-green}"
    textColor: "{colors.moonlight}"
    rounded: "{rounded.none}"
    padding: "7px 12px"
    height: "34px"
  button-hover:
    backgroundColor: "{colors.well-green}"
  button-primary:
    backgroundColor: "{colors.signal-green}"
    textColor: "{colors.on-signal}"
    rounded: "{rounded.none}"
    padding: "7px 12px"
    height: "34px"
  button-quiet:
    textColor: "{colors.signal-green-lit}"
    padding: "7px 6px"
  segmented-option:
    textColor: "{colors.muted-text}"
    padding: "6px 12px"
    height: "30px"
  segmented-option-pressed:
    backgroundColor: "{colors.signal-tint}"
    textColor: "{colors.signal-green-lit}"
  chip-danger:
    backgroundColor: "{colors.brick-tint}"
    textColor: "{colors.brick}"
    typography: "{typography.label}"
    padding: "1px 6px"
  chip-human:
    backgroundColor: "{colors.lavender-tint}"
    textColor: "{colors.dusk-lavender}"
    padding: "1px 6px"
  list-row:
    backgroundColor: "{colors.panel-green}"
    textColor: "{colors.body-text}"
    padding: "12px 16px"
  list-row-current:
    backgroundColor: "{colors.signal-tint}"
  nav-item:
    textColor: "{colors.body-text}"
    padding: "8px 10px"
    height: "36px"
  nav-item-current:
    backgroundColor: "{colors.signal-tint}"
    textColor: "{colors.signal-green-lit}"
  command:
    backgroundColor: "{colors.well-green}"
    textColor: "{colors.moonlight}"
    typography: "{typography.mono}"
    padding: "8px 10px"
  drawer:
    backgroundColor: "{colors.panel-green}"
    width: "400px"
    padding: "22px 22px 40px"
  lamp:
    backgroundColor: "{colors.signal-green}"
    size: "8px"
  tooltip:
    backgroundColor: "{colors.moonlight}"
    textColor: "{colors.void-green}"
    padding: "8px 10px"
---

# Design System: OpenRig Console

## Overview

**Creative North Star: "The Quiet Orrery, Operated"**

This is oakgreen.cc's night sky put to work. The splash page's orrery (a dark, slow mechanical sky with the OGCC mark as sun) becomes the console's home: the rig and its mission are two systems sharing one sky, pods as square stations on the inner orbit, seats as bodies around them, workflow steps on the far track. One system is lit and the other sits in shadow; picking a shadowed body swaps them. Everything else (Attention, Backlog, Projects, Specs, Terminals, System) is the same ground, panel and hairline carried into lists, panes and tables.

Density is operational, not decorative: a 232px sidebar, a work area, and a right drawer on pick. Hierarchy comes from weight, case and tone, never from colour noise. The brand's clockwork survives: a giant OGCC mark turns linearly in Shadow Orbit behind the map and the Backlog ring, and nothing else in the machine spins.

The lineage is explicit. **Kept from OGCC:** the One Hue Rule (Signal Green is the only brand hue), the toy-ink family for everything that is not the brand (here repurposed as status), square corners, no shadows, no glow, no gradients, system-ui as the only face, linear clockwork rotation of the backdrop mark, and Sektor green never appearing. **Expanded for an operate surface:** hairline rules and bordered panels are allowed (the splash page had none); a light "Daylight" variant derived from the same ramps; status inks are lifted to L≈72–77% so they read as text on the dark ground (the splash inks sat at L≈61% as drawn objects); the orbit-swap tween eases, because it is travel, not rotation.

**Key Characteristics:**
- One brand hue (Signal Green) per preset; status in toy inks; every colour a token.
- Square everything (0 radius); 1px hairlines in shadow tone; flat tonal layering.
- system-ui for all text and all counts; ui-monospace only for ids, commands and terminal text.
- The orrery is the signature: lit/shadow dual layers, seats as motes in shadow, a clockwork backdrop mark.
- Fully themeable: presets carry dark and light variants; adopters override any token via `/theme.json` or the Theme panel, falling back to OGCC.

## Colors

A single forest-green hue at several depths for ground, panels, rules and text, one Signal Green for the brand, and a muted ink family that speaks only status. Values below are the OGCC dark preset; Daylight and the Cobalt preset re-map the same token roles.

### Primary
- **Signal Green** (`signal-green`): the brand hue as a fill: primary buttons, meters, lamps in the ok state, the sidebar mark, the sun, the undo-window drain. Matches oakgreen.cc's #3c9057.
- **Signal Green, Lit** (`signal-green-lit`): the same hue raised for text and lines on dark: selection, focus ring, current nav item, pressed segment text, links, flow dots, the selection ring around a picked body.
- **Signal Tint** (`signal-tint`): the ground for anything selected or current: selected list rows, current nav item, pressed segment, the receipt bar.

### Tertiary (status inks)
The OGCC toy-box inks, reassigned from orbiting toys to meaning. Each has a paired tint ground for chips and emphasised fills; each is quieter in chroma than Signal Green.
- **Brick** (`brick` / `brick-tint`): stalled, nobody owns it, failed, overdue. The only tone that shows through the shadow layer and the only tone that throws the alarm ring.
- **Tarnished Brass** (`brass` / `brass-tint`): needs input, parked, at a prompt.
- **Faded Cobalt** (`cobalt` / `cobalt-tint`): questions and links to evidence.
- **Dusk Lavender** (`dusk-lavender` / `lavender-tint`): anything addressed to the human; the "waits on you" leader line to the sun.
- **Pewter** (`pewter`): idle, stopped, no signal.
- **Bone** (`bone`): neutral marks on the map.

### Neutral
- **Void Green** (`void-green`): the page ground and the ground under shadow-layer bodies. oakgreen.cc's #0b190f.
- **Panel Green** (`panel-green`): sidebar, list column, drawer, view heads, lit station fill.
- **Well Green** (`well-green`): hover, table heads, sunk wells (command blocks, list group heads).
- **Shadow Orbit** (`shadow-orbit`): the backdrop mark, dashed strokes of shadow-layer bodies, mote fills. oakgreen.cc's #173620.
- **Hairline / Hairline Strong** (`hairline`, `hairline-strong`): 1px dividers; control borders and emphasised rules.
- **Moonlight / Body / Muted** (`moonlight`, `body-text`, `muted-text`): headings and names; running text; secondary text and labels.
- **Terminal Ground / Text** (`terminal-ground`, `terminal-text`): terminal previews and the raw token editor; stays dark in Daylight.

### Daylight
The light variant is derived from the same ramps, not designed separately: ground `daylight-ground`, panels `daylight-panel`, shadow layer `daylight-shadow`, ink `daylight-ink`, brand as text `daylight-signal` and as fill `daylight-signal-fill`. Status inks drop to L≈46–48% to hold contrast on light grounds.

### Named Rules
**The One Hue Rule.** Within a preset, the accent is the only brand hue. Selection, focus, "you" and flow are Signal Green; nothing else borrows it. A new element that needs a second brand colour is the wrong element.

**The Ink Means Status Rule.** Brick, brass, cobalt, lavender and pewter carry state and nothing else, always with a text or shape cue beside them so state is never colour alone.

**The Token-Only Rule.** Every colour painted comes from a token in the preset; no raw colours in stylesheets. Tints of a token use `color-mix(in oklch, ...)` against another token.

**The Guest Mark Rule.** Sektor's #41ff19 never appears in the console and never stands for OGCC.

## Typography

**Display Font:** system-ui (with -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif)
**Body Font:** system-ui (same stack)
**Label/Mono Font:** ui-monospace (with SFMono-Regular, Menlo, monospace), for machine text only

**Character:** One native face, as on oakgreen.cc; hierarchy is weight, size, case and tracking. The OGCC wordmark treatment (light, wide-tracked uppercase) is reserved for brand moments.

### Hierarchy
- **Wordmark** (300, 15px, 0.25em, uppercase): the sidebar "OPENRIG" wordmark, the sun's "YOU" label (13px), the Backlog ring's centre name (15px, 0.2em).
- **Count display** (800, 56px, -0.03em, tabular): the single big number in the centre of the Backlog ring.
- **Headline** (700, 22px, 1.25, -0.01em): the pane heading in split views (Attention, Projects, Specs).
- **Map title** (700, 20px, -0.01em): the rig or mission name at the top-left of the map; drawer headings share 20px.
- **Title** (700, 15px): list-column and view heads, 58px tall.
- **Body** (400, 14px, 1.45, tabular numerals): running text; explanatory "why" paragraphs cap at 64ch.
- **Label** (600, 11px, 0.1em, uppercase): section heads (`h3` "Seats", "Run it"), table heads (0.08em), list group heads, heartbeat head (10px, 0.12em). A label is the heading itself, never a line above another heading.
- **Mono** (400, 12px, 1.5): ids, commands, session names, terminal text, token editor.

### Named Rules
**The Tabular Count Rule.** Numerals in counts, ratios and ages are system-ui with tabular figures (set on `body`). Monospace is only for ids, commands and terminal text; a count in mono is wrong.

**The No Kicker Rule.** No kicker or eyebrow sits above a heading. The kind of a thing (spec kind, item kind, state) goes in a chip or a leading word on the meta line under the heading, or in front of the scope line in a list row.

**The Two-Line Reason Rule.** A station's subtitle is the sentence the map exists to say: it wraps to two lines at word boundaries, and only the second line may truncate.

## Layout

A fixed 232px sidebar beside one work area (`grid-template-columns: 232px 1fr`). The sidebar holds the mark and wordmark (58px row), the rig switcher, seven views with right-aligned counts in their tone, and the heartbeat pinned to the bottom. Heads across the app share a 58px height so rules line up across columns.

Split views use a list column of `clamp(280px, 30%, 380px)` and a pane capped at 820px with 28px/40px padding. Full-width views use a view head and a 24px body. Topology fills the work area with the orrery; its title and the Rig/Mission layer switch sit together at the top-left, the hover readout centred, the legend bottom-left. The detail drawer sits on the right edge and pushes the map (400px; 360px under 1100px).

Spacing rhythm is small and regular: 4, 8, 12, 16, 24px, with 40px only for pane side padding.

Under 768px the sidebar becomes an off-canvas drawer behind a 52px top bar (with a direct Attention count button), split views show list or detail one at a time with a back control, the drawer becomes a right sheet (`min(26rem, 94vw)`), the orrery goes square with enlarged type and bare-fill seats, and a row list of pods and seats appears under it. Touch targets are 44px on phone.

### Named Rules
**The Snap-Then-Slide Rule.** The drawer's width snaps open (the map re-lays out once, not per frame); only the inner panel slides in on a transform (24px, 240ms, ease-out). On phone the whole sheet slides on transform.

**The Title-Beside-Switch Rule.** The map's layer switch lives at the top-left beside the map title, never floating elsewhere on the sky.

## Elevation & Depth

Flat. There are no box-shadows, no glows, no gradients, no backdrop blur anywhere. Depth is tonal: Void Green ground, Panel Green surfaces, Well Green for hover and wells, and 1px hairlines between them. On the map, depth is the lit/shadow split: the lit layer draws in Panel Green with strong hairlines and full-strength text; the shadow layer draws in the Shadow Orbit tone, dashed, with muted labels. The only overlays (toast, map tooltip, bar tooltip) are inverted blocks (Moonlight on Void) rather than lifted cards.

### Named Rules
**The No-Glow Rule.** Any shadow, glow or blur breaks the night sky. Emphasis is a stroke width, a tint ground, or an inversion.

**The Tinted Shadow Rule.** The shadow layer is tinted from tokens (ground fill, Shadow Orbit dashed stroke, muted label), never a greyscale or opacity filter over the lit style. The one-hue world stays green in shadow, and shadow labels hold at least 3:1 on the ground.

## Shapes

Square everything (0 radius): buttons, inputs, chips, lamps, stations, motes, the drawer. The lamp, an 8px square, is the console's smallest unit of state; timeline ticks are 7px squares. Borders are 1px; a selected or stalled body steps to 2px. Orbits are 1px circles, tracks and leader lines are dotted with round caps, "waits on you" is a 4/5 dash. Icons are a single stroke grammar inherited from the OGCC site: 24px box, 1.75 stroke, round caps and joins, inline SVG.

## Components

### Buttons
Plain and confident; bordered blocks, never pills.
- **Shape:** square (0), 1px Hairline Strong border, 34px minimum height, 13px weight 600.
- **Default:** Panel Green ground, Moonlight text; hover to Well Green.
- **Primary:** Signal Green fill and border, On-Signal text; inline `kbd` hints take a translucent on-accent border.
- **Quiet:** borderless, Signal Green Lit text; hover to Well Green.
- **Danger:** default button with Brick text.
- **Motion:** colour transitions 120ms ease-out; press nudges down 1px. Disabled is 50% opacity.

### Segmented control
- **Style:** one bordered strip, options divided by hairlines, 12px weight 600, Muted text.
- **Pressed:** Signal Tint ground, Signal Green Lit text. Used for the Rig/Mission layer switch (with a Brick lamp on Mission when a step has no owner), System tabs, theme mode.

### Chips
- **Style:** 11px weight 600, 1px border in `currentColor`, tint ground of the tone (ok, warn, danger, human, info; idle uses Well Green with a strong hairline).
- **Use:** the carrier for kind and state on meta lines and in facts tables.

### Lists and panes
- **Row:** Panel Green, 12px/16px padding, hairline under each; title 13.5px weight 600, clamped to two lines; scope/ref line 11px beneath.
- **Current:** Signal Tint ground inside a 1px Signal Green Lit frame.
- **Group heads:** sticky Well Green bars in the label style.
- **Pane head:** headline, then a meta line of chips, mono ids and ages, closed by a hairline.

### Command block
- **Style:** Well Green well, strong hairline, 12px mono text, a bordered "Copy" cell on the right that reads "Copied" in Signal Green Lit for 1.4s.
- **Wrapping:** the command wraps so it is readable before it is copied, but only between tokens: a flag never splits from itself; a single token longer than 36 characters may break anywhere.

### Inputs / Fields
- **Style:** Void Green ground inside panels, 1px Hairline Strong, square, caret in Signal Green Lit.
- **Focus:** 2px Signal Green Lit outline (inset by 1px on fields; offset 2px elsewhere).

### Navigation
- **Sidebar items:** 36px rows, 14px weight 500, 19px stroke icon in Muted; hover Well Green; current is Signal Tint with Signal Green Lit text and icon. Counts right-aligned 12px tabular, taking the tone of what they count (Brick, Lavender, Brass) at weight 600.
- **Heartbeat:** lamp-led lines pinned to the sidebar foot; the bad line lifts to Moonlight 600.

### Receipt
The Attention receipt: a Signal Tint bar that wipes in (clip-path, 320ms), states what just happened with an Undo, and drains a 2px Signal Green line across its foot for the undo window (linear).

### The Orrery (signature)
- **Stations:** square bodies on the inner orbit: lamp, name (14px 700), working/seat ratio (12px 600 tabular, right), two-line reason (11.5px). Tone colours the stroke; Brick also thickens it to 2px and tints the fill.
- **Satellites and motes:** seats fan on the outer orbit when the rig is lit; when the mission is lit they become motes, small Shadow Orbit squares beside their pod that take a tone fill only when they matter.
- **Shadow layer:** tinted per the Tinted Shadow Rule; a Brick body shows through at full tone. Hover or focus lifts a shadow body to a solid Signal Green Lit stroke, inviting the swap.
- **Orbit swap:** clicking a shadow body exchanges which layer is lit: positions and box sizes travel on 480ms ease-out, opacity on 320ms. Reduced motion makes it instant.
- **Flows:** handoff edges in Muted with arrowheads; Signal Green Lit dots travel them linearly (1.8s). The stalled body throws a Brick alarm ring (2.4s).
- **Backdrop:** the theme's mark (`--mark`, OGCC by default) centred on its pane in both axes at 130% of the pane's short side, in Shadow Orbit at `--backdrop-opacity` (20%; 22% in Daylight), rotating linearly once per `--backdrop-period` (40s). One `Backdrop` component serves the map and the Backlog ring. Loops pause when the tab is hidden.
- **Brand mark:** a theme token, not a component constant. `--mark` holds a `url()` drawn as a CSS mask in currentColor, so a preset or `/theme.json` swaps the logo in the sidebar, the sun and the backdrop at once. The sidebar mark sits at 20px and the sun at 52px (72px on phones): present, not leading.
- **Sun:** the OGCC mark in Signal Green at centre, "YOU" in the wordmark style, a waiting count beneath; turns Lavender when something is addressed to you.

## Do's and Don'ts

### Do:
- **Do** take every colour from a preset token, and let anything a theme leaves unset fall back to OGCC.
- **Do** keep Signal Green for selection, focus, "you" and flow only; speak status in the toy inks with a text cue beside them.
- **Do** keep all corners square and all rules 1px hairlines in the shadow tone.
- **Do** put an item's kind in a chip or a leading word on the meta line, not above the heading.
- **Do** tint the shadow layer from tokens and keep its labels at 3:1 or better.
- **Do** set counts in system-ui tabular figures; reserve mono for ids, commands and terminal text.
- **Do** wrap station reasons to two lines and wrap commands only between tokens.
- **Do** rotate the backdrop mark linearly; ease only travel (the orbit swap, drawer and sheet entry, toasts).
- **Do** drop travel and loops under `prefers-reduced-motion` while keeping state visible.

### Don't:
- **Don't** use box-shadows, glows, gradients or backdrop blur.
- **Don't** round corners.
- **Don't** place kickers or eyebrows above headings.
- **Don't** greyscale or filter the shadow layer; it stays green.
- **Don't** set counts or ratios in monospace.
- **Don't** ease, speed up or stop the clockwork backdrop for interaction.
- **Don't** animate the drawer's width; snap it and slide the inner panel.
- **Don't** use Sektor green (#41ff19) anywhere in the console.
- **Don't** introduce a second brand hue within a preset.

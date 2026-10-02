// Every colour the console paints comes from these tokens. A preset carries a dark and a light variant;
// adopters add or override presets through /theme.json or the Theme panel (see ThemeProvider).
// OGCC values come from oakgreen.cc's design system (oklch ramps in website/.impeccable/design.json).

export type Tokens = Record<`--${string}`, string>;
export interface Preset { id: string; label: string; dark: Tokens; light: Tokens }

/** Tokens a theme is expected to set. Anything not set falls back to the OGCC preset. */
export const TOKEN_DOCS: Record<string, string> = {
  "--bg": "Page ground",
  "--surface": "Panels, lists, sidebar",
  "--surface-2": "Hover, table heads, sunk wells",
  "--shadow": "The background layer of the map; deep fills",
  "--line": "Hairline rules",
  "--line-strong": "Control borders, emphasised rules",
  "--fg": "Headings, names, primary text",
  "--body": "Running text",
  "--md": "Secondary text, labels",
  "--accent": "Brand hue as text/lines: selection, focus, you",
  "--accent-fill": "Brand hue as a fill (primary buttons, meters)",
  "--on-accent": "Text on accent-fill",
  "--accent-tint": "Selected rows, pressed segments",
  "--danger": "Stalled, nobody owns it, failed", "--danger-tint": "Danger ground",
  "--warn": "Needs input, parked, overdue soon", "--warn-tint": "Warn ground",
  "--info": "Questions, links to evidence", "--info-tint": "Info ground",
  "--human": "Items addressed to a human", "--human-tint": "Human ground",
  "--idle": "Idle, stopped, no signal",
  "--bone": "Neutral marks on the map",
  "--focus": "Keyboard focus ring",
  "--terminal-bg": "Terminal previews ground", "--terminal-fg": "Terminal previews text", "--terminal-accent": "Keys, prompts and highlights in terminal text",
  "--font": "UI face", "--mono": "Ids, commands, terminal text",
};

export const OGCC: Preset = {
  id: "ogcc",
  label: "Oak Green",
  dark: {
    "--bg": "oklch(19.5% 0.03 152)",
    "--surface": "oklch(22% 0.033 152)",
    "--surface-2": "oklch(25.5% 0.038 151)",
    "--shadow": "oklch(31% 0.06 150)",
    "--line": "oklch(29% 0.035 152)",
    "--line-strong": "oklch(38% 0.04 152)",
    "--fg": "oklch(95% 0.015 150)",
    "--body": "oklch(86% 0.02 150)",
    "--md": "oklch(70% 0.03 152)",
    "--accent": "oklch(73% 0.115 150)",
    "--accent-fill": "oklch(58.5% 0.115 150)",
    "--on-accent": "oklch(15% 0.03 152)",
    "--accent-tint": "oklch(27% 0.06 150)",
    "--danger": "oklch(72% 0.1 35)", "--danger-tint": "oklch(26% 0.05 35)",
    "--warn": "oklch(77% 0.08 80)", "--warn-tint": "oklch(26% 0.04 80)",
    "--info": "oklch(74% 0.07 240)", "--info-tint": "oklch(26% 0.035 240)",
    "--human": "oklch(75% 0.07 305)", "--human-tint": "oklch(26% 0.04 305)",
    "--idle": "oklch(62% 0.018 250)",
    "--bone": "oklch(85% 0.02 85)",
    "--focus": "oklch(73% 0.115 150)",
    "--terminal-bg": "oklch(15% 0.03 152)", "--terminal-fg": "oklch(85% 0.03 152)", "--terminal-accent": "oklch(73% 0.115 150)",
    "--font": "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
    "--mono": "ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  light: {
    "--bg": "oklch(95.5% 0.012 150)",
    "--surface": "oklch(98.5% 0.006 150)",
    "--surface-2": "oklch(92.5% 0.018 150)",
    "--shadow": "oklch(86% 0.03 150)",
    "--line": "oklch(88% 0.02 150)",
    "--line-strong": "oklch(76% 0.03 150)",
    "--fg": "oklch(19.5% 0.03 152)",
    "--body": "oklch(28% 0.03 152)",
    "--md": "oklch(45% 0.03 152)",
    "--accent": "oklch(45% 0.115 150)",
    "--accent-fill": "oklch(50% 0.115 150)",
    "--on-accent": "oklch(98.5% 0.006 150)",
    "--accent-tint": "oklch(92% 0.045 150)",
    "--danger": "oklch(48% 0.12 35)", "--danger-tint": "oklch(94% 0.03 35)",
    "--warn": "oklch(47% 0.085 80)", "--warn-tint": "oklch(94.5% 0.035 80)",
    "--info": "oklch(46% 0.085 240)", "--info-tint": "oklch(94% 0.025 240)",
    "--human": "oklch(47% 0.09 305)", "--human-tint": "oklch(94% 0.03 305)",
    "--idle": "oklch(55% 0.018 250)",
    "--bone": "oklch(50% 0.02 85)",
    "--focus": "oklch(45% 0.115 150)",
    "--terminal-bg": "oklch(19.5% 0.03 152)", "--terminal-fg": "oklch(85% 0.03 152)", "--terminal-accent": "oklch(76% 0.11 150)",
    "--font": "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
    "--mono": "ui-monospace, SFMono-Regular, Menlo, monospace",
  },
};

/** A second built-in so adopters can see a full re-skin: same structure, a cobalt night. */
export const COBALT: Preset = {
  id: "cobalt",
  label: "Cobalt",
  dark: {
    ...OGCC.dark,
    "--bg": "oklch(19% 0.03 250)", "--surface": "oklch(22% 0.033 250)", "--surface-2": "oklch(25.5% 0.038 250)",
    "--shadow": "oklch(31% 0.055 250)", "--line": "oklch(29% 0.035 250)", "--line-strong": "oklch(38% 0.04 250)",
    "--fg": "oklch(95% 0.012 250)", "--body": "oklch(86% 0.018 250)", "--md": "oklch(70% 0.03 250)",
    "--accent": "oklch(76% 0.1 240)", "--accent-fill": "oklch(60% 0.12 245)", "--on-accent": "oklch(15% 0.03 250)",
    "--accent-tint": "oklch(27% 0.06 245)", "--focus": "oklch(76% 0.1 240)",
    "--terminal-bg": "oklch(15% 0.03 250)", "--terminal-fg": "oklch(85% 0.03 250)",
  },
  light: {
    ...OGCC.light,
    "--bg": "oklch(96% 0.01 250)", "--surface": "oklch(99% 0.005 250)", "--surface-2": "oklch(93% 0.015 250)",
    "--shadow": "oklch(87% 0.025 250)", "--line": "oklch(89% 0.015 250)", "--line-strong": "oklch(77% 0.025 250)",
    "--fg": "oklch(20% 0.03 250)", "--body": "oklch(29% 0.03 250)", "--md": "oklch(46% 0.03 250)",
    "--accent": "oklch(45% 0.12 245)", "--accent-fill": "oklch(50% 0.13 245)", "--accent-tint": "oklch(92% 0.04 245)", "--focus": "oklch(45% 0.12 245)",
  },
};

export const BUILTIN_PRESETS: Preset[] = [OGCC, COBALT];

// The plugin contract. A plugin is a tab: a route segment, a nav row with an optional count, and a view.
// Plugins bring their own glyph (a path in the 24-box, 1.75-stroke grammar) and their own data; the console
// only routes to them, lists them, and gives them the shell's primitives.
import type { ComponentType, LazyExoticComponent } from "react";
import type { Tone } from "../lib/status";

export interface NavCount { text: string; tone?: Tone }

export interface RiguiPlugin {
  /** Route segment and stable key: /<id>/<sub-id?>. Must not collide with a core view. */
  id: string;
  /** Sidebar label and document title. */
  label: string;
  /** SVG path data in the console's icon grammar (24 box, stroked, round caps). */
  icon: string;
  /** The tab itself; lazy so a plugin costs nothing until it is opened. */
  view: LazyExoticComponent<ComponentType> | ComponentType;
  /** The sidebar count. Runs on every view, so it should read a cached query, not start heavy work. */
  useCount?: () => NavCount | undefined;
}

export const definePlugin = (p: RiguiPlugin) => p;

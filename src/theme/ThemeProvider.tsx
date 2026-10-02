import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { BUILTIN_PRESETS, OGCC, type Preset, type Tokens } from "./presets";

export type Mode = "system" | "dark" | "light";

/**
 * /theme.json, served beside the build (or the daemon's static dir), lets an adopter rebrand without a rebuild:
 *   { "default": "acme", "presets": [{ "id": "acme", "label": "Acme", "extends": "ogcc",
 *       "dark": { "--accent-fill": "#e4572e" }, "light": { ... } }] }
 * Missing tokens fall back to the preset it extends, then to OGCC.
 */
interface ThemeFile { default?: string; presets?: (Partial<Preset> & { id: string; extends?: string })[] }

interface ThemeState {
  mode: Mode;
  resolved: "dark" | "light";
  presetId: string;
  presets: Preset[];
  overrides: Tokens; // per-viewer, from the Theme panel; win over everything
  setMode(m: Mode): void;
  setPreset(id: string): void;
  setOverrides(t: Tokens): void;
}

const Ctx = createContext<ThemeState | null>(null);
export const useTheme = () => { const c = useContext(Ctx); if (!c) throw new Error("useTheme outside ThemeProvider"); return c; };

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };

function merge(file: ThemeFile | null): Preset[] {
  const list = [...BUILTIN_PRESETS];
  for (const p of file?.presets ?? []) {
    const base = list.find((x) => x.id === (p.extends ?? "ogcc")) ?? OGCC;
    const merged: Preset = { id: p.id, label: p.label ?? p.id, dark: { ...base.dark, ...p.dark }, light: { ...base.light, ...p.light } };
    const i = list.findIndex((x) => x.id === p.id);
    if (i >= 0) list[i] = merged; else list.push(merged);
  }
  return list;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>(() => (read("rigui.mode") as Mode) || "system");
  const [presetId, setPresetState] = useState(() => read("rigui.preset") || "");
  const [file, setFile] = useState<ThemeFile | null>(null);
  const [overrides, setOverridesState] = useState<Tokens>(() => { try { return JSON.parse(read("rigui.tokens") || "{}"); } catch { return {}; } });
  const [systemDark, setSystemDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);

  useEffect(() => {
    fetch("/theme.json").then((r) => (r.ok && r.headers.get("content-type")?.includes("json") ? r.json() : null)).then(setFile).catch(() => {});
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => setSystemDark(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const presets = useMemo(() => merge(file), [file]);
  const activeId = presetId || file?.default || "ogcc";
  const preset = presets.find((p) => p.id === activeId) ?? OGCC;
  const resolved = mode === "system" ? (systemDark ? "dark" : "light") : mode;

  useEffect(() => {
    const tokens = { ...OGCC[resolved], ...preset[resolved], ...overrides };
    let el = document.getElementById("rigui-theme") as HTMLStyleElement | null;
    if (!el) { el = document.createElement("style"); el.id = "rigui-theme"; document.head.appendChild(el); }
    el.textContent = `:root{${Object.entries(tokens).map(([k, v]) => `${k}:${v}`).join(";")};color-scheme:${resolved}}`;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.preset = preset.id;
  }, [preset, resolved, overrides]);

  const value: ThemeState = {
    mode, resolved, presetId: preset.id, presets, overrides,
    setMode: (m) => { setModeState(m); write("rigui.mode", m); },
    setPreset: (id) => { setPresetState(id); write("rigui.preset", id); },
    setOverrides: (t) => { setOverridesState(t); write("rigui.tokens", JSON.stringify(t)); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

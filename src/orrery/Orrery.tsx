import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Backdrop, Mark } from "../components/Icon";
import { arcBetween, bowPath, boxEdge, R, trimFor } from "./geometry";
import { SUN_ID, type Body, type Layer, type Scene } from "./scene";

const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** Words onto at most two lines of n characters; only the second line may truncate. */
function wrap2(s: string, n: number): string[] {
  if (s.length <= n) return [s];
  const words = s.split(" ");
  let first = "";
  while (words.length && (first ? first.length + 1 : 0) + words[0]!.length <= n) first += (first ? " " : "") + words.shift();
  if (!first) return [trunc(s, n)];
  return [first, trunc(words.join(" "), n)];
}

export interface OrreryProps {
  scene: Scene;
  narrow: boolean;
  selected: string | null;
  youCount: number;
  onPick(b: Body): void;
  onSun(): void;
  tooltip(b: Body, shadow: boolean): ReactNode;
}

/**
 * The rig map. Two layers share one sky; the lit one holds the inner orbits, the other waits on the outer track
 * in shadow. Bodies are positioned with CSS transforms so a swap is a tween between orbits, not a redraw.
 */
export function Orrery({ scene, narrow, selected, youCount, onPick, onSun, tooltip }: OrreryProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ id: string; x: number; y: number; below: boolean } | null>(null);
  const byId = useMemo(() => new Map(scene.bodies.map((b) => [b.id, b])), [scene]);
  const pad = narrow ? 560 : 510;
  // Hover (or the selection, when nothing is hovered) lights its links and flows; only hover dims other bodies.
  const focusId = hover?.id ?? selected;
  const touches = (ends: [string, string], via?: string[]) => !focusId || ends.includes(focusId) || !!via?.includes(focusId);

  const showTip = (b: Body, el: SVGGElement) => {
    const w = wrap.current?.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (!w) return;
    const below = r.top - w.top < 90;
    setHover({ id: b.id, x: r.left - w.left + r.width / 2, y: below ? r.bottom - w.top + 8 : r.top - w.top - 8, below });
  };

  // A swap moves every body; drop the tooltip rather than leave it pointing at empty sky.
  useLayoutEffect(() => { setHover(null); }, [scene.lit]);

  const flows = scene.flows.map((f) => {
    const a = byId.get(f.ends[0])!, b = byId.get(f.ends[1])!;
    if (f.along) {
      const arc = arcBetween(f.along.r, f.along.a1, f.along.a2, trimFor(f.along.r, Math.max(a.w, b.w) / 2));
      return { ...f, d: arc.d, head: arc.head as string | null };
    }
    const pa = boxEdge(a.at, a.w, a.h, { x: 0, y: 0 }), pb = boxEdge(b.at, b.w, b.h, { x: 0, y: 0 });
    return { ...f, d: bowPath(pa, pb, 0.5), head: null as string | null };
  });

  const sunTone = youCount ? "human" : "ok";
  const layers: Layer[] = scene.lit === "rig" ? ["mission", "rig"] : ["rig", "mission"]; // shadow first, lit on top
  const hovered = hover ? byId.get(hover.id) : null;

  return (
    <div className="orrery" ref={wrap} data-narrow={narrow || undefined} data-lit={scene.lit}>
      <Backdrop />
      <svg viewBox={`${-pad} ${-pad} ${pad * 2} ${pad * 2}`} role="group" aria-label={`${scene.lit === "rig" ? "Rig" : "Mission"} map`}>
        <circle className="orbit" r={R.station} />
        {scene.lit === "rig" && <circle className="orbit faint" r={R.satellite} />}
        <circle className="orbit track" r={R.track} />

        <g className="links" key={`l-${scene.lit}`}>
          {scene.links.map((l) => (
            <line key={l.id} className="link" data-kind={l.kind} data-tone={l.tone} data-dim={!touches(l.ends) || undefined}
              x1={l.from.x} y1={l.from.y} x2={l.to.x} y2={l.to.y} />
          ))}
        </g>

        <g className="flows" key={`f-${scene.lit}`}>
          {flows.map((f) => (
            <g key={f.id} data-dim={!touches(f.ends, f.via) || undefined} data-lit={focusId && touches(f.ends, f.via) ? "" : undefined}>
              <path className="flow-edge" d={f.d} />
              {f.head && <path className="flow-head" d={f.head} />}
              {f.moving && <path className="flow-dot" d={f.d} />}
            </g>
          ))}
        </g>

        <g className="sun" role="button" tabIndex={0} aria-label={youCount ? `You: ${youCount} waiting on you. Open Attention.` : "You: nothing waiting. Open Attention."}
          data-tone={sunTone} onClick={onSun} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSun(); } }}>
          <circle className="sun-hit" r={narrow ? 80 : 58} />
          <foreignObject x={narrow ? -36 : -26} y={narrow ? -50 : -38} width={narrow ? 72 : 52} height={narrow ? 72 : 52}>
            <Mark className="sun-mark" />
          </foreignObject>
          <text className="sun-name" y={narrow ? 44 : 32}>you</text>
          <text className="sun-sub" y={narrow ? 72 : 50}>{youCount ? `${youCount} waiting` : "all clear"}</text>
        </g>

        {layers.map((layer) => (
          <g key={layer} className="layer" data-layer={layer} data-shadow={layer !== scene.lit || undefined}>
            {scene.bodies.filter((b) => b.layer === layer).map((b) => (
              <BodyView key={b.id} b={b} shadow={layer !== scene.lit} narrow={narrow} selected={selected === b.id} hovered={hover?.id === b.id}
                dim={!!hover && hover.id !== b.id && !related(scene, hover.id, b.id)}
                onPick={() => onPick(b)} onHover={(el) => (el ? showTip(b, el) : setHover((h) => (h?.id === b.id ? null : h)))} />
            ))}
          </g>
        ))}
      </svg>
      {hover && hovered && (
        <div className="orrery-tip" role="tooltip" data-below={hover.below || undefined} style={{ left: hover.x, top: hover.y }}>
          {tooltip(hovered, hovered.layer !== scene.lit)}
        </div>
      )}
    </div>
  );
}

function related(scene: Scene, a: string, b: string) {
  if (a === SUN_ID) return scene.links.some((l) => l.kind === "you" && l.ends.includes(b));
  const body = scene.bodies.find((x) => x.id === b);
  if (body?.parent === a || scene.bodies.find((x) => x.id === a)?.parent === b) return true;
  return scene.links.some((l) => l.ends.includes(a) && l.ends.includes(b))
    || scene.flows.some((f) => (f.ends.includes(a) || f.via?.includes(a)) && (f.ends.includes(b) || f.via?.includes(b)));
}

function BodyView({ b, shadow, narrow, selected, hovered, dim, onPick, onHover }: {
  b: Body; shadow: boolean; narrow: boolean; selected: boolean; hovered: boolean; dim: boolean; onPick(): void; onHover(el: SVGGElement | null): void;
}) {
  const ref = useRef<SVGGElement>(null);
  const { w, h } = b;
  const hidden = b.place === "hidden";
  const label = `${b.kind} ${b.name}: ${b.status.reason}${shadow ? ". In shadow; activate to bring this layer forward." : ""}`;
  return (
    <g ref={ref} className="body" data-kind={b.kind} data-place={b.place} data-tone={b.status.tone} data-nobody={b.status.nobody || undefined}
      data-sel={selected || undefined} data-hover={hovered || undefined} data-dim={dim || undefined}
      style={{ transform: `translate(${b.at.x}px, ${b.at.y}px)` }}
      role={hidden ? undefined : "button"} tabIndex={hidden ? -1 : 0} aria-hidden={hidden || undefined} aria-label={hidden ? undefined : label}
      onClick={hidden ? undefined : onPick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(); } }}
      onPointerEnter={() => ref.current && onHover(ref.current)} onPointerLeave={() => onHover(null)}
      onFocus={() => ref.current && onHover(ref.current)} onBlur={() => onHover(null)}>
      {b.status.tone === "danger" && !hidden && <rect className="alarm" x={-w / 2} y={-h / 2} width={w} height={h} />}
      {/* Geometry as CSS so a swap tweens the box between station and track sizes. */}
      <rect className="box" style={{ x: -w / 2, y: -h / 2, width: w, height: h }} />
      <rect className="ring" style={{ x: -w / 2 - 5, y: -h / 2 - 5, width: w + 10, height: h + 10 }} />
      {b.place === "station" && (
        <>
          <rect className="b-lamp" x={-w / 2 + 12} y={-h / 2 + (narrow ? 20 : 14)} width={narrow ? 12 : 8} height={narrow ? 12 : 8} />
          <text className="b-name" x={-w / 2 + (narrow ? 32 : 27)} y={-h / 2 + (narrow ? 32 : 22)}>{trunc(b.name, narrow ? 9 : 12)}</text>
          {b.aside && <text className="b-aside" x={w / 2 - 11} y={-h / 2 + (narrow ? 32 : 22)}>{b.aside}</text>}
          {/* The reason is the sentence the map exists to say: two lines, not an ellipsis. */}
          <text className="b-sub" x={-w / 2 + 12} y={-h / 2 + (narrow ? 64 : 42)}>
            {wrap2(b.sub, narrow ? 15 : 21).map((l, i) => <tspan key={i} x={-w / 2 + 12} dy={i ? (narrow ? 22 : 15) : 0}>{l}</tspan>)}
          </text>
        </>
      )}
      {b.place === "satellite" && !narrow && (
        <>
          <rect className="b-lamp" x={-w / 2 + 10} y={-7} width={7} height={7} />
          <text className="b-name sm" x={-w / 2 + 23} y={-1}>{trunc(b.name, 11)}</text>
          <text className="b-sub sm" x={-w / 2 + 10} y={14}>{trunc(b.sub, 17)}</text>
        </>
      )}
      {b.place === "track" && (
        <>
          <rect className="b-lamp" x={-w / 2 + 8} y={-4 * (narrow ? 1.5 : 1)} width={narrow ? 11 : 7} height={narrow ? 11 : 7} />
          <text className="b-name xs" x={-w / 2 + (narrow ? 26 : 20)} y={narrow ? 7 : 4}>{trunc(b.name, 9)}</text>
        </>
      )}
    </g>
  );
}

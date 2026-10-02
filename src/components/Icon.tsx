// One stroke system for every glyph: 24 box, 1.75 stroke, round caps and joins (the OGCC site's icon grammar).
const P: Record<string, string> = {
  topology: "M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M12 3a9 9 0 1 0 9 9 M19 5m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0 M6.5 12a5.5 5.5 0 0 0 11 0",
  attention: "M4 13h3.5l1.5 3h6l1.5-3H20 M4 13l2.5-8h11L20 13v6H4z",
  backlog: "M12 3a9 9 0 1 0 9 9h-9z M15 3.5A9 9 0 0 1 20.5 9H15z",
  projects: "M5 21V4 M5 4h11l-2 4 2 4H5",
  specs: "M14 3v4a1 1 0 0 0 1 1h4 M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z M10 13l-2 2 2 2 M14 13l2 2-2 2",
  terminals: "M4 5h16v14H4z M8 10l2 2-2 2 M12 14h4",
  system: "M3 12h4l3-8 4 16 3-8h4",
  menu: "M4 7h16 M4 12h16 M4 17h16",
  close: "M6 6l12 12 M18 6L6 18",
  back: "M15 6l-6 6 6 6",
  copy: "M8 8h11v11H8z M16 8V5H5v11h3",
  check: "M5 12l5 5L20 7",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  swap: "M7 7h11l-3-3 M17 17H6l3 3",
  play: "M8 5v14l11-7z",
  pause: "M8 5v14 M16 5v14",
  host: "M4 5h16v6H4z M4 13h16v6H4z M8 8h.01 M8 16h.01",
  theme: "M12 3a9 9 0 1 0 0 18a3 3 0 0 0 0-6a3 3 0 0 1 0-6a3 3 0 0 0 0-6z",
  chevron: "M9 6l6 6-6 6",
  external: "M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6",
};
export type IconName = keyof typeof P;

export function Icon({ name, className, title }: { name: IconName; className?: string; title?: string }) {
  return (
    <svg className={className ?? "ico"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden={title ? undefined : true} role={title ? "img" : undefined} aria-label={title}>
      <path d={P[name]} />
    </svg>
  );
}

/** The OGCC mark: an outer ring and three broken arcs. Drawn in currentColor. */
export function Mark({ className, spin }: { className?: string; spin?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 500 500" aria-hidden="true" data-spin={spin || undefined}>
      <g fill="none" stroke="currentColor" strokeWidth="35" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="250" cy="250" r="230" />
        <path d="M 430,250 A 180,180 0 0 1 262.00767,429.59904 180,180 0 0 1 71.602046,273.96184 180,180 0 0 1 214.19073,73.597912 180,180 0 0 1 423.62033,202.50285" />
        <line x1="330" y1="250" x2="430" y2="250" />
        <path d="M 370.1607,299.61256 A 130,130 0 0 1 224.15443,377.40489 130,130 0 0 1 120.00495,248.86555 130,130 0 0 1 226.38189,122.16344 130,130 0 0 1 371.00826,202.49209" />
        <path d="M 314.41635,297.43979 A 80,80 0 0 1 225.0331,326.0043 80,80 0 0 1 170,250 a 80,80 0 0 1 55.03311,-76.0043 80,80 0 0 1 89.38324,28.56451" />
      </g>
    </svg>
  );
}

import type { ReactNode } from "react";
import { Icon } from "./Icon";

/**
 * A list column beside a reading pane (Attention, Specs, System). On a phone the list and the pane take turns:
 * `detail` shows the pane, and the pane's back button returns to the list.
 */
export function SplitView({ title, count, list, foot, pane, detail, onBack, backLabel, id }: {
  title: string; count?: ReactNode; list: ReactNode; foot?: ReactNode; pane: ReactNode;
  detail: boolean; onBack(): void; backLabel?: string; id?: string;
}) {
  return (
    <div className="split" data-detail={detail || undefined} id={id}>
      <section className="list-col" aria-label={title}>
        <header className="list-head"><h1>{title}</h1>{count != null && <small>{count}</small>}</header>
        <div className="list-scroll">{list}</div>
        {foot && <footer className="list-foot">{foot}</footer>}
      </section>
      <div className="pane">
        <div className="pane-in">
          <button type="button" className="pane-back" onClick={onBack}><Icon name="back" />{backLabel ?? title}</button>
          {pane}
        </div>
      </div>
    </div>
  );
}

export function ListGroup({ label, count }: { label: string; count?: number }) {
  return <h2 className="list-group"><span>{label}</span>{count != null && <small>{count}</small>}</h2>;
}

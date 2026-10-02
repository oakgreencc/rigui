import { lazy, Suspense, useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { useLiveEvents, useSource } from "./api/hooks";
import { RigProvider, Shell } from "./components/Shell";
import { ToastHost } from "./components/primitives";
import { useRoute, type ViewId } from "./lib/router";
import Topology from "./views/Topology";

// Topology is the landing view and ships in the main chunk; the rest load on first visit.
const VIEWS: Record<ViewId, React.ComponentType> = {
  topology: Topology,
  attention: lazy(() => import("./views/Attention")),
  backlog: lazy(() => import("./views/Backlog")),
  projects: lazy(() => import("./views/Projects")),
  specs: lazy(() => import("./views/Specs")),
  terminals: lazy(() => import("./views/Terminals")),
  system: lazy(() => import("./views/System")),
};

const TITLES: Record<ViewId, string> = {
  topology: "Topology", attention: "Attention", backlog: "Backlog", projects: "Projects", specs: "Specs", terminals: "Terminals", system: "System",
};

export function App({ qc }: { qc: QueryClient }) {
  const source = useSource();
  useLiveEvents(qc, source);
  const route = useRoute();
  const View = VIEWS[route.view];
  useEffect(() => { document.title = `${TITLES[route.view]} · OpenRig`; }, [route.view]);
  // Clockwork stops when nobody is looking.
  useEffect(() => {
    const on = () => { if (document.hidden) document.documentElement.dataset.hiddenTab = ""; else delete document.documentElement.dataset.hiddenTab; };
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return (
    <ToastHost>
      <RigProvider>
        <Shell>
          <Suspense fallback={<p className="loading">Loading…</p>}>
            <View />
          </Suspense>
        </Shell>
      </RigProvider>
    </ToastHost>
  );
}

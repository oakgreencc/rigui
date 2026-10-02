import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { pickSource } from "./api/source";
import { SourceContext } from "./api/hooks";
import { ThemeProvider } from "./theme/ThemeProvider";
import { App } from "./App";
import "./styles/base.css";
import "./styles/shell.css";

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 10_000 } } });

pickSource().then((source) => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <SourceContext.Provider value={source}>
        <QueryClientProvider client={qc}>
          <ThemeProvider>
            <App qc={qc} />
          </ThemeProvider>
        </QueryClientProvider>
      </SourceContext.Provider>
    </StrictMode>,
  );
});

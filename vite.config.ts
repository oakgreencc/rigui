import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { githubBridge } from "./server/github";

// The console replaces the daemon-served UI. In dev it proxies /api and /healthz to a local daemon
// (OPENRIG_URL, default http://127.0.0.1:7433). With no daemon running, the fixture source takes over.
// The GitHub plugins read through the dev server's bridge (/__gh/*), authed from .env.local.
export default defineConfig(({ mode }) => {
  const env = { ...process.env, ...loadEnv(mode, process.cwd(), "") };
  const daemon = env.OPENRIG_URL ?? "http://127.0.0.1:7433";
  return {
    plugins: [react(), githubBridge(env)],
    server: {
      port: 5178,
      proxy: {
        "/api": { target: daemon, changeOrigin: true, ws: true },
        "/healthz": { target: daemon, changeOrigin: true },
      },
    },
    build: { outDir: "dist", sourcemap: true },
  };
});

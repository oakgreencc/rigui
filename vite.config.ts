import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The console replaces the daemon-served UI. In dev it proxies /api and /healthz to a local daemon
// (OPENRIG_URL, default http://127.0.0.1:7433). With no daemon running, the fixture source takes over.
const daemon = process.env.OPENRIG_URL ?? "http://127.0.0.1:7433";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5178,
    proxy: {
      "/api": { target: daemon, changeOrigin: true, ws: true },
      "/healthz": { target: daemon, changeOrigin: true },
    },
  },
  build: { outDir: "dist", sourcemap: true },
});

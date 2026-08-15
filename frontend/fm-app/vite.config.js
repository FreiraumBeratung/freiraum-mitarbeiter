import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import lanHttpsPlugin from "./vite-plugin-lan-https.js";

export default defineConfig({
  // "./" bleibt für Electron (file://). Auf dem Server: FM_WEB_BASE=/ npm run build
  // sonst lädt iOS-PWA unter /mail/compose die JS-Dateien vom falschen Pfad → weißer Screen.
  base: process.env.FM_WEB_BASE || "./",
  plugins: [react(), lanHttpsPlugin()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:30521", changeOrigin: true },
      "/voice": { target: "http://127.0.0.1:30521", changeOrigin: true },
      "/lead_hunter": { target: "http://127.0.0.1:30521", changeOrigin: true },
    },
  },
});

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  use: { headless: true, baseURL: "http://localhost:5173" },
  timeout: 20000,
  webServer: {
    command: "npm run dev -- --host --strictPort --port 5173",
    port: 5173,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});



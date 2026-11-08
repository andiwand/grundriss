// The browser tests: Playwright builds the app, serves the build, and runs the files
// e2e/*.e2e.ts in Chromium. The build has no reload on a change of a file, so a test sees one
// version of the app. Run them with `npm run test:e2e`.

import { defineConfig, devices } from "@playwright/test";

const PORT = 5175;
/** The Grundriss server of the tests (e2e/sharing.e2e.ts), in mode "api", with a known root token. */
export const SERVER_PORT = 5176;
export const SERVER_ROOT = "e2e-root-token-0123456789";

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts",
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}/`,
    // The tests check English texts, unless a test chooses German.
    locale: "en-US",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: `npx vite build --outDir .e2e-build --emptyOutDir && npx vite preview --outDir .e2e-build --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}/`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      // A fresh data folder for each run. The app of the tests may call the API (CORS).
      command:
        `rm -rf .e2e-server && npm run build:server && ` +
        `GRUNDRISS_MODE=api GRUNDRISS_DATA=.e2e-server GRUNDRISS_ROOT_TOKEN=${SERVER_ROOT} ` +
        `GRUNDRISS_ORIGINS=http://localhost:${PORT} PORT=${SERVER_PORT} node server/dist/main.mjs`,
      url: `http://localhost:${SERVER_PORT}/${SERVER_ROOT}/api/me`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});

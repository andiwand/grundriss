// The browser tests: Playwright builds the app, serves the build, and runs the files
// e2e/*.e2e.ts in Chromium. The build has no reload on a change of a file, so a test sees one
// version of the app. Run them with `npm run test:e2e`.

import { defineConfig, devices } from "@playwright/test";

const PORT = 5175;

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
  webServer: {
    command: `npx vite build --outDir .e2e-build --emptyOutDir && npx vite preview --outDir .e2e-build --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});

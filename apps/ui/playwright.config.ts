import { defineConfig, devices } from "@playwright/test";

/**
 * Visual regression tests against Storybook.
 *
 * Run with: npm run test:visual
 * Update baselines: npm run test:visual -- --update-snapshots
 *
 * The test server serves the pre-built Storybook static bundle.
 */
export default defineConfig({
  testDir: "./src/tests",
  snapshotDir: "./src/tests/snapshots",
  outputDir: "./src/tests/output",
  timeout: 30_000,

  use: {
    baseURL: "http://localhost:6006",
    screenshot: "only-on-failure",
  },

  webServer: {
    command: "npx http-server storybook-static -p 6006 --cors -c-1 -s",
    url: "http://localhost:6006",
    reuseExistingServer: true,
    timeout: 30_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

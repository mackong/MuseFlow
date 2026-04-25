import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for end-to-end critical-flow tests.
 *
 * - Mobile-first: Pixel 5 emulation is the only project, enforcing
 *   Constitution Principle I at CI time. Every e2e spec runs in a 393x851
 *   viewport with mobile UA and touch input.
 * - `webServer` boots the Next.js dev server on demand. In CI we spawn a
 *   fresh server; locally we reuse if you already have `pnpm dev` running.
 * - Slow 4G network throttling is NOT applied at the config level —
 *   Playwright doesn't expose a top-level option for it. Specs that need
 *   it apply CDP `Network.emulateNetworkConditions` via a fixture; see
 *   tests/e2e/fixtures.ts (added when the first e2e spec lands at T039).
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "Mobile Chrome (Pixel 5)",
      use: {
        ...devices["Pixel 5"],
      },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
  },
});

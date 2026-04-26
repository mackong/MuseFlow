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
  // Default to 1 worker locally too — Playwright's webServer-availability
  // probe + parallel boots can race against the dev server for the first
  // few specs; serial keeps the suite deterministic. Bump if the suite
  // grows large enough that wall-clock time matters.
  workers: 1,
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
    env: {
      // Run Next.js against the test DB so e2e specs can truncate + seed
      // without clobbering dev data.
      DATABASE_URL:
        process.env.DATABASE_URL_TEST ?? "postgresql://lihaiping@localhost:5432/museflow_test",
      DIRECT_DATABASE_URL:
        process.env.DATABASE_URL_TEST ?? "postgresql://lihaiping@localhost:5432/museflow_test",
      // Force fakes so e2e doesn't hit a real LLM / moderation / Redis.
      MUSEFLOW_AI_PROVIDER: "fake",
      MUSEFLOW_MODERATOR: "fake",
      UPSTASH_REDIS_REST_URL: "",
      UPSTASH_REDIS_REST_TOKEN: "",
      // Auth.js needs a secret; deterministic for e2e.
      AUTH_SECRET:
        process.env.AUTH_SECRET ??
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      AUTH_URL: "http://localhost:3000",
      NEXTAUTH_URL: "http://localhost:3000",
    },
  },
});

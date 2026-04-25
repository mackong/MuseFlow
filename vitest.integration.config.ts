import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Vitest config for API-route integration tests.
 *
 * Differences from `vitest.config.ts`:
 *   - Includes `tests/integration/**` (excludes unit + e2e).
 *   - `setupFiles: ["tests/integration/setup.ts"]` connects to a separate
 *     `museflow_test` Postgres database (DATABASE_URL_TEST), truncates
 *     between tests, and disconnects on teardown. The setup file fails
 *     fast with a clear message if DATABASE_URL_TEST is not configured.
 *   - Single-thread by default to avoid concurrent truncates colliding
 *     on a shared DB; bump pool / threads after we shard via DB branches.
 *   - Higher per-test timeout because some integration tests will involve
 *     a real Postgres round trip plus migration replay.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**", "dist/**", "tests/unit/**", "tests/e2e/**"],
    env: {
      MUSEFLOW_AI_PROVIDER: "fake",
      MUSEFLOW_MODERATOR: "fake",
      UPSTASH_REDIS_REST_URL: "",
      UPSTASH_REDIS_REST_TOKEN: "",
    },
    setupFiles: ["tests/integration/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: "threads",
    poolOptions: { threads: { singleThread: true } },
    clearMocks: true,
    restoreMocks: true,
  },
});

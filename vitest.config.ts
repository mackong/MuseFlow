import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Vitest config for unit tests.
 *
 * - Node test environment (services don't render React; co-located UI
 *   tests would use a dedicated jsdom config later).
 * - `@/*` path alias matched to tsconfig.json.
 * - Environment defaults force the fake AI provider and fake moderator so
 *   unit tests never accidentally hit a real LLM or moderation endpoint,
 *   regardless of what `.env` happens to contain.
 * - Includes `tests/unit/**` only; integration and e2e are owned by
 *   their own configs (`vitest.integration.config.ts`, `playwright.config.ts`).
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**", "dist/**", "tests/integration/**", "tests/e2e/**"],
    env: {
      MUSEFLOW_AI_PROVIDER: "fake",
      MUSEFLOW_MODERATOR: "fake",
      // Empty so the rate-limit service falls back to in-memory mode in tests.
      UPSTASH_REDIS_REST_URL: "",
      UPSTASH_REDIS_REST_TOKEN: "",
    },
    clearMocks: true,
    restoreMocks: true,
  },
});

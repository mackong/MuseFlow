import { afterAll, beforeEach } from "vitest";

/**
 * Integration test bootstrap.
 *
 * Loaded by every worker before any test file is imported. Responsibilities:
 *   1. Refuse to run unless DATABASE_URL_TEST is explicitly set — we never
 *      want integration tests pointed at the dev or production database by
 *      accident.
 *   2. Override DATABASE_URL and DIRECT_DATABASE_URL with the test URL so
 *      the Prisma client (lazily constructed inside tests/helpers/db.ts and
 *      src/server/db/prisma.ts) connects to the test DB on first use.
 *   3. Truncate every app table before each test for hermeticity.
 *   4. Disconnect on teardown.
 *
 * Migrations are NOT applied here — that is a one-time setup step the
 * developer runs explicitly:
 *
 *   createdb museflow_test
 *   DATABASE_URL=postgresql://lihaiping@localhost:5432/museflow_test \
 *     DIRECT_DATABASE_URL=postgresql://lihaiping@localhost:5432/museflow_test \
 *     pnpm prisma migrate deploy
 *
 * Then tests run against that schema. CI does the same against an ephemeral
 * Neon branch (decision 2 in research.md).
 */

const testUrl = process.env.DATABASE_URL_TEST;
if (!testUrl) {
  throw new Error(
    [
      "DATABASE_URL_TEST is not set. Integration tests refuse to run against the dev DB.",
      "",
      "Quick local setup (Homebrew Postgres):",
      "  createdb museflow_test",
      "  DATABASE_URL=postgresql://$USER@localhost:5432/museflow_test \\",
      "    DIRECT_DATABASE_URL=postgresql://$USER@localhost:5432/museflow_test \\",
      "    pnpm prisma migrate deploy",
      "  echo 'DATABASE_URL_TEST=postgresql://$USER@localhost:5432/museflow_test' >> .env.test.local",
      "",
      "Then re-run pnpm test:integration.",
    ].join("\n"),
  );
}

process.env.DATABASE_URL = testUrl;
process.env.DIRECT_DATABASE_URL = testUrl;

// Lazy import so the Prisma client constructed inside helpers picks up the
// overridden env. Importing at the top would race against the env override.
const { truncateAll, disconnectTestPrisma } = await import("../helpers/db");

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

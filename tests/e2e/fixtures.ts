import { randomBytes } from "node:crypto";

import { test as base, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * Playwright fixtures for MuseFlow e2e specs.
 *
 * - `prisma`: a connection to the same test DB the dev server uses
 *   (DATABASE_URL_TEST or the default museflow_test fallback). Test specs
 *   use this to truncate state and seed users.
 *
 * - `signedIn`: a Page that already has an Auth.js session cookie attached.
 *   Bypasses the magic-link round trip entirely by inserting User + Session
 *   rows directly and setting the session-token cookie on the browser
 *   context. Tests get a real authenticated session without flaky email
 *   parsing.
 */

const TEST_DB_URL =
  process.env.DATABASE_URL_TEST ?? "postgresql://lihaiping@localhost:5432/museflow_test";

interface Fixtures {
  prisma: PrismaClient;
  signedIn: Page;
}

export const test = base.extend<Fixtures>({
  prisma: async ({}, use) => {
    const client = new PrismaClient({
      datasources: { db: { url: TEST_DB_URL } },
    });
    await use(client);
    await client.$disconnect();
  },

  signedIn: async ({ page, context, prisma }, use) => {
    // Wipe and seed an authenticated user.
    await truncateAll(prisma);

    const userId = `cuid${randomBytes(10).toString("hex")}`;
    await prisma.user.create({
      data: {
        id: userId,
        email: `tester-${userId}@example.test`,
        displayName: `Tester ${userId.slice(-4)}`,
        username: `tester${userId.slice(-6)}`,
        emailVerified: new Date(),
      },
    });

    // Insert a Session row whose sessionToken value is what we set as the
    // browser cookie. Auth.js's database strategy looks up the cookie value
    // verbatim against Session.sessionToken (no hashing).
    const sessionToken = `sess-${randomBytes(24).toString("hex")}`;
    await prisma.session.create({
      data: {
        sessionToken,
        userId,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    await context.addCookies([
      {
        name: "authjs.session-token",
        value: sessionToken,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    await use(page);

    // Best-effort cleanup; subsequent specs truncate again.
    await prisma.session.deleteMany({ where: { sessionToken } }).catch(() => {});
  },
});

export const expect = base.expect;

export async function truncateAll(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE
       "SafetyCheck",
       "Generation",
       "Save",
       "Like",
       "Comment",
       "Draft",
       "Post",
       "Session",
       "Account",
       "VerificationToken",
       "User"
     RESTART IDENTITY CASCADE;`,
  );
}

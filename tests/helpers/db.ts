import { PrismaClient } from "@prisma/client";

import type { Tone } from "@/lib/contracts/shared";

/**
 * Test DB helper. Two modes:
 *
 * 1. Integration tests (real Postgres test branch via `DATABASE_URL`).
 *    Use `getTestPrisma()` and call `truncateAll()` between tests.
 *
 * 2. Unit tests (no DB needed).
 *    Service-layer tests pass `prismock`-built clients into services directly;
 *    do not import this helper. See README in tests/unit/.
 *
 * The helper deliberately does NOT spin up a Postgres docker container — that
 * is CI's responsibility (one Neon branch per CI run, decision 2 in
 * research.md).
 */

let cached: PrismaClient | undefined;

export function getTestPrisma(): PrismaClient {
  if (!cached) {
    cached = new PrismaClient({ log: ["error"] });
  }
  return cached;
}

export async function disconnectTestPrisma(): Promise<void> {
  if (cached) {
    await cached.$disconnect();
    cached = undefined;
  }
}

/**
 * Truncate every app table between tests. Order is irrelevant because we use
 * `RESTART IDENTITY CASCADE`. Auth.js tables are included so that User-related
 * tests start clean.
 */
export async function truncateAll(prisma: PrismaClient = getTestPrisma()): Promise<void> {
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

// -----------------------------------------------------------------------------
// Factories
// -----------------------------------------------------------------------------

let counter = 0;
const nextSeq = () => ++counter;

export interface MakeUserOpts {
  email?: string;
  displayName?: string;
  username?: string;
  description?: string | null;
}

export async function makeUser(prisma: PrismaClient = getTestPrisma(), opts: MakeUserOpts = {}) {
  const seq = nextSeq();
  return prisma.user.create({
    data: {
      email: opts.email ?? `user${seq}@example.test`,
      displayName: opts.displayName ?? `User ${seq}`,
      username: opts.username ?? `user${seq}`,
      description: opts.description ?? null,
      emailVerified: new Date(),
    },
  });
}

export interface MakePostOpts {
  authorId: string;
  title?: string;
  body?: string;
  tone?: Tone;
  publishedAt?: Date;
  parentId?: string;
  parentAuthorSnapshot?: { id: string; displayName: string };
  remixMode?: "REWRITE" | "CONTINUE" | "SUMMARIZE" | "CHANGE_TONE";
}

export async function makePost(prisma: PrismaClient = getTestPrisma(), opts: MakePostOpts) {
  const seq = nextSeq();
  return prisma.post.create({
    data: {
      authorId: opts.authorId,
      title: opts.title ?? `Test post ${seq}`,
      body: opts.body ?? `Test body ${seq}`,
      tone: opts.tone ?? "INSPIRING",
      publishedAt: opts.publishedAt ?? new Date(),
      parentId: opts.parentId ?? null,
      parentAuthorSnapshot: opts.parentAuthorSnapshot
        ? (opts.parentAuthorSnapshot as object)
        : undefined,
      remixMode: opts.remixMode ?? null,
    },
  });
}

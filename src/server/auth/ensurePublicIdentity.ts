import { prisma } from "@/server/db/prisma";

/**
 * Populate `displayName` and `username` for a user that was just created by
 * Auth.js. The schema marks both as nullable because Auth.js's `createUser`
 * adapter call only knows `name`/`email`/`image`; this hook fills the
 * spec-required identity fields with disambiguation against existing users.
 *
 * Idempotent: if both fields are already populated, returns immediately.
 *
 * Disambiguation strategy:
 *   1. Seed displayName from `user.name` (if set) or the email local-part.
 *   2. Seed username from a slug-safe transform of the email local-part.
 *   3. If a row with the seed username/displayName already exists (excluding
 *      this user), append a numeric suffix and retry. Cap at 100 attempts;
 *      catastrophic fallback uses the user's id prefix.
 */
export async function ensurePublicIdentity(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, displayName: true, username: true },
  });
  if (!user) return;
  if (user.username && user.displayName) return;

  const emailLocal = user.email.split("@")[0] ?? "user";
  const seedDisplay = sanitizeDisplay(user.name?.trim() || emailLocal);
  const seedUsername = sanitizeUsername(emailLocal) || `user${userId.slice(0, 8)}`;

  let displayName = seedDisplay;
  let username = seedUsername;

  for (let attempt = 0; attempt < 100; attempt++) {
    const conflict = await prisma.user.findFirst({
      where: {
        AND: [{ id: { not: userId } }, { OR: [{ username }, { displayName }] }],
      },
      select: { id: true },
    });
    if (!conflict) {
      await prisma.user.update({
        where: { id: userId },
        data: { displayName, username },
      });
      return;
    }
    const suffix = attempt + 2; // start at "user2"
    username = truncate(`${seedUsername}${suffix}`, 30);
    displayName = truncate(`${seedDisplay} ${suffix}`, 40);
  }

  // Catastrophic fallback — id-based, guaranteed unique because cuid is unique.
  await prisma.user.update({
    where: { id: userId },
    data: {
      username: `user${userId.slice(0, 8)}`,
      displayName: `User ${userId.slice(0, 6)}`,
    },
  });
}

/**
 * Trim, clamp to 2..40 chars, and ensure a non-empty result.
 * Display names allow any printable Unicode; we only enforce length.
 */
function sanitizeDisplay(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length < 2) return "User";
  return trimmed.slice(0, 40);
}

/**
 * Lowercase, strip everything outside `[a-z0-9_-]`, clamp to 2..30.
 * Returns "" if nothing survives — caller substitutes an id-based fallback.
 */
function sanitizeUsername(raw: string): string {
  const slug = raw.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (slug.length < 2) return "";
  return slug.slice(0, 30);
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max);
}

import { prisma } from "@/server/db/prisma";

import { auth } from "./auth.config";

/**
 * The shape every server-side handler (route, server action, page) sees when
 * it asks "who is the current user?" — minimal, public-safe, and never null
 * fields like email.
 *
 * Email is intentionally excluded; if a route needs it (e.g. /api/me),
 * fetch it explicitly with a scoped query.
 */
export interface CurrentUser {
  id: string;
  username: string;
  displayName: string;
  image: string | null;
}

/**
 * Return the current authenticated user with the spec-required public
 * identity fields populated, or `null` for anonymous requests.
 *
 * Returns null (not throws) so callers can decide how to react:
 *   - Public read endpoints can degrade gracefully.
 *   - Auth-required endpoints throw `UnauthenticatedError` themselves.
 *
 * Edge case: if the User row exists but `username` or `displayName` are
 * still null (the `events.createUser` hook failed), this also returns null.
 * That fails the user closed — they cannot perform any authenticated action
 * until the identity hook is re-run.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, username: true, displayName: true, image: true },
  });
  if (!user || !user.username || !user.displayName) return null;

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    image: user.image,
  };
}

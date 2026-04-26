import type { Prisma } from "@prisma/client";

import { prisma } from "@/server/db/prisma";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import {
  DisplayNameSchema,
  UsernameSchema,
  type OwnProfileShell,
  type PublicProfileShell,
  type ProfilePatch,
} from "@/lib/contracts/profile.contract";

/**
 * Profile service.
 *
 * Constitution Principle VII (Privacy & Data Control):
 *  - getOwnShell exposes email + private counts; only callable from
 *    /api/me with the authenticated session.
 *  - getPublic strips email and never exposes drafts / saved counts.
 *  - updateProfile enforces displayName + username uniqueness; throws
 *    ConflictError → HTTP 409 on collision.
 *
 * The four list helpers (own published / drafts / saved / remixes) are
 * thin adapters that delegate to the existing services so the wire shape
 * remains consistent (FeedCardProjection / DraftProjection / SaveListItem).
 */

// -----------------------------------------------------------------------------
// Shells
// -----------------------------------------------------------------------------

export async function getOwnShell(userId: string): Promise<OwnProfileShell> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      displayName: true,
      description: true,
      image: true,
      email: true,
      createdAt: true,
    },
  });
  if (!user) throw new NotFoundError("User not found");
  if (!user.username || !user.displayName) {
    // Identity-incomplete users are bounced from public surfaces; if the
    // Auth.js events.createUser hook hasn't completed yet, return 404
    // rather than expose a half-formed profile.
    throw new NotFoundError("User profile is incomplete");
  }

  const [publishedPosts, drafts, saved, authoredRemixes] = await Promise.all([
    prisma.post.count({ where: { authorId: userId, status: "PUBLISHED" } }),
    prisma.draft.count({ where: { authorId: userId } }),
    prisma.save.count({ where: { userId } }),
    prisma.post.count({
      where: { authorId: userId, status: "PUBLISHED", parentId: { not: null } },
    }),
  ]);

  return {
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      description: user.description ?? null,
      image: user.image ?? null,
      email: user.email,
      createdAt: (user.createdAt ?? new Date()).toISOString(),
    },
    counts: { publishedPosts, drafts, saved, authoredRemixes },
  };
}

export async function getPublic(username: string): Promise<PublicProfileShell> {
  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      displayName: true,
      description: true,
      image: true,
      createdAt: true,
    },
  });
  if (!user || !user.username || !user.displayName) {
    throw new NotFoundError("Profile not found");
  }

  const publishedPosts = await prisma.post.count({
    where: { authorId: user.id, status: "PUBLISHED" },
  });

  return {
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      description: user.description ?? null,
      image: user.image ?? null,
      createdAt: (user.createdAt ?? new Date()).toISOString(),
    },
    counts: { publishedPosts },
  };
}

// -----------------------------------------------------------------------------
// updateProfile — uniqueness-checked partial update.
// -----------------------------------------------------------------------------

export interface UpdateProfileInput {
  userId: string;
  patch: ProfilePatch;
}

export async function updateProfile(input: UpdateProfileInput): Promise<OwnProfileShell> {
  const { userId, patch } = input;

  // Re-validate against the server's strict schemas — defense in depth so
  // direct service calls (in tests) don't bypass route-level Zod parsing.
  const data: Prisma.UserUpdateInput = {};
  if (patch.displayName !== undefined) {
    const parsed = DisplayNameSchema.safeParse(patch.displayName);
    if (!parsed.success) throw new ValidationError("Invalid displayName");
    data.displayName = parsed.data;
  }
  if (patch.username !== undefined) {
    const parsed = UsernameSchema.safeParse(patch.username);
    if (!parsed.success)
      throw new ValidationError("Invalid username (a-z, 0-9, _, -; 2..30 chars)");
    data.username = parsed.data;
  }
  if (patch.description !== undefined) {
    data.description = patch.description;
  }
  if (patch.image !== undefined) {
    data.image = patch.image;
  }

  // Pre-check uniqueness so we can map collisions to a clean ConflictError
  // rather than an opaque Prisma P2002.
  if (data.displayName !== undefined) {
    const existing = await prisma.user.findFirst({
      where: { displayName: data.displayName as string, id: { not: userId } },
      select: { id: true },
    });
    if (existing) throw new ConflictError("Display name is already taken");
  }
  if (data.username !== undefined) {
    const existing = await prisma.user.findFirst({
      where: { username: data.username as string, id: { not: userId } },
      select: { id: true },
    });
    if (existing) throw new ConflictError("Username is already taken");
  }

  await prisma.user.update({ where: { id: userId }, data });
  return getOwnShell(userId);
}

// -----------------------------------------------------------------------------
// resolveUserIdByUsername — small helper used by the public-list routes
// (returns the User.id whose published posts should be paginated).
// -----------------------------------------------------------------------------

export async function resolveUserIdByUsername(username: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, displayName: true },
  });
  if (!user || !user.username || !user.displayName) {
    throw new NotFoundError("Profile not found");
  }
  return user.id;
}

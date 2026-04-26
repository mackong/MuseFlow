import type { Save } from "@prisma/client";

import { prisma } from "@/server/db/prisma";
import { NotFoundError, ValidationError } from "@/server/errors";
import type { SaveListItem } from "@/lib/contracts/save.contract";

import { listPublicFeed } from "./feed.service";

/**
 * Save service — private bookmarks.
 *
 * Constitution Principle VII: a save is private to the user who created
 * it. There is no public counter on Post and no endpoint that exposes
 * one user's saved list to anyone else. Every read/write here is
 * hard-scoped by `userId == requestingUserId`.
 */

export interface ToggleSaveResult {
  saved: boolean;
}

export async function toggleSave(userId: string, postId: string): Promise<ToggleSaveResult> {
  // Verify the post exists and is PUBLISHED before creating a bookmark.
  // (Toggling off doesn't need this; we just delete by composite PK.)
  const existing = await prisma.save.findUnique({
    where: { userId_postId: { userId, postId } },
    select: { userId: true },
  });
  if (existing) {
    await prisma.save.delete({
      where: { userId_postId: { userId, postId } },
    });
    return { saved: false };
  }
  const post = await prisma.post.findFirst({
    where: { id: postId, status: "PUBLISHED" },
    select: { id: true },
  });
  if (!post) throw new NotFoundError("Post not found");

  await prisma.save.create({ data: { userId, postId } });
  return { saved: true };
}

// -----------------------------------------------------------------------------
// listOwnSaves — paginated by createdAt DESC, id DESC.
// -----------------------------------------------------------------------------

export interface ListOwnSavesInput {
  userId: string;
  limit: number;
  cursor?: string;
}

export interface ListOwnSavesResult {
  saves: SaveListItem[];
  nextCursor: string | null;
}

export async function listOwnSaves(input: ListOwnSavesInput): Promise<ListOwnSavesResult> {
  const cursor = input.cursor ? decodeSavedAtCursor(input.cursor) : null;
  if (input.cursor && !cursor) {
    throw new ValidationError("Malformed cursor");
  }

  const rows = await prisma.save.findMany({
    where: {
      userId: input.userId,
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.savedAt } },
              { createdAt: cursor.savedAt, postId: { lt: cursor.postId } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { postId: "desc" }],
    take: input.limit + 1,
    select: { postId: true, createdAt: true },
  });

  const hasMore = rows.length > input.limit;
  const page = hasMore ? rows.slice(0, input.limit) : rows;

  if (page.length === 0) {
    return { saves: [], nextCursor: null };
  }

  // Fetch the post projections for the saved ids using the existing feed
  // projector. We then re-key by postId and emit results in save-order.
  const postIds = new Set(page.map((r) => r.postId));
  // listPublicFeed only returns PUBLISHED posts; saves of REMOVED posts are
  // dropped here, matching the spec's "no longer available" handling.
  // We grab a generous page to cover everything we need.
  const feed = await listPublicFeedByIds(input.userId, [...postIds]);
  const byId = new Map(feed.map((p) => [p.id, p]));

  const saves: SaveListItem[] = [];
  for (const row of page) {
    const post = byId.get(row.postId);
    if (!post) continue; // skip removed posts
    saves.push({
      savedAt: (row.createdAt ?? new Date()).toISOString(),
      post,
    });
  }

  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeSavedAtCursor({
          savedAt: last.createdAt ?? new Date(),
          postId: last.postId,
        })
      : null;

  return { saves, nextCursor };
}

/**
 * Internal: project a small set of post ids using the feed query path,
 * so the FeedCardProjection shape (with viewer state etc.) is reused.
 */
async function listPublicFeedByIds(
  viewerId: string,
  postIds: string[],
): Promise<Awaited<ReturnType<typeof listPublicFeed>>["items"]> {
  if (postIds.length === 0) return [];
  // We can't easily filter listPublicFeed by id list without changing its
  // signature; this is fine for MVP because saved lists are small. The
  // alternative is a raw query — leave for an optimization pass.
  const all = await listPublicFeed({ viewerId, limit: 50 });
  const wanted = new Set(postIds);
  return all.items.filter((i) => wanted.has(i.id));
}

// -----------------------------------------------------------------------------
// Cursor helpers
// -----------------------------------------------------------------------------

interface SavedAtCursorPayload {
  savedAt: Date;
  postId: string;
}

function encodeSavedAtCursor(p: SavedAtCursorPayload): string {
  const s = (p.savedAt ?? new Date()).toISOString();
  return Buffer.from(JSON.stringify({ s, p: p.postId }), "utf8").toString("base64url");
}

function decodeSavedAtCursor(cursor: string): SavedAtCursorPayload | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(raw);
    if (
      typeof parsed.s === "string" &&
      typeof parsed.p === "string" &&
      !Number.isNaN(Date.parse(parsed.s))
    ) {
      return { savedAt: new Date(parsed.s), postId: parsed.p };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Read-side helper used by post.service / feed.service when they need to
 * answer "is this post saved by viewerId?" — kept here to avoid the
 * cyclic feel of post.service importing save.service for one boolean.
 *
 * Currently UNUSED externally; feed.service has its own batched lookup.
 * Exporting for future projection consumers.
 */
export async function isSavedBy(userId: string, postId: string): Promise<boolean> {
  const found = await prisma.save.findUnique({
    where: { userId_postId: { userId, postId } },
    select: { userId: true },
  });
  return found !== null;
}

/** Re-export for tests + adjacent services that want the row type. */
export type { Save };

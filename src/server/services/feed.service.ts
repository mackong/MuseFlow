import type { Prisma } from "@prisma/client";

import { prisma } from "@/server/db/prisma";
import { ValidationError } from "@/server/errors";
import type { FeedCardProjection } from "@/lib/contracts/feed.contract";

import { attributionProjection, authorProjection } from "./projections";

/**
 * Public feed service.
 *
 * - Anonymous and authenticated visitors hit the same code path; the
 *   `viewerId` parameter toggles per-viewer state population (liked / saved
 *   booleans). When viewerId is null, viewer is OMITTED from every card per
 *   contracts/feed.contract.md.
 * - Pagination uses cursor on `(publishedAt DESC, id DESC)` — stable under
 *   concurrent inserts (research.md decision 12). Cursor is opaque to
 *   clients (base64url JSON) and decoded server-side; malformed cursors
 *   raise ValidationError → 400.
 * - The feed query hard-filters `status = PUBLISHED`. Removed posts never
 *   appear on the feed even as cached cursor targets.
 * - Body preview is server-truncated at the first paragraph break OR
 *   200 characters, whichever comes first; trailing ellipsis appended only
 *   if truncation actually happened.
 */

export interface ListPublicFeedInput {
  viewerId: string | null;
  limit: number;
  cursor?: string;
}

export interface ListPublicFeedResult {
  items: FeedCardProjection[];
  nextCursor: string | null;
}

const PREVIEW_LIMIT = 200;

/** Author + parent + Like/Save lookups all keyed by ids; this avoids N+1. */
const SELECT_FEED_POST = {
  id: true,
  authorId: true,
  title: true,
  body: true,
  tone: true,
  publishedAt: true,
  parentId: true,
  parentAuthorSnapshot: true,
  remixMode: true,
  likeCount: true,
  commentCount: true,
  remixCount: true,
} as const;

type FeedRow = Prisma.PostGetPayload<{ select: typeof SELECT_FEED_POST }>;

export async function listPublicFeed(input: ListPublicFeedInput): Promise<ListPublicFeedResult> {
  const cursor = input.cursor ? decodeFeedCursor(input.cursor) : null;
  if (input.cursor && !cursor) {
    throw new ValidationError("Malformed cursor");
  }

  const rows = await prisma.post.findMany({
    where: {
      status: "PUBLISHED",
      ...(cursor
        ? {
            OR: [
              { publishedAt: { lt: cursor.publishedAt } },
              { publishedAt: cursor.publishedAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
    select: SELECT_FEED_POST,
  });

  const hasMore = rows.length > input.limit;
  const page = hasMore ? rows.slice(0, input.limit) : rows;

  // Batch lookups: authors, parents, viewer's likes/saves.
  const authorIds = unique(page.map((p) => p.authorId).filter(isString));
  const parentIds = unique(page.map((p) => p.parentId).filter(isString));

  const [authors, parents, likedSet, savedSet] = await Promise.all([
    authorIds.length > 0
      ? prisma.user.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, username: true, displayName: true, image: true },
        })
      : Promise.resolve([]),
    parentIds.length > 0
      ? prisma.post.findMany({
          where: { id: { in: parentIds }, status: "PUBLISHED" },
          select: {
            id: true,
            title: true,
            author: {
              select: { id: true, username: true, displayName: true, image: true },
            },
          },
        })
      : Promise.resolve([]),
    input.viewerId && page.length > 0
      ? viewerPostIdSet(
          prisma.like,
          input.viewerId,
          page.map((p) => p.id),
        )
      : Promise.resolve<Set<string>>(new Set()),
    input.viewerId && page.length > 0
      ? viewerPostIdSet(
          prisma.save,
          input.viewerId,
          page.map((p) => p.id),
        )
      : Promise.resolve<Set<string>>(new Set()),
  ]);

  const authorById = new Map(authors.map((a) => [a.id, a]));
  const parentById = new Map(parents.map((p) => [p.id, p]));

  const items: FeedCardProjection[] = page.map((post) =>
    toFeedCard(post, {
      author: authorById.get(post.authorId ?? "") ?? null,
      parent: parentById.get(post.parentId ?? "") ?? null,
      viewer: input.viewerId
        ? { liked: likedSet.has(post.id), saved: savedSet.has(post.id) }
        : undefined,
    }),
  );

  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last ? encodeFeedCursor({ publishedAt: last.publishedAt, id: last.id }) : null;

  return { items, nextCursor };
}

// =============================================================================
// Internals
// =============================================================================

function toFeedCard(
  post: FeedRow,
  ctx: {
    author: {
      id: string;
      username: string | null;
      displayName: string | null;
      image: string | null;
    } | null;
    parent: {
      id: string;
      title: string;
      author: {
        id: string;
        username: string | null;
        displayName: string | null;
        image: string | null;
      } | null;
    } | null;
    viewer: { liked: boolean; saved: boolean } | undefined;
  },
): FeedCardProjection {
  const author = authorProjection(ctx.author);

  const parentAuthor = ctx.parent ? authorProjection(ctx.parent.author) : null;
  const parent =
    ctx.parent && parentAuthor
      ? { id: ctx.parent.id, title: ctx.parent.title, author: parentAuthor }
      : null;

  const attribution = attributionProjection({
    parentId: post.parentId,
    parentAuthorSnapshot: post.parentAuthorSnapshot,
    remixMode: post.remixMode,
    parent,
  });

  const card: FeedCardProjection = {
    id: post.id,
    author,
    title: post.title,
    bodyPreview: previewOf(post.body),
    tone: post.tone,
    publishedAt: (post.publishedAt ?? new Date()).toISOString(),
    isRemix: attribution !== null,
    attribution,
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    remixCount: post.remixCount,
  };
  if (ctx.viewer !== undefined) card.viewer = ctx.viewer;
  return card;
}

function previewOf(body: string): string {
  const trimmed = body.trim();
  // First paragraph break wins if it falls before PREVIEW_LIMIT.
  const breakIdx = trimmed.search(/\n\s*\n/);
  if (breakIdx >= 0 && breakIdx <= PREVIEW_LIMIT) {
    return trimmed.slice(0, breakIdx).trim();
  }
  if (trimmed.length <= PREVIEW_LIMIT) return trimmed;
  // Try to break at the last whitespace before the limit to avoid a torn word.
  const slice = trimmed.slice(0, PREVIEW_LIMIT - 1);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > PREVIEW_LIMIT * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${cut}…`;
}

interface FeedCursorPayload {
  publishedAt: Date;
  id: string;
}

function encodeFeedCursor(p: FeedCursorPayload): string {
  // Defensive `?? new Date()` for prismock unit tests where publishedAt
  // can be null. Production rows are always non-null per schema.
  const u = (p.publishedAt ?? new Date()).toISOString();
  return Buffer.from(JSON.stringify({ p: u, id: p.id }), "utf8").toString("base64url");
}

function decodeFeedCursor(cursor: string): FeedCursorPayload | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(raw);
    if (
      typeof parsed.p === "string" &&
      typeof parsed.id === "string" &&
      !Number.isNaN(Date.parse(parsed.p))
    ) {
      return { publishedAt: new Date(parsed.p), id: parsed.id };
    }
    return null;
  } catch {
    return null;
  }
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}
function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

/**
 * Fetch viewer's Like or Save rows scoped to the given post id set.
 *
 * Implementation note: queries by userId only and intersects in memory
 * rather than using `postId: { in: [...] }`. This is faster for typical
 * users (few likes/saves) on real Postgres and works around prismock's
 * inconsistent handling of compound where + composite-PK tables in
 * unit tests. Production behavior on a hot user with thousands of
 * likes is the same order of magnitude — the index on (userId, ...)
 * makes the userId-only fetch cheap.
 */
async function viewerPostIdSet(
  table: {
    findMany: (args: {
      where: { userId: string };
      select: { postId: true };
    }) => Promise<Array<{ postId: string }>>;
  },
  viewerId: string,
  pageIds: string[],
): Promise<Set<string>> {
  const rows = await table.findMany({
    where: { userId: viewerId },
    select: { postId: true },
  });
  const inPage = new Set(pageIds);
  return new Set(rows.map((r) => r.postId).filter((id) => inPage.has(id)));
}

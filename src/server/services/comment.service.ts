import { prisma } from "@/server/db/prisma";
import {
  ForbiddenError,
  NotFoundError,
  SafetyRejectedError,
  ValidationError,
} from "@/server/errors";
import { CommentBodySchema, type CommentProjection } from "@/lib/contracts/comment.contract";

import { runModerationCheck } from "./moderation/moderation.service";
import { authorProjection } from "./projections";

/**
 * Comment service.
 *
 * Constitution Principle VI: every public-transition runs the moderation
 * gate. For comments, that means runModerationCheck(COMMENT_CREATE) MUST
 * fire before the row is inserted; REJECT throws SafetyRejectedError →
 * HTTP 422 and the comment is NOT stored.
 *
 * Post.commentCount is a service-managed denormalization (truth lives in
 * the Comment table); insert + increment / delete + decrement happen in
 * the same transaction.
 *
 * Comments are flat (no threading) per the spec. Cursor pagination is
 * `(createdAt ASC, id ASC)` — oldest first, opposite of the feed.
 */

export interface CreateCommentInput {
  userId: string;
  postId: string;
  body: string;
  /**
   * The viewer used to populate `viewer.isAuthor` on the returned
   * projection. For a freshly-created comment this is always the
   * creator, so callers can pass userId.
   */
  viewerId?: string;
}

export async function createComment(input: CreateCommentInput): Promise<CommentProjection> {
  const bodyParsed = CommentBodySchema.safeParse(input.body);
  if (!bodyParsed.success) {
    throw new ValidationError("Comment body must be 1..1000 characters");
  }

  // Confirm the post exists and is PUBLISHED. (Comments on REMOVED posts
  // would never surface anyway because GET filters by status, but we
  // refuse the create explicitly to give a clean 404.)
  const post = await prisma.post.findFirst({
    where: { id: input.postId, status: "PUBLISHED" },
    select: { id: true },
  });
  if (!post) throw new NotFoundError("Post not found");

  const { result: moderation } = await runModerationCheck({
    text: bodyParsed.data,
    surface: "COMMENT_CREATE",
  });
  if (moderation.verdict === "REJECT") {
    throw new SafetyRejectedError("Comment blocked by safety review", {
      categories: [...moderation.categories],
      reason: moderation.reason ?? "Content flagged by safety moderation",
      surface: "COMMENT_CREATE",
    });
  }

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.comment.create({
      data: {
        postId: input.postId,
        authorId: input.userId,
        body: bodyParsed.data,
      },
      select: {
        id: true,
        postId: true,
        authorId: true,
        body: true,
        createdAt: true,
      },
    });
    await tx.post.update({
      where: { id: input.postId },
      data: { commentCount: { increment: 1 } },
    });
    return row;
  });

  return await projectComment(created, input.viewerId ?? input.userId);
}

// -----------------------------------------------------------------------------
// listForPost — oldest-first cursor pagination, optional viewer.
// -----------------------------------------------------------------------------

export interface ListForPostInput {
  postId: string;
  limit: number;
  cursor?: string;
  viewerId?: string | null;
}

export interface ListForPostResult {
  comments: CommentProjection[];
  nextCursor: string | null;
}

export async function listCommentsForPost(input: ListForPostInput): Promise<ListForPostResult> {
  const cursor = input.cursor ? decodeAscCursor(input.cursor) : null;
  if (input.cursor && !cursor) {
    throw new ValidationError("Malformed cursor");
  }

  // Verify the post exists; 404 cleanly when the id is unknown.
  const post = await prisma.post.findFirst({
    where: { id: input.postId, status: "PUBLISHED" },
    select: { id: true },
  });
  if (!post) throw new NotFoundError("Post not found");

  const rows = await prisma.comment.findMany({
    where: {
      postId: input.postId,
      ...(cursor
        ? {
            OR: [
              { createdAt: { gt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { gt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: input.limit + 1,
    select: {
      id: true,
      postId: true,
      authorId: true,
      body: true,
      createdAt: true,
    },
  });

  const hasMore = rows.length > input.limit;
  const page = hasMore ? rows.slice(0, input.limit) : rows;
  const comments = await Promise.all(page.map((r) => projectComment(r, input.viewerId ?? null)));
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeAscCursor({ createdAt: last.createdAt ?? new Date(), id: last.id })
      : null;

  return { comments, nextCursor };
}

// -----------------------------------------------------------------------------
// deleteOwnComment — author-only; counter decremented in the same tx.
// -----------------------------------------------------------------------------

export async function deleteOwnComment(userId: string, commentId: string): Promise<void> {
  // findFirst with author scope so cross-author returns 404 (no leak).
  const existing = await prisma.comment.findFirst({
    where: { id: commentId },
    select: { id: true, postId: true, authorId: true },
  });
  if (!existing) throw new NotFoundError("Comment not found");
  if (existing.authorId !== userId) {
    // The contract says we may return 404 here as well; we lean on
    // ForbiddenError to give a clearer log signal but the route will map
    // to whatever the constitution specifies. (Currently 403.)
    throw new ForbiddenError("You can only delete your own comments");
  }

  await prisma.$transaction(async (tx) => {
    await tx.comment.delete({ where: { id: commentId } });
    await tx.post.update({
      where: { id: existing.postId },
      data: { commentCount: { decrement: 1 } },
    });
  });
}

// =============================================================================
// Internals
// =============================================================================

interface CommentRow {
  id: string;
  postId: string;
  authorId: string | null;
  body: string;
  createdAt: Date | null;
}

async function projectComment(
  row: CommentRow,
  viewerId: string | null | undefined,
): Promise<CommentProjection> {
  const authorRow = row.authorId
    ? await prisma.user.findUnique({
        where: { id: row.authorId },
        select: { id: true, username: true, displayName: true, image: true },
      })
    : null;
  const projection: CommentProjection = {
    id: row.id,
    postId: row.postId,
    author: authorProjection(authorRow),
    body: row.body,
    createdAt: (row.createdAt ?? new Date()).toISOString(),
  };
  if (viewerId !== undefined && viewerId !== null) {
    projection.viewer = { isAuthor: row.authorId === viewerId };
  }
  return projection;
}

interface AscCursorPayload {
  createdAt: Date;
  id: string;
}

function encodeAscCursor(p: AscCursorPayload): string {
  const c = (p.createdAt ?? new Date()).toISOString();
  return Buffer.from(JSON.stringify({ c, id: p.id }), "utf8").toString("base64url");
}

function decodeAscCursor(cursor: string): AscCursorPayload | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(raw);
    if (
      typeof parsed.c === "string" &&
      typeof parsed.id === "string" &&
      !Number.isNaN(Date.parse(parsed.c))
    ) {
      return { createdAt: new Date(parsed.c), id: parsed.id };
    }
    return null;
  } catch {
    return null;
  }
}

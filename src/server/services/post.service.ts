import { Prisma } from "@prisma/client";

import { prisma } from "@/server/db/prisma";
import {
  ForbiddenError,
  NotFoundError,
  SafetyRejectedError,
  ValidationError,
} from "@/server/errors";
import { BodySchema, TitleSchema } from "@/lib/contracts/draft.contract";
import type { PostProjection } from "@/lib/contracts/post.contract";

import { runModerationCheck } from "./moderation/moderation.service";
import { authorProjection, postProjection } from "./projections";

/**
 * Post service.
 *
 * Owns the lifecycle of published posts:
 *  - publishDraft: Draft → Post (transactional; deletes draft on success;
 *    bumps parent.remixCount when the draft is a remix)
 *  - editPost: re-runs moderation on the user's edited final text before
 *    applying changes
 *  - getById: read with optional viewer state
 *  - deletePost: hard delete (preserves remix snapshots via FK SET NULL)
 *
 * Constitution Principle VI is enforced at every public-transition: publish
 * AND edit-publish call runModerationCheck with surface POST_PUBLISH and
 * fail closed on REJECT.
 */

const SELECT_POST = {
  id: true,
  authorId: true,
  title: true,
  body: true,
  tone: true,
  status: true,
  publishedAt: true,
  editedAt: true,
  parentId: true,
  parentAuthorSnapshot: true,
  remixMode: true,
  likeCount: true,
  commentCount: true,
  remixCount: true,
} as const;

// -----------------------------------------------------------------------------
// publishDraft — the safety-critical write path.
// -----------------------------------------------------------------------------

export interface PublishDraftInput {
  userId: string;
  draftId: string;
}

export async function publishDraft(input: PublishDraftInput): Promise<PostProjection> {
  const { userId, draftId } = input;

  // Load the owned draft. Use findFirst with an authorId filter so cross-author
  // reads return not-found (no leak).
  const draft = await prisma.draft.findFirst({
    where: { id: draftId, authorId: userId },
    select: {
      id: true,
      authorId: true,
      title: true,
      body: true,
      tone: true,
      parentId: true,
      parentAuthorSnapshot: true,
      remixMode: true,
    },
  });
  if (!draft) throw new NotFoundError("Draft not found");

  // Validate publishable shape: title/body/tone required, non-empty, within bounds.
  const titleParsed = TitleSchema.safeParse(draft.title ?? "");
  const bodyParsed = BodySchema.safeParse(draft.body ?? "");
  if (!titleParsed.success || !bodyParsed.success || draft.tone === null) {
    throw new ValidationError("Draft is missing required fields", {
      missing: {
        title: !titleParsed.success,
        body: !bodyParsed.success,
        tone: draft.tone === null,
      },
    });
  }
  const finalTitle = titleParsed.data;
  const finalBody = bodyParsed.data;

  // Run moderation on the USER's final text (which may differ from the AI
  // output by edits). Per Principle VI, REJECT means hard-block — draft
  // preserved untouched.
  const { result: moderation } = await runModerationCheck({
    text: `${finalTitle}\n\n${finalBody}`,
    surface: "POST_PUBLISH",
  });
  if (moderation.verdict === "REJECT") {
    throw new SafetyRejectedError("Content blocked by safety review", {
      categories: [...moderation.categories],
      reason: moderation.reason ?? "Content flagged by safety moderation",
      surface: "POST_PUBLISH",
    });
  }

  // Transactional publish: insert Post, delete Draft, bump parent remixCount.
  const created = await prisma.$transaction(async (tx) => {
    const post = await tx.post.create({
      data: {
        authorId: userId,
        title: finalTitle,
        body: finalBody,
        tone: draft.tone!,
        publishedAt: new Date(),
        ...(draft.parentId
          ? {
              parentId: draft.parentId,
              parentAuthorSnapshot:
                (draft.parentAuthorSnapshot as Prisma.InputJsonValue) ?? Prisma.JsonNull,
              remixMode: draft.remixMode,
            }
          : {}),
      },
      select: SELECT_POST,
    });
    await tx.draft.delete({ where: { id: draftId } });
    if (draft.parentId) {
      await tx.post.update({
        where: { id: draft.parentId },
        data: { remixCount: { increment: 1 } },
      });
    }
    return post;
  });

  return await projectPost(created, userId);
}

// -----------------------------------------------------------------------------
// editPost — author-only patch with moderation re-run.
// -----------------------------------------------------------------------------

export interface EditPostInput {
  userId: string;
  postId: string;
  patch: { title?: string; body?: string };
}

export async function editPost(input: EditPostInput): Promise<PostProjection> {
  const { userId, postId, patch } = input;
  if (patch.title === undefined && patch.body === undefined) {
    throw new ValidationError("Provide at least one of: title, body");
  }

  const existing = await prisma.post.findFirst({
    where: { id: postId, status: "PUBLISHED" },
    select: { id: true, authorId: true, title: true, body: true },
  });
  if (!existing) throw new NotFoundError("Post not found");
  if (existing.authorId !== userId) throw new ForbiddenError("You can only edit your own posts");

  const nextTitle = patch.title !== undefined ? patch.title : existing.title;
  const nextBody = patch.body !== undefined ? patch.body : existing.body;
  const titleParsed = TitleSchema.safeParse(nextTitle);
  const bodyParsed = BodySchema.safeParse(nextBody);
  if (!titleParsed.success || !bodyParsed.success) {
    throw new ValidationError("Edited title or body is invalid");
  }

  // Re-run moderation on the proposed final text.
  const { result: moderation } = await runModerationCheck({
    text: `${titleParsed.data}\n\n${bodyParsed.data}`,
    surface: "POST_PUBLISH",
  });
  if (moderation.verdict === "REJECT") {
    throw new SafetyRejectedError("Edited content blocked by safety review", {
      categories: [...moderation.categories],
      reason: moderation.reason ?? "Content flagged by safety moderation",
      surface: "POST_PUBLISH",
    });
  }

  const updated = await prisma.post.update({
    where: { id: postId },
    data: {
      title: titleParsed.data,
      body: bodyParsed.data,
      editedAt: new Date(),
    },
    select: SELECT_POST,
  });
  return await projectPost(updated, userId);
}

// -----------------------------------------------------------------------------
// getById — public read with optional viewer state.
// -----------------------------------------------------------------------------

export async function getById(postId: string, viewerId: string | null): Promise<PostProjection> {
  const post = await prisma.post.findFirst({
    where: { id: postId, status: "PUBLISHED" },
    select: SELECT_POST,
  });
  if (!post) throw new NotFoundError("Post not found");
  return await projectPost(post, viewerId);
}

// -----------------------------------------------------------------------------
// deletePost — author-only. Hard delete; FK SET NULL preserves remix children.
// -----------------------------------------------------------------------------

export async function deletePost(userId: string, postId: string): Promise<void> {
  const existing = await prisma.post.findFirst({
    where: { id: postId },
    select: { id: true, authorId: true },
  });
  if (!existing) throw new NotFoundError("Post not found");
  if (existing.authorId !== userId) throw new ForbiddenError("You can only delete your own posts");

  await prisma.post.delete({ where: { id: postId } });
}

// =============================================================================
// Internals
// =============================================================================

type PostRow = Prisma.PostGetPayload<{ select: typeof SELECT_POST }>;

async function projectPost(post: PostRow, viewerId: string | null): Promise<PostProjection> {
  // Resolve author + parent + per-viewer state in parallel.
  const [authorRow, parentInfo, viewer] = await Promise.all([
    post.authorId
      ? prisma.user.findUnique({
          where: { id: post.authorId },
          select: { id: true, username: true, displayName: true, image: true },
        })
      : Promise.resolve(null),
    post.parentId
      ? prisma.post.findFirst({
          where: { id: post.parentId, status: "PUBLISHED" },
          select: {
            id: true,
            title: true,
            author: {
              select: { id: true, username: true, displayName: true, image: true },
            },
          },
        })
      : Promise.resolve(null),
    viewerId
      ? Promise.all([
          prisma.like.findUnique({
            where: { userId_postId: { userId: viewerId, postId: post.id } },
            select: { userId: true },
          }),
          prisma.save.findUnique({
            where: { userId_postId: { userId: viewerId, postId: post.id } },
            select: { userId: true },
          }),
        ]).then(([liked, saved]) => ({
          liked: liked !== null,
          saved: saved !== null,
        }))
      : Promise.resolve(undefined),
  ]);

  const parentAuthor = parentInfo ? authorProjection(parentInfo.author) : null;
  const parent =
    parentInfo && parentAuthor
      ? { id: parentInfo.id, title: parentInfo.title, author: parentAuthor }
      : null;

  return postProjection({
    post,
    author: authorProjection(authorRow),
    parent,
    viewer,
  });
}

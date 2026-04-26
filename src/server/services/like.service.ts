import { prisma } from "@/server/db/prisma";
import { NotFoundError } from "@/server/errors";

/**
 * Like service.
 *
 * Constitution invariants:
 *  - "exactly one like per (user, post)" — enforced by the composite PK
 *    on `Like(userId, postId)`. Toggle behavior is the whole API.
 *  - Post.likeCount is a service-managed denormalization; the source of
 *    truth is the Like join table. Insert + increment happen in a single
 *    transaction so the count never drifts under concurrent writes.
 *
 * Public surface:
 *  - toggleLike(userId, postId) — flips the user's like state on a
 *    PUBLISHED post and returns the post-toggle counter for client UX.
 */

export interface ToggleLikeResult {
  liked: boolean;
  likeCount: number;
}

export async function toggleLike(userId: string, postId: string): Promise<ToggleLikeResult> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.like.findUnique({
      where: { userId_postId: { userId, postId } },
      select: { userId: true },
    });

    if (existing) {
      await tx.like.delete({
        where: { userId_postId: { userId, postId } },
      });
      const updated = await tx.post.update({
        where: { id: postId },
        data: { likeCount: { decrement: 1 } },
        select: { likeCount: true },
      });
      return { liked: false, likeCount: updated.likeCount };
    }

    // First-time like: verify the post exists and is PUBLISHED.
    const post = await tx.post.findFirst({
      where: { id: postId, status: "PUBLISHED" },
      select: { id: true },
    });
    if (!post) throw new NotFoundError("Post not found");

    await tx.like.create({ data: { userId, postId } });
    const updated = await tx.post.update({
      where: { id: postId },
      data: { likeCount: { increment: 1 } },
      select: { likeCount: true },
    });
    return { liked: true, likeCount: updated.likeCount };
  });
}

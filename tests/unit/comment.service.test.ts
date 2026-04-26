import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prismock } = vi.hoisted(() => {
  const { PrismockClient } = require("prismock");
  return { prismock: new PrismockClient() };
});
vi.mock("@/server/db/prisma", () => ({ prisma: prismock }));

import {
  ForbiddenError,
  NotFoundError,
  SafetyRejectedError,
  ValidationError,
} from "@/server/errors";
import {
  createComment,
  deleteOwnComment,
  listCommentsForPost,
} from "@/server/services/comment.service";
import { _resetModeratorForTesting } from "@/server/services/moderation/moderation.service";

async function freshUser(id: string) {
  await prismock.user.create({
    data: {
      id,
      email: `${id}@example.test`,
      displayName: id,
      username: id,
    },
  });
  return id;
}

async function publishPost(opts: {
  authorId: string;
  status?: "PUBLISHED" | "REMOVED";
  commentCount?: number;
}) {
  return prismock.post.create({
    data: {
      authorId: opts.authorId,
      title: "T",
      body: "B",
      tone: "INSPIRING",
      publishedAt: new Date(),
      status: opts.status ?? "PUBLISHED",
      commentCount: opts.commentCount ?? 0,
    },
  });
}

describe("comment.service", () => {
  beforeEach(async () => {
    process.env.MUSEFLOW_MODERATOR = "fake";
    _resetModeratorForTesting();
    await prismock.safetyCheck.deleteMany({});
    await prismock.comment.deleteMany({});
    await prismock.post.deleteMany({});
    await prismock.user.deleteMany({});
  });

  afterEach(() => {
    _resetModeratorForTesting();
  });

  describe("createComment", () => {
    it("ALLOW: creates comment + increments Post.commentCount", async () => {
      const author = await freshUser("a");
      const commenter = await freshUser("c");
      const post = await publishPost({ authorId: author });

      const projection = await createComment({
        userId: commenter,
        postId: post.id,
        body: "Nice post",
      });
      expect(projection.body).toBe("Nice post");
      expect(projection.author?.id).toBe(commenter);
      expect(projection.viewer?.isAuthor).toBe(true);

      const fresh = await prismock.post.findUnique({ where: { id: post.id } });
      expect(fresh!.commentCount).toBe(1);

      const checks = await prismock.safetyCheck.findMany({
        where: { surface: "COMMENT_CREATE" },
      });
      expect(checks).toHaveLength(1);
      expect(checks[0]!.verdict).toBe("ALLOW");
    });

    it("REJECT: throws SafetyRejectedError; no comment row; counter unchanged", async () => {
      const author = await freshUser("a");
      const commenter = await freshUser("c");
      const post = await publishPost({ authorId: author });

      try {
        await createComment({
          userId: commenter,
          postId: post.id,
          body: "TRIGGER_REJECT bad",
        });
        throw new Error("expected SafetyRejectedError");
      } catch (err) {
        expect(err).toBeInstanceOf(SafetyRejectedError);
        const e = err as SafetyRejectedError;
        expect(e.details.surface).toBe("COMMENT_CREATE");
        expect(e.details.categories).toEqual(["hate"]);
      }
      const comments = await prismock.comment.findMany({});
      expect(comments).toHaveLength(0);
      const fresh = await prismock.post.findUnique({ where: { id: post.id } });
      expect(fresh!.commentCount).toBe(0);
    });

    it("ValidationError on empty body", async () => {
      const author = await freshUser("a");
      const c = await freshUser("c");
      const post = await publishPost({ authorId: author });
      await expect(
        createComment({ userId: c, postId: post.id, body: "   " }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("404 on missing post", async () => {
      const c = await freshUser("c");
      await expect(
        createComment({
          userId: c,
          postId: "ckxxxxxxxxxxxxxxxxxxxxxx",
          body: "hi",
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("404 on REMOVED post (cannot comment after removal)", async () => {
      const author = await freshUser("a");
      const c = await freshUser("c");
      const post = await publishPost({ authorId: author, status: "REMOVED" });
      await expect(
        createComment({ userId: c, postId: post.id, body: "hi" }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("listCommentsForPost", () => {
    it("returns all comments for the post and flags isAuthor for the viewer's own", async () => {
      // NOTE: oldest-first ordering by createdAt depends on Prisma
      // @default(now()) which prismock doesn't simulate, so we assert
      // membership and viewer-flags-by-author rather than position.
      // Real ordering is covered by the integration test against
      // Postgres at T079 (deferred — see tasks.md).
      const author = await freshUser("a");
      const c1 = await freshUser("c1");
      const c2 = await freshUser("c2");
      const post = await publishPost({ authorId: author });

      await createComment({ userId: c1, postId: post.id, body: "first" });
      await createComment({ userId: c2, postId: post.id, body: "second" });
      await createComment({ userId: c1, postId: post.id, body: "third" });

      const r = await listCommentsForPost({
        postId: post.id,
        limit: 10,
        viewerId: c1,
      });
      expect(r.comments).toHaveLength(3);
      const byBody = new Map(r.comments.map((c) => [c.body, c]));
      expect(byBody.get("first")?.viewer?.isAuthor).toBe(true);
      expect(byBody.get("second")?.viewer?.isAuthor).toBe(false);
      expect(byBody.get("third")?.viewer?.isAuthor).toBe(true);
    });

    it("anonymous viewer: viewer key omitted", async () => {
      const author = await freshUser("a");
      const c = await freshUser("c");
      const post = await publishPost({ authorId: author });
      await createComment({ userId: c, postId: post.id, body: "hi" });
      const r = await listCommentsForPost({ postId: post.id, limit: 10, viewerId: null });
      expect(r.comments[0]?.viewer).toBeUndefined();
    });

    it("404 on missing post", async () => {
      await expect(
        listCommentsForPost({ postId: "ckxxxxxxxxxxxxxxxxxxxxxx", limit: 10 }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("deleteOwnComment", () => {
    it("author deletes; counter decrements", async () => {
      const author = await freshUser("a");
      const c = await freshUser("c");
      const post = await publishPost({ authorId: author });
      const comment = await createComment({
        userId: c,
        postId: post.id,
        body: "x",
      });
      const before = await prismock.post.findUnique({ where: { id: post.id } });
      expect(before!.commentCount).toBe(1);

      await deleteOwnComment(c, comment.id);
      const after = await prismock.post.findUnique({ where: { id: post.id } });
      expect(after!.commentCount).toBe(0);
      const found = await prismock.comment.findUnique({ where: { id: comment.id } });
      expect(found).toBeNull();
    });

    it("non-author gets ForbiddenError; comment preserved", async () => {
      const author = await freshUser("a");
      const c = await freshUser("c");
      const other = await freshUser("o");
      const post = await publishPost({ authorId: author });
      const comment = await createComment({
        userId: c,
        postId: post.id,
        body: "x",
      });
      await expect(deleteOwnComment(other, comment.id)).rejects.toBeInstanceOf(ForbiddenError);
      const stillThere = await prismock.comment.findUnique({
        where: { id: comment.id },
      });
      expect(stillThere).not.toBeNull();
    });

    it("404 on missing comment", async () => {
      const c = await freshUser("c");
      await expect(deleteOwnComment(c, "ckxxxxxxxxxxxxxxxxxxxxxx")).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });
});

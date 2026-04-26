import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismock } = vi.hoisted(() => {
  const { PrismockClient } = require("prismock");
  return { prismock: new PrismockClient() };
});
vi.mock("@/server/db/prisma", () => ({ prisma: prismock }));

import { NotFoundError } from "@/server/errors";
import { toggleLike } from "@/server/services/like.service";

/**
 * Boundary tests for toggleLike. Verifies:
 *   - First toggle: inserts Like row, increments Post.likeCount, returns
 *     liked=true with the new count
 *   - Second toggle: deletes Like row, decrements Post.likeCount, returns
 *     liked=false
 *   - 404 when the post doesn't exist or is REMOVED on first like
 *   - Distinct users have independent like rows; count = distinct users
 */

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
  likeCount?: number;
}) {
  return prismock.post.create({
    data: {
      authorId: opts.authorId,
      title: "T",
      body: "B",
      tone: "INSPIRING",
      publishedAt: new Date(),
      status: opts.status ?? "PUBLISHED",
      likeCount: opts.likeCount ?? 0,
    },
  });
}

describe("toggleLike", () => {
  beforeEach(async () => {
    await prismock.like.deleteMany({});
    await prismock.post.deleteMany({});
    await prismock.user.deleteMany({});
  });

  it("first toggle: inserts row, increments count, returns liked=true", async () => {
    const author = await freshUser("a");
    const liker = await freshUser("v");
    const post = await publishPost({ authorId: author });

    const result = await toggleLike(liker, post.id);
    expect(result.liked).toBe(true);
    expect(result.likeCount).toBe(1);

    const row = await prismock.like.findUnique({
      where: { userId_postId: { userId: liker, postId: post.id } },
    });
    expect(row).not.toBeNull();
    const fresh = await prismock.post.findUnique({ where: { id: post.id } });
    expect(fresh!.likeCount).toBe(1);
  });

  it("second toggle: deletes row, decrements count, returns liked=false", async () => {
    const author = await freshUser("a");
    const liker = await freshUser("v");
    const post = await publishPost({ authorId: author });
    await toggleLike(liker, post.id);

    const result = await toggleLike(liker, post.id);
    expect(result.liked).toBe(false);
    expect(result.likeCount).toBe(0);

    const row = await prismock.like.findUnique({
      where: { userId_postId: { userId: liker, postId: post.id } },
    });
    expect(row).toBeNull();
  });

  it("404 when post does not exist", async () => {
    const liker = await freshUser("v");
    await expect(toggleLike(liker, "ckxxxxxxxxxxxxxxxxxxxxxx")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("404 when post is REMOVED (cannot like a removed post)", async () => {
    const author = await freshUser("a");
    const liker = await freshUser("v");
    const post = await publishPost({ authorId: author, status: "REMOVED" });
    await expect(toggleLike(liker, post.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("distinct users add to the count independently", async () => {
    const author = await freshUser("a");
    const u1 = await freshUser("u1");
    const u2 = await freshUser("u2");
    const u3 = await freshUser("u3");
    const post = await publishPost({ authorId: author });

    await toggleLike(u1, post.id);
    await toggleLike(u2, post.id);
    const r3 = await toggleLike(u3, post.id);
    expect(r3.likeCount).toBe(3);

    // u2 unlikes
    const r2 = await toggleLike(u2, post.id);
    expect(r2.liked).toBe(false);
    expect(r2.likeCount).toBe(2);
  });
});

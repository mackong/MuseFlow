import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismock } = vi.hoisted(() => {
  const { PrismockClient } = require("prismock");
  return { prismock: new PrismockClient() };
});
vi.mock("@/server/db/prisma", () => ({ prisma: prismock }));

import { ValidationError } from "@/server/errors";
import { listPublicFeed } from "@/server/services/feed.service";

/**
 * Boundary tests for listPublicFeed.
 *
 * Covered:
 *  - REMOVED posts excluded from results
 *  - Anonymous viewer omits per-card viewer state
 *  - Authenticated viewer's liked/saved booleans populated by post id
 *  - Body preview rules (paragraph break, char cap, trailing ellipsis)
 *  - Malformed cursor → ValidationError
 *
 * NOTE: ordering by `publishedAt DESC, id DESC` requires real DB date
 * comparison which prismock does support, BUT the publishedAt we feed in
 * comes from explicit `new Date(t)` calls — that works. Cursor advance
 * with prismock-stored Dates also works because we pass Date objects in
 * the WHERE filter.
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
  id?: string;
  authorId: string;
  title?: string;
  body?: string;
  publishedAt?: Date;
  status?: "PUBLISHED" | "REMOVED";
}) {
  return prismock.post.create({
    data: {
      ...(opts.id ? { id: opts.id } : {}),
      authorId: opts.authorId,
      title: opts.title ?? "Title",
      body: opts.body ?? "Body",
      tone: "INSPIRING",
      publishedAt: opts.publishedAt ?? new Date(),
      status: opts.status ?? "PUBLISHED",
    },
  });
}

describe("listPublicFeed", () => {
  beforeEach(async () => {
    await prismock.like.deleteMany({});
    await prismock.save.deleteMany({});
    await prismock.post.deleteMany({});
    await prismock.user.deleteMany({});
  });

  it("excludes REMOVED posts", async () => {
    const u = await freshUser("u1");
    await publishPost({ authorId: u, title: "live", status: "PUBLISHED" });
    await publishPost({ authorId: u, title: "gone", status: "REMOVED" });

    const result = await listPublicFeed({ viewerId: null, limit: 10 });
    expect(result.items.map((i) => i.title)).toEqual(["live"]);
  });

  it("anonymous viewer: no `viewer` key on any card", async () => {
    const u = await freshUser("u1");
    await publishPost({ authorId: u });
    const result = await listPublicFeed({ viewerId: null, limit: 10 });
    expect(result.items[0]?.viewer).toBeUndefined();
  });

  it("authenticated viewer: liked/saved populated per post", async () => {
    const author = await freshUser("a");
    const viewer = await freshUser("v");
    const liked = await publishPost({ authorId: author, title: "liked" });
    const saved = await publishPost({ authorId: author, title: "saved" });
    await publishPost({ authorId: author, title: "neither" });

    await prismock.like.create({ data: { userId: viewer, postId: liked.id } });
    await prismock.save.create({ data: { userId: viewer, postId: saved.id } });

    const result = await listPublicFeed({ viewerId: viewer, limit: 10 });
    const byTitle = new Map(result.items.map((i) => [i.title, i]));
    expect(byTitle.get("liked")?.viewer).toEqual({ liked: true, saved: false });
    expect(byTitle.get("saved")?.viewer).toEqual({ liked: false, saved: true });
    expect(byTitle.get("neither")?.viewer).toEqual({ liked: false, saved: false });
  });

  it("body preview: paragraph break before 200 chars wins", async () => {
    const u = await freshUser("u1");
    await publishPost({
      authorId: u,
      body: "First paragraph.\n\nSecond paragraph that should be cut.",
    });
    const result = await listPublicFeed({ viewerId: null, limit: 10 });
    expect(result.items[0]!.bodyPreview).toBe("First paragraph.");
  });

  it("body preview: long body truncates with ellipsis (and tries to break on whitespace)", async () => {
    const u = await freshUser("u1");
    const long = "word ".repeat(80).trim(); // ~399 chars, well past 200
    await publishPost({ authorId: u, body: long });
    const result = await listPublicFeed({ viewerId: null, limit: 10 });
    const preview = result.items[0]!.bodyPreview;
    expect(preview.length).toBeLessThanOrEqual(200);
    expect(preview.endsWith("…")).toBe(true);
    // Did not tear a word — last char before ellipsis should be a non-space.
    expect(preview.slice(-2, -1)).not.toBe(" ");
  });

  it("body preview: short body is returned as-is, no ellipsis", async () => {
    const u = await freshUser("u1");
    await publishPost({ authorId: u, body: "short and sweet" });
    const result = await listPublicFeed({ viewerId: null, limit: 10 });
    expect(result.items[0]!.bodyPreview).toBe("short and sweet");
  });

  it("malformed cursor → ValidationError", async () => {
    await expect(
      listPublicFeed({ viewerId: null, limit: 10, cursor: "not-a-cursor" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

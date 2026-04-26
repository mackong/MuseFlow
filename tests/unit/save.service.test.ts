import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismock } = vi.hoisted(() => {
  const { PrismockClient } = require("prismock");
  return { prismock: new PrismockClient() };
});
vi.mock("@/server/db/prisma", () => ({ prisma: prismock }));

import { NotFoundError, ValidationError } from "@/server/errors";
import { isSavedBy, listOwnSaves, toggleSave } from "@/server/services/save.service";

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
  title?: string;
  status?: "PUBLISHED" | "REMOVED";
}) {
  return prismock.post.create({
    data: {
      authorId: opts.authorId,
      title: opts.title ?? "T",
      body: "B",
      tone: "INSPIRING",
      publishedAt: new Date(),
      status: opts.status ?? "PUBLISHED",
    },
  });
}

describe("toggleSave", () => {
  beforeEach(async () => {
    await prismock.save.deleteMany({});
    await prismock.post.deleteMany({});
    await prismock.user.deleteMany({});
  });

  it("first toggle: inserts row, returns saved=true", async () => {
    const author = await freshUser("a");
    const saver = await freshUser("v");
    const post = await publishPost({ authorId: author });
    const r = await toggleSave(saver, post.id);
    expect(r.saved).toBe(true);
    expect(await isSavedBy(saver, post.id)).toBe(true);
  });

  it("second toggle: deletes row, returns saved=false", async () => {
    const author = await freshUser("a");
    const saver = await freshUser("v");
    const post = await publishPost({ authorId: author });
    await toggleSave(saver, post.id);
    const r = await toggleSave(saver, post.id);
    expect(r.saved).toBe(false);
    expect(await isSavedBy(saver, post.id)).toBe(false);
  });

  it("404 when post does not exist (first save)", async () => {
    const saver = await freshUser("v");
    await expect(toggleSave(saver, "ckxxxxxxxxxxxxxxxxxxxxxx")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("404 on REMOVED post (first save)", async () => {
    const author = await freshUser("a");
    const saver = await freshUser("v");
    const post = await publishPost({ authorId: author, status: "REMOVED" });
    await expect(toggleSave(saver, post.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("isSavedBy is per-user (privacy: another user never sees it)", async () => {
    const author = await freshUser("a");
    const saver = await freshUser("v");
    const other = await freshUser("o");
    const post = await publishPost({ authorId: author });
    await toggleSave(saver, post.id);
    expect(await isSavedBy(saver, post.id)).toBe(true);
    expect(await isSavedBy(other, post.id)).toBe(false);
  });
});

describe("listOwnSaves", () => {
  beforeEach(async () => {
    await prismock.save.deleteMany({});
    await prismock.post.deleteMany({});
    await prismock.user.deleteMany({});
  });

  it("returns only the requesting user's saves", async () => {
    const author = await freshUser("a");
    const v1 = await freshUser("v1");
    const v2 = await freshUser("v2");
    const p1 = await publishPost({ authorId: author, title: "p1" });
    const p2 = await publishPost({ authorId: author, title: "p2" });

    await toggleSave(v1, p1.id);
    await toggleSave(v2, p2.id);

    const r1 = await listOwnSaves({ userId: v1, limit: 10 });
    expect(r1.saves.map((s) => s.post.title)).toEqual(["p1"]);
    const r2 = await listOwnSaves({ userId: v2, limit: 10 });
    expect(r2.saves.map((s) => s.post.title)).toEqual(["p2"]);
  });

  it("malformed cursor → ValidationError", async () => {
    const v = await freshUser("v");
    await expect(
      listOwnSaves({ userId: v, limit: 10, cursor: "not-a-cursor" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("empty when nothing saved", async () => {
    const v = await freshUser("v");
    const r = await listOwnSaves({ userId: v, limit: 10 });
    expect(r.saves).toEqual([]);
    expect(r.nextCursor).toBeNull();
  });
});

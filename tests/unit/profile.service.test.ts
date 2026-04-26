import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismock } = vi.hoisted(() => {
  const { PrismockClient } = require("prismock");
  return { prismock: new PrismockClient() };
});
vi.mock("@/server/db/prisma", () => ({ prisma: prismock }));

import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import {
  getOwnShell,
  getPublic,
  resolveUserIdByUsername,
  updateProfile,
} from "@/server/services/profile.service";

/**
 * Boundary tests for profile.service.
 *
 * Covered:
 *  - getOwnShell: includes email + private counts (drafts, saved,
 *    authoredRemixes); 404 when user is missing or identity is incomplete.
 *  - getPublic: NEVER includes email; counts.publishedPosts only;
 *    404 when username is unknown.
 *  - updateProfile: applies displayName / username / description / image;
 *    uniqueness collisions throw ConflictError;
 *    invalid values throw ValidationError.
 */

async function freshUser(id: string, opts: { username?: string; displayName?: string } = {}) {
  await prismock.user.create({
    data: {
      id,
      email: `${id}@example.test`,
      displayName: opts.displayName ?? id,
      username: opts.username ?? id,
    },
  });
  return id;
}

async function publishPost(authorId: string, opts: { parentId?: string } = {}) {
  return prismock.post.create({
    data: {
      authorId,
      title: "T",
      body: "B",
      tone: "INSPIRING",
      publishedAt: new Date(),
      status: "PUBLISHED",
      parentId: opts.parentId ?? null,
    },
  });
}

describe("profile.service", () => {
  beforeEach(async () => {
    await prismock.save.deleteMany({});
    await prismock.draft.deleteMany({});
    await prismock.post.deleteMany({});
    await prismock.user.deleteMany({});
  });

  describe("getOwnShell", () => {
    it("returns email + private counts (publishedPosts, drafts, saved, authoredRemixes)", async () => {
      const me = await freshUser("me");
      const author = await freshUser("a");
      // 2 published posts (1 original + 1 remix), 3 drafts, 1 saved.
      const original = await publishPost(me);
      const parent = await publishPost(author);
      await prismock.post.create({
        data: {
          authorId: me,
          title: "remix",
          body: "B",
          tone: "INSPIRING",
          publishedAt: new Date(),
          status: "PUBLISHED",
          parentId: parent.id,
          parentAuthorSnapshot: { id: author, displayName: "a" },
          remixMode: "REWRITE",
        },
      });
      await prismock.draft.create({ data: { authorId: me } });
      await prismock.draft.create({ data: { authorId: me } });
      await prismock.draft.create({ data: { authorId: me } });
      await prismock.save.create({ data: { userId: me, postId: parent.id } });

      const shell = await getOwnShell(me);
      expect(shell.user.email).toBe("me@example.test");
      expect(shell.user.username).toBe("me");
      expect(shell.user.displayName).toBe("me");
      expect(shell.counts.publishedPosts).toBe(2);
      expect(shell.counts.drafts).toBe(3);
      expect(shell.counts.saved).toBe(1);
      expect(shell.counts.authoredRemixes).toBe(1);
      // sanity: original.id is referenced (avoid lint)
      expect(original.id).toBeTruthy();
    });

    it("throws NotFoundError when user does not exist", async () => {
      await expect(getOwnShell("nonexistent")).rejects.toBeInstanceOf(NotFoundError);
    });

    it("throws NotFoundError when identity is incomplete (no username)", async () => {
      // Simulate the brief window between Auth.js createUser insert and
      // events.createUser populating username/displayName.
      await prismock.user.create({
        data: {
          id: "incomplete",
          email: "x@example.test",
          // displayName / username deliberately omitted
        },
      });
      await expect(getOwnShell("incomplete")).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("getPublic", () => {
    it("never includes email; only publishedPosts count", async () => {
      const u = await freshUser("u1", { username: "alice", displayName: "Alice" });
      await publishPost(u);
      await publishPost(u);
      await prismock.draft.create({ data: { authorId: u } });
      await prismock.save.create({ data: { userId: u, postId: (await publishPost(u)).id } });

      const shell = await getPublic("alice");
      expect("email" in shell.user).toBe(false);
      expect(shell.user.username).toBe("alice");
      expect(shell.user.displayName).toBe("Alice");
      expect(shell.counts).toEqual({ publishedPosts: 3 });
      // The compiler also won't allow drafts/saved here (typed),
      // but verify at runtime too.
      expect("drafts" in shell.counts).toBe(false);
      expect("saved" in shell.counts).toBe(false);
    });

    it("throws NotFoundError when username is unknown", async () => {
      await expect(getPublic("ghost")).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("updateProfile", () => {
    it("applies displayName + description + image", async () => {
      const me = await freshUser("me");
      const updated = await updateProfile({
        userId: me,
        patch: {
          displayName: "Me Mine",
          description: "About me",
          image: "https://example.com/avatar.png",
        },
      });
      expect(updated.user.displayName).toBe("Me Mine");
      expect(updated.user.description).toBe("About me");
      expect(updated.user.image).toBe("https://example.com/avatar.png");
    });

    it("changes username to a unique slug", async () => {
      const me = await freshUser("me");
      const updated = await updateProfile({
        userId: me,
        patch: { username: "me-2" },
      });
      expect(updated.user.username).toBe("me-2");
    });

    it("ConflictError when displayName collides with another user's", async () => {
      const me = await freshUser("me");
      await freshUser("them", { displayName: "Taken Name" });
      await expect(
        updateProfile({ userId: me, patch: { displayName: "Taken Name" } }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it("ConflictError when username collides", async () => {
      const me = await freshUser("me");
      await freshUser("them", { username: "taken" });
      await expect(
        updateProfile({ userId: me, patch: { username: "taken" } }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it("ValidationError on illegal username characters", async () => {
      const me = await freshUser("me");
      await expect(
        updateProfile({ userId: me, patch: { username: "Invalid Name!" } }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("self-collision is allowed (setting your own current name to itself is a no-op)", async () => {
      const me = await freshUser("me", { displayName: "My Name" });
      const updated = await updateProfile({
        userId: me,
        patch: { displayName: "My Name" },
      });
      expect(updated.user.displayName).toBe("My Name");
    });
  });

  describe("resolveUserIdByUsername", () => {
    it("returns the user id for a known username", async () => {
      const me = await freshUser("me", { username: "alice" });
      expect(await resolveUserIdByUsername("alice")).toBe(me);
    });

    it("throws NotFoundError for unknown username", async () => {
      await expect(resolveUserIdByUsername("ghost")).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});

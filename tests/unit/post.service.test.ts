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
import { createOriginalDraft, patchOwnDraft } from "@/server/services/draft.service";
import { _resetModeratorForTesting } from "@/server/services/moderation/moderation.service";
import { deletePost, editPost, getById, publishDraft } from "@/server/services/post.service";

/**
 * Boundary tests for post.service. Uses prismock + the fake moderator (via
 * MUSEFLOW_MODERATOR=fake; TRIGGER_REJECT triggers a REJECT verdict).
 *
 * Key invariants exercised:
 *   - publishDraft: ALLOW path is transactional (Post created, Draft deleted)
 *   - publishDraft: REJECT preserves the Draft and throws SafetyRejectedError
 *   - publishDraft: missing-fields → ValidationError
 *   - publishDraft: remix path bumps parent.remixCount and persists snapshot
 *   - editPost: re-runs moderation; REJECT leaves the post unchanged
 *   - getById: PUBLISHED only; viewer state populated when viewerId given
 *   - deletePost: author-only; ForbiddenError otherwise
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

async function fillDraft(userId: string) {
  const draft = await createOriginalDraft({ authorId: userId, tone: "INSPIRING" });
  await patchOwnDraft({
    userId,
    draftId: draft.id,
    patch: { title: "On the joy of walking", body: "It is a wonder of the morning." },
  });
  return draft.id;
}

describe("post.service", () => {
  beforeEach(async () => {
    process.env.MUSEFLOW_MODERATOR = "fake";
    _resetModeratorForTesting();
    await prismock.safetyCheck.deleteMany({});
    await prismock.draft.deleteMany({});
    await prismock.post.deleteMany({});
    await prismock.like.deleteMany({});
    await prismock.save.deleteMany({});
    await prismock.user.deleteMany({});
  });

  afterEach(() => {
    _resetModeratorForTesting();
  });

  describe("publishDraft", () => {
    it("ALLOW path: creates Post (PUBLISHED), deletes Draft, returns projection", async () => {
      const userId = await freshUser("u1");
      const draftId = await fillDraft(userId);

      const post = await publishDraft({ userId, draftId });
      expect(post.title).toBe("On the joy of walking");
      expect(post.body).toBe("It is a wonder of the morning.");
      expect(post.tone).toBe("INSPIRING");
      expect(post.status).toBe("PUBLISHED");
      expect(post.attribution).toBeNull();

      // Draft is gone.
      const draftAfter = await prismock.draft.findUnique({ where: { id: draftId } });
      expect(draftAfter).toBeNull();
      // SafetyCheck row recorded with surface=POST_PUBLISH.
      const checks = await prismock.safetyCheck.findMany({
        where: { surface: "POST_PUBLISH" },
      });
      expect(checks).toHaveLength(1);
      expect(checks[0]!.verdict).toBe("ALLOW");
    });

    it("REJECT path: preserves Draft, throws SafetyRejectedError with categories+reason", async () => {
      const userId = await freshUser("u1");
      const draft = await createOriginalDraft({ authorId: userId, tone: "PLAYFUL" });
      await patchOwnDraft({
        userId,
        draftId: draft.id,
        patch: { title: "ok title", body: "TRIGGER_REJECT body" },
      });

      try {
        await publishDraft({ userId, draftId: draft.id });
        throw new Error("expected SafetyRejectedError");
      } catch (err) {
        expect(err).toBeInstanceOf(SafetyRejectedError);
        const e = err as SafetyRejectedError;
        expect(e.details.surface).toBe("POST_PUBLISH");
        expect(e.details.categories).toEqual(["hate"]);
        expect(e.details.reason).toBe("contains banned phrase");
      }

      // Draft is preserved.
      const draftAfter = await prismock.draft.findUnique({ where: { id: draft.id } });
      expect(draftAfter).not.toBeNull();
      // No Post created.
      const posts = await prismock.post.findMany({});
      expect(posts).toHaveLength(0);
    });

    it("missing required fields → ValidationError; no Post created", async () => {
      const userId = await freshUser("u1");
      const draft = await createOriginalDraft({ authorId: userId }); // no tone, no title, no body
      await expect(publishDraft({ userId, draftId: draft.id })).rejects.toBeInstanceOf(
        ValidationError,
      );
      const posts = await prismock.post.findMany({});
      expect(posts).toHaveLength(0);
    });

    it("cross-author publish returns NotFoundError", async () => {
      const a = await freshUser("a");
      const b = await freshUser("b");
      const draftId = await fillDraft(a);
      await expect(publishDraft({ userId: b, draftId })).rejects.toBeInstanceOf(NotFoundError);
    });

    it("remix publish: bumps parent.remixCount and persists snapshot+remixMode on the new Post (T105)", async () => {
      const parentAuthor = await freshUser("pa");
      const remixer = await freshUser("rm");
      // Set up a parent post the remixer is going to fork.
      const parent = await prismock.post.create({
        data: {
          authorId: parentAuthor,
          title: "Original",
          body: "Original body",
          tone: "INSPIRING",
          publishedAt: new Date(),
          status: "PUBLISHED",
          remixCount: 0,
        },
      });
      // Build a remix draft directly (skipping AI; remix.service has its own
      // tests). Snapshot the parent author at draft time.
      const draft = await prismock.draft.create({
        data: {
          authorId: remixer,
          title: "Remix title",
          body: "Remix body",
          tone: "INSPIRING",
          parentId: parent.id,
          parentAuthorSnapshot: { id: parentAuthor, displayName: "pa" },
          remixMode: "REWRITE",
        },
      });

      const published = await publishDraft({ userId: remixer, draftId: draft.id });
      expect(published.attribution).not.toBeNull();
      expect(published.attribution!.remixMode).toBe("REWRITE");
      expect(published.attribution!.parentAuthorSnapshot.displayName).toBe("pa");

      const parentAfter = await prismock.post.findUnique({ where: { id: parent.id } });
      expect(parentAfter!.remixCount).toBe(1);

      // Snapshot persists on the new Post row.
      const newPostRow = await prismock.post.findUnique({ where: { id: published.id } });
      expect(newPostRow!.parentId).toBe(parent.id);
      expect(newPostRow!.remixMode).toBe("REWRITE");
      const snap = newPostRow!.parentAuthorSnapshot as { id: string; displayName: string };
      expect(snap.displayName).toBe("pa");
    });
  });

  describe("editPost", () => {
    it("ALLOW path: applies patch, sets editedAt, re-runs moderation", async () => {
      const userId = await freshUser("u1");
      const draftId = await fillDraft(userId);
      const post = await publishDraft({ userId, draftId });

      const edited = await editPost({
        userId,
        postId: post.id,
        patch: { title: "On dawn walks" },
      });
      expect(edited.title).toBe("On dawn walks");
      expect(edited.editedAt).not.toBeNull();
      // Two POST_PUBLISH safety checks now (publish + edit).
      const checks = await prismock.safetyCheck.findMany({
        where: { surface: "POST_PUBLISH" },
      });
      expect(checks).toHaveLength(2);
    });

    it("REJECT path: leaves the post unchanged and throws SafetyRejectedError", async () => {
      const userId = await freshUser("u1");
      const draftId = await fillDraft(userId);
      const post = await publishDraft({ userId, draftId });

      await expect(
        editPost({
          userId,
          postId: post.id,
          patch: { body: "TRIGGER_REJECT update" },
        }),
      ).rejects.toBeInstanceOf(SafetyRejectedError);

      const stillSame = await prismock.post.findUnique({ where: { id: post.id } });
      expect(stillSame!.body).toBe("It is a wonder of the morning.");
      expect(stillSame!.editedAt).toBeNull();
    });

    it("ForbiddenError for non-author", async () => {
      const a = await freshUser("a");
      const b = await freshUser("b");
      const draftId = await fillDraft(a);
      const post = await publishDraft({ userId: a, draftId });
      await expect(
        editPost({ userId: b, postId: post.id, patch: { title: "haxx" } }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe("getById", () => {
    it("returns published post; viewer state populated for authenticated viewer", async () => {
      const author = await freshUser("a");
      const viewer = await freshUser("v");
      const draftId = await fillDraft(author);
      const post = await publishDraft({ userId: author, draftId });

      // Viewer hasn't liked or saved yet.
      const got1 = await getById(post.id, viewer);
      expect(got1.viewer).toEqual({ liked: false, saved: false });

      // Add a like and a save manually.
      await prismock.like.create({ data: { userId: viewer, postId: post.id } });
      await prismock.save.create({ data: { userId: viewer, postId: post.id } });
      const got2 = await getById(post.id, viewer);
      expect(got2.viewer).toEqual({ liked: true, saved: true });
    });

    it("anonymous viewer omits viewer state", async () => {
      const author = await freshUser("a");
      const draftId = await fillDraft(author);
      const post = await publishDraft({ userId: author, draftId });
      const got = await getById(post.id, null);
      expect(got.viewer).toBeUndefined();
    });

    it("REMOVED posts return NotFoundError to all viewers", async () => {
      const author = await freshUser("a");
      const draftId = await fillDraft(author);
      const post = await publishDraft({ userId: author, draftId });
      await prismock.post.update({
        where: { id: post.id },
        data: { status: "REMOVED" },
      });
      await expect(getById(post.id, author)).rejects.toBeInstanceOf(NotFoundError);
      await expect(getById(post.id, null)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("deletePost", () => {
    it("author can delete; non-author gets ForbiddenError", async () => {
      const a = await freshUser("a");
      const b = await freshUser("b");
      const draftId = await fillDraft(a);
      const post = await publishDraft({ userId: a, draftId });

      await expect(deletePost(b, post.id)).rejects.toBeInstanceOf(ForbiddenError);
      await deletePost(a, post.id);
      const after = await prismock.post.findUnique({ where: { id: post.id } });
      expect(after).toBeNull();
    });
  });
});

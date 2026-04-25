import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prismock } = vi.hoisted(() => {
  const { PrismockClient } = require("prismock");
  return { prismock: new PrismockClient() };
});
vi.mock("@/server/db/prisma", () => ({ prisma: prismock }));

import { NotFoundError, ValidationError } from "@/server/errors";
import {
  createOriginalDraft,
  deleteOwnDraft,
  getOwnDraft,
  listOwnDrafts,
  patchOwnDraft,
} from "@/server/services/draft.service";

/**
 * Boundary tests for draft.service.
 *
 * - Author-private invariant: cross-author reads/writes return NotFoundError,
 *   not ForbiddenError, to avoid existence leaks.
 * - Validation: PATCH requires at least one field.
 * - Listing: paginates by (updatedAt DESC, id DESC).
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

describe("draft.service", () => {
  beforeEach(async () => {
    await prismock.draft.deleteMany({});
    await prismock.user.deleteMany({});
  });

  afterEach(async () => {
    await prismock.draft.deleteMany({});
    await prismock.user.deleteMany({});
  });

  describe("createOriginalDraft", () => {
    it("creates an empty draft with optional tone", async () => {
      const userId = await freshUser("u1");
      const draft = await createOriginalDraft({ authorId: userId, tone: "INSPIRING" });
      expect(draft.id).toBeTruthy();
      expect(draft.title).toBeNull();
      expect(draft.body).toBeNull();
      expect(draft.tone).toBe("INSPIRING");
      expect(draft.attribution).toBeNull();
      expect(draft.lastSafetyCheck).toBeNull();
    });
  });

  describe("getOwnDraft", () => {
    it("returns the draft when authorId matches the requester", async () => {
      const userId = await freshUser("u1");
      const created = await createOriginalDraft({ authorId: userId });
      const got = await getOwnDraft(userId, created.id);
      expect(got.id).toBe(created.id);
    });

    it("throws NotFoundError when another user requests it (no leak)", async () => {
      const a = await freshUser("a");
      const b = await freshUser("b");
      const draft = await createOriginalDraft({ authorId: a });
      await expect(getOwnDraft(b, draft.id)).rejects.toBeInstanceOf(NotFoundError);
    });

    it("throws NotFoundError on missing id", async () => {
      const userId = await freshUser("u1");
      await expect(getOwnDraft(userId, "ckxxxxxxxxxxxxxxxxxxxxxxx")).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  describe("patchOwnDraft", () => {
    it("updates title/body/tone individually", async () => {
      const userId = await freshUser("u1");
      const created = await createOriginalDraft({ authorId: userId });
      const r1 = await patchOwnDraft({
        userId,
        draftId: created.id,
        patch: { title: "T1" },
      });
      expect(r1.title).toBe("T1");
      const r2 = await patchOwnDraft({
        userId,
        draftId: created.id,
        patch: { body: "B1" },
      });
      expect(r2.body).toBe("B1");
      expect(r2.title).toBe("T1");
      const r3 = await patchOwnDraft({
        userId,
        draftId: created.id,
        patch: { tone: "PLAYFUL" },
      });
      expect(r3.tone).toBe("PLAYFUL");
    });

    it("rejects empty patch with ValidationError", async () => {
      const userId = await freshUser("u1");
      const created = await createOriginalDraft({ authorId: userId });
      await expect(
        patchOwnDraft({ userId, draftId: created.id, patch: {} }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("cross-author patch returns NotFoundError", async () => {
      const a = await freshUser("a");
      const b = await freshUser("b");
      const draft = await createOriginalDraft({ authorId: a });
      await expect(
        patchOwnDraft({ userId: b, draftId: draft.id, patch: { title: "haxx" } }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("deleteOwnDraft", () => {
    it("deletes when owner", async () => {
      const userId = await freshUser("u1");
      const created = await createOriginalDraft({ authorId: userId });
      await deleteOwnDraft(userId, created.id);
      await expect(getOwnDraft(userId, created.id)).rejects.toBeInstanceOf(NotFoundError);
    });

    it("cross-author delete returns NotFoundError; row preserved", async () => {
      const a = await freshUser("a");
      const b = await freshUser("b");
      const created = await createOriginalDraft({ authorId: a });
      await expect(deleteOwnDraft(b, created.id)).rejects.toBeInstanceOf(NotFoundError);
      // a can still find it
      const stillThere = await getOwnDraft(a, created.id);
      expect(stillThere.id).toBe(created.id);
    });
  });

  describe("listOwnDrafts", () => {
    // NOTE: cursor pagination (and ordering by `updatedAt DESC, id DESC`)
    // depends on Prisma's @updatedAt directive, which prismock doesn't
    // simulate. Full pagination correctness is exercised by the real-Postgres
    // integration tests at T037 / T039.

    it("excludes drafts owned by other users", async () => {
      const a = await freshUser("a");
      const b = await freshUser("b");
      await createOriginalDraft({ authorId: a });
      await createOriginalDraft({ authorId: a });
      await createOriginalDraft({ authorId: b });
      const aPage = await listOwnDrafts({ userId: a, limit: 10 });
      expect(aPage.drafts).toHaveLength(2);
      const bPage = await listOwnDrafts({ userId: b, limit: 10 });
      expect(bPage.drafts).toHaveLength(1);
    });
  });
});

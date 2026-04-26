import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prismock } = vi.hoisted(() => {
  const { PrismockClient } = require("prismock");
  return { prismock: new PrismockClient() };
});
vi.mock("@/server/db/prisma", () => ({ prisma: prismock }));

import { AIProviderError, NotFoundError, RateLimitedError, ValidationError } from "@/server/errors";
import { _resetAIProviderForTesting } from "@/server/services/ai/ai.service";
import { FakeAIProvider } from "@/server/services/ai/fake-provider";
import { _resetModeratorForTesting } from "@/server/services/moderation/moderation.service";
import { _resetRateLimitsForTesting } from "@/server/services/ratelimit.service";
import { createRemixDraft } from "@/server/services/remix.service";

/**
 * Boundary tests for createRemixDraft.
 *
 * Covered:
 *   - ALLOW: draft created with parentId + parentAuthorSnapshot + remixMode;
 *     title/body pre-filled; lastSafetyCheckId linked
 *   - REJECT: draft still created (per contract: 201 with REJECT verdict)
 *     but title/body are null; lastSafetyCheckId points at the REJECT row
 *   - CHANGE_TONE without targetTone → ValidationError
 *   - 404 on missing/REMOVED source post
 *   - AI provider error: NO draft created (atomic)
 *   - Rate limit exhaustion: NO draft created
 *   - Snapshot persists author info even though we use the live author
 *     for the parent join in the projection
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

async function publishedPost(opts: {
  authorId: string;
  title?: string;
  body?: string;
  status?: "PUBLISHED" | "REMOVED";
}) {
  return prismock.post.create({
    data: {
      authorId: opts.authorId,
      title: opts.title ?? "Original",
      body: opts.body ?? "Body",
      tone: "INSPIRING",
      publishedAt: new Date(),
      status: opts.status ?? "PUBLISHED",
    },
  });
}

describe("createRemixDraft", () => {
  beforeEach(async () => {
    process.env.MUSEFLOW_AI_PROVIDER = "fake";
    process.env.MUSEFLOW_MODERATOR = "fake";
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    _resetAIProviderForTesting();
    _resetModeratorForTesting();
    _resetRateLimitsForTesting();
    await prismock.draft.deleteMany({});
    await prismock.generation.deleteMany({});
    await prismock.safetyCheck.deleteMany({});
    await prismock.post.deleteMany({});
    await prismock.user.deleteMany({});
  });

  afterEach(() => {
    _resetAIProviderForTesting();
    _resetModeratorForTesting();
    _resetRateLimitsForTesting();
  });

  it("ALLOW: creates draft with parentId + snapshot + remixMode + AI output", async () => {
    const author = await freshUser("a");
    const remixer = await freshUser("r");
    const source = await publishedPost({
      authorId: author,
      title: "On dawn walks",
      body: "It is a wonder.",
    });

    const result = await createRemixDraft({
      userId: remixer,
      sourcePostId: source.id,
      mode: "SUMMARIZE",
    });

    expect(result.aiOutputSafetyCheck.verdict).toBe("ALLOW");
    expect(result.draft.title).toContain("Summary");
    expect(result.draft.body).toBeTruthy();
    expect(result.draft.attribution).not.toBeNull();
    expect(result.draft.attribution!.remixMode).toBe("SUMMARIZE");
    expect(result.draft.attribution!.parentAuthorSnapshot.displayName).toBe("a");

    // Verify the persisted row.
    const row = await prismock.draft.findUnique({ where: { id: result.draft.id } });
    expect(row!.authorId).toBe(remixer);
    expect(row!.parentId).toBe(source.id);
    expect(row!.remixMode).toBe("SUMMARIZE");
    const snap = row!.parentAuthorSnapshot as { id: string; displayName: string };
    expect(snap.displayName).toBe("a");
    expect(row!.lastGenerationId).toBeTruthy();
    expect(row!.lastSafetyCheckId).toBeTruthy();

    // Generation row recorded with surface=REMIX + parentPostId.
    const gens = await prismock.generation.findMany({ where: { userId: remixer } });
    expect(gens).toHaveLength(1);
    expect(gens[0]!.surface).toBe("REMIX");
    expect(gens[0]!.mode).toBe("SUMMARIZE");
    expect(gens[0]!.parentPostId).toBe(source.id);
  });

  it("REJECT: creates draft with null title/body but full attribution + REJECT lastSafetyCheck", async () => {
    const author = await freshUser("a");
    const remixer = await freshUser("r");
    // The fake provider echoes 'TRIGGER_REJECT' into output if the source
    // body contains it; the fake moderator then flags it.
    const source = await publishedPost({
      authorId: author,
      body: "TRIGGER_REJECT lurks here",
    });

    const result = await createRemixDraft({
      userId: remixer,
      sourcePostId: source.id,
      mode: "REWRITE",
    });

    expect(result.aiOutputSafetyCheck.verdict).toBe("REJECT");
    if (result.aiOutputSafetyCheck.verdict === "REJECT") {
      expect(result.aiOutputSafetyCheck.categories).toEqual(["hate"]);
    }
    expect(result.draft.title).toBeNull();
    expect(result.draft.body).toBeNull();
    expect(result.draft.attribution).not.toBeNull();
    expect(result.draft.lastSafetyCheck?.verdict).toBe("REJECT");
  });

  it("CHANGE_TONE: persists tone + uses targetTone in the draft", async () => {
    const author = await freshUser("a");
    const remixer = await freshUser("r");
    const source = await publishedPost({ authorId: author });

    const result = await createRemixDraft({
      userId: remixer,
      sourcePostId: source.id,
      mode: "CHANGE_TONE",
      targetTone: "PLAYFUL",
    });

    expect(result.draft.tone).toBe("PLAYFUL");
    expect(result.draft.attribution!.remixMode).toBe("CHANGE_TONE");
  });

  it("CHANGE_TONE without targetTone → ValidationError; no draft created", async () => {
    const author = await freshUser("a");
    const remixer = await freshUser("r");
    const source = await publishedPost({ authorId: author });

    await expect(
      createRemixDraft({
        userId: remixer,
        sourcePostId: source.id,
        mode: "CHANGE_TONE",
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    const drafts = await prismock.draft.findMany({});
    expect(drafts).toHaveLength(0);
  });

  it("404 on missing source", async () => {
    const remixer = await freshUser("r");
    await expect(
      createRemixDraft({
        userId: remixer,
        sourcePostId: "ckxxxxxxxxxxxxxxxxxxxxxx",
        mode: "REWRITE",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("404 on REMOVED source (refuses to remix tombstoned posts)", async () => {
    const author = await freshUser("a");
    const remixer = await freshUser("r");
    const source = await publishedPost({ authorId: author, status: "REMOVED" });
    await expect(
      createRemixDraft({
        userId: remixer,
        sourcePostId: source.id,
        mode: "REWRITE",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("AI provider error: atomic — no draft created", async () => {
    const author = await freshUser("a");
    const remixer = await freshUser("r");
    const source = await publishedPost({ authorId: author });

    const spy = vi
      .spyOn(FakeAIProvider.prototype, "generate")
      .mockRejectedValueOnce(new AIProviderError("simulated"));

    await expect(
      createRemixDraft({
        userId: remixer,
        sourcePostId: source.id,
        mode: "REWRITE",
      }),
    ).rejects.toBeInstanceOf(AIProviderError);

    spy.mockRestore();

    const drafts = await prismock.draft.findMany({});
    expect(drafts).toHaveLength(0);
  });

  it("rate-limit exhaustion: no draft created", async () => {
    const author = await freshUser("a");
    const remixer = await freshUser("r");
    const source = await publishedPost({ authorId: author });

    // Burn the REMIX bucket (10/hour).
    for (let i = 0; i < 10; i++) {
      await createRemixDraft({
        userId: remixer,
        sourcePostId: source.id,
        mode: "REWRITE",
      });
    }
    const before = await prismock.draft.count();

    await expect(
      createRemixDraft({
        userId: remixer,
        sourcePostId: source.id,
        mode: "REWRITE",
      }),
    ).rejects.toBeInstanceOf(RateLimitedError);

    const after = await prismock.draft.count();
    expect(after).toBe(before);
  });
});

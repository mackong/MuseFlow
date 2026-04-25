import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prismock } = vi.hoisted(() => {
  const { PrismockClient } = require("prismock");
  return { prismock: new PrismockClient() };
});
vi.mock("@/server/db/prisma", () => ({ prisma: prismock }));

import { AIProviderError, RateLimitedError } from "@/server/errors";
import { _resetAIProviderForTesting, generate } from "@/server/services/ai/ai.service";
import { _resetModeratorForTesting } from "@/server/services/moderation/moderation.service";
import { _resetRateLimitsForTesting } from "@/server/services/ratelimit.service";

/**
 * Boundary tests for the ai.service orchestrator. Verifies:
 *   - happy path persists a Generation row with status=SUCCESS + safetyCheckId
 *   - safety reject suppresses output + persists status=SAFETY_REJECTED
 *   - provider error persists status=ERROR with errorMessage and re-throws
 *   - rate-limit exhaustion throws RateLimitedError before any provider call
 *
 * The fake provider (TRIGGER_REJECT trick) and fake moderator give us a
 * deterministic safety-rejection path without network or LLM calls.
 */

async function freshUser(id = "u1") {
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

describe("ai.service.generate", () => {
  beforeEach(async () => {
    process.env.MUSEFLOW_AI_PROVIDER = "fake";
    process.env.MUSEFLOW_MODERATOR = "fake";
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    _resetAIProviderForTesting();
    _resetModeratorForTesting();
    _resetRateLimitsForTesting();
    await prismock.generation.deleteMany({});
    await prismock.safetyCheck.deleteMany({});
    await prismock.user.deleteMany({});
  });

  afterEach(() => {
    _resetAIProviderForTesting();
    _resetModeratorForTesting();
    _resetRateLimitsForTesting();
  });

  it("ALLOW path: persists Generation(status=SUCCESS) with linked SafetyCheck and returns output", async () => {
    const userId = await freshUser();
    const result = await generate({
      userId,
      surface: "CREATE",
      request: { mode: "CREATE", idea: "the joy of walking", tone: "INSPIRING" },
    });

    expect(result.output).not.toBeNull();
    expect(result.output!.title).toBeTruthy();
    expect(result.safety.verdict).toBe("ALLOW");
    expect(result.provider).toBe("fake");
    expect(result.rateLimit.limit).toBe(20);
    expect(result.rateLimit.remaining).toBe(19);

    const gen = await prismock.generation.findUnique({ where: { id: result.generationId } });
    expect(gen!.status).toBe("SUCCESS");
    expect(gen!.safetyCheckId).not.toBeNull();
    expect(gen!.surface).toBe("CREATE");
    expect(gen!.mode).toBe("CREATE");
    expect(gen!.userId).toBe(userId);
    expect(gen!.provider).toBe("fake");
  });

  it("REJECT path: suppresses output, persists Generation(status=SAFETY_REJECTED)", async () => {
    const userId = await freshUser();
    const result = await generate({
      userId,
      surface: "CREATE",
      request: { mode: "CREATE", idea: "TRIGGER_REJECT contents", tone: "PLAYFUL" },
    });

    expect(result.output).toBeNull();
    expect(result.safety.verdict).toBe("REJECT");
    if (result.safety.verdict === "REJECT") {
      expect(result.safety.categories).toEqual(["hate"]);
      expect(result.safety.reason).toBe("contains banned phrase");
    }

    const gen = await prismock.generation.findUnique({ where: { id: result.generationId } });
    expect(gen!.status).toBe("SAFETY_REJECTED");
    expect(gen!.safetyCheckId).not.toBeNull();
    const safety = await prismock.safetyCheck.findUnique({ where: { id: gen!.safetyCheckId! } });
    expect(safety!.verdict).toBe("REJECT");
    expect(safety!.categories).toEqual(["hate"]);
  });

  it("REMIX surface: counts against the REMIX bucket and stores parentPostId", async () => {
    const userId = await freshUser();
    // Seed a parent post so the FK constraint passes (prismock honors FKs only loosely
    // but we set a real id anyway so future strict-FK changes don't break this).
    const parent = await prismock.post.create({
      data: {
        id: "parent1",
        authorId: userId,
        title: "Original",
        body: "Body",
        tone: "INSPIRING",
        publishedAt: new Date(),
      },
    });
    const result = await generate({
      userId,
      surface: "REMIX",
      parentPostId: parent.id,
      request: {
        mode: "REWRITE",
        source: { title: "Original", body: "Body" },
      },
    });
    expect(result.rateLimit.limit).toBe(10);
    expect(result.rateLimit.remaining).toBe(9);

    const gen = await prismock.generation.findUnique({ where: { id: result.generationId } });
    expect(gen!.surface).toBe("REMIX");
    expect(gen!.mode).toBe("REWRITE");
    expect(gen!.parentPostId).toBe(parent.id);
  });

  it("ERROR path: provider throws → Generation row recorded with status=ERROR + errorMessage; AIProviderError surfaces", async () => {
    const userId = await freshUser();

    // Force the next provider call to fail. The fake provider exposes
    // failNextCall(); we reach into the cached singleton via the public
    // generate() flow — easier to swap in a thrown-from-mock by re-reading
    // env. Here we use the fake's instance method.
    const { _resetAIProviderForTesting: reset } = await import("@/server/services/ai/ai.service");
    reset();
    process.env.MUSEFLOW_AI_PROVIDER = "fake";
    // Trigger one call to materialize the cached provider, then poke it.
    const { generate: gen2 } = await import("@/server/services/ai/ai.service");
    // Use the FakeAIProvider directly to force-fail
    const { FakeAIProvider } = await import("@/server/services/ai/fake-provider");
    const fp = new FakeAIProvider();
    fp.failNextCall();
    // The cached singleton in ai.service is internal; instead, exercise the
    // ERROR path by feeding malformed input that the provider rejects? The
    // fake provider doesn't have a rejection mode based on input. So we
    // instead spy on FakeAIProvider.prototype.generate to throw once.
    const spy = vi
      .spyOn(FakeAIProvider.prototype, "generate")
      .mockRejectedValueOnce(new AIProviderError("simulated provider failure"));

    await expect(
      gen2({
        userId,
        surface: "CREATE",
        request: { mode: "CREATE", idea: "anything", tone: "INSPIRING" },
      }),
    ).rejects.toBeInstanceOf(AIProviderError);

    spy.mockRestore();

    const rows = await prismock.generation.findMany({
      where: { userId, status: "ERROR" },
    });
    expect(rows.length).toBe(1);
    expect(rows[0]!.errorMessage).toContain("simulated provider failure");
  });

  it("RATE_LIMITED: throws RateLimitedError before the provider runs (no Generation row)", async () => {
    const userId = await freshUser();
    // Burn the entire CREATE bucket.
    for (let i = 0; i < 20; i++) {
      await generate({
        userId,
        surface: "CREATE",
        request: { mode: "CREATE", idea: `idea${i}`, tone: "INSPIRING" },
      });
    }
    const before = await prismock.generation.count({ where: { userId } });
    await expect(
      generate({
        userId,
        surface: "CREATE",
        request: { mode: "CREATE", idea: "21st", tone: "INSPIRING" },
      }),
    ).rejects.toBeInstanceOf(RateLimitedError);
    const after = await prismock.generation.count({ where: { userId } });
    expect(after).toBe(before); // no new Generation row on rate-limited path
  });
});

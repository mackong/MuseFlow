import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RateLimitedError } from "@/server/errors";
import {
  _resetRateLimitsForTesting,
  checkAIGenerationLimit,
} from "@/server/services/ratelimit.service";

/**
 * Exercises the in-memory fallback path. Upstash env vars are unset under
 * `MUSEFLOW_AI_PROVIDER=fake` test config, so every call hits the fallback
 * limiter — which is what we want here.
 */
describe("checkAIGenerationLimit (in-memory fallback)", () => {
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    _resetRateLimitsForTesting();
  });

  afterEach(() => {
    if (originalUrl !== undefined) process.env.UPSTASH_REDIS_REST_URL = originalUrl;
    if (originalToken !== undefined) process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
    _resetRateLimitsForTesting();
  });

  it("allows up to 20 CREATE generations per user", async () => {
    for (let i = 0; i < 20; i++) {
      const r = await checkAIGenerationLimit("u1", "CREATE");
      expect(r.allowed).toBe(true);
      expect(r.limit).toBe(20);
      expect(r.remaining).toBe(19 - i);
    }
  });

  it("throws RateLimitedError on the 21st CREATE call with retryAfterSeconds and resetAt", async () => {
    for (let i = 0; i < 20; i++) await checkAIGenerationLimit("u1", "CREATE");
    await expect(checkAIGenerationLimit("u1", "CREATE")).rejects.toBeInstanceOf(RateLimitedError);
    try {
      await checkAIGenerationLimit("u1", "CREATE");
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitedError);
      const e = err as RateLimitedError;
      expect(e.details.retryAfterSeconds).toBeGreaterThan(0);
      expect(e.details.limit).toBe(20);
      expect(e.details.remaining).toBe(0);
      expect(typeof e.details.resetAt).toBe("string");
    }
  });

  it("CREATE and REMIX have independent counters per user", async () => {
    for (let i = 0; i < 20; i++) await checkAIGenerationLimit("u1", "CREATE");
    // CREATE exhausted, REMIX is still untouched.
    const r = await checkAIGenerationLimit("u1", "REMIX");
    expect(r.allowed).toBe(true);
    expect(r.limit).toBe(10);
    expect(r.remaining).toBe(9);
  });

  it("REMIX caps at 10 calls per user", async () => {
    for (let i = 0; i < 10; i++) await checkAIGenerationLimit("u2", "REMIX");
    await expect(checkAIGenerationLimit("u2", "REMIX")).rejects.toBeInstanceOf(RateLimitedError);
  });

  it("different users have independent counters", async () => {
    for (let i = 0; i < 20; i++) await checkAIGenerationLimit("u1", "CREATE");
    const r = await checkAIGenerationLimit("u2", "CREATE");
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(19);
  });

  it("counter resets after the window elapses", async () => {
    vi.useFakeTimers();
    try {
      const start = Date.now();
      for (let i = 0; i < 20; i++) await checkAIGenerationLimit("u3", "CREATE");
      // Inside the window: still rate-limited.
      await expect(checkAIGenerationLimit("u3", "CREATE")).rejects.toBeInstanceOf(RateLimitedError);
      // Advance just past the 1-hour window.
      vi.setSystemTime(start + 60 * 60 * 1000 + 1);
      const r = await checkAIGenerationLimit("u3", "CREATE");
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(19);
    } finally {
      vi.useRealTimers();
    }
  });
});

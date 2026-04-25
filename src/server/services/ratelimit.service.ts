import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { RateLimitedError } from "@/server/errors";

/**
 * AI generation rate limiter.
 *
 * Constitution Principle X — every AI call site MUST be rate-limited per
 * user, with a clear user-facing message on exhaustion.
 *
 * Backend: Upstash Ratelimit (sliding window) when `UPSTASH_REDIS_REST_URL`
 * and `UPSTASH_REDIS_REST_TOKEN` are set. Otherwise an in-process fixed-
 * window fallback so dev and tests work without external infrastructure.
 *
 * Defaults (from plan.md cost envelopes):
 *   - CREATE: 20 generations / hour / user
 *   - REMIX:  10 generations / hour / user
 *
 * Public surface: a single `checkAIGenerationLimit(userId, surface)` that
 * returns the limit info on success and throws `RateLimitedError` when
 * exhausted. The route handler maps the error to HTTP 429 with a
 * Retry-After header (see `errors.ts toHttpResponse`).
 */

export type RateLimitSurface = "CREATE" | "REMIX";

interface LimitConfig {
  limit: number;
  windowMs: number;
  /** `@upstash/ratelimit` sliding-window window string. */
  windowStr: `${number} ${"s" | "m" | "h"}`;
}

const CONFIGS: Record<RateLimitSurface, LimitConfig> = {
  CREATE: { limit: 20, windowMs: 60 * 60 * 1000, windowStr: "1 h" },
  REMIX: { limit: 10, windowMs: 60 * 60 * 1000, windowStr: "1 h" },
};

export interface RateLimitInfo {
  /** Always `true` on the returned path; an exhausted limit throws instead. */
  allowed: true;
  limit: number;
  remaining: number;
  resetAt: Date;
}

// -----------------------------------------------------------------------------
// Upstash backend (lazy-initialized on first call)
// -----------------------------------------------------------------------------

let upstash: { CREATE: Ratelimit; REMIX: Ratelimit } | null = null;
let upstashChecked = false;

function getUpstash(): { CREATE: Ratelimit; REMIX: Ratelimit } | null {
  if (upstashChecked) return upstash;
  upstashChecked = true;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    upstash = null;
    return null;
  }

  const redis = new Redis({ url, token });
  upstash = {
    CREATE: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(CONFIGS.CREATE.limit, CONFIGS.CREATE.windowStr),
      prefix: "rl:gen:create",
      analytics: false,
    }),
    REMIX: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(CONFIGS.REMIX.limit, CONFIGS.REMIX.windowStr),
      prefix: "rl:gen:remix",
      analytics: false,
    }),
  };
  return upstash;
}

// -----------------------------------------------------------------------------
// In-memory fallback (fixed-window, per process)
// -----------------------------------------------------------------------------

interface FallbackEntry {
  count: number;
  resetAt: number;
}
const fallback = new Map<string, FallbackEntry>();

function fallbackCheck(
  key: string,
  config: LimitConfig,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = fallback.get(key);
  if (!entry || now >= entry.resetAt) {
    const resetAt = now + config.windowMs;
    fallback.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: config.limit - 1, resetAt };
  }
  if (entry.count >= config.limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }
  entry.count += 1;
  return { allowed: true, remaining: config.limit - entry.count, resetAt: entry.resetAt };
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

export async function checkAIGenerationLimit(
  userId: string,
  surface: RateLimitSurface,
): Promise<RateLimitInfo> {
  const config = CONFIGS[surface];
  const upstashLimiters = getUpstash();

  if (upstashLimiters) {
    const result = await upstashLimiters[surface].limit(userId);
    if (!result.success) {
      throw new RateLimitedError(
        `Rate limit reached for ${surface.toLowerCase()} generation. Try again shortly.`,
        {
          retryAfterSeconds: Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)),
          limit: result.limit,
          remaining: result.remaining,
          resetAt: new Date(result.reset).toISOString(),
        },
      );
    }
    return {
      allowed: true,
      limit: result.limit,
      remaining: result.remaining,
      resetAt: new Date(result.reset),
    };
  }

  // In-memory fallback
  const result = fallbackCheck(`${surface}:${userId}`, config);
  if (!result.allowed) {
    throw new RateLimitedError(
      `Rate limit reached for ${surface.toLowerCase()} generation. Try again shortly.`,
      {
        retryAfterSeconds: Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000)),
        limit: config.limit,
        remaining: 0,
        resetAt: new Date(result.resetAt).toISOString(),
      },
    );
  }
  return {
    allowed: true,
    limit: config.limit,
    remaining: result.remaining,
    resetAt: new Date(result.resetAt),
  };
}

/**
 * Test-only escape hatch: wipes the in-memory fallback and forces re-detection
 * of Upstash credentials on the next call. Production code MUST NOT call this.
 */
export function _resetRateLimitsForTesting(): void {
  fallback.clear();
  upstash = null;
  upstashChecked = false;
}

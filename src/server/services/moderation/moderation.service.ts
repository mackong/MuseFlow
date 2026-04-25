import { prisma } from "@/server/db/prisma";
import { InternalError } from "@/server/errors";

import { FakeModerator } from "./fake-moderator";
import type { ModerationRequest, ModerationResult, Moderator } from "./moderator.interface";
import { OpenAIModerator } from "./openai-moderator";

/**
 * Moderation service.
 *
 * Constitution Principle VI:
 *  - Every AI output and every public-transition (publish, edit-publish,
 *    comment create) MUST pass a safety check before becoming public.
 *  - Failure to verify (provider error, timeout) MUST fail closed —
 *    blocking publication rather than silently allowing it.
 *
 * Public surface:
 *  - `runModerationCheck(req, opts?)` — calls the configured Moderator and
 *    persists a SafetyCheck row. Returns the result + the persisted id.
 *
 * Provider selection (env `MUSEFLOW_MODERATOR`):
 *  - `openai` (default): real OpenAI Moderation API
 *  - `fake`: in-process deterministic fake (used in unit tests and
 *    offline dev when MUSEFLOW_MODERATOR is forced to `fake`)
 */

export interface ModerationOutcome {
  result: ModerationResult;
  safetyCheckId: string;
}

let cached: Moderator | null = null;

function getModerator(): Moderator {
  if (cached) return cached;
  const provider = (process.env.MUSEFLOW_MODERATOR ?? "openai").toLowerCase();
  if (provider === "fake") {
    cached = new FakeModerator();
    return cached;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODERATION_MODEL ?? "omni-moderation-latest";
  if (!apiKey) {
    throw new InternalError(
      "OPENAI_API_KEY is required when MUSEFLOW_MODERATOR=openai. Set it or switch to MUSEFLOW_MODERATOR=fake.",
    );
  }
  cached = new OpenAIModerator({
    apiKey,
    model,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });
  return cached;
}

/**
 * Run a moderation check, persist the result, return both.
 *
 * Failure mode: if the Moderator throws (transport / quota / etc), this
 * function re-throws. Callers in the publish path MUST treat that as a
 * hard "block publish" — fail closed per Principle VI.
 */
export async function runModerationCheck(req: ModerationRequest): Promise<ModerationOutcome> {
  const moderator = getModerator();
  const result = await moderator.check(req);

  const row = await prisma.safetyCheck.create({
    data: {
      provider: result.rawProvider,
      surface: req.surface,
      verdict: result.verdict,
      categories: result.categories,
      reason: result.reason,
      latencyMs: result.latencyMs,
    },
    select: { id: true },
  });

  return { result, safetyCheckId: row.id };
}

/**
 * Test-only: reset the cached moderator instance so a re-read of
 * MUSEFLOW_MODERATOR / OPENAI_API_KEY env vars takes effect.
 */
export function _resetModeratorForTesting(): void {
  cached = null;
}

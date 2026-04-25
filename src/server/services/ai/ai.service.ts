import { prisma } from "@/server/db/prisma";
import { AIProviderError, InternalError } from "@/server/errors";

import { runModerationCheck } from "../moderation/moderation.service";
import { checkAIGenerationLimit } from "../ratelimit.service";

import { FakeAIProvider } from "./fake-provider";
import { OpenAIProvider } from "./openai-provider";
import type { AIGenerationRequest, AIProvider } from "./provider.interface";

/**
 * AI service — the orchestrator that every AI generation goes through.
 *
 * Constitution Principle X: every call MUST emit a `Generation` row with
 * provider, model, latency, status, token counts (when available), and
 * surface. This is the single place that record happens.
 *
 * Pipeline (in order):
 *  1. Rate-limit check  → throws RateLimitedError on exhaustion
 *  2. Provider call     → throws AIProviderError on transport / parse failure
 *  3. Moderation check  → ALLOWS or REJECTS the AI output (does not throw on REJECT)
 *  4. Persist Generation row + link safetyCheckId
 *
 * Failure modes are funnelled into the Generation row:
 *  - SUCCESS: output returned with safety verdict
 *  - SAFETY_REJECTED: output suppressed, verdict=REJECT, categories+reason set
 *  - ERROR: provider error or moderation transport error; user-facing
 *    error is an AIProviderError (HTTP 502) so the route maps cleanly
 */

export type GenerationSurface = "CREATE" | "REMIX";

export interface GenerateInput {
  userId: string;
  surface: GenerationSurface;
  request: AIGenerationRequest;
  /** Required when surface=REMIX; persisted on the Generation row. */
  parentPostId?: string;
}

export interface GenerateResult {
  generationId: string;
  output: { title: string; body: string } | null;
  safety: { verdict: "ALLOW" } | { verdict: "REJECT"; categories: string[]; reason: string };
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  provider: string;
  model: string;
  /** Limit info for setting X-RateLimit-* headers in the route handler. */
  rateLimit: { limit: number; remaining: number; resetAt: Date };
}

let cachedProvider: AIProvider | null = null;

function getProvider(): AIProvider {
  if (cachedProvider) return cachedProvider;
  const which = (process.env.MUSEFLOW_AI_PROVIDER ?? "openai").toLowerCase();

  if (which === "fake") {
    cachedProvider = new FakeAIProvider();
    return cachedProvider;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  if (!apiKey) {
    throw new InternalError(
      "OPENAI_API_KEY is required when MUSEFLOW_AI_PROVIDER=openai. Set it or use MUSEFLOW_AI_PROVIDER=fake.",
    );
  }
  cachedProvider = new OpenAIProvider({
    apiKey,
    model,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });
  return cachedProvider;
}

/** Map ai-service mode → Generation.mode enum. */
function generationModeOf(req: AIGenerationRequest) {
  return req.mode; // identical string union; Prisma enum names match exactly
}

export async function generate(input: GenerateInput): Promise<GenerateResult> {
  const { userId, surface, request, parentPostId } = input;

  // 1. Rate-limit check (throws RateLimitedError → 429)
  const rateLimit = await checkAIGenerationLimit(userId, surface);

  const provider = getProvider();
  const start = Date.now();

  // 2. Provider call. We catch AIProviderError so we can persist the failure
  //    record before re-throwing.
  try {
    const result = await provider.generate(request);
    const latencyMs = Date.now() - start;

    // 3. Moderation on the AI output (concatenate title + body for the check).
    let moderationOutcome;
    try {
      moderationOutcome = await runModerationCheck({
        text: `${result.output.title}\n\n${result.output.body}`,
        surface: "AI_OUTPUT",
      });
    } catch (modErr) {
      // Treat moderation transport errors as a hard failure for THIS call —
      // record an ERROR row so cost dashboards still see the LLM call.
      await prisma.generation.create({
        data: {
          userId,
          surface,
          mode: generationModeOf(request),
          provider: provider.name,
          model: provider.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          latencyMs,
          status: "ERROR",
          errorMessage:
            modErr instanceof Error ? modErr.message.slice(0, 500) : "Moderation transport error",
          ...(parentPostId ? { parentPostId } : {}),
        },
      });
      throw new AIProviderError("Moderation service unavailable; cannot verify AI output");
    }

    const { result: modResult, safetyCheckId } = moderationOutcome;
    const status = modResult.verdict === "ALLOW" ? "SUCCESS" : "SAFETY_REJECTED";

    // 4. Persist the Generation row.
    const row = await prisma.generation.create({
      data: {
        userId,
        surface,
        mode: generationModeOf(request),
        provider: provider.name,
        model: provider.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        latencyMs,
        status,
        safetyCheckId,
        ...(parentPostId ? { parentPostId } : {}),
      },
      select: { id: true },
    });

    return {
      generationId: row.id,
      output: modResult.verdict === "ALLOW" ? result.output : null,
      safety:
        modResult.verdict === "ALLOW"
          ? { verdict: "ALLOW" }
          : {
              verdict: "REJECT",
              categories: modResult.categories,
              reason: modResult.reason ?? "Content flagged by safety moderation",
            },
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      latencyMs,
      provider: provider.name,
      model: provider.model,
      rateLimit,
    };
  } catch (err) {
    // Provider error path: still persist a Generation row for cost auditing.
    if (err instanceof AIProviderError) {
      const latencyMs = Date.now() - start;
      await prisma.generation
        .create({
          data: {
            userId,
            surface,
            mode: generationModeOf(request),
            provider: provider.name,
            model: provider.model,
            inputTokens: null,
            outputTokens: null,
            latencyMs,
            status: "ERROR",
            errorMessage: err.message.slice(0, 500),
            ...(parentPostId ? { parentPostId } : {}),
          },
        })
        .catch(() => {
          /* DB logging is best-effort on the error path */
        });
      throw err;
    }
    throw err;
  }
}

/** Test-only: clear cached provider so a re-read of MUSEFLOW_AI_PROVIDER takes effect. */
export function _resetAIProviderForTesting(): void {
  cachedProvider = null;
}

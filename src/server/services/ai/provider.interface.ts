import type { Tone, RemixMode } from "@/lib/contracts/shared";

/**
 * AI provider abstraction. Constitution Principle VIII enforces that all LLM
 * access goes through this interface. The `openai` SDK MUST NOT be imported
 * from any module outside `src/server/services/ai/`. This is enforced as a
 * lint error in `eslint.config.mjs`.
 *
 * Adding a new provider (e.g., Anthropic, Gemini, local Ollama) means:
 *   1. Create `<provider>-provider.ts` next to `openai-provider.ts`,
 *      implementing `AIProvider`.
 *   2. Wire selection in `ai.service.ts` via env (MUSEFLOW_AI_PROVIDER).
 *   3. No call sites change.
 */

export type AIGenerationMode = "CREATE" | RemixMode;

/** Discriminated union over the modes — keeps unsupported field combos out. */
export type AIGenerationRequest =
  | { mode: "CREATE"; idea: string; tone: Tone }
  | { mode: "REWRITE"; source: { title: string; body: string } }
  | { mode: "CONTINUE"; source: { title: string; body: string } }
  | { mode: "SUMMARIZE"; source: { title: string; body: string } }
  | {
      mode: "CHANGE_TONE";
      source: { title: string; body: string };
      targetTone: Tone;
    };

export interface AIGenerationResult {
  output: { title: string; body: string };
  /** Token counts when the provider reports them; null otherwise. */
  inputTokens: number | null;
  outputTokens: number | null;
  /** Provider-side identifier for the call (passes through to logs). */
  rawProvider: string;
  rawModel: string;
}

export interface AIProvider {
  /** Stable provider name (e.g. "openai", "anthropic"). Recorded in Generation rows. */
  readonly name: string;
  /** Configured model id (e.g. "gpt-4o-mini"). Recorded in Generation rows. */
  readonly model: string;

  /**
   * Generate content for one of the five modes.
   *
   * Implementations MUST:
   *   - Return a strict { title, body } JSON shape (use the provider's JSON
   *     mode / structured output).
   *   - Throw `AIProviderError` (from `@/server/errors`) on upstream failure
   *     after at most one retry on JSON-parse failure.
   *   - NOT call moderation, persist DB rows, or interact with the rate
   *     limiter — those concerns belong to `ai.service.ts`.
   */
  generate(req: AIGenerationRequest): Promise<AIGenerationResult>;
}

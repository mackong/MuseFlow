import { z } from "zod";

import { IdSchema, RemixModeSchema, ToneSchema } from "./shared";

/**
 * Wire contract for `POST /api/ai/generate` and the AIProvider output shape.
 *
 * RN-compatibility: this file imports only `zod` and shared primitives.
 * No Node-only APIs, no Prisma. A future Expo client can import these
 * schemas as-is.
 */

// -----------------------------------------------------------------------------
// Generation modes (matches AIProvider interface in src/server/services/ai)
// -----------------------------------------------------------------------------

export const AiGenerationModeSchema = z.enum([
  "CREATE",
  "REWRITE",
  "CONTINUE",
  "SUMMARIZE",
  "CHANGE_TONE",
]);
export type AiGenerationMode = z.infer<typeof AiGenerationModeSchema>;

// -----------------------------------------------------------------------------
// Request body — discriminated union by mode
// -----------------------------------------------------------------------------

export const AiGenerateRequestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("CREATE"),
    idea: z.string().trim().min(1).max(500),
    tone: ToneSchema,
  }),
  z.object({
    mode: z.literal("REWRITE"),
    sourcePostId: IdSchema,
  }),
  z.object({
    mode: z.literal("CONTINUE"),
    sourcePostId: IdSchema,
  }),
  z.object({
    mode: z.literal("SUMMARIZE"),
    sourcePostId: IdSchema,
  }),
  z.object({
    mode: z.literal("CHANGE_TONE"),
    sourcePostId: IdSchema,
    targetTone: ToneSchema,
  }),
]);
export type AiGenerateRequest = z.infer<typeof AiGenerateRequestSchema>;

// -----------------------------------------------------------------------------
// Provider output — strict JSON shape returned by the model
// -----------------------------------------------------------------------------

export const AiGenerateOutputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(8000),
});
export type AiGenerateOutput = z.infer<typeof AiGenerateOutputSchema>;

// -----------------------------------------------------------------------------
// Response — what /api/ai/generate returns to clients (200 always; the
// safety verdict is informational, NOT an HTTP error here, because the
// editor uses it to render rejection inline alongside any partial UI).
// 4xx/5xx are reserved for true failures (auth, validation, rate, provider).
// -----------------------------------------------------------------------------

export const SafetyVerdictAllowSchema = z.object({ verdict: z.literal("ALLOW") });
export const SafetyVerdictRejectSchema = z.object({
  verdict: z.literal("REJECT"),
  categories: z.array(z.string()),
  reason: z.string(),
});
export const SafetyVerdictSchema = z.discriminatedUnion("verdict", [
  SafetyVerdictAllowSchema,
  SafetyVerdictRejectSchema,
]);
export type SafetyVerdictPayload = z.infer<typeof SafetyVerdictSchema>;

export const AiGenerateUsageSchema = z.object({
  inputTokens: z.number().int().nullable(),
  outputTokens: z.number().int().nullable(),
});
export type AiGenerateUsage = z.infer<typeof AiGenerateUsageSchema>;

export const AiGenerateResponseSchema = z.object({
  generationId: IdSchema,
  output: AiGenerateOutputSchema.nullable(), // null when REJECT
  safety: SafetyVerdictSchema,
  usage: AiGenerateUsageSchema.optional(),
  latencyMs: z.number().int().nonnegative(),
  provider: z.string(),
  model: z.string(),
});
export type AiGenerateResponse = z.infer<typeof AiGenerateResponseSchema>;

// -----------------------------------------------------------------------------
// Convenience: re-export RemixMode/Tone for callers that import from here.
// -----------------------------------------------------------------------------

export { RemixModeSchema, ToneSchema };

import { z } from "zod";

import { DraftProjectionSchema } from "./draft.contract";
import { RemixModeSchema, ToneSchema } from "./shared";

/**
 * Wire shapes for `POST /api/remix/[postId]`.
 *
 * The endpoint composes ai.service.generate(REMIX, mode) +
 * remix.service.createRemixDraft + moderation.service.check(AI_OUTPUT)
 * and returns the new Draft + the AI-output safety verdict inline (so
 * the editor can render the rejection state without a follow-up fetch).
 *
 * Note: response status is 201 in BOTH the ALLOW and REJECT cases,
 * because the *draft* was created in either case — only the AI's
 * proposed content is flagged. This matches FR-009 ("rejection MUST
 * preserve the user's draft").
 */

export const RemixInitRequestSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("REWRITE") }),
  z.object({ mode: z.literal("CONTINUE") }),
  z.object({ mode: z.literal("SUMMARIZE") }),
  z.object({ mode: z.literal("CHANGE_TONE"), targetTone: ToneSchema }),
]);
export type RemixInitRequest = z.infer<typeof RemixInitRequestSchema>;

export const RemixSafetyVerdictSchema = z.discriminatedUnion("verdict", [
  z.object({ verdict: z.literal("ALLOW") }),
  z.object({
    verdict: z.literal("REJECT"),
    categories: z.array(z.string()),
    reason: z.string(),
  }),
]);
export type RemixSafetyVerdict = z.infer<typeof RemixSafetyVerdictSchema>;

export const RemixInitResponseSchema = z.object({
  draft: DraftProjectionSchema,
  aiOutputSafetyCheck: RemixSafetyVerdictSchema,
});
export type RemixInitResponse = z.infer<typeof RemixInitResponseSchema>;

// Re-export for convenience
export { RemixModeSchema };

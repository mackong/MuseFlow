import { z } from "zod";

import { AttributionProjectionSchema, BodySchema, TitleSchema } from "./post.contract";
import { CursorSchema, IdSchema, IsoDateSchema, ToneSchema } from "./shared";

/**
 * Draft wire shapes. RN-compatible (zod + shared primitives + post-contract
 * projections, all server-agnostic).
 *
 * Drafts are private-by-default — these schemas only describe the projection
 * an authenticated owner sees. There is no public DraftProjection.
 */

// -----------------------------------------------------------------------------
// Last-safety-check projection inlined on the draft (so the editor can render
// rejection state from a single fetch).
// -----------------------------------------------------------------------------

export const DraftLastSafetyCheckSchema = z
  .discriminatedUnion("verdict", [
    z.object({ verdict: z.literal("ALLOW") }),
    z.object({
      verdict: z.literal("REJECT"),
      categories: z.array(z.string()),
      reason: z.string(),
    }),
  ])
  .nullable();
export type DraftLastSafetyCheck = z.infer<typeof DraftLastSafetyCheckSchema>;

// -----------------------------------------------------------------------------
// DraftProjection — what /api/drafts/[id] returns.
// -----------------------------------------------------------------------------

export const DraftProjectionSchema = z.object({
  id: IdSchema,
  title: z.string().nullable(),
  body: z.string().nullable(),
  tone: ToneSchema.nullable(),
  attribution: AttributionProjectionSchema.nullable(),
  lastSafetyCheck: DraftLastSafetyCheckSchema,
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export type DraftProjection = z.infer<typeof DraftProjectionSchema>;

// -----------------------------------------------------------------------------
// Request bodies.
// -----------------------------------------------------------------------------

/**
 * POST /api/drafts — create an original-content draft. The remix-draft path
 * goes through POST /api/remix/[postId] (US4); that endpoint fans out to
 * draft.service.createRemixDraft and is NOT exposed here.
 */
export const DraftCreateSchema = z.object({
  kind: z.literal("ORIGINAL"),
  tone: ToneSchema.optional(),
});
export type DraftCreate = z.infer<typeof DraftCreateSchema>;

/**
 * PATCH /api/drafts/[id] — partial edit. All fields optional but at least
 * one MUST be present. attribution / remixMode are immutable on a draft;
 * the service refuses to mutate them after creation.
 *
 * Note: title and body allow EMPTY strings during in-progress drafting —
 * different from PostProjection's TitleSchema/BodySchema which require
 * non-empty content for publication.
 */
export const DraftPatchSchema = z
  .object({
    title: z.string().max(120).optional(),
    body: z.string().max(8000).optional(),
    tone: ToneSchema.optional(),
  })
  .refine((d) => d.title !== undefined || d.body !== undefined || d.tone !== undefined, {
    message: "Provide at least one of: title, body, tone",
  });
export type DraftPatch = z.infer<typeof DraftPatchSchema>;

// -----------------------------------------------------------------------------
// List query (GET /api/drafts).
// -----------------------------------------------------------------------------

export const DraftListQuerySchema = z.object({
  cursor: CursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type DraftListQuery = z.infer<typeof DraftListQuerySchema>;

// -----------------------------------------------------------------------------
// Response shapes.
// -----------------------------------------------------------------------------

export const DraftResponseSchema = z.object({ draft: DraftProjectionSchema });
export type DraftResponse = z.infer<typeof DraftResponseSchema>;

export const DraftListResponseSchema = z.object({
  drafts: z.array(DraftProjectionSchema),
  nextCursor: z.string().nullable(),
});
export type DraftListResponse = z.infer<typeof DraftListResponseSchema>;

// -----------------------------------------------------------------------------
// Re-export bounds for routes that share the publish-time strict schemas.
// -----------------------------------------------------------------------------

export { TitleSchema, BodySchema };

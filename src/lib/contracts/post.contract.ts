import { z } from "zod";

import {
  AuthorProjectionSchema,
  IdSchema,
  IsoDateSchema,
  PostStatusSchema,
  RemixModeSchema,
  ToneSchema,
} from "./shared";

/**
 * Post & Draft wire shapes (RN-compatible: zod + shared primitives only).
 *
 * Source-of-truth for the persisted shape is `prisma/schema.prisma` and
 * `data-model.md`. These projections are what crosses the API boundary —
 * they intentionally drop server-only fields (createdAt/updatedAt on Post,
 * raw author rows, etc.) and add per-viewer state where applicable.
 */

// -----------------------------------------------------------------------------
// Field bounds (matched to Prisma column constraints)
// -----------------------------------------------------------------------------

export const TitleSchema = z.string().trim().min(1).max(120);
export const BodySchema = z.string().trim().min(1).max(8000);

// -----------------------------------------------------------------------------
// Attribution — non-null on remixes; parent may be null when the source post
// has been removed (snapshot persists per Constitution Principle V).
// -----------------------------------------------------------------------------

export const AttributionParentSchema = z
  .object({
    id: IdSchema,
    title: z.string(),
    author: AuthorProjectionSchema,
  })
  .nullable();

export const AttributionParentSnapshotSchema = z.object({
  id: IdSchema,
  displayName: z.string().min(2).max(40),
});

export const AttributionProjectionSchema = z.object({
  parent: AttributionParentSchema,
  parentAuthorSnapshot: AttributionParentSnapshotSchema,
  remixMode: RemixModeSchema,
});
export type AttributionProjection = z.infer<typeof AttributionProjectionSchema>;

// -----------------------------------------------------------------------------
// Per-viewer state (omitted entirely for anonymous viewers).
// -----------------------------------------------------------------------------

export const ViewerStateSchema = z.object({
  liked: z.boolean(),
  saved: z.boolean(),
});
export type ViewerState = z.infer<typeof ViewerStateSchema>;

// -----------------------------------------------------------------------------
// Post — full detail (used on /post/[id]). The feed card variant lives in
// feed.contract.ts and trims body to a preview.
// -----------------------------------------------------------------------------

export const PostProjectionSchema = z.object({
  id: IdSchema,
  author: AuthorProjectionSchema.nullable(),
  title: z.string(),
  body: z.string(),
  tone: ToneSchema,
  status: PostStatusSchema,
  publishedAt: IsoDateSchema,
  editedAt: IsoDateSchema.nullable(),
  attribution: AttributionProjectionSchema.nullable(),
  likeCount: z.number().int().nonnegative(),
  commentCount: z.number().int().nonnegative(),
  remixCount: z.number().int().nonnegative(),
  viewer: ViewerStateSchema.optional(),
});
export type PostProjection = z.infer<typeof PostProjectionSchema>;

// -----------------------------------------------------------------------------
// PATCH /api/posts/[id] — partial edit. Both fields optional but at least
// one MUST be provided. tone and attribution are immutable post-publish.
// -----------------------------------------------------------------------------

export const PostPatchSchema = z
  .object({
    title: TitleSchema.optional(),
    body: BodySchema.optional(),
  })
  .refine((d) => d.title !== undefined || d.body !== undefined, {
    message: "Provide at least one of: title, body",
  });
export type PostPatch = z.infer<typeof PostPatchSchema>;

// -----------------------------------------------------------------------------
// Response shapes used by routes.
// -----------------------------------------------------------------------------

export const PostResponseSchema = z.object({ post: PostProjectionSchema });
export type PostResponse = z.infer<typeof PostResponseSchema>;

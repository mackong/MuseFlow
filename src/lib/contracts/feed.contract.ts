import { z } from "zod";

import { AttributionProjectionSchema, ViewerStateSchema } from "./post.contract";
import {
  AuthorProjectionSchema,
  CursorSchema,
  IdSchema,
  IsoDateSchema,
  ToneSchema,
} from "./shared";

/**
 * GET /api/feed wire shapes (RN-compatible — zod + shared primitives only).
 *
 * The feed card is intentionally a slimmer projection than PostProjection:
 * - body is replaced by bodyPreview (server-truncated; see feed.service)
 * - status is omitted (only PUBLISHED ever appears here)
 * - editedAt is omitted (not relevant to discovery surface)
 *
 * Anonymous viewers receive `viewer` omitted on every card.
 */

export const FeedCardProjectionSchema = z.object({
  id: IdSchema,
  author: AuthorProjectionSchema.nullable(),
  title: z.string(),
  bodyPreview: z.string(),
  tone: ToneSchema,
  publishedAt: IsoDateSchema,
  isRemix: z.boolean(),
  attribution: AttributionProjectionSchema.nullable(),
  likeCount: z.number().int().nonnegative(),
  commentCount: z.number().int().nonnegative(),
  remixCount: z.number().int().nonnegative(),
  viewer: ViewerStateSchema.optional(),
});
export type FeedCardProjection = z.infer<typeof FeedCardProjectionSchema>;

export const FeedQuerySchema = z.object({
  cursor: CursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type FeedQuery = z.infer<typeof FeedQuerySchema>;

export const FeedResponseSchema = z.object({
  items: z.array(FeedCardProjectionSchema),
  nextCursor: z.string().nullable(),
});
export type FeedResponse = z.infer<typeof FeedResponseSchema>;

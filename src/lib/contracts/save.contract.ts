import { z } from "zod";

import { FeedCardProjectionSchema } from "./feed.contract";
import { CursorSchema, IsoDateSchema } from "./shared";

/**
 * Wire shapes for the saves endpoints.
 *
 * Saves are private — there is intentionally no public counter on Post
 * and the list endpoint requires authentication; cross-user saved lists
 * are not exposed anywhere (Constitution Principle VII).
 */

export const SaveToggleResponseSchema = z.object({
  saved: z.boolean(),
});
export type SaveToggleResponse = z.infer<typeof SaveToggleResponseSchema>;

export const SaveListItemSchema = z.object({
  savedAt: IsoDateSchema,
  post: FeedCardProjectionSchema,
});
export type SaveListItem = z.infer<typeof SaveListItemSchema>;

export const SaveListQuerySchema = z.object({
  cursor: CursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type SaveListQuery = z.infer<typeof SaveListQuerySchema>;

export const SaveListResponseSchema = z.object({
  saves: z.array(SaveListItemSchema),
  nextCursor: z.string().nullable(),
});
export type SaveListResponse = z.infer<typeof SaveListResponseSchema>;

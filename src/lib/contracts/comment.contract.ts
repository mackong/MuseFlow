import { z } from "zod";

import { AuthorProjectionSchema, CursorSchema, IdSchema, IsoDateSchema } from "./shared";

/**
 * Wire shapes for the comments endpoints.
 *
 * Comments are flat (single-level, no threading) per the spec. Every
 * comment has a body length 1..1000; the server runs a moderation check
 * on create and on edit before persisting, returning HTTP 422
 * `safety_rejected` when the verdict is REJECT.
 */

export const CommentBodySchema = z.string().trim().min(1).max(1000);

export const CommentViewerStateSchema = z.object({
  isAuthor: z.boolean(),
});

export const CommentProjectionSchema = z.object({
  id: IdSchema,
  postId: IdSchema,
  author: AuthorProjectionSchema.nullable(),
  body: z.string(),
  createdAt: IsoDateSchema,
  viewer: CommentViewerStateSchema.optional(),
});
export type CommentProjection = z.infer<typeof CommentProjectionSchema>;

export const CommentCreateSchema = z.object({
  postId: IdSchema,
  body: CommentBodySchema,
});
export type CommentCreate = z.infer<typeof CommentCreateSchema>;

export const CommentCreateResponseSchema = z.object({
  comment: CommentProjectionSchema,
});
export type CommentCreateResponse = z.infer<typeof CommentCreateResponseSchema>;

export const CommentListQuerySchema = z.object({
  cursor: CursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type CommentListQuery = z.infer<typeof CommentListQuerySchema>;

export const CommentListResponseSchema = z.object({
  comments: z.array(CommentProjectionSchema),
  nextCursor: z.string().nullable(),
});
export type CommentListResponse = z.infer<typeof CommentListResponseSchema>;

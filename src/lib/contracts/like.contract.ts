import { z } from "zod";

/**
 * Wire shapes for `POST /api/likes/[postId]`.
 *
 * The endpoint is a toggle — request body is empty `{}` and response
 * carries the post-toggle state (liked / likeCount) so the client can
 * skip an extra fetch.
 */

export const LikeToggleResponseSchema = z.object({
  liked: z.boolean(),
  likeCount: z.number().int().nonnegative(),
});
export type LikeToggleResponse = z.infer<typeof LikeToggleResponseSchema>;

import { z } from "zod";

import { IdSchema, IsoDateSchema } from "./shared";

/**
 * Wire shapes for the profile endpoints (US5).
 *
 * Constitution Principle VII (Privacy & Data Control):
 *  - The OWN profile shell exposes the requester's email + private
 *    counts (drafts, saved). It is reachable only at GET /api/me with
 *    the authenticated session.
 *  - The PUBLIC profile shell at GET /api/profile/[username] NEVER
 *    includes email, drafts count, or saved count — only public
 *    fields and publishedPosts count.
 */

// -----------------------------------------------------------------------------
// Field bounds (re-used by PATCH /api/me)
// -----------------------------------------------------------------------------

export const DisplayNameSchema = z.string().trim().min(2).max(40);
export const UsernameSchema = z
  .string()
  .trim()
  .min(2)
  .max(30)
  .regex(/^[a-z0-9_-]+$/, "username may only contain a-z, 0-9, _ and -");
export const ProfileDescriptionSchema = z.string().max(240).nullable();
export const ProfileImageSchema = z.string().url().nullable();

// -----------------------------------------------------------------------------
// Own shell — what GET /api/me returns
// -----------------------------------------------------------------------------

export const OwnProfileShellSchema = z.object({
  user: z.object({
    id: IdSchema,
    username: z.string(),
    displayName: z.string(),
    description: z.string().nullable(),
    image: z.string().nullable(),
    email: z.string(),
    createdAt: IsoDateSchema,
  }),
  counts: z.object({
    publishedPosts: z.number().int().nonnegative(),
    drafts: z.number().int().nonnegative(),
    saved: z.number().int().nonnegative(),
    authoredRemixes: z.number().int().nonnegative(),
  }),
});
export type OwnProfileShell = z.infer<typeof OwnProfileShellSchema>;

// -----------------------------------------------------------------------------
// Public shell — what GET /api/profile/[username] returns
// -----------------------------------------------------------------------------

export const PublicProfileShellSchema = z.object({
  user: z.object({
    id: IdSchema,
    username: z.string(),
    displayName: z.string(),
    description: z.string().nullable(),
    image: z.string().nullable(),
    createdAt: IsoDateSchema,
    // intentionally NO email here, even when the requester is the same user
  }),
  counts: z.object({
    publishedPosts: z.number().int().nonnegative(),
  }),
});
export type PublicProfileShell = z.infer<typeof PublicProfileShellSchema>;

// -----------------------------------------------------------------------------
// PATCH /api/me — partial profile update
// -----------------------------------------------------------------------------

export const ProfilePatchSchema = z
  .object({
    displayName: DisplayNameSchema.optional(),
    username: UsernameSchema.optional(),
    description: ProfileDescriptionSchema.optional(),
    image: ProfileImageSchema.optional(),
  })
  .refine(
    (d) =>
      d.displayName !== undefined ||
      d.username !== undefined ||
      d.description !== undefined ||
      d.image !== undefined,
    { message: "Provide at least one of: displayName, username, description, image" },
  );
export type ProfilePatch = z.infer<typeof ProfilePatchSchema>;

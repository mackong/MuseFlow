import { z } from "zod";

/**
 * Shared, framework-agnostic Zod primitives used across all API contracts.
 *
 * Constitution Principle IX: this file imports only `zod`. It MUST stay free
 * of Next.js, Prisma, or any server-only API so a future Expo / React Native
 * client can `import` it untouched.
 */

// -----------------------------------------------------------------------------
// IDs and timestamps
// -----------------------------------------------------------------------------

/** A cuid-shaped string. Length range catches both cuid v1 (~25) and v2 (24..32). */
export const IdSchema = z.string().min(20).max(40);

/** ISO 8601 timestamp string (e.g. "2026-04-25T14:32:00.000Z"). */
export const IsoDateSchema = z.string().datetime({ offset: true });

// -----------------------------------------------------------------------------
// Pagination
// -----------------------------------------------------------------------------

/** Opaque cursor; clients MUST treat as a black box. Server controls encoding. */
export const CursorSchema = z.string().min(1).max(200);

/** Page size, clamped 1..50 with default 20 (per contracts/feed.contract.md). */
export const LimitSchema = z.coerce.number().int().min(1).max(50).default(20);

export const PaginationQuerySchema = z.object({
  cursor: CursorSchema.optional(),
  limit: LimitSchema.optional(),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

// -----------------------------------------------------------------------------
// Enums (kept in sync with prisma/schema.prisma — single source of truth is
// the Prisma client's generated types; these mirror them at the wire level so
// non-Prisma clients can validate without depending on @prisma/client).
// -----------------------------------------------------------------------------

export const ToneSchema = z.enum(["INSPIRING", "ANALYTICAL", "PLAYFUL", "POETIC", "PROFESSIONAL"]);
export type Tone = z.infer<typeof ToneSchema>;

export const RemixModeSchema = z.enum(["REWRITE", "CONTINUE", "SUMMARIZE", "CHANGE_TONE"]);
export type RemixMode = z.infer<typeof RemixModeSchema>;

export const PostStatusSchema = z.enum(["PUBLISHED", "REMOVED"]);
export type PostStatus = z.infer<typeof PostStatusSchema>;

// -----------------------------------------------------------------------------
// Author projection — used everywhere a user is rendered to other users.
// NEVER includes email or any other private field.
// -----------------------------------------------------------------------------

export const AuthorProjectionSchema = z.object({
  id: IdSchema,
  username: z.string().min(2).max(30),
  displayName: z.string().min(2).max(40),
  image: z.string().url().nullable(),
});
export type AuthorProjection = z.infer<typeof AuthorProjectionSchema>;

// -----------------------------------------------------------------------------
// Error envelope (matches contracts/README.md Errors section)
// -----------------------------------------------------------------------------

export const ErrorCodeSchema = z.enum([
  "unauthenticated",
  "forbidden",
  "not_found",
  "validation_failed",
  "safety_rejected",
  "rate_limited",
  "ai_provider_error",
  "conflict",
  "internal_error",
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

// -----------------------------------------------------------------------------
// NOTE: cursor encoding/decoding lives in `src/server/services/` (server-only)
// because it uses Node Buffer. Clients MUST treat cursor strings as opaque.
// -----------------------------------------------------------------------------

import type { Draft, Post, SafetyCheck, User } from "@prisma/client";

import type {
  AttributionProjection,
  PostProjection,
  ViewerState,
} from "@/lib/contracts/post.contract";
import type { DraftLastSafetyCheck, DraftProjection } from "@/lib/contracts/draft.contract";
import type { AuthorProjection } from "@/lib/contracts/shared";

/**
 * DB-row → wire-projection helpers. Keeping these in one place ensures every
 * service hands clients the same shape and that nothing private (email,
 * sign-in metadata, raw safety-check ids) ever leaks into a projection.
 */

// -----------------------------------------------------------------------------
// Author
// -----------------------------------------------------------------------------

/**
 * Build an AuthorProjection from a User row OR null if the user has been
 * deleted (FK SET NULL preserves remix attribution per Principle V).
 *
 * displayName/username can be null transiently right after Auth.js
 * createUser fires, before our events.createUser hook completes. Treat that
 * as null author for projection purposes — we never expose an incomplete
 * identity.
 */
export function authorProjection(
  user: Pick<User, "id" | "username" | "displayName" | "image"> | null,
): AuthorProjection | null {
  if (!user || !user.username || !user.displayName) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    image: user.image ?? null,
  };
}

// -----------------------------------------------------------------------------
// Attribution (used on both Post and Draft when parentId is set)
// -----------------------------------------------------------------------------

interface RawAttributionInput {
  parentId: string | null;
  parentAuthorSnapshot: unknown; // Prisma `Json?` — JsonValue at runtime
  remixMode: Post["remixMode"] | Draft["remixMode"];
  /**
   * Live parent post. Pass null whenever:
   *   - the parent post no longer exists, OR
   *   - the parent's author has been deleted (incomplete identity).
   * The snapshot in `parentAuthorSnapshot` carries attribution in those cases.
   */
  parent: {
    id: string;
    title: string;
    author: AuthorProjection;
  } | null;
}

export function attributionProjection(input: RawAttributionInput): AttributionProjection | null {
  if (!input.parentId || !input.remixMode) return null;
  const snapshot = input.parentAuthorSnapshot as { id: string; displayName: string } | null;
  if (!snapshot) return null;
  return {
    parent: input.parent,
    parentAuthorSnapshot: snapshot,
    remixMode: input.remixMode,
  };
}

// -----------------------------------------------------------------------------
// Post detail
// -----------------------------------------------------------------------------

export interface PostProjectionInput {
  post: Pick<
    Post,
    | "id"
    | "title"
    | "body"
    | "tone"
    | "status"
    | "publishedAt"
    | "editedAt"
    | "parentId"
    | "parentAuthorSnapshot"
    | "remixMode"
    | "likeCount"
    | "commentCount"
    | "remixCount"
  >;
  author: AuthorProjection | null;
  parent: RawAttributionInput["parent"];
  /** Per-viewer state; pass undefined for anonymous viewers to omit it. */
  viewer: ViewerState | undefined;
}

export function postProjection(input: PostProjectionInput): PostProjection {
  const { post, author, parent, viewer } = input;
  const projection: PostProjection = {
    id: post.id,
    author,
    title: post.title,
    body: post.body,
    tone: post.tone,
    status: post.status,
    publishedAt: (post.publishedAt ?? new Date()).toISOString(),
    editedAt: post.editedAt ? post.editedAt.toISOString() : null,
    attribution: attributionProjection({
      parentId: post.parentId,
      parentAuthorSnapshot: post.parentAuthorSnapshot,
      remixMode: post.remixMode,
      parent,
    }),
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    remixCount: post.remixCount,
  };
  if (viewer !== undefined) projection.viewer = viewer;
  return projection;
}

// -----------------------------------------------------------------------------
// Draft
// -----------------------------------------------------------------------------

export interface DraftProjectionInput {
  draft: Pick<
    Draft,
    | "id"
    | "title"
    | "body"
    | "tone"
    | "parentId"
    | "parentAuthorSnapshot"
    | "remixMode"
    | "createdAt"
    | "updatedAt"
  >;
  parent: RawAttributionInput["parent"];
  lastSafetyCheck: Pick<SafetyCheck, "verdict" | "categories" | "reason"> | null;
}

export function draftProjection(input: DraftProjectionInput): DraftProjection {
  const { draft, parent, lastSafetyCheck } = input;
  const safety: DraftLastSafetyCheck =
    lastSafetyCheck === null
      ? null
      : lastSafetyCheck.verdict === "ALLOW"
        ? { verdict: "ALLOW" }
        : {
            verdict: "REJECT",
            categories: [...lastSafetyCheck.categories],
            reason: lastSafetyCheck.reason ?? "Content flagged by safety moderation",
          };

  return {
    id: draft.id,
    title: draft.title,
    body: draft.body,
    tone: draft.tone,
    attribution: attributionProjection({
      parentId: draft.parentId,
      parentAuthorSnapshot: draft.parentAuthorSnapshot,
      remixMode: draft.remixMode,
      parent,
    }),
    lastSafetyCheck: safety,
    createdAt: (draft.createdAt ?? new Date()).toISOString(),
    updatedAt: (draft.updatedAt ?? new Date()).toISOString(),
  };
}

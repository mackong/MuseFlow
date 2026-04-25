import type { Draft, Tone } from "@prisma/client";

import { prisma } from "@/server/db/prisma";
import { NotFoundError, ValidationError } from "@/server/errors";
import type { DraftProjection } from "@/lib/contracts/draft.contract";

import { authorProjection, draftProjection } from "./projections";

type DraftRow = Pick<
  Draft,
  | "id"
  | "authorId"
  | "title"
  | "body"
  | "tone"
  | "parentId"
  | "parentAuthorSnapshot"
  | "remixMode"
  | "lastSafetyCheckId"
  | "createdAt"
  | "updatedAt"
>;

/**
 * Draft service.
 *
 * Drafts are author-private (Constitution Principle VII). Every read MUST be
 * scoped by `authorId == requestingUserId`; cross-author lookups return
 * NotFoundError instead of ForbiddenError to avoid leaking existence (per
 * the contracts/posts.contract.md 404-on-mismatch rule).
 *
 * Attribution fields (parentId, parentAuthorSnapshot, remixMode) are set at
 * draft creation time and are immutable thereafter. Patches that touch them
 * are rejected.
 */

const SELECT_DRAFT = {
  id: true,
  authorId: true,
  title: true,
  body: true,
  tone: true,
  parentId: true,
  parentAuthorSnapshot: true,
  remixMode: true,
  lastSafetyCheckId: true,
  createdAt: true,
  updatedAt: true,
} as const;

// -----------------------------------------------------------------------------
// Create — original-content draft (remix-draft creation lives in remix.service)
// -----------------------------------------------------------------------------

export interface CreateOriginalDraftInput {
  authorId: string;
  tone?: Tone;
}

export async function createOriginalDraft(
  input: CreateOriginalDraftInput,
): Promise<DraftProjection> {
  const draft = await prisma.draft.create({
    data: {
      authorId: input.authorId,
      tone: input.tone ?? null,
    },
    select: SELECT_DRAFT,
  });
  return await projectDraft(draft);
}

// -----------------------------------------------------------------------------
// Read — single
// -----------------------------------------------------------------------------

export async function getOwnDraft(userId: string, draftId: string): Promise<DraftProjection> {
  const draft = await prisma.draft.findFirst({
    where: { id: draftId, authorId: userId },
    select: SELECT_DRAFT,
  });
  if (!draft) throw new NotFoundError("Draft not found");
  return await projectDraft(draft);
}

// -----------------------------------------------------------------------------
// Read — list (own, newest-first by updatedAt)
// -----------------------------------------------------------------------------

export interface ListOwnDraftsInput {
  userId: string;
  limit: number;
  cursor?: string;
}

export interface ListOwnDraftsResult {
  drafts: DraftProjection[];
  nextCursor: string | null;
}

export async function listOwnDrafts(input: ListOwnDraftsInput): Promise<ListOwnDraftsResult> {
  const cursorPayload = input.cursor ? decodeUpdatedAtCursor(input.cursor) : null;

  const rows = await prisma.draft.findMany({
    where: {
      authorId: input.userId,
      ...(cursorPayload
        ? {
            OR: [
              { updatedAt: { lt: cursorPayload.updatedAt } },
              {
                updatedAt: cursorPayload.updatedAt,
                id: { lt: cursorPayload.id },
              },
            ],
          }
        : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
    select: SELECT_DRAFT,
  });

  const hasMore = rows.length > input.limit;
  const page = hasMore ? rows.slice(0, input.limit) : rows;
  const drafts = await Promise.all(page.map(projectDraft));
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last ? encodeUpdatedAtCursor({ updatedAt: last.updatedAt, id: last.id }) : null;
  return { drafts, nextCursor };
}

// -----------------------------------------------------------------------------
// Update — patch only mutable fields. Attribution is locked.
// -----------------------------------------------------------------------------

export interface PatchDraftInput {
  userId: string;
  draftId: string;
  patch: { title?: string; body?: string; tone?: Tone };
}

export async function patchOwnDraft(input: PatchDraftInput): Promise<DraftProjection> {
  const { userId, draftId, patch } = input;
  if (patch.title === undefined && patch.body === undefined && patch.tone === undefined) {
    throw new ValidationError("Provide at least one of: title, body, tone");
  }

  // updateMany returns count; we use it to enforce ownership in the same
  // statement (no separate check + race window).
  const updated = await prisma.draft.updateMany({
    where: { id: draftId, authorId: userId },
    data: {
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.tone !== undefined ? { tone: patch.tone } : {}),
    },
  });
  if (updated.count === 0) throw new NotFoundError("Draft not found");

  return getOwnDraft(userId, draftId);
}

// -----------------------------------------------------------------------------
// Delete (discard)
// -----------------------------------------------------------------------------

export async function deleteOwnDraft(userId: string, draftId: string): Promise<void> {
  const result = await prisma.draft.deleteMany({
    where: { id: draftId, authorId: userId },
  });
  if (result.count === 0) throw new NotFoundError("Draft not found");
}

// =============================================================================
// Internals
// =============================================================================

async function projectDraft(draft: DraftRow): Promise<DraftProjection> {
  // Resolve parent post for attribution + last safety check, in parallel.
  const [parentPost, lastSafety] = await Promise.all([
    draft.parentId
      ? prisma.post.findFirst({
          where: { id: draft.parentId, status: "PUBLISHED" },
          select: {
            id: true,
            title: true,
            author: {
              select: { id: true, username: true, displayName: true, image: true },
            },
          },
        })
      : Promise.resolve(null),
    draft.lastSafetyCheckId
      ? prisma.safetyCheck.findUnique({
          where: { id: draft.lastSafetyCheckId },
          select: { verdict: true, categories: true, reason: true },
        })
      : Promise.resolve(null),
  ]);

  // Per the contract, parent.author is non-null. When the live author row
  // has been deleted, drop the live parent and let the snapshot field
  // carry attribution.
  const parentAuthor = parentPost ? authorProjection(parentPost.author) : null;
  const parent =
    parentPost && parentAuthor
      ? { id: parentPost.id, title: parentPost.title, author: parentAuthor }
      : null;

  return draftProjection({
    draft,
    parent,
    lastSafetyCheck: lastSafety,
  });
}

interface UpdatedAtCursorPayload {
  updatedAt: Date;
  id: string;
}

function encodeUpdatedAtCursor(p: UpdatedAtCursorPayload): string {
  // Defensive `?? new Date()` for prismock unit tests where @updatedAt
  // isn't auto-applied. Production Prisma always populates updatedAt.
  const u = (p.updatedAt ?? new Date()).toISOString();
  return Buffer.from(JSON.stringify({ u, id: p.id }), "utf8").toString("base64url");
}

function decodeUpdatedAtCursor(cursor: string): UpdatedAtCursorPayload | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(raw);
    if (
      typeof parsed.u === "string" &&
      typeof parsed.id === "string" &&
      !Number.isNaN(Date.parse(parsed.u))
    ) {
      return { updatedAt: new Date(parsed.u), id: parsed.id };
    }
    return null;
  } catch {
    return null;
  }
}

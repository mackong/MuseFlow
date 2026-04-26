import type { Prisma, RemixMode } from "@prisma/client";

import { prisma } from "@/server/db/prisma";
import { NotFoundError, ValidationError } from "@/server/errors";
import type { DraftProjection } from "@/lib/contracts/draft.contract";
import type { Tone } from "@/lib/contracts/shared";

import { generate } from "./ai/ai.service";
import { authorProjection, draftProjection } from "./projections";

/**
 * Remix service.
 *
 * Constitution Principle V (Remix and Attribution):
 *  - parentId + parentAuthorSnapshot are set at draft-creation time and
 *    are immutable thereafter. The snapshot is what survives if the
 *    parent post or parent author is later deleted.
 *  - Attribution metadata persists through editing AND publication
 *    (publish service does NOT mutate parentId / parentAuthorSnapshot).
 *
 * Pipeline:
 *  1. Fetch source post (PUBLISHED only). Refuse remix on REMOVED posts.
 *  2. Validate mode-specific args (CHANGE_TONE requires targetTone).
 *  3. Call ai.service.generate({ surface: "REMIX", mode, source, ... }).
 *     - Throws RateLimitedError → 429 (caller's route handler maps via
 *       toHttpResponse — no draft created on rate-limit).
 *     - Throws AIProviderError → 502 (no draft created on provider
 *       failure — atomic).
 *     - Returns { output: null, safety.verdict="REJECT", … } when the
 *       AI output is flagged. We DO create a draft in this case (per
 *       contract: 201 with REJECT verdict), with empty title/body and
 *       lastSafetyCheck linked.
 *  4. Persist the Draft with snapshot, lastGenerationId, lastSafetyCheckId.
 */

export type RemixModeInput = "REWRITE" | "CONTINUE" | "SUMMARIZE" | "CHANGE_TONE";

export interface CreateRemixDraftInput {
  userId: string;
  sourcePostId: string;
  mode: RemixModeInput;
  /** Required when mode === "CHANGE_TONE"; ignored otherwise. */
  targetTone?: Tone;
}

export interface CreateRemixDraftResult {
  draft: DraftProjection;
  aiOutputSafetyCheck:
    | { verdict: "ALLOW" }
    | { verdict: "REJECT"; categories: string[]; reason: string };
}

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

export async function createRemixDraft(
  input: CreateRemixDraftInput,
): Promise<CreateRemixDraftResult> {
  if (input.mode === "CHANGE_TONE" && !input.targetTone) {
    throw new ValidationError("CHANGE_TONE requires a targetTone");
  }

  // Step 1 — load the source. Must be PUBLISHED; REMOVED posts can't be
  // remixed (the snapshot doesn't apply forward, only backward via
  // attribution preservation on existing remixes).
  const source = await prisma.post.findFirst({
    where: { id: input.sourcePostId, status: "PUBLISHED" },
    select: {
      id: true,
      title: true,
      body: true,
      authorId: true,
      author: {
        select: { id: true, username: true, displayName: true, image: true },
      },
    },
  });
  if (!source) throw new NotFoundError("Source post not found");

  // Step 2 — build the AI request shape per mode.
  const aiRequest =
    input.mode === "CHANGE_TONE"
      ? {
          mode: "CHANGE_TONE" as const,
          source: { title: source.title, body: source.body },
          targetTone: input.targetTone!,
        }
      : {
          mode: input.mode,
          source: { title: source.title, body: source.body },
        };

  // Step 3 — generate. ai.service throws RateLimitedError / AIProviderError;
  // both propagate cleanly so no draft is created on those failure paths.
  const ai = await generate({
    userId: input.userId,
    surface: "REMIX",
    request: aiRequest,
    parentPostId: source.id,
  });

  // Step 4 — persist the draft. parentAuthorSnapshot captures the
  // author's identity AT REMIX TIME so it survives later deletion.
  // Use the live author when available; fall back to a placeholder if
  // the parent's author has somehow already been removed.
  const liveAuthor = authorProjection(source.author);
  const snapshotDisplayName = liveAuthor?.displayName ?? "Removed user";
  const snapshot: { id: string; displayName: string } = {
    id: source.authorId ?? "",
    displayName: snapshotDisplayName,
  };

  const remixMode = input.mode as RemixMode;
  const draftRow = await prisma.draft.create({
    data: {
      authorId: input.userId,
      // Pre-fill from AI output when ALLOW; leave null on REJECT so the
      // user starts from a blank slate but with the parent attribution
      // and the rejection record on the draft.
      title: ai.output?.title ?? null,
      body: ai.output?.body ?? null,
      tone: input.mode === "CHANGE_TONE" ? (input.targetTone ?? null) : null,
      parentId: source.id,
      parentAuthorSnapshot: snapshot as Prisma.InputJsonValue,
      remixMode,
      lastGenerationId: ai.generationId,
      lastSafetyCheckId: ai.safetyCheckId,
    },
    select: SELECT_DRAFT,
  });

  // Project the draft. The parent must show as live (it's just been
  // verified PUBLISHED above) so the AttributionBadge renders the
  // clickable parent variant.
  const parent = liveAuthor ? { id: source.id, title: source.title, author: liveAuthor } : null;
  const lastSafety = ai.safetyCheckId
    ? await prisma.safetyCheck.findUnique({
        where: { id: ai.safetyCheckId },
        select: { verdict: true, categories: true, reason: true },
      })
    : null;

  const projected = draftProjection({
    draft: draftRow,
    parent,
    lastSafetyCheck: lastSafety,
  });

  return {
    draft: projected,
    aiOutputSafetyCheck: ai.safety,
  };
}

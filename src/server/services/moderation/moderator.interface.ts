/**
 * Moderation provider abstraction. Constitution Principle VI requires every
 * AI output and every public-transition (publish, edit-publish, comment
 * create) to pass a safety check before being persisted as public state.
 *
 * The check itself is provider-agnostic. Swapping in Perspective API, an
 * in-house classifier, or a layered approach is a single new adapter file.
 */

/**
 * Canonical category set across providers.
 *
 * Providers that don't expose every category are allowed — they simply never
 * report the missing ones. We DO NOT silently remap categories across
 * providers (e.g. "toxic" → "harassment") because the user-facing reason
 * would be misleading.
 */
export type SafetyCategory =
  | "hate"
  | "hate/threatening"
  | "harassment"
  | "harassment/threatening"
  | "self-harm"
  | "sexual"
  | "sexual/minors"
  | "violence"
  | "violence/graphic";

export type ModerationSurface = "AI_OUTPUT" | "POST_PUBLISH" | "COMMENT_CREATE";

export interface ModerationRequest {
  text: string;
  surface: ModerationSurface;
}

export interface ModerationResult {
  verdict: "ALLOW" | "REJECT";
  /** Empty when ALLOW. Sorted alphabetically when REJECT for stable display. */
  categories: SafetyCategory[];
  /** Human-readable summary shown to the user. Non-null and non-empty when REJECT. */
  reason: string | null;
  rawProvider: string;
  latencyMs: number;
}

export interface Moderator {
  readonly name: string;
  /**
   * Run a moderation check.
   *
   * Implementations MUST:
   *   - NOT throw on REJECT — they return `{ verdict: "REJECT", ... }`.
   *   - Throw on transport / authentication / quota errors. The caller
   *     (`moderation.service.ts`) decides whether to fail-closed (block the
   *     publish) or surface the error.
   *   - NOT persist rows themselves — that's `moderation.service.ts`'s job.
   */
  check(req: ModerationRequest): Promise<ModerationResult>;
}

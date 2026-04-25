# Moderation Contract (Server-Internal)

There is **no public HTTP endpoint** for moderation. Moderation is a
server-side service called from `ai.service.ts`, `post.service.ts`, and
`comment.service.ts` at the safety gates required by Constitution Principle
VI (Safety by Design). This file documents the server-internal interface so
any future provider (Perspective, in-house classifier, layered approaches)
can plug in without touching feature code.

## `Moderator` interface

```ts
// src/server/services/moderation/moderator.interface.ts
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

export interface ModerationRequest {
  text: string;                     // The full text to evaluate
  surface: "AI_OUTPUT" | "POST_PUBLISH" | "COMMENT_CREATE";
}

export interface ModerationResult {
  verdict: "ALLOW" | "REJECT";
  categories: SafetyCategory[];     // empty when ALLOW
  reason: string | null;            // non-null and human-readable when REJECT
  rawProvider: string;              // "openai", "perspective", ...
  latencyMs: number;
}

export interface Moderator {
  readonly name: string;
  check(req: ModerationRequest): Promise<ModerationResult>;
}
```

## Where it is called

| Call site                                     | Surface          | When |
|-----------------------------------------------|------------------|------|
| `ai.service.ts.generate(...)`                 | `AI_OUTPUT`      | After every successful provider call, before returning to caller |
| `post.service.ts.publishDraft(draftId)`       | `POST_PUBLISH`   | Before inserting the `Post` row, on the user's final edited content |
| `post.service.ts.editPost(postId, patch)`     | `POST_PUBLISH`   | Before applying an edit to a published post |
| `comment.service.ts.create(postId, body)`     | `COMMENT_CREATE` | Before inserting the `Comment` row |

## Behavior on REJECT

| Call site                  | Action |
|----------------------------|--------|
| AI generation              | Service returns successful response with `safety.verdict = REJECT`; no error thrown. UI shows rejection state and offers Regenerate / Edit / Discard. The draft retains the safety-check link (`Draft.lastSafetyCheckId`). |
| Post publish               | Service throws `SafetyRejectedError`; route handler maps to HTTP `422 safety_rejected` with `details.categories` and `details.reason`. The draft is preserved untouched. |
| Post edit                  | Same as Post publish: throws, draft of the proposed edit is NOT stored as a new resource (the user's local form state holds it client-side). |
| Comment create             | Service throws `SafetyRejectedError`; route handler maps to HTTP `422 safety_rejected`. The pending comment text is NOT stored. |

## What MUST be persisted

For every moderation call, exactly one `SafetyCheck` row is recorded with:

- `provider` (e.g. `"openai"`)
- `surface` (the call site)
- `verdict` and `categories`
- `reason` (when REJECT)
- `latencyMs`
- `createdAt`

The raw input text is NOT stored on the SafetyCheck row. Investigative
debugging uses temporary structured logs that are scrubbed and rotated
according to log retention policy (out of scope for this contract).

## Provider swap discipline

To swap providers (e.g., add Perspective):
1. Create `src/server/services/moderation/perspective-moderator.ts`
   implementing `Moderator`.
2. Map provider-native categories to the canonical `SafetyCategory` union.
3. Wire it in `moderation.service.ts` via env-driven selection.
4. No call site changes.

If a provider lacks a category present in our canonical list, the missing
category is simply never reported by that provider — it is not silently
mapped to a different category.

## Rate-limit posture

Moderation calls are NOT user-rate-limited at MVP. They are cheap, run on
every safety transition, and apply to anonymous-to-public boundary checks
where rate-limiting the safety gate would be self-defeating. The provider's
own service-level rate limits are the only constraint.

## Error mapping

| Internal error            | HTTP from outer route handler                    |
|---------------------------|--------------------------------------------------|
| `SafetyRejectedError`     | `422 safety_rejected` with `details`              |
| Provider error / timeout  | `503 internal_error` (we do NOT publish on a failed safety check — failing closed is the correct posture for Principle VI) |

Failing closed means: if the moderation provider is down, publishing is
blocked with a generic "we couldn't verify your post; please try again
shortly" message. This is a deliberate UX cost to preserve the safety
guarantee.

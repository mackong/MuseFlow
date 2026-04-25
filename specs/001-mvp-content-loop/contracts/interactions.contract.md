# Interactions Contract — Likes, Saves, Comments, Remix init

## Likes

### `POST /api/likes/[postId]`

Toggle a like by the current user on a published post. Idempotent under
retry: the operation reflects the user's intent regardless of repeat clicks.

- **Auth**: required.
- **Request body**: `{}` (empty).
- **Response 200**:

  ```ts
  {
    liked: boolean;        // current state after the toggle
    likeCount: number;     // current count after the toggle
  }
  ```

- **Errors**:
  - `unauthenticated`, `not_found` (post does not exist, or is REMOVED).
- **Behavior**:
  - If a `Like(userId, postId)` row does not exist → insert it AND
    `Post.likeCount += 1` (same tx).
  - If it does exist → delete it AND `Post.likeCount -= 1` (same tx).
  - `Post.likeCount` is clamped at the DB layer with a `CHECK >= 0`
    constraint; underflow indicates a bug, not a state to swallow.
  - Insert uses `ON CONFLICT DO NOTHING`; the increment is conditioned on
    affected_rows = 1 to handle concurrent dup retries.

---

## Saves

### `POST /api/saves/[postId]`

Toggle a private save (bookmark) by the current user. Save existence is
private to the user.

- **Auth**: required.
- **Request body**: `{}`.
- **Response 200**: `{ saved: boolean }`
- **Errors**: `unauthenticated`, `not_found`.
- **Behavior**: Same insert/delete idempotency as Likes; no public counter
  is maintained because saves are private.

### `GET /api/saves`

List the authenticated user's saved posts, newest-saved-first. Returns the
post projection plus the `savedAt` timestamp.

- **Auth**: required.
- **Query**: `cursor?`, `limit?`.
- **Response 200**:

  ```ts
  {
    saves: Array<{
      savedAt: string;
      post: PostProjection;     // with viewer.{liked,saved} populated
    }>;
    nextCursor: string | null;
  }
  ```

- **Errors**: `unauthenticated`.
- **Privacy**: This endpoint MUST NOT be reachable for any user other than
  the authenticated requester. There is no `GET /api/users/[id]/saves`.

---

## Comments

### `POST /api/comments`

Create a comment on a published post.

- **Auth**: required.
- **Request body**:

  ```ts
  { postId: string; body: string }   // body length 1..1000
  ```

- **Response 201**: `{ comment: CommentProjection }`
- **Errors**:
  - `unauthenticated`, `not_found` (postId), `validation_failed`
  - `safety_rejected` — moderation flagged the comment body.
- **Side effects**: `Post.commentCount += 1` (same tx). SafetyCheck recorded.

### `GET /api/posts/[id]/comments`

List comments on a post, oldest-first.

- **Auth**: optional.
- **Query**: `cursor?`, `limit?`.
- **Response 200**:

  ```ts
  {
    comments: CommentProjection[];
    nextCursor: string | null;
  }
  ```

- **Errors**: `not_found`.

### `DELETE /api/comments/[id]`

Delete the requester's own comment.

- **Auth**: required, AND `comment.authorId` must equal current user.
- **Response 204**: empty.
- **Errors**: `unauthenticated`, `not_found` (returned instead of 403 to
  avoid existence leaks), `forbidden` is only returned if the route discovers
  the comment exists but the user is not its author — implementations may
  prefer `not_found` for both cases.
- **Side effects**: `Post.commentCount -= 1` (same tx).

### CommentProjection

```ts
interface CommentProjection {
  id: string;
  postId: string;
  author: AuthorProjection | null;   // null if author deleted account
  body: string;
  createdAt: string;
  // Per-viewer state (omitted for anonymous viewers)
  viewer?: { isAuthor: boolean };
}
```

---

## Remix initialization

### `POST /api/remix/[postId]`

Start a remix from a published post. Creates a new draft seeded by an AI
generation in the chosen mode and pre-attributed to the source. The user is
then routed to the draft editor.

This endpoint is the *user-facing* remix entry point. Internally it composes
`ai.service.generate(REMIX, mode)` + `draft.service.createRemixDraft(...)` +
`moderation.service.check(AI_OUTPUT)`.

- **Auth**: required.
- **Request body**:

  ```ts
  {
    mode: "REWRITE" | "CONTINUE" | "SUMMARIZE" | "CHANGE_TONE";
    // Required when mode = "CHANGE_TONE":
    targetTone?: Tone;
  }
  ```

- **Response 201**:

  ```ts
  {
    draft: DraftProjection;          // with attribution populated
    aiOutputSafetyCheck:             // inline so the editor can show rejection state
      | { verdict: "ALLOW" }
      | { verdict: "REJECT"; categories: string[]; reason: string };
  }
  ```

  Note that `verdict: "REJECT"` is returned with `201` because the *draft*
  was created successfully — only the AI output is flagged. The editor
  displays the rejection state and offers "Regenerate" / "Edit and try
  again" / "Discard". This matches FR-009 (rejection MUST preserve the user's
  draft).

- **Errors**:
  - `unauthenticated`, `not_found` (source post)
  - `validation_failed` — mode missing or `CHANGE_TONE` without `targetTone`
  - `rate_limited` — per-user remix quota exceeded;
    `details.retryAfterSeconds`
  - `ai_provider_error` — upstream model call failed; no draft created
- **Side effects**:
  - `Generation` row recorded (surface = REMIX, mode, parentPostId).
  - `Draft` row created with `parentId`, `parentAuthorSnapshot`, `remixMode`.
  - On AI safety reject: draft still created, with `lastSafetyCheck = REJECT`.
  - On AI provider error: NO draft created (atomic).
- **Note**: Original post's `remixCount` is NOT incremented here —
  incrementation happens at *publish* time of the remix
  (`POST /api/drafts/[id]/publish`). This keeps the count semantically
  meaningful as "remixes that exist publicly".

---

## Idempotency notes

All toggle endpoints (likes, saves) tolerate rapid retries because they are
last-write-wins on the user's intended state, computed inside a single
transaction guarded by the composite unique constraint in the DB.

The remix-init endpoint is NOT idempotent: re-issuing it from the client
will produce a second draft with a fresh AI generation. Clients are
responsible for disabling the Remix button during the in-flight call.

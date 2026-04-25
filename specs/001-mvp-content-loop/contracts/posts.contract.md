# Posts & Drafts Contract

Covers the lifecycle of a piece of content from draft creation through
publication, editing, deletion, and the special case of remix drafts.

## Shared shapes

```ts
// Tones (matches data-model.md `Tone` enum)
type Tone = "INSPIRING" | "ANALYTICAL" | "PLAYFUL" | "POETIC" | "PROFESSIONAL";

// Remix modes (matches `RemixMode` enum)
type RemixMode = "REWRITE" | "CONTINUE" | "SUMMARIZE" | "CHANGE_TONE";

// Post status (matches `PostStatus` enum)
type PostStatus = "PUBLISHED" | "REMOVED";

// Author projection used in any context that displays a user
interface AuthorProjection {
  id: string;
  username: string;
  displayName: string;
  image: string | null;
}

// Attribution projection — sent to clients that render remixes
interface AttributionProjection {
  // The current parent post if it still exists; null if removed
  parent: { id: string; title: string; author: AuthorProjection } | null;
  // Always present (snapshot at draft time); used when parent is null
  parentAuthorSnapshot: { id: string; displayName: string };
  remixMode: RemixMode;
}

interface PostProjection {
  id: string;
  author: AuthorProjection | null; // null if author deleted account
  title: string;
  body: string; // full body on detail; preview-only on feed (see feed.contract.md)
  tone: Tone;
  status: PostStatus;
  publishedAt: string; // ISO 8601
  editedAt: string | null;
  attribution: AttributionProjection | null; // non-null iff this post is a remix
  likeCount: number;
  commentCount: number;
  remixCount: number;
  // Per-viewer state (omitted if request is unauthenticated)
  viewer?: {
    liked: boolean;
    saved: boolean;
  };
}

interface DraftProjection {
  id: string;
  title: string | null;
  body: string | null;
  tone: Tone | null;
  attribution: AttributionProjection | null;
  lastSafetyCheck:
    | { verdict: "ALLOW" }
    | { verdict: "REJECT"; categories: string[]; reason: string }
    | null;
  createdAt: string;
  updatedAt: string;
}
```

---

## `POST /api/drafts`

Create a new empty draft (used by the create flow before AI generation; also
used by the remix flow, see Remix below).

- **Auth**: required.
- **Request body**:

  ```ts
  // For an original-content draft:
  { kind: "ORIGINAL"; tone?: Tone }

  // For a remix draft (also see POST /api/remix/[postId])
  // — this endpoint does NOT create remix drafts directly; use the remix endpoint.
  ```

- **Response 201**: `{ draft: DraftProjection }`
- **Errors**: `unauthenticated`, `validation_failed`.

---

## `GET /api/drafts`

List the authenticated user's own drafts, newest-first.

- **Auth**: required.
- **Query**: `cursor?`, `limit?`.
- **Response 200**: `{ drafts: DraftProjection[]; nextCursor: string | null }`
- **Errors**: `unauthenticated`.

---

## `GET /api/drafts/[id]`

Fetch a single draft.

- **Auth**: required, AND the draft's `authorId` MUST match the current user;
  otherwise the response is `404 not_found` (NOT 403, to avoid leaking
  existence per Principle VII).
- **Response 200**: `{ draft: DraftProjection }`
- **Errors**: `unauthenticated`, `not_found`.

---

## `PATCH /api/drafts/[id]`

Update draft fields. Used both for inline edits and for accepting AI output
into a draft.

- **Auth**: required, ownership-scoped (same 404-on-mismatch rule).
- **Request body** (all fields optional; at least one must be present):

  ```ts
  {
    title?: string;            // length 0..120
    body?: string;              // length 0..8000
    tone?: Tone;
  }
  ```

  Note: `attribution` and `remixMode` are immutable on a draft; the service
  refuses to mutate them after draft creation.

- **Response 200**: `{ draft: DraftProjection }`
- **Errors**: `unauthenticated`, `not_found`, `validation_failed`.

---

## `DELETE /api/drafts/[id]`

Discard a draft.

- **Auth**: required, ownership-scoped.
- **Response 204**: empty.
- **Errors**: `unauthenticated`, `not_found`.

---

## `POST /api/drafts/[id]/publish`

Publish a draft as a `Post`. Runs moderation on the final user-edited content
(`title` + `body`). On success, the draft row is deleted and a Post is
inserted in the same transaction.

- **Auth**: required, ownership-scoped.
- **Request body**: `{}` (publish operates on the current draft state).
- **Response 201**: `{ post: PostProjection }`
- **Errors**:
  - `unauthenticated`, `not_found`
  - `validation_failed` — draft is missing required fields (`title`, `body`,
    `tone`)
  - `safety_rejected` — moderation flagged the content. `details.categories`,
    `details.reason`. Draft is preserved.
- **Side effects on success**:
  - `Post` row inserted with `publishedAt = now()`, `status = PUBLISHED`.
  - If the draft is a remix: parent post's `remixCount += 1` (same tx).
  - Draft row deleted (same tx).
  - SafetyCheck row recorded.

---

## `GET /api/posts/[id]`

Fetch a single post.

- **Auth**: optional. Anonymous viewers receive `viewer` omitted.
- **Response 200**: `{ post: PostProjection }`
- **Errors**:
  - `not_found` — post does not exist or has `status = REMOVED` (we treat
    removed posts as not found for normal viewers; the only exception is
    attribution rendering on a remix, which uses cached snapshot data and
    never queries the removed post directly).

---

## `PATCH /api/posts/[id]`

Edit an existing published post.

- **Auth**: required, AND `post.authorId` must equal current user; otherwise
  `403 forbidden`.
- **Request body**:

  ```ts
  {
    title?: string;
    body?: string;
  }
  ```

  `tone` is immutable post-publish (the original tone reflects the
  generation context). Attribution is also immutable.

- **Behavior**: Re-runs moderation on the edited content before applying.
- **Response 200**: `{ post: PostProjection }`
- **Errors**:
  - `unauthenticated`, `not_found`, `forbidden`, `validation_failed`
  - `safety_rejected` — post is not updated; original public version remains
    visible. Caller surfaces the rejection in the editor.
- **Side effects**: `editedAt = now()`. SafetyCheck row recorded.

---

## `DELETE /api/posts/[id]`

Delete a published post.

- **Auth**: required; author-only (`403 forbidden` otherwise).
- **Response 204**: empty.
- **Side effects**:
  - Post is hard-deleted. Row goes away.
  - Children (remixes) keep their `parentId` set to the deleted id; the FK
    rule `ON DELETE SET NULL` handles this — `parentId` becomes null in their
    rows.
  - The `parentAuthorSnapshot` on each remix child remains intact (Principle
    V). Remix UI renders the snapshot author as a non-clickable reference.
  - Comments on the deleted post are cascaded away.
  - `Like`/`Save` rows referencing this post cascade away.

---

## Remix-draft creation

Remix is a special-case draft creation — it triggers an AI call. See:

- [`ai.contract.md`](./ai.contract.md) for the underlying generation endpoint.
- [Remix flow in `interactions.contract.md`](./interactions.contract.md#post-apiremixpostid)
  for the user-facing endpoint that creates a remix draft.

---

## Validation summary (Zod-shaped)

```ts
const TitleSchema = z.string().trim().min(1).max(120);
const BodySchema = z.string().trim().min(1).max(8000);
const ToneSchema = z.enum(["INSPIRING", "ANALYTICAL", "PLAYFUL", "POETIC", "PROFESSIONAL"]);

const DraftCreateSchema = z.object({
  kind: z.literal("ORIGINAL"),
  tone: ToneSchema.optional(),
});

const DraftPatchSchema = z
  .object({
    title: z.string().max(120).optional(),
    body: z.string().max(8000).optional(),
    tone: ToneSchema.optional(),
  })
  .refine((d) => d.title !== undefined || d.body !== undefined || d.tone !== undefined, {
    message: "At least one field must be provided",
  });

const PostPatchSchema = z
  .object({
    title: TitleSchema.optional(),
    body: BodySchema.optional(),
  })
  .refine((d) => d.title !== undefined || d.body !== undefined, {
    message: "At least one field must be provided",
  });
```

The publish endpoint additionally requires that the draft, at the moment of
publish, has `title` matching `TitleSchema` and `body` matching `BodySchema`
and a non-null `tone`. If any are missing, publish fails with
`validation_failed`.

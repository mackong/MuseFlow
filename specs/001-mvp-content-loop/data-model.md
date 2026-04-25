# Phase 1 Data Model: MVP Core Content Loop

**Feature**: 001-mvp-content-loop
**Date**: 2026-04-25
**Stack**: PostgreSQL 15 via Prisma 5
**Source of truth**: `prisma/schema.prisma` (this document is the design rationale).

This document defines every persisted entity, its fields, constraints,
relationships, indexes, and the state transitions relevant to the spec.

---

## Conventions

- Primary keys are `String @id @default(cuid())` unless stated otherwise.
- Timestamps use `DateTime` with `@default(now())` for create and explicit
  service-side updates for `updatedAt`.
- Soft deletion is NOT used at MVP; deletes are hard except where explicitly
  required by Principle V (remix attribution preservation).
- All foreign keys default to `ON DELETE RESTRICT` unless specified.
- All counters maintained on parent rows (e.g., `Post.likeCount`) are
  service-managed denormalizations protected by transactions; the underlying
  join tables are the source of truth.

---

## Entities

### `User`

The authenticated principal. Owns posts, drafts, comments, likes, saves,
remixes, and AI generation records.

| Field           | Type          | Constraints                     | Notes                                                     |
| --------------- | ------------- | ------------------------------- | --------------------------------------------------------- |
| `id`            | String (cuid) | PK                              |                                                           |
| `email`         | String        | Unique, not null                | Source of identity for Auth.js                            |
| `displayName`   | String        | Unique, length 2..40            | Public name; renames allowed (decision 13 in research.md) |
| `username`      | String        | Unique, length 2..30, slug-safe | Used in profile URL `/profile/{username}`                 |
| `description`   | String?       | Length 0..240                   | Optional public bio shown on public profile               |
| `image`         | String?       |                                 | Avatar URL (provided by OAuth or null)                    |
| `emailVerified` | DateTime?     |                                 | Set by Auth.js on email magic-link verify                 |
| `createdAt`     | DateTime      | @default(now())                 |                                                           |
| `updatedAt`     | DateTime      | @updatedAt                      |                                                           |

**Auth.js companion tables** (`Account`, `Session`, `VerificationToken`)
follow the standard Auth.js Prisma adapter schema and are not redefined here.

**Relations**:

- `posts: Post[]` (authored)
- `drafts: Draft[]`
- `comments: Comment[]`
- `likes: Like[]`
- `saves: Save[]`
- `generations: Generation[]`

**Indexes**: unique on `email`, `displayName`, `username`. Index on
`createdAt DESC` (admin/audit queries; not on hot paths).

---

### `Post`

A _published_ unit of content (always public when present in this table). Drafts
do not live here — they live in `Draft`. A remix is a `Post` with
`parentId IS NOT NULL`.

| Field                  | Type       | Constraints                          | Notes                                                                             |
| ---------------------- | ---------- | ------------------------------------ | --------------------------------------------------------------------------------- |
| `id`                   | String     | PK (cuid)                            |                                                                                   |
| `authorId`             | String     | FK → `User.id`, on delete `SET NULL` | Anonymizes content if author deletes account (Principle V & VII)                  |
| `title`                | String     | Length 1..120                        |                                                                                   |
| `body`                 | String     | Length 1..8000                       | Markdown text, sanitized at render                                                |
| `tone`                 | Tone       | Enum                                 | Snapshotted at publish time                                                       |
| `status`               | PostStatus | Enum, default `PUBLISHED`            | `PUBLISHED` or `REMOVED`                                                          |
| `publishedAt`          | DateTime   | not null                             | Set on first publish; never reset                                                 |
| `editedAt`             | DateTime?  |                                      | Set on each post edit; null if never edited                                       |
| `parentId`             | String?    | FK → `Post.id`, on delete `SET NULL` | Null for original posts; non-null for remixes                                     |
| `parentAuthorSnapshot` | Json?      |                                      | `{ id: string, displayName: string }` captured at remix-draft creation; immutable |
| `remixMode`            | RemixMode? | Enum                                 | Required iff `parentId` set; null otherwise                                       |
| `likeCount`            | Int        | default 0, ≥ 0                       | Denormalized; truth is `Like` rows                                                |
| `commentCount`         | Int        | default 0, ≥ 0                       | Denormalized; truth is `Comment` rows                                             |
| `remixCount`           | Int        | default 0, ≥ 0                       | Denormalized; truth is child `Post.parentId`                                      |
| `createdAt`            | DateTime   | @default(now())                      |                                                                                   |
| `updatedAt`            | DateTime   | @updatedAt                           |                                                                                   |

**Enums**:

```text
enum Tone        { INSPIRING, ANALYTICAL, PLAYFUL, POETIC, PROFESSIONAL }
enum PostStatus  { PUBLISHED, REMOVED }
enum RemixMode   { REWRITE, CONTINUE, SUMMARIZE, CHANGE_TONE }
```

**Indexes**:

- Composite: `(status, publishedAt DESC, id DESC)` — primary feed query
  (decision 12 in research.md).
- `(authorId, status, publishedAt DESC)` — public profile and own-published list.
- `parentId` — for incrementing `remixCount` and child queries.

**Constraints**:

- CHECK: `(parentId IS NULL AND remixMode IS NULL) OR (parentId IS NOT NULL AND remixMode IS NOT NULL)`
- CHECK: `likeCount >= 0 AND commentCount >= 0 AND remixCount >= 0`

**State transitions**:

```text
(none) ──publish──▶ PUBLISHED ──edit──▶ PUBLISHED  (re-runs moderation)
                       │
                       └──delete──▶ REMOVED  (rows kept so remixes can show
                                              "Remix of a removed post")
```

`REMOVED` posts are excluded from the feed and from public profiles. They
remain readable only as the _target_ of an attribution display on a remix
(text-only, non-clickable).

---

### `Draft`

A private work-in-progress version owned by a single user. Never visible to
anyone but the author. A draft becomes a `Post` via the `publish` operation;
after publishing, the draft row is deleted in the same transaction.

| Field                  | Type       | Constraints                          | Notes                                                    |
| ---------------------- | ---------- | ------------------------------------ | -------------------------------------------------------- |
| `id`                   | String     | PK (cuid)                            |                                                          |
| `authorId`             | String     | FK → `User.id`, on delete `CASCADE`  | If user deletes account, drafts go too                   |
| `title`                | String?    | Length 0..120                        | May be empty during early authoring                      |
| `body`                 | String?    | Length 0..8000                       |                                                          |
| `tone`                 | Tone?      | Enum                                 | Selected during create flow                              |
| `parentId`             | String?    | FK → `Post.id`, on delete `SET NULL` | If draft is a remix                                      |
| `parentAuthorSnapshot` | Json?      |                                      | Captured at draft creation; required when `parentId` set |
| `remixMode`            | RemixMode? | Enum                                 | Required iff `parentId` set                              |
| `lastGenerationId`     | String?    | FK → `Generation.id`                 | Most recent AI output for this draft                     |
| `lastSafetyCheckId`    | String?    | FK → `SafetyCheck.id`                | Last moderation result on AI output                      |
| `createdAt`            | DateTime   | @default(now())                      |                                                          |
| `updatedAt`            | DateTime   | @updatedAt                           |                                                          |

**Indexes**:

- `(authorId, updatedAt DESC)` — own profile drafts list.

**Constraints**:

- Reads MUST be filtered by `authorId == currentUserId`. The route handler
  layer is responsible; the data layer additionally enforces by always
  scoping the Prisma query in `draft.service.ts`.
- Same `(parentId, remixMode)` paired-nullability check as `Post`.

**State transitions**:

```text
(create)     ──▶ Draft (no AI yet)
Draft        ──generate──▶ Draft (with title/body/lastGenerationId/lastSafetyCheckId)
Draft        ──regenerate──▶ Draft (new generation; previous overwritten in fields,
                                    but Generation row preserved for audit)
Draft        ──save──▶ Draft       (no-op besides updatedAt + persisted edits)
Draft        ──publish──▶ Post AND row deleted in same tx
Draft        ──discard──▶ (deleted)
```

---

### `Comment`

A flat (single-level, no threading) reply to a `PUBLISHED` post.

| Field       | Type     | Constraints                          | Notes                                                                                  |
| ----------- | -------- | ------------------------------------ | -------------------------------------------------------------------------------------- |
| `id`        | String   | PK (cuid)                            |                                                                                        |
| `postId`    | String   | FK → `Post.id`, on delete `CASCADE`  | If post is hard-deleted, comments go                                                   |
| `authorId`  | String   | FK → `User.id`, on delete `SET NULL` | Author deletion preserves the comment with `authorId = NULL` (rendered as "[removed]") |
| `body`      | String   | Length 1..1000                       |                                                                                        |
| `createdAt` | DateTime | @default(now())                      |                                                                                        |

**Indexes**:

- `(postId, createdAt ASC)` — render comments under a post in chronological order.

**Authorization**:

- Create: any authenticated user on a `PUBLISHED` post.
- Delete: only `authorId == currentUserId`.

**Counter**: `Post.commentCount` += 1 on create, -= 1 on delete (same tx).

---

### `Like`

A unique pairing of `(userId, postId)`. Source of truth for the per-post like
count.

| Field       | Type     | Constraints                         | Notes |
| ----------- | -------- | ----------------------------------- | ----- |
| `userId`    | String   | FK → `User.id`, on delete `CASCADE` |       |
| `postId`    | String   | FK → `Post.id`, on delete `CASCADE` |       |
| `createdAt` | DateTime | @default(now())                     |       |

**Composite primary key**: `(userId, postId)` — guarantees one like per pair.

**Indexes**:

- `(postId)` — for "did this user like this?" lookups when paired with userId
  in the WHERE clause.
- `(userId, createdAt DESC)` — future "things I liked" view (out of MVP scope
  but cheap to index now).

**Counter**: `Post.likeCount` += 1 on insert, -= 1 on delete (same tx).
Service uses `INSERT … ON CONFLICT DO NOTHING` and inspects `affected_rows` to
decide whether to bump the counter; on delete, conditional decrement.

---

### `Save`

A user's private bookmark. Same shape as `Like` but represents a different
user intention; private to its owner.

| Field       | Type     | Constraints                         | Notes |
| ----------- | -------- | ----------------------------------- | ----- |
| `userId`    | String   | FK → `User.id`, on delete `CASCADE` |       |
| `postId`    | String   | FK → `Post.id`, on delete `CASCADE` |       |
| `createdAt` | DateTime | @default(now())                     |       |

**Composite primary key**: `(userId, postId)`.

**Indexes**: `(userId, createdAt DESC)` — own profile saved list (the only
read pattern).

**Privacy**: Save existence MUST NOT be exposed on public profiles or in the
feed. The list query is hard-scoped by `userId == currentUserId` at the
service layer.

---

### `Generation`

A record of an AI generation event. Used both for product flow (the draft
references its `lastGenerationId`) and cost tracking (Principle X).

| Field           | Type              | Constraints                          | Notes                                                       |
| --------------- | ----------------- | ------------------------------------ | ----------------------------------------------------------- |
| `id`            | String            | PK (cuid)                            |                                                             |
| `userId`        | String            | FK → `User.id`, on delete `CASCADE`  |                                                             |
| `surface`       | GenerationSurface | Enum                                 | `CREATE` or `REMIX`                                         |
| `mode`          | GenerationMode    | Enum                                 | `CREATE`, `REWRITE`, `CONTINUE`, `SUMMARIZE`, `CHANGE_TONE` |
| `provider`      | String            | Length 1..40                         | `openai`, `anthropic`, …                                    |
| `model`         | String            | Length 1..80                         | e.g., `gpt-4o-mini`                                         |
| `inputTokens`   | Int?              |                                      | Null when provider does not report                          |
| `outputTokens`  | Int?              |                                      | Null when provider does not report                          |
| `latencyMs`     | Int               |                                      | Wall-clock from request to response                         |
| `status`        | GenerationStatus  | Enum                                 | `SUCCESS`, `SAFETY_REJECTED`, `ERROR`                       |
| `errorMessage`  | String?           | Length 0..500                        | Set when `status = ERROR`                                   |
| `safetyCheckId` | String?           | FK → `SafetyCheck.id`                | The safety check run on this output                         |
| `parentPostId`  | String?           | FK → `Post.id`, on delete `SET NULL` | For remix generations only                                  |
| `createdAt`     | DateTime          | @default(now())                      |                                                             |

**Enums**:

```text
enum GenerationSurface { CREATE, REMIX }
enum GenerationMode    { CREATE, REWRITE, CONTINUE, SUMMARIZE, CHANGE_TONE }
enum GenerationStatus  { SUCCESS, SAFETY_REJECTED, ERROR }
```

**Indexes**:

- `(userId, createdAt DESC)` — per-user history and rate-limit audit.
- `(provider, model, createdAt DESC)` — cost reporting by provider+model.

**Privacy**: This table MUST NOT contain raw input or output text (Principle
X bullet on logs). It captures metadata only.

---

### `SafetyCheck`

The verdict of a moderation call. Attached to AI outputs (via
`Generation.safetyCheckId`) and to publish/comment-create attempts (via
`Post.publishSafetyCheckId` if we choose to keep that link, or referenced
in audit logs only).

| Field        | Type               | Constraints            | Notes                                                     |
| ------------ | ------------------ | ---------------------- | --------------------------------------------------------- |
| `id`         | String             | PK (cuid)              |                                                           |
| `provider`   | String             | Length 1..40           | `openai`, `perspective`, …                                |
| `surface`    | SafetyCheckSurface | Enum                   | `AI_OUTPUT`, `POST_PUBLISH`, `COMMENT_CREATE`             |
| `verdict`    | SafetyVerdict      | Enum                   | `ALLOW`, `REJECT`                                         |
| `categories` | String[]           | Empty array if `ALLOW` | Flagged category keys, e.g. `["hate","violence/graphic"]` |
| `reason`     | String?            | Length 0..200          | Human-readable summary shown to user on rejection         |
| `latencyMs`  | Int                |                        |                                                           |
| `createdAt`  | DateTime           | @default(now())        |                                                           |

**Enums**:

```text
enum SafetyCheckSurface { AI_OUTPUT, POST_PUBLISH, COMMENT_CREATE }
enum SafetyVerdict      { ALLOW, REJECT }
```

**Indexes**: `(verdict, createdAt DESC)` — operational dashboard for rejection
rate.

---

## Relationship diagram (textual)

```text
User 1────┬──N Post (author)
          ├──N Draft (author)
          ├──N Comment (author; nullable on user delete)
          ├──N Like (composite PK with Post)
          ├──N Save (composite PK with Post)
          └──N Generation

Post 1────┬──N Comment
          ├──N Like
          ├──N Save
          ├──0..1 Post (parentId; self-ref)
          └──0..N Post (children via parentId — increments parent.remixCount)

Generation 0..1──── 0..1 SafetyCheck
Draft       0..1──── 0..1 Generation (lastGenerationId)
Draft       0..1──── 0..1 SafetyCheck (lastSafetyCheckId on AI output)
```

---

## Invariants enforced at service / DB layer

1. **One like per (user, post)** — composite PK on `Like`.
2. **`Post.likeCount` matches the COUNT of its `Like` rows** — service
   transactions; periodic reconciliation job out of MVP scope but the
   reconciliation query is `SELECT COUNT(*) FROM Like WHERE postId = $1`.
3. **Drafts are author-private** — every draft query is scoped by
   `authorId = currentUserId`; reviewed at PR time.
4. **Public surfaces show only `PUBLISHED` posts** — feed and public profile
   queries hard-filter `status = PUBLISHED`.
5. **Remix attribution is immutable post-publish** — `parentId` and
   `parentAuthorSnapshot` set at draft creation are never mutated by edit
   operations; service layer rejects writes that try.
6. **`parentAuthorSnapshot` survives parent author deletion** — JSON column
   does not cascade.
7. **Comment delete authorization is `authorId == currentUserId`** — enforced
   at service layer; route handler returns 403 on mismatch.
8. **Rate limits are checked before AI calls** — `ai.service.ts.generate()`
   first invokes `ratelimit.service.ts`, which throws `RateLimitedError`.

---

## Migrations posture

- One initial migration creating all tables, indexes, and enums.
- Subsequent feature migrations follow the standard Prisma migrate workflow.
- Test environment uses Neon database branches (decision 2 in research.md).

---

## Out-of-scope data (referenced for future work)

The following are intentionally not modeled at MVP per Principle XII:

- `Follow(followerId, followedId)` — follow graph
- `Notification(userId, type, payload, readAt)` — notifications
- `Tag` and `PostTag` join — taxonomy
- Image / video / audio attachment tables — non-text media
- `Subscription` / `Tip` / `Payment` — monetization

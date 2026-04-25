# Phase 0 Research: MVP Core Content Loop

**Feature**: 001-mvp-content-loop
**Date**: 2026-04-25
**Purpose**: Resolve open technology and pattern decisions before Phase 1
design. Each entry follows the Decision / Rationale / Alternatives format.

---

## 1. Auth provider — Auth.js vs Clerk

**Decision**: Auth.js (NextAuth v5) with email magic link and one OAuth
provider (GitHub) at MVP.

**Rationale**:
- User input explicitly prefers Auth.js if open-source simplicity is enough.
  It is.
- Auth.js v5 integrates natively with Next.js App Router, supports edge
  middleware, Prisma adapter for users/sessions/accounts, and is free at any
  scale.
- Matches Constitution Principle XII (Fast MVP Iteration): no third-party
  vendor lock-in, no incremental SaaS bill, simpler local dev story.
- Email magic link covers the dominant sign-up path with minimal UX friction;
  GitHub OAuth covers the technical-creator persona.

**Alternatives considered**:
- *Clerk*: Faster to ship a polished UI; comes with managed user-management
  pages. Rejected because (a) it is a paid SaaS, (b) it owns user data, which
  conflicts with Principle VII (Privacy and Data Control) on default
  data-residency assumptions, and (c) the Auth.js Prisma adapter is sufficient
  for MVP needs.
- *Supabase Auth*: Bundled with Supabase Postgres (an alternative DB host
  below). Rejected because we want auth choice independent of DB-host choice;
  Auth.js works with whichever Postgres host we pick.

---

## 2. Postgres host — Neon vs Supabase

**Decision**: Neon for the MVP.

**Rationale**:
- Neon's branch-per-PR model lines up with Vercel preview deployments: each
  preview gets a Postgres branch, run migrations, run tests, throw it away.
  This is high leverage for the testing gates required by Principle XI.
- Connection pooling is provided by Neon's pooler endpoint, important for
  Vercel's serverless function model where a single request can spin up a
  fresh runtime.
- Free tier is sufficient for MVP scale (≤ 10k users target in plan.md).

**Alternatives considered**:
- *Supabase*: Strong if we wanted bundled auth + storage + edge functions.
  Rejected because we have already chosen Auth.js (decision 1) and we are not
  using object storage at MVP (text-only per Principle XII), so the bundle
  benefit is small. Keeping Supabase as a documented fallback if Neon's
  serverless pricing changes.
- *Vercel Postgres*: Tightest Vercel integration but currently a thin wrapper
  on top of Neon; redundant.
- *Self-hosted Postgres*: Higher operational burden, conflicts with Principle
  XII.

**Migration path**: All DB access goes through Prisma. Switching hosts is a
`DATABASE_URL` change plus a connection-pool flag.

---

## 3. AI provider for the MVP

**Decision**: Default implementation targets the OpenAI Chat Completions API
(via the official `openai` npm SDK) hitting an OpenAI-compatible endpoint.
Default model: a cost-efficient general-purpose model (configured via env;
recommended start: `gpt-4o-mini` or equivalent).

**Rationale**:
- User input specified OpenAI-compatible API.
- The official SDK supports `baseURL` overrides, which means the same code
  also works with Together, OpenRouter, Groq, vLLM, Ollama, etc., without
  changing call sites — this directly satisfies Constitution Principle VIII.
- Streaming, structured output, and token usage reporting are all supported
  by the SDK and the protocol.

**Critical implementation discipline**: The SDK is imported ONLY inside
`src/server/services/ai/openai-provider.ts`. Every other module in the codebase
depends on the `AIProvider` interface in
`src/server/services/ai/provider.interface.ts`. Reviewers enforce this with
the Provider Gate from the constitution.

**Alternatives considered**:
- *Anthropic SDK directly*: Excellent quality, but requires its own adapter.
  Tracked as a v1.1 candidate. Will be added as `anthropic-provider.ts`
  implementing the same interface.
- *Vercel AI SDK*: Adds an extra abstraction layer and pulls in client-side
  helpers we do not need server-side. The cost-tracking surface (token counts)
  is also less explicit. Rejected for MVP; revisit if streaming UX gets
  complex.
- *LangChain*: Out of scope at MVP. Too much surface area, cost-tracking is
  indirect, conflicts with Principle XII.

---

## 4. Content moderation provider

**Decision**: OpenAI Moderation API as the MVP backend behind a `Moderator`
interface. Categories used: `hate`, `hate/threatening`, `harassment`,
`harassment/threatening`, `self-harm`, `sexual`, `sexual/minors`, `violence`,
`violence/graphic`. Threshold: provider-default flagged categories.

**Rationale**:
- Free of charge, low-latency, returns category-level breakdown.
- Aligns with Principle VI (Safety by Design): we get a discrete category list
  to surface as a human-readable rejection reason.
- Same interface allows future swap to Perspective API, in-house classifier,
  or layered approaches without rewriting feature code.

**What we do with the result**:
- AI generation: if any flagged category is true, surface a rejection state in
  the create/remix UI with the category as the reason. The user can edit and
  retry, regenerate, or abandon.
- Publish: re-run moderation on the user's final text (which may differ from
  the AI output due to edits). Block the publish on flagged categories.
- Comments: same check at submit time.

**Alternatives considered**:
- *Perspective API*: Toxicity-focused; less category granularity than OpenAI
  Moderation; requires Google Cloud project. Rejected for MVP simplicity but
  documented as a future provider.
- *No moderation, defer to manual review*: Violates Principle VI directly.
  Rejected.

---

## 5. AI generation modes — prompt design and validation

**Decision**: Five generation modes implemented as discrete prompt templates
in `src/server/services/ai/prompts.ts`:

| Mode        | Surface | Inputs                                | Output shape                  |
|-------------|---------|---------------------------------------|-------------------------------|
| `create`    | US1     | idea (text), tone (enum)              | `{ title, body }` JSON        |
| `rewrite`   | US4     | original post (title+body)            | `{ title, body }` JSON        |
| `continue`  | US4     | original post                         | `{ title, body }` JSON        |
| `summarize` | US4     | original post                         | `{ title, body }` JSON        |
| `change-tone` | US4   | original post, target tone (enum)     | `{ title, body }` JSON        |

All modes use JSON-mode (response_format: json_object) and return a strict
`{ title, body }` shape validated by Zod (`AiGenerateResponseSchema` in
`src/lib/contracts/ai.contract.ts`). On parse failure, the service retries once
with a stricter system message; second failure surfaces as a user-visible
"could not generate, please try again" with the retry control.

**Rationale**: Constraining the output to a typed JSON shape lets the rest of
the system treat AI output identically across all modes. Five modes is the
spec scope; no need for a generic `prompt` field that would require its own
moderation considerations.

**Alternatives considered**:
- *Free-form text + post-hoc title extraction*: Rejected as fragile; extracting
  a title from a wall of text leads to inconsistent UX.
- *Function calling / tool use for output shape*: Marginally more reliable but
  requires per-provider tweaks. JSON-mode is universally supported by
  OpenAI-compatible providers.

---

## 6. Rate limiting

**Decision**: Use Upstash Ratelimit (`@upstash/ratelimit` + Redis REST) at the
service-layer entry of `ai.service.ts`. Buckets: `generate:create:{userId}`
and `generate:remix:{userId}`. Default windows from plan.md cost envelopes:
20 generations/hour and 10 remixes/hour, both as token-bucket-style
`slidingWindow`.

**Rationale**:
- Constitution Principle X requires per-user rate limits and a clear
  user-facing message at exhaustion.
- Upstash is HTTP-based (no persistent connections), works on Vercel
  serverless without connection-pool friction, and has a free tier.
- Service-layer enforcement (not middleware) means the same limits apply if a
  future native client calls the API directly.

**Alternatives considered**:
- *In-process counter*: Wrong — serverless functions are stateless across
  cold starts; counts would be unreliable.
- *Database-backed counter (Postgres)*: Works but adds DB load on a hot path.
  Acceptable fallback if we later remove the Upstash dependency.

---

## 7. Real-time feed updates (FR-014, SC-005)

**Decision**: For MVP, use **client-side periodic revalidation** via SWR/React
Query with a 30-second focus-and-interval revalidation, plus an optimistic
prepend on the publishing user's own session. No websockets, no SSE.

**Rationale**:
- Principle XII (Fast MVP Iteration). Real-time push is non-trivial on Vercel
  serverless and adds infrastructure surface.
- SC-005 requires "within 10 seconds" propagation; a 30s revalidate combined
  with on-focus revalidation achieves this in the common case (user is
  actively viewing). Strict 10s for an *idle* session is documented as best-
  effort and revisited post-launch.
- Optimistic prepend on the publisher's own session covers the "user just
  published — they want to see it appear" UX without server push.

**Alternatives considered**:
- *Server-Sent Events*: Cleaner real-time UX but Vercel serverless function
  duration limits make long-lived SSE awkward. Tracked as a v1.1 upgrade if
  retention metrics show feed stickiness matters.
- *Pusher / Ably*: External dependency, monthly cost, Principle XII tension.
  Rejected.

---

## 8. PWA implementation

**Decision**: Hand-rolled service worker via `next-pwa` (or
`@serwist/next` if `next-pwa` lags Next 15 support) with:
- Web App Manifest at `src/app/manifest.ts`
- Pre-cached app shell + skeleton routes
- Network-first strategy for `/api/*` and `/feed`
- Cache-first for static assets and the offline shell

**Rationale**:
- Principle II requires installable PWA + app-like nav; this is the minimum
  viable implementation.
- Avoids hand-writing a service worker from scratch (Principle XII).
- Lighthouse PWA target ≥ 90 in plan.md is achievable with manifest + SW +
  proper icons.

**Alternatives considered**:
- *No PWA, just responsive web*: Violates Principle II.
- *Capacitor / Expo wrapper*: Out of MVP scope (Principle XII excludes native
  builds).

---

## 9. Test stack

**Decision**:
- **Unit**: Vitest with Node test environment for all `src/server/services/*`
  and `src/lib/*` modules. Database access mocked via `prismock` or in-memory
  Prisma; AI and Moderator interfaces injected via fakes from `tests/helpers/`.
- **Integration**: Vitest hitting Next.js Route Handlers with a real Postgres
  test database (Neon branch per CI run) to cover request/response shape and
  service wiring.
- **E2E**: Playwright on a mobile viewport profile (Pixel 5 emulation,
  Slow 4G throttle) for: (a) sign-in → create → publish, (b) feed → like →
  comment → save, (c) remix → publish-with-attribution. Three specs total to
  start.

**Rationale**:
- Vitest is the de-facto Next.js + TS unit framework, fast cold start, ESM
  native.
- Playwright on a mobile viewport directly enforces Principle I (Mobile-First
  Experience) at CI time.
- Three e2e specs map exactly to the MVP critical flows from Principle XI;
  resists scope creep.

**Alternatives considered**:
- *Jest*: Slower, more config friction with ESM and Next 15. Rejected.
- *Cypress*: Comparable to Playwright; Playwright wins on mobile emulation
  fidelity and parallelism.

---

## 10. Real-time count integrity (FR-016, SC-007)

**Decision**: Likes are stored as a join table `Like(userId, postId)` with a
unique constraint on the pair. The `Post.likeCount` is a denormalized integer
maintained by the service via an `UPDATE … SET likeCount = likeCount ± 1` in
the same transaction as the join-table insert/delete. The transaction is
isolated by Postgres' default `READ COMMITTED`; the unique constraint
guarantees idempotency.

**Rationale**:
- Reading `likeCount` from the post row is a single-row read suitable for
  feed rendering (no aggregate query per post).
- The unique constraint is the source of truth for "exactly one like per
  user per post"; the counter is a cache.
- Toggle behavior: on insert, `count + 1`; on delete, `count - 1`. The same
  logic gives idempotency under retries because the second insert fails the
  unique constraint and short-circuits.

**Alternatives considered**:
- *Compute count on read via `SELECT COUNT(*)`*: Simpler write path but
  expensive at feed render time. Rejected.
- *Redis counter*: Adds infrastructure for a small win. Rejected at MVP.

The same pattern applies to `Post.commentCount` and `Post.remixCount`.

---

## 11. Remix attribution data model

**Decision**: A self-referential foreign key on `Post`:

- `Post.parentId` → `Post.id` (nullable; null for non-remix posts)
- `Post.parentAuthorSnapshot` (JSONB) — captures `{ id, displayName }` of the
  parent's author at remix-draft creation time, immutable thereafter

**Rationale**:
- `parentId` lets us walk the lineage and increment `parent.remixCount`
  atomically.
- `parentAuthorSnapshot` is the durable record needed for Principle V: even
  if the parent post or parent author is later deleted, the remix can still
  display "Remix of a removed post" with the original author's display name
  at the time of remixing.
- `ON DELETE SET NULL` on `parentId` handles parent deletion cleanly; the
  snapshot survives.

**Alternatives considered**:
- *Junction table `Remix(postId, parentId)`*: Adds a join for the most common
  read; no upside given remixes are 1-to-1 with parents.
- *No author snapshot*: Saves a column but breaks Principle V when an author
  deletes their account.

---

## 12. Feed pagination

**Decision**: Cursor-based pagination keyed on `(publishedAt DESC, id DESC)`.
Page size 20. Cursor encodes the last seen `publishedAt` and `id`.

**Rationale**:
- Stable under concurrent inserts (a user-time pair is unique enough to avoid
  skipping or duplicating posts as new ones arrive at the top).
- Performant with a composite index on `(status, publishedAt DESC, id DESC)`.
- Offset pagination would re-shuffle as new posts arrive, breaking the user's
  scroll position.

**Alternatives considered**:
- *Offset/limit*: Simpler API, broken UX under live insertion. Rejected.

---

## 13. Author display name change consistency (Edge case in spec)

**Decision**: Display names are joined at read time, not snapshotted on the
post. Renames are reflected immediately on all of the user's content.

**Rationale**:
- The spec explicitly states: "historical attribution on remixes and comments
  updates to reflect the current display name (one identity, current name)".
- Snapshotting display name on every Post / Comment would diverge from this.

**Exception**: `Post.parentAuthorSnapshot` IS snapshotted because it must
survive parent-author account deletion (decision 11).

---

## 14. Out-of-scope confirmations (cross-check vs Principle XII)

These items are explicitly out of scope for this MVP and will not be addressed
in any task generated from this plan. Listed here so the next phase
(`/speckit-tasks`) does not invent work for them.

- Image, video, or audio generation
- Following / follower graph
- Personalized or recommended feeds (feed is global reverse-chrono)
- Free-text search across posts
- Notifications (email or in-product)
- Native mobile app (Expo / RN) build
- Creator monetization / payments
- Multi-language UI (English only at launch; localization scaffolding stays in
  place per Principle II to avoid hardcoded strings)

---

## Resolution status

| Open question                            | Resolved in section |
|------------------------------------------|---------------------|
| Which auth?                              | 1                   |
| Which Postgres host?                     | 2                   |
| Which AI provider implementation?        | 3                   |
| Which moderation provider?               | 4                   |
| How to validate AI output shape?         | 5                   |
| How to enforce rate limits?              | 6                   |
| How to keep feed fresh?                  | 7                   |
| How to deliver the PWA pieces?           | 8                   |
| Which test frameworks?                   | 9                   |
| How to keep like counts accurate?        | 10                  |
| How to model remix attribution?          | 11                  |
| How to paginate the feed?                | 12                  |
| Display-name update propagation?         | 13                  |

All `NEEDS CLARIFICATION` markers from Technical Context have been resolved.
Phase 1 may proceed.

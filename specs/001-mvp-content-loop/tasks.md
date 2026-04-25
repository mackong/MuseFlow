---
description: "Task list for MVP Core Content Loop (001) — implements the spec, plan, data model, and contracts in this directory"
---

# Tasks: MVP Core Content Loop

**Input**: Design documents from `/specs/001-mvp-content-loop/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Required by Constitution v2.0.0 Principle XI for the critical flows
(creation, publishing, moderation, interaction, remix). Test tasks are
included as **non-optional** for those flows; pure UI styling tasks do not
require tests.

**Organization**: Tasks are grouped by user story (US1–US5) so each story can
be implemented and demonstrated independently after the foundation is in
place.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4, US5).
  Setup, Foundational, and Polish phases carry no story label.
- File paths are absolute-from-repo-root.

## Path Conventions

Single Next.js project (App Router) at the repository root:

- `src/app/**` — UI + thin Route Handlers (no business logic)
- `src/server/services/**` — business logic
- `src/server/db/`, `src/server/auth/`, `src/server/errors.ts` — shared server infra
- `src/lib/contracts/**` — Zod schemas (importable by future RN client)
- `src/components/**` — UI components (mobile-first)
- `prisma/schema.prisma` — data model
- `tests/{unit,integration,e2e,helpers}/**` — tests

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and base toolchain.

- [x] T001 Initialize Next.js 15 App Router project at repo root with `pnpm create next-app` (TypeScript, Tailwind, App Router, src dir, no Turbopack at start) — produces `package.json`, `tsconfig.json`, `next.config.mjs`, `src/app/`
- [x] T002 [P] Configure `tsconfig.json` with `"strict": true`, `"noUncheckedIndexedAccess": true`, path alias `"@/*": ["./src/*"]`
- [x] T003 [P] Add `.gitignore` covering `node_modules/`, `.next/`, `coverage/`, `.env*` (except `.env.example`), `.claude/settings.local.json`, `prisma/*.db`, `playwright-report/`, `test-results/`
- [x] T004 [P] Configure ESLint flat config (`eslint.config.js`) with `@typescript-eslint`, `eslint-plugin-react`, `eslint-plugin-tailwindcss`; add a custom rule (or comment lint guidance) forbidding direct imports of `openai` outside `src/server/services/ai/`
- [x] T005 [P] Configure Prettier (`.prettierrc.json`) with `prettier-plugin-tailwindcss`
- [x] T006 Install runtime deps: `pnpm add prisma @prisma/client zod openai next-auth@beta @auth/prisma-adapter @upstash/ratelimit @upstash/redis sonner`
- [x] T007 [P] Install dev deps: `pnpm add -D vitest @vitest/ui @vitejs/plugin-react happy-dom playwright @playwright/test prismock @types/node tsx`
- [x] T008 Initialize shadcn/ui in `components.json` with `pnpm dlx shadcn@latest init` (style: default, base color: slate, CSS variables: yes, RSC: yes, src dir: yes), then add base primitives: `button card input label sheet skeleton sonner tabs textarea toast`
- [x] T009 [P] Add npm scripts to `package.json`: `dev`, `build`, `start`, `lint`, `format`, `test:unit` (vitest run), `test:integration` (vitest run --config vitest.integration.config.ts), `test:e2e` (playwright test), `test`, `db:migrate` (prisma migrate dev), `db:reset` (prisma migrate reset --force), `db:seed` (tsx prisma/seed.ts), `db:studio`
- [x] T010 [P] Create `.env.example` with all variables from `quickstart.md` § 2 (`DATABASE_URL`, `DIRECT_DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `EMAIL_*`, `GITHUB_*`, `OPENAI_*`, `UPSTASH_*`, `MUSEFLOW_AI_PROVIDER`, `MUSEFLOW_MODERATOR`) — with safe placeholder values

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database, auth, service interfaces, and app shell — every user
story depends on this phase.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T011 [P] Write full Prisma schema in `prisma/schema.prisma` for all 8 entities + 6 enums per `data-model.md`: User, Post, Draft, Comment, Like, Save, Generation, SafetyCheck; enums Tone, PostStatus, RemixMode, GenerationSurface, GenerationMode, GenerationStatus, SafetyCheckSurface, SafetyVerdict; plus Auth.js companion tables Account, Session, VerificationToken; include all indexes and `CHECK` constraints noted in `data-model.md`
- [ ] T012 Run `pnpm db:migrate --name init` to generate the initial migration under `prisma/migrations/`; commit migration files
- [x] T013 [P] Create Prisma client singleton at `src/server/db/prisma.ts` (with hot-reload-safe global pattern for dev)
- [x] T014 [P] Create shared Zod primitives at `src/lib/contracts/shared.ts`: `CursorSchema`, `LimitSchema`, `IdSchema`, `IsoDateSchema`, `AuthorProjectionSchema`, `ErrorEnvelopeSchema`, `Tone` and `RemixMode` enum schemas
- [x] T015 [P] Create typed error module at `src/server/errors.ts` exporting: `AppError`, `UnauthenticatedError`, `ForbiddenError`, `NotFoundError`, `ValidationError`, `SafetyRejectedError`, `RateLimitedError`, `AIProviderError`, `ConflictError`; include `toHttpResponse(error)` mapper that returns `{ status, body }` per `contracts/README.md` error envelope
- [x] T016 [P] Define `AIProvider` interface and types at `src/server/services/ai/provider.interface.ts` per `contracts/ai.contract.md` § AIProvider interface
- [x] T017 [P] Define `Moderator` interface and types at `src/server/services/moderation/moderator.interface.ts` per `contracts/moderation.contract.md`
- [x] T018 [P] Implement fake AI provider at `tests/helpers/fakeAIProvider.ts`: deterministic `{ title, body }` output keyed by mode + idea; configurable safety-rejection trigger (e.g. body contains "TRIGGER_REJECT")
- [x] T019 [P] Implement fake moderator at `tests/helpers/fakeModerator.ts`: ALLOW by default; REJECT when input text contains "TRIGGER_REJECT" with category `["hate"]` and reason `"contains banned phrase"`
- [x] T020 [P] Test DB helper at `tests/helpers/db.ts`: per-test transaction or `prismock` setup; truncation reset; user/post factories
- [ ] T021 Create Auth.js v5 config at `src/server/auth/auth.config.ts` using `@auth/prisma-adapter`; providers: `EmailProvider` (magic link, dev transport that logs to console when `EMAIL_SERVER` unset) and `GitHub` (only when env vars present); session strategy `database`; export `auth`, `signIn`, `signOut`, `handlers`
- [ ] T022 [P] Create `getCurrentUser()` helper at `src/server/auth/session.ts` returning `{ id, username, displayName, image } | null`
- [ ] T023 Mount Auth.js handlers at `src/app/api/auth/[...nextauth]/route.ts` exporting `GET` and `POST` from `handlers`
- [ ] T024 [P] Implement rate-limit service at `src/server/services/ratelimit.service.ts` using `@upstash/ratelimit`; export `checkAIGenerationLimit(userId, surface)` returning `{ allowed, retryAfterSeconds, remaining, resetAt }`; throws `RateLimitedError` when exhausted; defaults: 20/hr CREATE, 10/hr REMIX (from `plan.md` cost envelopes)
- [ ] T025 [P] Vitest unit config at `vitest.config.ts` (Node env, alias `@/*`, env defaults `MUSEFLOW_AI_PROVIDER=fake MUSEFLOW_MODERATOR=fake`)
- [ ] T026 [P] Vitest integration config at `vitest.integration.config.ts` (separate include glob `tests/integration/**`, `setupFiles` that boots a Neon test branch or `prismock`)
- [ ] T027 [P] Playwright config at `playwright.config.ts`: mobile viewport (Pixel 5 emulation), Slow 4G throttle, `webServer` runs `pnpm dev`
- [ ] T028 [P] App shell at `src/app/layout.tsx` (root html, viewport meta `width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no`, `theme-color`, fonts, Toaster)
- [ ] T029 [P] BottomNav component at `src/components/nav/BottomNav.tsx`: 4 tabs (Feed, Create, Saved, Profile), active state, touch targets ≥ 44px
- [ ] T030 Authenticated app shell at `src/app/(app)/layout.tsx`: redirects to sign-in if no session; renders BottomNav fixed-bottom, content area scrollable
- [ ] T031 [P] Sign-in page at `src/app/(auth)/sign-in/page.tsx` (mobile-first form: email magic-link primary, GitHub secondary; uses Auth.js client)

**Checkpoint**: Foundation ready — user story implementation can begin.

---

## Phase 3: User Story 1 — Create and Publish an AI-Assisted Post (Priority: P1) 🎯 MVP

**Goal**: A logged-in user enters an idea, picks a tone, gets an AI-generated
title and body, edits, and either publishes (with safety check) or saves as
draft.

**Independent Test**: Sign in → enter idea → pick tone → generate → edit →
publish → confirm post appears at `/post/[id]`. Saving as draft instead keeps
the content out of the public surface but visible in own profile drafts list.

### Tests for User Story 1 (REQUIRED — Principle XI critical flow) ⚠️

> Write these tests FIRST, ensure they FAIL before implementation.

- [ ] T032 [P] [US1] Unit test for AI service: orchestrates rate limit → provider call → moderation → records `Generation` + `SafetyCheck`; uses fake provider/moderator; covers SUCCESS, SAFETY_REJECTED, ERROR, RATE_LIMITED paths in `tests/unit/ai.service.test.ts`
- [ ] T033 [P] [US1] Unit test for moderation service: ALLOW path returns verdict and persists row; REJECT path persists categories + reason; provider error fails-closed in `tests/unit/moderation.service.test.ts`
- [ ] T034 [P] [US1] Unit test for draft service: CRUD scoped to author; cross-author read returns NotFoundError; immutable attribution fields rejected on PATCH in `tests/unit/draft.service.test.ts`
- [ ] T035 [P] [US1] Unit test for post service `publishDraft`: success creates Post + deletes Draft in one tx; safety reject preserves draft; draft missing required fields throws ValidationError in `tests/unit/post.service.test.ts`
- [ ] T036 [P] [US1] Integration test for `POST /api/ai/generate`: 200 ALLOW, 200 REJECT, 401, 400, 429, 502 in `tests/integration/ai.api.test.ts`
- [ ] T037 [P] [US1] Integration test for drafts CRUD endpoints: 401 anon, 200 own, 404 cross-author in `tests/integration/drafts.api.test.ts`
- [ ] T038 [P] [US1] Integration test for `POST /api/drafts/[id]/publish`: 201 creates Post, 422 safety_rejected preserves draft, 400 missing fields, 404 cross-author in `tests/integration/publish.api.test.ts`
- [ ] T039 [P] [US1] E2E test for create+publish flow on mobile viewport in `tests/e2e/create-and-publish.spec.ts`: sign in → create → generate (fake provider) → edit → publish → assert post visible at detail URL

### Implementation for User Story 1

- [ ] T040 [P] [US1] AI prompts module at `src/server/services/ai/prompts.ts`: system prompts for `CREATE`, `REWRITE`, `CONTINUE`, `SUMMARIZE`, `CHANGE_TONE`; each enforces strict JSON output `{ title, body }`
- [ ] T041 [P] [US1] OpenAI provider implementation at `src/server/services/ai/openai-provider.ts`: uses `openai` SDK with `baseURL` override for OpenAI-compatible endpoints; JSON-mode response_format; one retry on JSON parse failure with stricter system msg; second failure throws `AIProviderError`
- [ ] T042 [P] [US1] OpenAI moderator implementation at `src/server/services/moderation/openai-moderator.ts`: calls OpenAI Moderation API; maps flagged categories to canonical `SafetyCategory` union; returns `Moderator` interface
- [ ] T043 [US1] Moderation service at `src/server/services/moderation/moderation.service.ts`: `check(req)` calls configured `Moderator`, persists `SafetyCheck` row, returns result (depends on T017 + T042)
- [ ] T044 [US1] AI service at `src/server/services/ai/ai.service.ts`: `generate(userId, request)` wraps rate-limit (T024) → provider (T041) → JSON validation → moderation (T043) → persists `Generation` row; returns shape per `contracts/ai.contract.md`
- [ ] T045 [P] [US1] AI Zod contracts at `src/lib/contracts/ai.contract.ts`: `AiGenerateRequestSchema` (discriminated union by mode), `AiGenerateOutputSchema`, `AiGenerateResponseSchema` per `contracts/ai.contract.md`
- [ ] T046 [P] [US1] Draft Zod contracts at `src/lib/contracts/draft.contract.ts`: `DraftProjectionSchema`, `DraftCreateSchema`, `DraftPatchSchema` per `contracts/posts.contract.md`
- [ ] T047 [P] [US1] Post Zod contracts at `src/lib/contracts/post.contract.ts`: `PostProjectionSchema`, `PostPatchSchema`, `AttributionProjectionSchema` per `contracts/posts.contract.md`
- [ ] T048 [US1] Draft service at `src/server/services/draft.service.ts`: `createOriginal(userId, tone?)`, `getOwn(userId, draftId)`, `listOwn(userId, cursor, limit)`, `patchOwn(userId, draftId, patch)`, `deleteOwn(userId, draftId)`; all queries hard-scoped by `authorId == userId`
- [ ] T049 [US1] Post service at `src/server/services/post.service.ts`: `publishDraft(userId, draftId)` (transactional: validate fields → moderate user-final text → insert Post + delete Draft + bump parent.remixCount if remix), `editPost(userId, postId, patch)` (re-moderate), `deletePost(userId, postId)`, `getById(viewerId|null, postId)`
- [ ] T050 [US1] Route `POST /api/ai/generate` at `src/app/api/ai/generate/route.ts`: ≤30 lines — `getCurrentUser()` → validate body → `aiService.generate(...)` → format response → set rate-limit headers
- [ ] T051 [US1] Drafts list/create routes at `src/app/api/drafts/route.ts` (GET, POST)
- [ ] T052 [US1] Drafts item routes at `src/app/api/drafts/[id]/route.ts` (GET, PATCH, DELETE)
- [ ] T053 [US1] Publish route at `src/app/api/drafts/[id]/publish/route.ts` (POST)
- [ ] T054 [P] [US1] `ToneSelector` component at `src/components/editor/ToneSelector.tsx`: 5 options, mobile-friendly chip layout, accessible labels
- [ ] T055 [P] [US1] `PostEditor` component at `src/components/editor/PostEditor.tsx`: title input + body textarea with character counts, autosize on mobile, debounced PATCH to draft endpoint
- [ ] T056 [P] [US1] `RejectionNotice` component at `src/components/safety/RejectionNotice.tsx`: shows category + reason, offers Regenerate / Edit / Discard actions
- [ ] T057 [US1] Create page at `src/app/(app)/create/page.tsx`: idea textarea → ToneSelector → "Generate" CTA → calls `/api/ai/generate` → on ALLOW renders PostEditor seeded with output → "Save draft" / "Publish" actions; on REJECT renders RejectionNotice; on RATE_LIMITED shows wait-time toast
- [ ] T058 [US1] Drafts list view at `src/app/(app)/me/drafts/page.tsx`: lists own drafts via `GET /api/drafts`, links to editor
- [ ] T059 [US1] Draft editor view at `src/app/(app)/draft/[id]/page.tsx`: loads draft via `GET /api/drafts/[id]`, reuses PostEditor, exposes Regenerate / Save / Publish / Discard

**Checkpoint**: User Story 1 fully functional. A user can create, edit,
publish, and save drafts. Safety rejections behave per spec. AI generations
recorded for cost tracking.

---

## Phase 4: User Story 2 — Browse the Public Feed (Priority: P1)

**Goal**: Any visitor (anon or logged in) sees a reverse-chronological feed of
published posts; clicking a card opens the full post.

**Independent Test**: After US1 publishes a post, an anonymous browser opens
`/feed` and sees the post card (title, preview, author, time, counts). Click
opens full post.

### Tests for User Story 2 (REQUIRED — Principle XI critical flow) ⚠️

- [ ] T060 [P] [US2] Unit test for feed service: cursor pagination stable under concurrent inserts; status filter excludes REMOVED; preview truncation rules in `tests/unit/feed.service.test.ts`
- [ ] T061 [P] [US2] Integration test for `GET /api/feed`: 200 with valid cursor, 200 empty state, 400 malformed cursor, viewer state populated only when authenticated in `tests/integration/feed.api.test.ts`
- [ ] T062 [P] [US2] Integration test for `GET /api/posts/[id]`: 200 logged-in (with viewer), 200 anon (without viewer), 404 not_found / removed in `tests/integration/post-detail.api.test.ts`

### Implementation for User Story 2

- [ ] T063 [P] [US2] Feed Zod contracts at `src/lib/contracts/feed.contract.ts`: `FeedCardProjectionSchema`, `FeedQuerySchema` per `contracts/feed.contract.md`
- [ ] T064 [US2] Feed service at `src/server/services/feed.service.ts`: `listPublic(viewerId|null, cursor, limit)` runs the indexed cursor query, joins author, computes per-viewer `liked`/`saved` (only when viewerId), truncates body preview per rules
- [ ] T065 [US2] Route `GET /api/feed` at `src/app/api/feed/route.ts`
- [ ] T066 [US2] Route `GET /api/posts/[id]` at `src/app/api/posts/[id]/route.ts`
- [ ] T067 [P] [US2] `FeedCard` component at `src/components/feed/FeedCard.tsx`: mobile-first card with title, preview, author, relative time, count badges, optional `AttributionBadge` for remix
- [ ] T068 [P] [US2] `AttributionBadge` component at `src/components/post/AttributionBadge.tsx`: "Remix of <title> by <author>" with link when parent present, plain text when removed
- [ ] T069 [P] [US2] `FeedList` component at `src/components/feed/FeedList.tsx`: SWR-backed list with 30s revalidate + revalidate-on-focus (decision 7); cursor-based "Load more"; skeleton loaders
- [ ] T070 [P] [US2] `RelativeTime` component at `src/components/ui/RelativeTime.tsx`: hydration-safe relative time formatter
- [ ] T071 [US2] Feed page at `src/app/(app)/feed/page.tsx`: anonymous-friendly (no redirect), mounts FeedList, shows empty-state CTA when zero results
- [ ] T072 [US2] Post detail page at `src/app/(app)/post/[id]/page.tsx`: loads post via `GET /api/posts/[id]`, renders full body, attribution badge if remix, placeholder for InteractionBar (filled in US3)
- [ ] T073 [P] [US2] `SignInPrompt` component at `src/components/auth/SignInPrompt.tsx`: shown when an anonymous user taps an interaction; bottom sheet with "Sign in" / "Create account" CTAs

**Checkpoint**: Anonymous and logged-in users can browse the feed and read
posts. The MVP slice (US1 + US2) is now demonstrable end-to-end.

---

## Phase 5: User Story 3 — Like, Comment, Save (Priority: P2)

**Goal**: Logged-in users like, comment, and save published posts.

**Independent Test**: User A publishes; User B likes (count 0→1, idempotent
re-click toggles), comments (count goes up, comment visible), saves (appears
in B's saved list); B can delete their own comment; A cannot delete B's.

### Tests for User Story 3 (REQUIRED — Principle XI critical flow) ⚠️

- [ ] T074 [P] [US3] Unit test for like service: insert idempotency, toggle decrement, count-equals-distinct-users invariant under concurrent toggles in `tests/unit/like.service.test.ts`
- [ ] T075 [P] [US3] Unit test for save service: per-user privacy, toggle in `tests/unit/save.service.test.ts`
- [ ] T076 [P] [US3] Unit test for comment service: create with safety check, author-only delete, comment count maintenance in `tests/unit/comment.service.test.ts`
- [ ] T077 [P] [US3] Integration test for `POST /api/likes/[postId]`: 200 toggle, 401 anon, 404 missing post, count integrity assertion in `tests/integration/likes.api.test.ts`
- [ ] T078 [P] [US3] Integration test for `POST /api/saves/[postId]` and `GET /api/saves`: privacy (cross-user 401/empty), toggle behavior in `tests/integration/saves.api.test.ts`
- [ ] T079 [P] [US3] Integration test for comments endpoints (POST, GET, DELETE): 422 safety_rejected on bad body, 401 anon, 404 cross-author delete in `tests/integration/comments.api.test.ts`
- [ ] T080 [P] [US3] E2E test for like + comment + save flow on mobile viewport in `tests/e2e/feed-and-interact.spec.ts`

### Implementation for User Story 3

- [ ] T081 [P] [US3] Like Zod contracts at `src/lib/contracts/like.contract.ts`
- [ ] T082 [P] [US3] Save Zod contracts at `src/lib/contracts/save.contract.ts`
- [ ] T083 [P] [US3] Comment Zod contracts at `src/lib/contracts/comment.contract.ts`
- [ ] T084 [US3] Like service at `src/server/services/like.service.ts`: `toggle(userId, postId)` using INSERT … ON CONFLICT DO NOTHING + transactional counter delta; reads also expose `viewerLiked(userId, postId)` for projections
- [ ] T085 [US3] Save service at `src/server/services/save.service.ts`: `toggle(userId, postId)`, `listOwn(userId, cursor, limit)`; queries hard-scoped by userId
- [ ] T086 [US3] Comment service at `src/server/services/comment.service.ts`: `create(userId, postId, body)` (moderation gated), `listForPost(postId, cursor, limit)`, `deleteOwn(userId, commentId)`; counter maintenance in tx
- [ ] T087 [US3] Route `POST /api/likes/[postId]` at `src/app/api/likes/[postId]/route.ts`
- [ ] T088 [US3] Route `POST /api/saves/[postId]` at `src/app/api/saves/[postId]/route.ts`
- [ ] T089 [US3] Route `GET /api/saves` at `src/app/api/saves/route.ts`
- [ ] T090 [US3] Comments routes at `src/app/api/comments/route.ts` (POST) and `src/app/api/posts/[id]/comments/route.ts` (GET) and `src/app/api/comments/[id]/route.ts` (DELETE)
- [ ] T091 [P] [US3] `InteractionBar` component at `src/components/post/InteractionBar.tsx`: like/comment/save/remix buttons; optimistic toggle for like and save; shows SignInPrompt for anonymous users
- [ ] T092 [P] [US3] `CommentList` component at `src/components/post/CommentList.tsx`: oldest-first, paginated, delete affordance only when `viewer.isAuthor`
- [ ] T093 [P] [US3] `CommentForm` component at `src/components/post/CommentForm.tsx`: 1000-char textarea, submit handler, surfaces 422 safety rejection inline
- [ ] T094 [US3] Wire InteractionBar + CommentList + CommentForm into post detail page (T072)
- [ ] T095 [US3] Saved view at `src/app/(app)/saved/page.tsx`: lists own saved posts (uses `GET /api/saves`)

**Checkpoint**: Engagement features complete. Like / comment / save invariants
verified by tests. SignInPrompt protects anonymous users from accidental
interaction attempts.

---

## Phase 6: User Story 4 — Remix with AI (Priority: P2)

**Goal**: Logged-in users remix any published post via 4 modes; the resulting
post preserves attribution to the original.

**Independent Test**: User A publishes post X. User B clicks Remix on X,
chooses summarize, AI produces a draft pre-attributed to X, B edits and
publishes; new post appears in feed with attribution to X and A; X's
remixCount goes 0→1; clicking attribution navigates to X.

### Tests for User Story 4 (REQUIRED — Principle XI critical flow) ⚠️

- [ ] T096 [P] [US4] Unit test for remix service: attribution snapshot captured at draft time and immutable; rate-limit enforced; AI safety reject preserves draft with REJECT verdict in `tests/unit/remix.service.test.ts`
- [ ] T097 [P] [US4] Unit test for attribution service: orphan handling (parent removed → snapshot rendered as non-clickable text) in `tests/unit/attribution.service.test.ts`
- [ ] T098 [P] [US4] Integration test for `POST /api/remix/[postId]`: 201 creates draft + Generation, 201 with REJECT verdict on AI safety reject, 429 rate-limited, 404 missing source in `tests/integration/remix.api.test.ts`
- [ ] T099 [P] [US4] Integration test for publishing a remix: parent.remixCount += 1 atomically; remixCount stays correct under concurrent publish in `tests/integration/remix-publish.api.test.ts`
- [ ] T100 [P] [US4] E2E test for remix flow on mobile viewport in `tests/e2e/remix.spec.ts`

### Implementation for User Story 4

- [ ] T101 [P] [US4] Remix Zod contracts at `src/lib/contracts/remix.contract.ts`: `RemixInitRequestSchema`, `RemixInitResponseSchema` per `contracts/interactions.contract.md`
- [ ] T102 [P] [US4] Attribution service at `src/server/services/attribution.service.ts`: `buildProjection(post)` returns `AttributionProjection | null`, joining live parent if present and falling back to `parentAuthorSnapshot`
- [ ] T103 [US4] Remix service at `src/server/services/remix.service.ts`: `createRemixDraft(userId, sourcePostId, mode, targetTone?)` — fetches source, calls `aiService.generate(REMIX, mode)`, creates Draft with parentId + parentAuthorSnapshot + remixMode, returns draft + safety verdict; atomic on AI provider error (no draft)
- [ ] T104 [US4] Route `POST /api/remix/[postId]` at `src/app/api/remix/[postId]/route.ts`
- [ ] T105 [US4] Update `post.service.publishDraft` (T049) to bump `parent.remixCount` in the same tx when the publishing draft has a `parentId` — verify with new integration test (T099)
- [ ] T106 [US4] Update feed and post-detail projections to include `attribution` (via T102) when `isRemix`
- [ ] T107 [P] [US4] `RemixModeSelector` component at `src/components/editor/RemixModeSelector.tsx`: bottom sheet with 4 modes; CHANGE_TONE reveals nested tone selection
- [ ] T108 [US4] Remix entry page at `src/app/(app)/post/[id]/remix/page.tsx`: shows source preview, RemixModeSelector, calls `POST /api/remix/[postId]`, redirects to draft editor on success; surfaces RejectionNotice if AI output rejected
- [ ] T109 [US4] Wire Remix button in `InteractionBar` (T091) to navigate to `/post/[id]/remix`

**Checkpoint**: Remix flow complete with attribution preserved end-to-end.
The full content loop (idea → generation → editing → publishing → browsing →
interaction → remix → new content) is demonstrable.

---

## Phase 7: User Story 5 — Profile (Priority: P3)

**Goal**: Users see their own profile with 4 sections (published, drafts,
saved, remixes); other users see only published content.

**Independent Test**: Open own profile → 4 tabs visible. Open another user's
public profile → only published-posts list; no drafts or saved.

### Tests for User Story 5 ⚠️

- [ ] T110 [P] [US5] Unit test for profile service: own projection includes private counts; public projection excludes drafts/saved entirely in `tests/unit/profile.service.test.ts`
- [ ] T111 [P] [US5] Integration test for `GET /api/me` and `GET /api/profile/[username]`: 401 anon for /me; never expose email or drafts on public; rename uniqueness in PATCH /api/me in `tests/integration/profile.api.test.ts`

### Implementation for User Story 5

- [ ] T112 [P] [US5] Profile Zod contracts at `src/lib/contracts/profile.contract.ts`
- [ ] T113 [US5] Profile service at `src/server/services/profile.service.ts`: `getOwnShell(userId)`, `getPublic(username)`, `listOwnPublished/Drafts/Saved/Remixes(userId, cursor, limit)`, `listPublicPublished(username, cursor, limit)`, `updateProfile(userId, patch)` with displayName/username uniqueness checks
- [ ] T114 [US5] Routes under `src/app/api/me/route.ts` (GET, PATCH), `src/app/api/me/posts/route.ts`, `src/app/api/me/drafts/route.ts` (delegates to drafts list), `src/app/api/me/saved/route.ts`, `src/app/api/me/remixes/route.ts`
- [ ] T115 [US5] Public profile routes at `src/app/api/profile/[username]/route.ts` and `src/app/api/profile/[username]/posts/route.ts`
- [ ] T116 [P] [US5] Own profile page at `src/app/(app)/me/page.tsx`: 4 tabs (Published / Drafts / Saved / Remixes) using shadcn Tabs
- [ ] T117 [P] [US5] Public profile page at `src/app/(app)/profile/[username]/page.tsx`: header + published-only feed
- [ ] T118 [P] [US5] Profile edit form at `src/app/(app)/me/edit/page.tsx`: displayName, username, description, image; surfaces 409 conflict for taken names

**Checkpoint**: All five user stories are independently functional. The MVP
loop is complete.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: PWA polish, performance budget verification, and final hardening.

- [ ] T119 [P] PWA manifest at `src/app/manifest.ts` (App Router manifest convention): name, short_name, theme_color, background_color, display=standalone, icons set
- [ ] T120 [P] PWA icons at `public/icons/` (192px, 512px, maskable, apple-touch-icon) — placeholder SVG/PNG until brand assets exist
- [ ] T121 Service worker via `@serwist/next` (or `next-pwa`) with offline shell + network-first for `/api/*` and `/feed`, cache-first for static assets
- [ ] T122 [P] Add `next-sitemap` or app-router-native sitemap/robots for the public feed and public profiles
- [ ] T123 [P] `pnpm db:seed` script at `prisma/seed.ts` creates `alice@example.com`, `bob@example.com`, 5 published posts with varied tones, 2 remixes (per quickstart.md § 3)
- [ ] T124 [P] Run Lighthouse mobile profile against `/feed`, `/create`, `/post/[id]`; record baseline in `specs/001-mvp-content-loop/.lighthouse-baseline.json`; assert PWA category ≥ 90
- [ ] T125 [P] Add a CI workflow at `.github/workflows/ci.yml`: install, lint, typecheck, `test:unit`, `test:integration` (against ephemeral Neon branch), `test:e2e` (mobile viewport)
- [ ] T126 [P] Verify Constitution gates by reading `specs/001-mvp-content-loop/plan.md` "Constitution Check" and inspecting code: no `openai` import outside `src/server/services/ai/`; no business logic in `src/app/**/page.tsx` or `route.ts`; PWA manifest + SW shipped; record evidence in PR description
- [ ] T127 Run quickstart.md § 5 critical-flow walkthrough manually on a real Android device or accurate mobile emulation; document any deviations as follow-up issues, not silent fixes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: T001 first; T002–T010 can parallelize after T001
- **Phase 2 (Foundational)**: depends on Phase 1; BLOCKS all user stories
  - Within Phase 2: T011 then T012 sequential; everything else parallel after T012
- **Phase 3 (US1)**: depends on Phase 2; tests T032–T039 first; implementation in order
- **Phase 4 (US2)**: depends on Phase 2; can run in parallel with US1 if staffed (no shared file dependencies)
- **Phase 5 (US3)**: depends on Phase 2 + US1's Post/Draft entities (already in T011); independent of US2 file-wise
- **Phase 6 (US4)**: depends on US1 (publishDraft) and on a published post existing; otherwise independent
- **Phase 7 (US5)**: depends on Phases 2 + US1; independent of US3/US4 file-wise (uses their counts via DB only)
- **Phase 8 (Polish)**: depends on all user stories being deemed done

### User Story Dependencies (informal)

- **US1 (P1)**: Foundational only.
- **US2 (P1)**: Foundational only. Can be implemented in parallel with US1.
- **US3 (P2)**: Foundational + entities; functionally requires US1 to have produced a published post for manual testing, but tests can use seeded data.
- **US4 (P2)**: Foundational + US1 (calls `aiService` and `publishDraft`); tests rely on US1's services.
- **US5 (P3)**: Foundational + US1; queries published posts and drafts.

### Within Each User Story

- Tests written first; verified to FAIL before implementation begins.
- Zod contracts before services that consume them.
- Services before route handlers; route handlers before pages.
- UI components in parallel with services; pages last (compose both).

### Parallel Opportunities

- All `[P]` tasks within a phase can run in parallel.
- After T012 completes, every other foundational task is `[P]`.
- After Foundational completes, **US1 and US2 can run fully in parallel** with two contributors.
- US5 can run in parallel with US3/US4 once US1 ships (no file conflicts; only DB shape dependencies, already locked by T011).

---

## Parallel Example: Foundational Phase (Phase 2 after T012)

```bash
# Single contributor or one assistant per task — no shared file conflicts:
T013 src/server/db/prisma.ts
T014 src/lib/contracts/shared.ts
T015 src/server/errors.ts
T016 src/server/services/ai/provider.interface.ts
T017 src/server/services/moderation/moderator.interface.ts
T018 tests/helpers/fakeAIProvider.ts
T019 tests/helpers/fakeModerator.ts
T020 tests/helpers/db.ts
T022 src/server/auth/session.ts
T024 src/server/services/ratelimit.service.ts
T025 vitest.config.ts
T026 vitest.integration.config.ts
T027 playwright.config.ts
T028 src/app/layout.tsx
T029 src/components/nav/BottomNav.tsx
T031 src/app/(auth)/sign-in/page.tsx
```

T021 (Auth.js config) and T023 (mount handler) are sequential because T023
imports from T021. T030 ((app) layout) follows T021 because it uses the
session helper.

## Parallel Example: User Story 1 tests (Phase 3 start)

```bash
# All test files are independent — write them in parallel:
T032 tests/unit/ai.service.test.ts
T033 tests/unit/moderation.service.test.ts
T034 tests/unit/draft.service.test.ts
T035 tests/unit/post.service.test.ts
T036 tests/integration/ai.api.test.ts
T037 tests/integration/drafts.api.test.ts
T038 tests/integration/publish.api.test.ts
T039 tests/e2e/create-and-publish.spec.ts
```

All eight should FAIL initially (services don't exist yet); they pass as
implementation tasks T040–T059 land.

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Phase 1 + Phase 2 (foundation)
2. Phase 3 (US1: create + publish)
3. Phase 4 (US2: feed)
4. **STOP and VALIDATE** — at this point a logged-in user can publish, and
   anyone can read. This is a demonstrable, deployable MVP.
5. Run mobile-viewport e2e (T039) and Lighthouse mobile profile manually.

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. - US1 + US2 → Public MVP (deployable)
3. - US3 → Engagement (likes/comments/saves)
4. - US4 → Remix (the differentiator)
5. - US5 → Profile completeness
6. - Polish → Release-ready PWA

### Parallel Team Strategy

With 2 engineers post-foundation:

- Eng A: US1 implementation (tests + services + UI)
- Eng B: US2 implementation (tests + services + UI)

Then merge, deploy MVP, then split US3 / US4 / US5 across remaining capacity.

---

## Notes

- `[P]` tasks operate on different files with no shared write dependencies.
- `[Story]` label maps each US-phase task to its user story for traceability;
  Setup, Foundational, and Polish carry no label.
- Service modules are the source of truth for business rules per Constitution
  Principle IX. Route handlers stay ≤ 30 lines.
- All AI access goes through `AIProvider` (T016); no `openai` SDK import
  outside `src/server/services/ai/`. Reviewers enforce this gate per the
  constitution.
- All public transitions (publish, edit-publish, comment-create) call the
  moderation service per Constitution Principle VI.
- Drafts and the saved list are author-private; tests T037, T078, T111
  verify no leak to public surfaces.
- Critical-flow tests (US1, US2, US3, US4) are non-optional per Constitution
  Principle XI.
- Commit per task or logical group; mobile-viewport review is mandatory for
  any PR touching UI.
- Avoid: vague tasks, same-file write conflicts within a `[P]` group,
  cross-story dependencies that break independence beyond what's documented.

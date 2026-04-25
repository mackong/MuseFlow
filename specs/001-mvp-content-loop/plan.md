# Implementation Plan: MVP Core Content Loop

**Branch**: `001-mvp-content-loop` | **Date**: 2026-04-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-mvp-content-loop/spec.md`

**Note**: This plan was filled by `/speckit-plan`. It governs implementation of the
MuseFlow MVP content loop: AI-assisted post creation, public feed, interaction
(like / comment / save), AI remix with attribution, and user profiles —
delivered as a mobile-first PWA on Next.js.

## Summary

Build the MuseFlow MVP content loop as a mobile-first PWA backed by an API-first
service layer. Users sign in, generate AI-assisted posts with a tone selector,
edit and either publish or save as draft, browse a public reverse-chronological
feed, like / comment / save posts, remix posts via four generation modes
(rewrite, continue, summarize, change tone) with attribution preserved, and view
profiles (own with four sections; public with published-only). All AI generation
goes through a provider abstraction; all public transitions run safety
moderation; AI calls are rate-limited per user and logged for cost tracking.

The architectural commitments are:

- **Frontend**: Next.js (App Router) + TypeScript + Tailwind + shadcn/ui,
  mobile-first, installable PWA.
- **Backend**: Next.js Route Handlers as thin transport layer; **business logic
  lives in `src/server/services/`** per Constitution Principle IX.
- **Persistence**: PostgreSQL via Prisma.
- **AI**: Provider-agnostic interface; MVP implementation uses an
  OpenAI-compatible client. Switching providers is a config + new adapter file,
  not a refactor.
- **Moderation**: Service abstraction with an OpenAI Moderation default; runs
  on AI output before display-as-publishable AND on user input at the moment
  of publish (the two safety gates from Principle VI).
- **Auth**: Auth.js (Email + OAuth credentials).

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), Node.js 20.x LTS
**Primary Dependencies**: Next.js 15 (App Router), React 19, Tailwind CSS 3.x,
shadcn/ui, Prisma 5.x, Auth.js v5, Zod, OpenAI SDK (or `fetch` against
OpenAI-compatible endpoints), `@upstash/ratelimit` (or equivalent), `sonner` for toasts,
`next-pwa` (or hand-rolled service worker + manifest)
**Storage**: PostgreSQL 15+ (Neon for managed dev/preview/prod; Supabase as
alternative — see research.md). Prisma manages migrations.
**Testing**: Vitest (unit + service tests), Vitest + supertest-style helpers
for API route integration tests, Playwright for end-to-end critical-flow tests
on mobile viewport
**Target Platform**: Mobile web (primary) + responsive desktop. Installable
PWA on iOS Safari and Android Chrome. Server runs on Vercel.
**Project Type**: Web application (single Next.js project; no separate
backend repo). Service modules are repo-internal but architected so a future
Expo / React Native client can call the same HTTP API surface (Principle IX).
**Performance Goals**:

- Feed first contentful paint < 1.8s on a mid-tier Android device over a
  simulated Slow 4G network
- Largest contentful paint < 2.5s on the same profile
- Time to interactive < 3.5s on the same profile
- Lighthouse PWA category ≥ 90 on mobile profile at release
- AI generation P95 end-to-end ≤ 8s (server time excluding model latency
  variance is the goal; total wall clock depends on provider)
  **Constraints**:
- Initial JS bundle for the app shell ≤ 200 KB gzipped (excluding fonts and
  the editor surface, which may be route-split)
- No business logic inside `src/app/**/page.tsx` or `src/app/**/route.ts`
  beyond schema validation and a single service call
- All LLM access flows through `src/server/services/ai/provider.interface.ts`
- All publish transitions invoke the moderation service before persisting the
  public state change
  **Scale/Scope**:
- MVP target: ≤ 10k registered users, ≤ 100k posts in feed table, peak ~50
  concurrent requests; well within a single Postgres + Vercel serverless
  configuration
- Code surface: 5 user stories, ~10 service modules, ~15 API endpoints,
  ~12 main UI screens

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

Evaluation against Constitution v2.0.0 (`.specify/memory/constitution.md`):

| #    | Principle                  | Plan Posture                                                                                                                                                                                                                | Gate Result |
| ---- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| I    | Mobile-First Experience    | Tailwind + shadcn/ui designed mobile-first; bottom tab nav (`(app)/_components/BottomNav`); single-column feed; touch targets ≥ 44px; performance budgets in Technical Context                                              | **PASS**    |
| II   | App-Like PWA Behavior      | `next-pwa` (or manual SW) with offline shell; web manifest + iOS/Android icons; client-side navigation between feed/create/profile; bottom-sheet UI for actions (shadcn `Sheet`); skeleton loaders                          | **PASS**    |
| III  | Human-Centered AI Creation | Generate flow returns to editable draft; explicit "Publish" / "Save draft" / "Regenerate" buttons; no auto-publish path exists in the API contract                                                                          | **PASS**    |
| IV   | Content Interaction Loop   | All 5 user stories cover idea → generation → editing → publishing → browsing → interaction → remix → new content                                                                                                            | **PASS**    |
| V    | Remix and Attribution      | `Post.parentId` + `Post.parentAuthorSnapshot` set at remix-draft creation, persisted through publish; UI shows "Remix of …"; orphan handling preserves text reference                                                       | **PASS**    |
| VI   | Safety by Design (NN)      | Moderation service called from `ai.service.ts` after generation AND from `post.service.ts.publish()` and `comment.service.ts.create()`; rejection returns a `SafetyRejection` with category + reason                        | **PASS**    |
| VII  | Privacy and Data Control   | Drafts table / draft status filtered by `authorId` only; public feed and public profile queries hard-filter `status = 'PUBLISHED'`; no training opt-in field touched in MVP (default off)                                   | **PASS**    |
| VIII | Model-Provider Flexibility | `AIProvider` interface in `src/server/services/ai/provider.interface.ts`; MVP impl `openai-provider.ts`; provider chosen via env config; feature code imports the interface, never the SDK                                  | **PASS**    |
| IX   | API-First Backend Design   | All business logic in `src/server/services/`; route handlers in `src/app/api/**` are ≤ 30 lines (validate → call service → respond); shared contracts in `src/lib/contracts/` are reusable by a future RN/Expo client       | **PASS**    |
| X    | Cost-Aware AI              | Every `aiProvider.generate()` call wraps a `Generation` record (provider, model, latency, status, token counts when available, feature surface); rate-limit middleware in service layer; per-feature budgets declared below | **PASS**    |
| XI   | Testable Behavior (NN)     | Vitest unit tests for every service module; integration tests for every route in `tests/integration/`; Playwright e2e covering create+publish, interact, remix end-to-end                                                   | **PASS**    |
| XII  | Fast MVP Iteration         | No images/video/audio/agents/native build in scope; single Postgres; no microservices; no caching layer beyond Next.js defaults; no recommendation engine                                                                   | **PASS**    |

**Gate result (pre-research)**: PASS. No Complexity Tracking entries required.

**Gate re-check (post Phase 1 design)**: PASS. The data model, contracts,
service layout, and quickstart introduce no new principle violations:

- The `AIProvider` and `Moderator` interfaces are concretely specified, with
  the SDK isolated to a single adapter file (Principles VIII, VI).
- All endpoints in `contracts/` are owned by service modules; route handlers
  remain thin (Principle IX).
- The data model carries `parentAuthorSnapshot` JSONB to preserve attribution
  through parent deletion (Principle V).
- Drafts and saves never appear in any public projection in `contracts/`
  (Principle VII).
- The `Generation` table records provider, model, latency, status, and tokens
  (Principle X).
- Feed and profile contracts hard-filter `status = PUBLISHED` (Principles VI
  and VII).
- The quickstart's mobile-first review checklist enforces Principle I at PR
  time, and the PWA section enforces Principle II.

**Per-feature cost envelopes (Principle X)**:

- Create generation: 1 LLM call/idea, target avg input ≤ 200 tokens, output ≤ 600 tokens
- Regenerate: same envelope, counted separately for budgeting
- Remix: 1 LLM call, target avg input ≤ 1200 tokens (original + instruction), output ≤ 800 tokens
- Moderation: 1 moderation call per AI output AND per publish; cheap
- Per-user rate limit defaults (revisable): 20 generations/hour, 10 remixes/hour

## Project Structure

### Documentation (this feature)

```text
specs/001-mvp-content-loop/
├── plan.md                  # This file (/speckit-plan command output)
├── research.md              # Phase 0 output
├── data-model.md            # Phase 1 output
├── quickstart.md            # Phase 1 output
├── contracts/               # Phase 1 output (per-resource API contracts)
│   ├── README.md
│   ├── auth.contract.md
│   ├── posts.contract.md
│   ├── drafts.contract.md
│   ├── comments.contract.md
│   ├── likes.contract.md
│   ├── saves.contract.md
│   ├── remix.contract.md
│   ├── ai.contract.md
│   ├── moderation.contract.md
│   ├── feed.contract.md
│   └── profile.contract.md
├── checklists/
│   └── requirements.md      # from /speckit-specify
└── tasks.md                 # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

Web application — single Next.js project with strong service-module discipline
per Constitution Principle IX:

```text
src/
├── app/                                  # Next.js App Router (UI + thin handlers)
│   ├── (auth)/                           # sign-in / sign-up routes
│   ├── (app)/                            # authenticated app shell w/ bottom tab nav
│   │   ├── feed/page.tsx
│   │   ├── create/page.tsx
│   │   ├── post/[id]/page.tsx
│   │   ├── post/[id]/remix/page.tsx
│   │   ├── profile/[username]/page.tsx
│   │   └── me/page.tsx                   # own profile w/ drafts/saved/remixes
│   ├── api/                              # Route Handlers — thin transport layer
│   │   ├── auth/[...nextauth]/route.ts
│   │   ├── posts/route.ts                # GET feed, POST publish
│   │   ├── posts/[id]/route.ts           # GET detail, PATCH edit, DELETE
│   │   ├── drafts/route.ts               # GET own drafts, POST create
│   │   ├── drafts/[id]/route.ts          # GET, PATCH, DELETE
│   │   ├── comments/route.ts             # POST create
│   │   ├── comments/[id]/route.ts        # DELETE
│   │   ├── likes/[postId]/route.ts       # POST toggle
│   │   ├── saves/[postId]/route.ts       # POST toggle
│   │   ├── remix/[postId]/route.ts       # POST start remix → returns draft id
│   │   ├── ai/generate/route.ts          # POST generation (mode discriminator)
│   │   ├── moderation/check/route.ts     # POST (server-internal use; no UI)
│   │   ├── feed/route.ts                 # GET paginated public feed
│   │   └── profile/[username]/route.ts   # GET public profile
│   ├── manifest.ts                       # PWA manifest
│   ├── icon.tsx / apple-icon.tsx         # PWA icons
│   ├── layout.tsx
│   └── globals.css
│
├── server/                               # Server-only code; never imported by client
│   ├── services/
│   │   ├── post.service.ts               # publish, edit, delete, view-detail
│   │   ├── draft.service.ts              # CRUD on drafts (private to author)
│   │   ├── comment.service.ts            # create, delete, list-by-post
│   │   ├── like.service.ts               # toggle (idempotent per user-post)
│   │   ├── save.service.ts               # toggle (private list)
│   │   ├── remix.service.ts              # createRemixDraft (calls ai+moderation)
│   │   ├── feed.service.ts               # paginated reverse-chrono query
│   │   ├── profile.service.ts            # own + public projection
│   │   ├── ai/
│   │   │   ├── provider.interface.ts     # AIProvider type — the abstraction
│   │   │   ├── openai-provider.ts        # MVP impl (OpenAI-compatible)
│   │   │   ├── prompts.ts                # system prompts per generation mode
│   │   │   └── ai.service.ts             # generate(...), records Generation row
│   │   ├── moderation/
│   │   │   ├── moderator.interface.ts    # Moderator type
│   │   │   ├── openai-moderator.ts       # MVP impl
│   │   │   └── moderation.service.ts     # check(...), records SafetyCheck row
│   │   ├── ratelimit.service.ts          # @upstash/ratelimit-backed
│   │   └── attribution.service.ts        # parent snapshot + display formatting
│   ├── db/
│   │   └── prisma.ts                     # singleton Prisma client
│   ├── auth/
│   │   ├── auth.config.ts                # Auth.js v5 config
│   │   └── session.ts                    # getCurrentUser() helper
│   └── errors.ts                         # typed errors mapped to HTTP responses
│
├── lib/
│   ├── contracts/                        # Zod schemas — REUSABLE by future RN client
│   │   ├── post.contract.ts
│   │   ├── draft.contract.ts
│   │   ├── comment.contract.ts
│   │   ├── like.contract.ts
│   │   ├── save.contract.ts
│   │   ├── remix.contract.ts
│   │   ├── ai.contract.ts
│   │   ├── feed.contract.ts
│   │   ├── profile.contract.ts
│   │   └── shared.ts
│   ├── http/                             # client-side fetch helpers (used by RSCs/CSRs)
│   └── utils/
│
├── components/                           # UI components (mobile-first)
│   ├── ui/                               # shadcn/ui primitives
│   ├── nav/BottomNav.tsx                 # 4-tab bottom navigation
│   ├── nav/AppShell.tsx
│   ├── feed/FeedCard.tsx
│   ├── feed/FeedList.tsx
│   ├── post/PostDetail.tsx
│   ├── post/InteractionBar.tsx           # like / comment / save / remix buttons
│   ├── post/AttributionBadge.tsx         # "Remix of … by …"
│   ├── editor/PostEditor.tsx             # title + body editor (mobile-first)
│   ├── editor/ToneSelector.tsx
│   ├── editor/RemixModeSelector.tsx
│   ├── safety/RejectionNotice.tsx
│   └── auth/SignInPrompt.tsx
│
└── styles/

prisma/
└── schema.prisma                         # all data model entities

public/
├── manifest.webmanifest                  # (or generated by app/manifest.ts)
├── icons/                                # PWA icon set
└── ...

tests/
├── unit/                                 # service-layer tests (Vitest)
│   ├── post.service.test.ts
│   ├── like.service.test.ts              # idempotency, count integrity
│   ├── remix.service.test.ts             # attribution preservation
│   ├── ai.service.test.ts                # uses fake provider
│   └── moderation.service.test.ts
├── integration/                          # API route handlers
│   ├── posts.api.test.ts
│   ├── likes.api.test.ts
│   ├── remix.api.test.ts
│   └── ...
├── e2e/                                  # Playwright, mobile viewport
│   ├── create-and-publish.spec.ts
│   ├── feed-and-interact.spec.ts
│   └── remix.spec.ts
└── helpers/
    ├── fakeAIProvider.ts
    ├── fakeModerator.ts
    └── db.ts                             # test db setup/teardown
```

**Structure Decision**: Single Next.js project (App Router) with a strict
`src/app` (transport) / `src/server/services` (business logic) split. Shared
Zod contracts in `src/lib/contracts` are the same artifacts a future Expo /
React Native client will import to talk to these endpoints. This satisfies
Constitution Principle IX (API-First Backend Design) without paying the cost
of a separate backend repo at MVP scale.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. Table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --------- | ---------- | ------------------------------------ |
| _(none)_  | _(n/a)_    | _(n/a)_                              |

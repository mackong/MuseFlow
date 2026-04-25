# Quickstart: MVP Core Content Loop

**Feature**: 001-mvp-content-loop
**Audience**: A new contributor or future-you returning to this branch.

This document is the smallest set of steps to get the feature running locally,
with a real database, a fake AI provider, and a fake moderator. Before
implementation begins this is a _forward-looking_ runbook; once the feature
ships, it doubles as the README section pointed to from
`/api/healthz`-style operational docs.

> Implementation status: this is the planning artifact. The commands below
> reference paths that will exist after `/speckit-tasks` and the implementation
> phase complete.

## Prerequisites

- Node.js 20.x LTS (`nvm use 20` or `volta install node@20`)
- pnpm 9 (`corepack enable && corepack prepare pnpm@latest --activate`)
- A Postgres database. Two convenient options:
  - **Neon** (recommended; matches production): create a free project, copy
    the pooled connection string.
  - **Local Docker**: `docker run --name museflow-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:15`
- An OpenAI-compatible API key (only required to exercise the real AI path; the
  default test setup uses a fake provider).

## 1. Clone and install

```bash
git clone <repo-url> museflow
cd museflow
pnpm install
```

## 2. Configure environment

Copy the example env file and fill in:

```bash
cp .env.example .env.local
```

| Variable                   | Required for | Notes                                                                                                 |
| -------------------------- | ------------ | ----------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`             | always       | Pooled Postgres URL (Neon's `?pgbouncer=true&connection_limit=1` flavor)                              |
| `DIRECT_DATABASE_URL`      | migrations   | Direct (non-pooled) URL for `prisma migrate`                                                          |
| `AUTH_SECRET`              | always       | Generate with `openssl rand -base64 32`                                                               |
| `AUTH_URL`                 | always       | `http://localhost:3000` for local dev                                                                 |
| `EMAIL_SERVER`             | optional     | SMTP URL for magic-link sign-in. Omit to use the dev email transport that prints links to the console |
| `EMAIL_FROM`               | optional     | `MuseFlow <noreply@museflow.local>`                                                                   |
| `GITHUB_CLIENT_ID`         | optional     | OAuth GitHub app for one-click sign-in                                                                |
| `GITHUB_CLIENT_SECRET`     | optional     |                                                                                                       |
| `OPENAI_API_KEY`           | real AI      | Or any OpenAI-compatible key                                                                          |
| `OPENAI_BASE_URL`          | optional     | Override for OpenAI-compatible providers (default: official OpenAI)                                   |
| `OPENAI_MODEL`             | always       | e.g., `gpt-4o-mini`                                                                                   |
| `OPENAI_MODERATION_MODEL`  | always       | e.g., `omni-moderation-latest`                                                                        |
| `UPSTASH_REDIS_REST_URL`   | rate limit   | From Upstash console                                                                                  |
| `UPSTASH_REDIS_REST_TOKEN` | rate limit   |                                                                                                       |
| `MUSEFLOW_AI_PROVIDER`     | optional     | `openai` (default) or `fake` (no key required)                                                        |
| `MUSEFLOW_MODERATOR`       | optional     | `openai` (default) or `fake`                                                                          |

For first-run smoke testing without external services, set:

```bash
MUSEFLOW_AI_PROVIDER=fake
MUSEFLOW_MODERATOR=fake
```

## 3. Set up the database

```bash
pnpm prisma migrate dev          # creates schema and applies all migrations
pnpm db:seed                     # optional — populates demo users and posts
```

`pnpm db:seed` creates two users (`alice@example.com`, `bob@example.com`),
five published posts across different tones, and a couple of remixes — enough
to render the feed and exercise like/comment/save manually.

## 4. Run the dev server

```bash
pnpm dev
```

Open http://localhost:3000 in a **mobile viewport** (Chrome DevTools device
mode, Pixel 5 profile). The app should match Constitution Principle I from
the first frame; if it looks like a desktop site, that is a bug.

## 5. Verify the critical flows

In order — these correspond to the user stories in `spec.md` and to the
Playwright e2e specs in `tests/e2e/`:

1. **Sign in**: click "Sign in" on the landing page, enter your email,
   follow the magic link printed to the dev console (or sent via SMTP if
   configured).
2. **Create + publish (US1)**: tap the create tab, enter an idea such as
   "the joy of walking at dawn", pick a tone, generate, edit, publish. The
   post should appear in the feed within a few seconds.
3. **Browse feed (US2)**: open the feed tab. Cards show title, body
   preview, author, time, and counts. Click a card to read the full post.
4. **Like / comment / save (US3)**: on the post detail, tap like (count
   goes 0 → 1), tap again (1 → 0), leave a comment, save the post. The
   saved post appears in your own profile's saved tab.
5. **Remix (US4)**: on a published post by someone else, tap remix, pick
   "summarize", let the AI run, edit, publish. The new post appears on the
   feed with attribution to the original.
6. **Profile (US5)**: open your own profile. You should see four sections:
   published, drafts, saved, remixes. Open another user's public profile;
   confirm only published posts are visible there.

## 6. Run the test suite

```bash
pnpm test:unit            # Vitest unit tests for src/server/services/
pnpm test:integration     # API route handler integration tests (uses test DB)
pnpm test:e2e             # Playwright on mobile viewport (creates a test user)
pnpm test                 # all of the above
```

The unit tests use `MUSEFLOW_AI_PROVIDER=fake` and `MUSEFLOW_MODERATOR=fake`
automatically — no API keys required.

## 7. Common pitfalls

- **Magic links not arriving**: check the dev console; the email transport
  in dev mode prints links rather than sending them.
- **`Module not found: @prisma/client`**: run `pnpm prisma generate`.
- **Feed never updates after publishing in another tab**: the feed
  revalidates on focus and on a 30s interval (decision 7 in `research.md`).
  Switch tabs to bring it to focus, or wait.
- **Rate limit hit during testing**: bump `MUSEFLOW_AI_PROVIDER=fake` to
  bypass the limiter and the real provider altogether.
- **PWA install option missing**: only available over HTTPS. Use
  `pnpm dev:https` (uses `mkcert` to generate a local cert) or run against a
  Vercel preview deployment.

## 8. Mobile-first review checklist (from Constitution v2.0.0)

When opening a PR for any UI change in this feature, confirm:

- [ ] Reviewed in a mobile viewport (Pixel 5 emulation or real device)
- [ ] Touch targets ≥ 44 pt
- [ ] No horizontal overflow at 360px width
- [ ] Bottom tab nav remains usable; no critical actions buried in
      desktop-style menus
- [ ] Skeleton / loading states present on all data-fetching screens
- [ ] Lighthouse mobile run shows no regression on Performance or PWA score

## 9. Where to look when something is wrong

| Symptom                                  | First place to look                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| AI calls failing                         | `src/server/services/ai/openai-provider.ts` and `Generation` table              |
| "safety_rejected" with no obvious reason | `SafetyCheck` table for the latest row, surface = `AI_OUTPUT` or `POST_PUBLISH` |
| Like count drift                         | Reconcile by `SELECT COUNT(*) FROM Like WHERE postId = ?` vs `Post.likeCount`   |
| Remix attribution missing                | `parentAuthorSnapshot` JSONB column on the remix `Post` row                     |
| Public surface leaking a draft           | Search every read path for the missing `status = 'PUBLISHED'` filter            |

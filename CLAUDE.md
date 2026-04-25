<!-- SPECKIT START -->

For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at `specs/001-mvp-content-loop/plan.md` (and its companions
`research.md`, `data-model.md`, `quickstart.md`, and `contracts/`).

**Chosen MVP stack** (governed by `.specify/memory/constitution.md` v2.0.0):

- Frontend: Next.js 15 App Router, TypeScript, Tailwind CSS, shadcn/ui;
  mobile-first PWA (manifest + service worker, installable).
- Backend: Next.js Route Handlers as a thin transport layer over
  service modules in `src/server/services/`. Business logic MUST NOT live
  in `src/app/**/page.tsx` or `src/app/**/route.ts`.
- Database: PostgreSQL via Prisma. Neon for managed hosting; Supabase as
  documented fallback.
- Auth: Auth.js v5 (email magic-link + GitHub OAuth) with Prisma adapter.
- AI: Provider-agnostic interface in
  `src/server/services/ai/provider.interface.ts`. MVP impl is
  `openai-provider.ts` against an OpenAI-compatible endpoint. Feature code
  imports the interface, never the SDK directly.
- Moderation: `Moderator` interface; OpenAI Moderation API as MVP impl.
  Runs on AI output AND on every public-transition (publish, edit
  republish, comment create).
- Rate limit: Upstash Ratelimit at the AI service entry.
- Tests: Vitest for unit + integration; Playwright for mobile-viewport e2e
  on the create / interact / remix critical flows.
- Deploy: Vercel for app; Neon for DB.

Shared API contracts live in `src/lib/contracts/*.ts` (Zod schemas) and
are documented in `specs/001-mvp-content-loop/contracts/`. They are the
stable surface a future Expo / React Native client will consume —
breaking changes to these contracts require a version bump.

<!-- SPECKIT END -->

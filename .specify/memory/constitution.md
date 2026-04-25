<!--
SYNC IMPACT REPORT
==================
Version change: 1.0.0 → 2.0.0
Bump rationale: MAJOR. Reshapes the project identity from a generic AI content
                platform to a mobile-first PWA with a backend designed for
                future native-mobile reuse. Removes one prior principle
                (Accessibility & Internationalization Readiness) and adds three
                new principles (Mobile-First Experience, App-Like PWA Behavior,
                API-First Backend Design). Reorders and renames remaining
                principles. Backward-incompatible with v1.0.0 governance.

Modified principles (v1.0.0 → v2.0.0 mapping):
  - I.   Human-Centered Creation                → III.  Human-Centered AI Creation (renamed)
  - II.  Content Interaction Loop               → IV.   Content Interaction Loop (unchanged content)
  - III. Safety by Design (NN)                  → VI.   Safety by Design (NN)
  - IV.  Privacy and Data Control               → VII.  Privacy and Data Control
  - V.   Creator Attribution                    → V.    Remix and Attribution (reframed
                                                          as product differentiator,
                                                          attribution rules preserved)
  - VI.  Cost-Aware AI                          → X.    Cost-Aware AI
  - VII. Fast MVP Iteration                     → XII.  Fast MVP Iteration (now explicitly
                                                          excludes images/video/agents/native
                                                          apps for MVP)
  - VIII.Testable Behavior (NN)                 → XI.   Testable Behavior (NN)
  - X.   Model-Provider Flexibility             → VIII. Model-Provider Flexibility
                                                          (adds OpenAI-compatible default
                                                          for MVP; abstraction unchanged)

Added principles:
  - I.  Mobile-First Experience
  - II. App-Like PWA Behavior
  - IX. API-First Backend Design

Removed principles:
  - IX. Accessibility & Internationalization Readiness (v1.0.0)
        — Removed because mobile-first PWA delivery and API-first reuse take
          precedence at MVP. A11y/i18n readiness MAY be reintroduced as a
          MINOR amendment in a future revision when the product expands beyond
          the MVP scope.

Added sections: none (Additional Constraints & Quality Standards and
                Development Workflow & Review Gates retained, content updated
                to reflect mobile/PWA/API-first changes).

Removed sections: none.

Templates requiring updates:
  - .specify/templates/plan-template.md          ✅ aligned (Constitution Check
                                                  block remains generic; gates
                                                  resolved at plan time against
                                                  these principles; no edit
                                                  required)
  - .specify/templates/spec-template.md          ✅ aligned (acceptance criteria,
                                                  edge cases, success metrics
                                                  satisfy Principle XI)
  - .specify/templates/tasks-template.md         ✅ aligned (no principle-driven
                                                  task category removed)
  - .specify/templates/checklist-template.md     ✅ aligned

Documents requiring manual follow-up:
  - specs/001-mvp-content-loop/spec.md           ⚠ pending (written under
                                                  v1.0.0; product behavior
                                                  remains valid, but the
                                                  Assumptions section still
                                                  references the removed
                                                  Internationalization
                                                  principle. Either rephrase
                                                  the i18n assumption as a
                                                  voluntary product choice,
                                                  or remove if i18n is
                                                  formally out of scope for
                                                  the MVP. Mobile-first and
                                                  PWA delivery constraints
                                                  should also be added to the
                                                  spec's Assumptions or
                                                  Success Criteria where
                                                  relevant.)
  - CLAUDE.md                                    ⚠ pending (currently a stub;
                                                  will need to record the
                                                  chosen MVP stack — Next.js
                                                  for the PWA, with backend
                                                  service modules and stable
                                                  API contracts — when the
                                                  first plan is written.)
  - README.md / docs/quickstart.md               ⚠ pending (do not exist;
                                                  create when project adds
                                                  user-facing docs and
                                                  reference this constitution.)

Follow-up TODOs: none deferred.
-->

# MuseFlow Constitution

MuseFlow is a mobile-first, AI-powered content interaction platform delivered for
its MVP as a Progressive Web App. Its mission is to help users turn raw ideas into
interactive content flows on smartphones: generate, publish, browse, interact with,
and remix content with AI assistance through a fast, app-like mobile experience.
This constitution defines the non-negotiable rules that every feature, plan, and
review MUST satisfy.

## Core Principles

### I. Mobile-First Experience

The product MUST be designed for smartphone screens first. Layouts, navigation,
forms, and interactions MUST prioritize one-handed mobile use, fast first
contentful paint on mid-tier mobile devices over typical mobile networks,
touch-friendly hit targets, and app-like flows. Designs that work only on desktop
viewports or that require precision pointer input are rejected at review.

**Rationale**: MuseFlow's audience is consumer creators on phones. Designing
mobile-first is the cheapest way to guarantee the primary surface works; desktop
is then a derivative, not the source of truth.

### II. App-Like PWA Behavior

The MVP MUST behave like a lightweight mobile app where the platform allows:
bottom tab navigation, single-column feed, bottom sheets for actions, responsive
fluid layout, installable PWA readiness (manifest, service worker, icons), and
smooth loading and transition states. Full-page reloads on primary navigation
between feed/create/profile are prohibited; navigation MUST feel app-like.

**Rationale**: A web product that behaves like a website cannot compete for
attention on the same device as native apps. PWA discipline is what closes that
perception gap without paying the cost of a native build.

### III. Human-Centered AI Creation

AI assists users; it MUST NOT replace their ownership of the work. For every AI
output surfaced to a user, the system MUST provide explicit affordances to edit,
reject, regenerate, save, or publish that output. Auto-publishing AI output
without an explicit user confirmation action is prohibited.

**Rationale**: Creative ownership and trust collapse when users cannot intervene.
This principle is the contract that distinguishes MuseFlow from one-shot
generators.

### IV. Content Interaction Loop

Every core feature MUST support, or compose into, the loop:
**idea → AI generation → editing → publishing → browsing → interaction → remix → new content.**
Features that terminate the loop (e.g., publish-only, generate-only with no
remix path, interaction with no path back to creation) require an explicit,
documented exception in the feature spec.

**Rationale**: The loop is the product. Off-loop features cause platform drift
and dead-end content.

### V. Remix and Attribution

Remix is a core product differentiator. When a user creates a remix from another
post, the resulting post MUST preserve a traceable, visible relationship to the
source post and its original author. Remix attribution metadata MUST be created
at draft time, MUST persist through editing and publication, and MUST remain
visible (as a non-clickable reference if the original is later removed) — never
silently stripped or rewritten.

**Rationale**: Remix is the differentiator of the loop and the foundation for
any future creator-credit or monetization feature. Lost attribution destroys both.

### VI. Safety by Design (NON-NEGOTIABLE)

All user-generated and AI-generated content MUST pass automated safety checks
before becoming publicly accessible. Private drafts are exempt while private,
but every transition to a public surface (publish, remix re-publish, share
link, search index) MUST re-run the checks. When the safety check rejects
content, publishing MUST be blocked and a clear, human-readable reason MUST be
shown to the user. Bypassing or disabling safety checks for shipping
convenience is prohibited.

**Rationale**: Public exposure is the moment of risk. Re-running checks at every
public transition prevents stale or inherited unsafe content; a clear
user-facing reason preserves trust when content is blocked.

### VII. Privacy and Data Control

Drafts are private by default. Private drafts MUST NOT appear in public surfaces,
recommendation feeds, search indexes, or other users' views. Public profiles
MUST expose only published content. User data MUST NOT be used for model
training, fine-tuning, or evaluation unless the user has provided explicit,
revocable opt-in consent. Default settings MUST be the privacy-preserving
option.

**Rationale**: Default-open data flows have repeatedly broken user trust on
similar platforms. Opt-in consent is the only defensible default.

### VIII. Model-Provider Flexibility

All LLM and generative-model access MUST go through a provider-agnostic
abstraction layer maintained inside this repository. Feature code MUST NOT
import a specific provider SDK directly. Swapping between providers (OpenAI,
Claude, Gemini, local models, future providers) MUST be achievable as a
configuration change, not a code refactor. For the MVP, OpenAI-compatible
providers MAY be used as the default backend; this default MUST NOT be allowed
to leak into feature code as a hard dependency.

**Rationale**: Pricing, availability, and capability of foundation models shift
on a quarterly basis. Lock-in to a single provider is an existential risk.

### IX. API-First Backend Design

Business logic MUST live in backend service modules, NOT inside web framework
page components or route handlers (e.g., Next.js `app/` page files). Every core
behavior MUST be exposed through stable API contracts (request/response shapes
defined in shared types or schema files) so that a future native-mobile client
(e.g., Expo / React Native) can reuse the same backend without server-side
rewrites. Pages MAY call services and MAY render results, but MUST NOT be the
source of truth for business rules.

**Rationale**: A future native app is on the roadmap. Tightly coupling
business logic to a specific web framework's page lifecycle would force a
rewrite at exactly the moment the team is busiest. Service-module discipline
costs little now and saves a quarter later.

### X. Cost-Aware AI

All AI generation calls MUST be rate-limited per user and observable. Each call
MUST emit a structured log record containing at minimum: provider, model,
latency, status (success / safety-rejected / error), feature surface, and
input/output token counts when the provider exposes them. Expensive model calls
MUST be tagged so they can be tracked separately for budgeting.

**Rationale**: AI costs scale faster than revenue if unmonitored. Observability
at the call site is the only way to catch regressions before they bankrupt a
feature.

### XI. Testable Behavior (NON-NEGOTIABLE)

Every feature specification MUST include explicit acceptance criteria and
enumerated edge cases. Critical flows — content creation, publishing, safety
moderation, like/comment/save interaction, and remix — MUST be covered by
automated tests. Pull requests that introduce or modify behavior in these
flows without corresponding tests require a documented, reviewer-approved
exception recorded in the PR description.

**Rationale**: AI features are non-deterministic enough already; the
deterministic surface around them MUST be locked down by tests, or regressions
are invisible.

### XII. Fast MVP Iteration

Implementations MUST favor simple, reliable approaches over complex
architectures. The MVP is text-only. The following are explicitly out of scope
for the first release: image generation, video generation, audio generation,
advanced personalization or recommendation, creator monetization, and native
mobile apps (Expo / React Native build). Premature optimization, speculative
abstractions, and unused extension points are rejected at review unless they
are required to satisfy another principle (e.g., the API-First and
Provider-Flexibility principles).

**Rationale**: MuseFlow's competitive edge is iteration speed. Architectural
ambition is the most common failure mode of early-stage AI products.

## Additional Constraints & Quality Standards

- **Mobile performance budget**: Every primary screen (feed, post detail,
  create, remix, profile) MUST meet a defined mobile performance budget on a
  mid-tier device over a 4G connection. Plans MUST declare the budget and CI
  SHOULD verify it where automation is feasible.
- **PWA readiness**: The web app MUST ship a valid manifest, a service worker
  that handles offline shell loading at minimum, and the icon set required for
  installability on iOS and Android. Lighthouse PWA category SHOULD be green at
  release.
- **Service module boundary**: Business logic MUST live under a clearly named
  service layer (e.g., `src/server/services/` or equivalent). Page components,
  route handlers, and UI components MUST call services and MUST NOT inline
  business rules.
- **Stable API contracts**: Every API endpoint MUST have a typed contract
  (request and response schemas) committed to the repository. Contract changes
  MUST be reviewed for backward compatibility with the planned native-mobile
  client.
- **Observability**: Every AI call site, publishing transition, and safety
  check outcome MUST emit structured logs suitable for aggregation. Logs MUST
  NOT contain raw private draft contents.
- **Rate limits**: Default rate limits MUST be defined per feature surface
  before that surface ships. Rate-limit exhaustion MUST surface a clear,
  user-facing message — never a silent failure.
- **Data retention**: Private drafts and deletion requests MUST be honored
  within published service-level expectations; deletion MUST cascade to any
  derived caches, embeddings, or training corpora.
- **Provider abstraction surface**: The provider abstraction MUST expose, at
  minimum, text completion, streaming, structured output, and a hook for
  future modalities. Capability gaps between providers MUST be reported by
  the abstraction, not silently ignored.
- **Cost budgets**: Each feature MUST declare an expected per-action cost
  envelope at plan time. Material deviations in production MUST trigger a
  review.

## Development Workflow & Review Gates

- **Spec → Plan → Tasks**: Features MUST follow the Spec Kit workflow.
  No implementation begins before a spec, plan, and task list exist for the
  feature branch.
- **Constitution Check gate**: Every plan MUST execute the Constitution Check
  block before Phase 0 research and re-execute it after Phase 1 design.
  Violations MUST be either remediated or recorded with justification in the
  Complexity Tracking table.
- **Mobile-first review**: PRs touching UI MUST be reviewed on a mobile
  viewport (or accurate emulation) before approval. Desktop-only sign-off is
  insufficient.
- **API contract review**: PRs touching backend services or routes MUST link
  to or update the corresponding API contract file; reviewers MUST verify the
  contract change is compatible with the planned native-mobile client.
- **Pull request review**: Every PR MUST be reviewed by at least one engineer
  who did not author the changes. Reviewers MUST verify principle compliance,
  not only code correctness.
- **Test gate**: CI MUST run automated tests on every PR. Merging with
  failing tests is prohibited. Critical-flow PRs without new or updated tests
  require a documented exception.
- **Safety gate**: Any change that touches publishing, remix, or share paths
  MUST include a manual confirmation in the PR description that safety checks
  still execute on the public transition.
- **Provider gate**: Any PR that touches AI call sites MUST confirm that the
  provider abstraction is used and that no new direct provider-SDK import has
  been introduced into feature code.

## Governance

- This constitution supersedes ad-hoc practices, individual preferences, and
  prior informal conventions. Where this document and other guidance conflict,
  this document wins.
- **Amendment procedure**: Amendments MUST be proposed via a pull request that
  modifies `.specify/memory/constitution.md`, includes an updated Sync Impact
  Report, and is approved by at least one project maintainer. Amendments that
  remove or weaken a NON-NEGOTIABLE principle additionally require explicit
  written justification in the PR description.
- **Versioning policy**: This constitution uses semantic versioning.
  - **MAJOR**: Backward-incompatible governance or principle removals or
    redefinitions.
  - **MINOR**: New principle or section added, or materially expanded
    guidance within an existing principle.
  - **PATCH**: Clarifications, wording cleanup, typo fixes, or non-semantic
    refinements.
- **Compliance review**: At every release boundary, maintainers MUST confirm
  that shipped features comply with the current constitution. Newly
  discovered violations MUST be tracked as remediation items, not silently
  accepted.
- **Runtime guidance**: For per-feature execution guidance, refer to the
  active plan in `specs/<feature-branch>/plan.md`. For repository-level agent
  guidance, refer to `CLAUDE.md`. Both MUST cite this constitution when they
  constrain implementation choices.

**Version**: 2.0.0 | **Ratified**: 2026-04-25 | **Last Amended**: 2026-04-25

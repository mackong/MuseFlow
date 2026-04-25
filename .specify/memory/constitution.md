<!--
SYNC IMPACT REPORT
==================
Version change: 0.0.0 (template placeholders) → 1.0.0 (initial ratification)
Bump rationale: First substantive ratification. Promotes the file from template
                placeholders to a complete governing document; treated as initial
                MAJOR release.

Modified principles:
  - [PRINCIPLE_1_NAME]              → I. Human-Centered Creation
  - [PRINCIPLE_2_NAME]              → II. Content Interaction Loop
  - [PRINCIPLE_3_NAME]              → III. Safety by Design (NON-NEGOTIABLE)
  - [PRINCIPLE_4_NAME]              → IV. Privacy and Data Control
  - [PRINCIPLE_5_NAME]              → V. Creator Attribution

Added principles (template expanded from 5 to 10 to match product mandate):
  - VI.   Cost-Aware AI
  - VII.  Fast MVP Iteration
  - VIII. Testable Behavior (NON-NEGOTIABLE)
  - IX.   Accessibility & Internationalization Readiness
  - X.    Model-Provider Flexibility

Added sections:
  - Additional Constraints & Quality Standards (was [SECTION_2_NAME])
  - Development Workflow & Review Gates    (was [SECTION_3_NAME])

Removed sections: none

Templates requiring updates:
  - .specify/templates/plan-template.md          ✅ aligned (Constitution Check
                                                  block remains generic; gates
                                                  resolved at plan time against
                                                  these principles)
  - .specify/templates/spec-template.md          ✅ aligned (acceptance criteria,
                                                  edge cases, success metrics
                                                  satisfy Principle VIII)
  - .specify/templates/tasks-template.md         ✅ aligned (no principle-driven
                                                  task category removed)
  - .specify/templates/checklist-template.md     ✅ aligned (generic checklist
                                                  scaffold, no principle changes
                                                  required)
  - README.md / docs/quickstart.md               ⚠ pending (files do not exist
                                                  yet; create when project adds
                                                  user-facing docs and reference
                                                  this constitution)
  - CLAUDE.md (project guidance)                 ⚠ pending (currently a stub;
                                                  expand when first feature plan
                                                  is written)

Follow-up TODOs: none deferred.
-->

# MuseFlow Constitution

MuseFlow is an AI-powered content interaction platform. Its mission is to help users
turn raw ideas into interactive content flows: generate, publish, interact with, and
remix content with AI assistance. This constitution defines the non-negotiable rules
that every feature, plan, and review MUST satisfy.

## Core Principles

### I. Human-Centered Creation

AI assists users; it MUST NOT replace their ownership of the work. For every AI
output surfaced to a user, the system MUST provide explicit affordances to edit,
reject, or regenerate that output before it is persisted to a public artifact.
No feature may auto-publish AI output without a confirmed human action.

**Rationale**: Creative ownership and trust collapse when users cannot intervene.
This principle is the contract that distinguishes MuseFlow from one-shot
generators.

### II. Content Interaction Loop

Every core feature MUST support, or compose into, the loop:
**idea → generation → publishing → interaction → remix → new content.**
Features that terminate the loop (e.g., publish-only, generate-only with no
remix path) require an explicit, documented exception in the feature spec.

**Rationale**: The loop is the product. Off-loop features cause platform drift
and dead-end content.

### III. Safety by Design (NON-NEGOTIABLE)

All user-generated and AI-generated content MUST pass automated safety checks
before becoming publicly accessible. Private drafts are exempt while private,
but every transition to a public surface (publish, remix re-publish, share
link, search index) MUST re-run the checks. Bypassing or disabling safety
checks for shipping convenience is prohibited.

**Rationale**: Public exposure is the moment of risk. Re-running checks at every
public transition prevents stale or inherited unsafe content.

### IV. Privacy and Data Control

Private drafts MUST NOT appear in public surfaces, recommendation feeds, search
indexes, or other users' views. User data MUST NOT be used for model training,
fine-tuning, or evaluation unless the user has provided explicit, revocable
opt-in consent. Default settings MUST be the privacy-preserving option.

**Rationale**: Default-open data flows have repeatedly broken user trust on
similar platforms. Opt-in consent is the only defensible default.

### V. Creator Attribution

Every published artifact MUST preserve the original creator identity and a
traceable remix lineage. Attribution metadata (original creator, parent
content, remix chain) MUST survive remixing and MUST be visible on the
published artifact. Stripping or rewriting attribution is prohibited.

**Rationale**: Remix culture works only when credit flows. Attribution is also
the foundation for future creator monetization and dispute resolution.

### VI. Cost-Aware AI

All AI generation calls MUST be rate-limited per user and observable. Each call
MUST emit a structured log record containing at minimum: provider, model,
latency, input/output token counts, and feature surface. Expensive model calls
(long-context, image, video, multi-step agent) MUST be tagged and tracked
against a per-user and per-feature budget.

**Rationale**: AI costs scale faster than revenue if unmonitored. Observability
at the call site is the only way to catch regressions before they bankrupt a
feature.

### VII. Fast MVP Iteration

Implementations MUST favor simple, reliable approaches over complex
architectures. Text-first MVP MUST ship before image, video, or autonomous-agent
features for any given user-facing surface. Premature optimization, speculative
abstractions, and unused extension points are rejected at review unless they
are required to satisfy another principle.

**Rationale**: MuseFlow's competitive edge is iteration speed. Architectural
ambition is the most common failure mode of early-stage AI products.

### VIII. Testable Behavior (NON-NEGOTIABLE)

Every feature specification MUST include explicit acceptance criteria and
enumerated edge cases. Implementations MUST include automated tests covering
the primary success flow and at least one failure path. Pull requests that
introduce or modify behavior without corresponding tests require a documented,
reviewer-approved exception recorded in the PR description.

**Rationale**: AI features are non-deterministic enough already; the
deterministic surface around them MUST be locked down by tests, or regressions
are invisible.

### IX. Accessibility & Internationalization Readiness

UI components MUST meet WCAG 2.1 AA fundamentals: keyboard navigability,
semantic structure, sufficient color contrast, and labelled interactive
elements. All user-facing strings MUST be routed through a localization layer
from day one; hard-coded display strings in component code are rejected at
review. Initial language is English; the architecture MUST allow additional
languages without code changes to feature components.

**Rationale**: Retrofitting a11y and i18n is an order of magnitude more
expensive than designing for them. The cost of compliance now is small; the
cost later is a rewrite.

### X. Model-Provider Flexibility

All LLM and generative-model access MUST go through a provider-agnostic
abstraction layer maintained inside this repository. Feature code MUST NOT
import a specific provider SDK directly. Swapping between providers (OpenAI,
Claude, Gemini, local models, future providers) MUST be achievable as a
configuration change, not a code refactor.

**Rationale**: Pricing, availability, and capability of foundation models shift
on a quarterly basis. Lock-in to a single provider is an existential risk.

## Additional Constraints & Quality Standards

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
- **Pull request review**: Every PR MUST be reviewed by at least one engineer
  who did not author the changes. Reviewers MUST verify principle compliance,
  not only code correctness.
- **Test gate**: CI MUST run automated tests on every PR. Merging with
  failing tests is prohibited.
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

**Version**: 1.0.0 | **Ratified**: 2026-04-25 | **Last Amended**: 2026-04-25

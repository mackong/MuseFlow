# Feature Specification: MVP Core Content Loop

**Feature Branch**: `001-mvp-content-loop`
**Created**: 2026-04-25
**Status**: Draft
**Input**: User description: "Build the MuseFlow MVP core content loop. MuseFlow allows users to transform an idea into an AI-assisted post, publish it to a public feed, receive interactions from other users, and let other users remix the post using AI."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Create and Publish an AI-Assisted Post (Priority: P1)

A logged-in Creator has a rough idea and wants to turn it into a publishable post
without writing it from scratch. They open the create flow, type the idea, pick a
tone, review the AI-generated title and body, edit anything that does not feel right,
and either publish to the public feed or save as a private draft. Before the post
becomes publicly visible, an automated safety check runs; if it rejects the content,
the user sees a clear reason and can revise.

**Why this priority**: This is the entry point of the entire content loop. No
downstream feature (feed, interaction, remix, profile) has anything to operate on
without it. It must work end-to-end before anything else ships.

**Independent Test**: A new user signs up, enters an idea such as "the joy of
walking at dawn", picks a tone, receives a generated title and body, edits the body,
and clicks publish. The post appears in the public feed within seconds. Saving as
draft instead keeps the post out of the public feed but visible in the user's own
profile drafts list.

**Acceptance Scenarios**:

1. **Given** a logged-in user on the create page, **When** they enter a non-empty idea,
   pick a tone from the five available options, and submit, **Then** the system returns
   a generated title and body that the user can edit in place.
2. **Given** a logged-in user reviewing AI-generated content, **When** they edit the
   title or body and click publish, **Then** their edited version (not the original
   AI version) is what enters the safety check and the public feed.
3. **Given** a logged-in user reviewing AI-generated content, **When** they click
   "Save as draft", **Then** the post is stored privately, does not appear on any
   public feed or other user's profile, and is visible in the user's own drafts list.
4. **Given** a user submitting content for publishing, **When** the safety check
   rejects the content, **Then** publishing is blocked, the post does not appear in
   the public feed, and the user sees a human-readable reason explaining why
   (e.g., the category of the violation), with the option to edit and retry.
5. **Given** a user who clicks "Regenerate" after seeing AI output, **When** the
   regeneration completes, **Then** the previous AI output is replaced and the user
   may edit, regenerate again, or accept the new version.

---

### User Story 2 - Browse the Public Feed (Priority: P1)

Any visitor (logged in or not) wants to see what other people have published. They
open the feed and scroll a list of recent published posts. Each card shows enough
information to decide whether to read or interact: title, a body preview, author
display name, time since publication, and counts for likes, comments, and remixes.
Clicking a card opens the full post.

**Why this priority**: A creation tool with no audience cannot demonstrate the
content loop. The feed is what makes Story 1 feel alive; it must ship together
with Story 1 to deliver any user value.

**Independent Test**: After Story 1 publishes a post, an anonymous visitor opens
the feed URL and sees that post in the list with its title, body preview, author
name, time, and zero counts for likes/comments/remixes. Clicking the card shows
the full post.

**Acceptance Scenarios**:

1. **Given** at least one published post exists, **When** any visitor (anonymous or
   logged in) loads the feed, **Then** the post appears with title, body preview,
   author display name, relative timestamp, like count, comment count, and remix count.
2. **Given** the feed is loaded, **When** a new post is published by any user,
   **Then** that post appears in the feed within a short refresh cycle (auto or via
   manual refresh) without requiring a full page reload.
3. **Given** a user viewing a feed card, **When** they click the card, **Then** the
   full post page loads with the complete body and any interaction controls.
4. **Given** zero published posts exist, **When** a visitor loads the feed, **Then**
   they see an empty-state message inviting them to create the first post (if logged
   in) or sign up (if anonymous).
5. **Given** the visitor is anonymous, **When** they view a feed card, **Then**
   interaction controls (like, comment, save, remix) are visible but require login
   to activate, with a clear prompt to sign in or sign up.

---

### User Story 3 - Like, Comment, and Save Posts (Priority: P2)

A logged-in Reader wants to engage with a post they enjoyed. They tap like, leave a
comment, and save the post for later. Liking is idempotent per user per post.
Comments belong to the commenter, who can delete their own. Saving adds the post to
the user's private saved list.

**Why this priority**: Engagement is what closes the social side of the loop;
without it the platform is a one-way generator. It is P2 because the create+feed
slice is already a demonstrable MVP without it.

**Independent Test**: Logged-in user A publishes a post (Story 1). Logged-in user B
opens it, clicks like, writes a comment, and clicks save. The post's like count
goes from 0 to 1, the comment appears under the post attributed to B, and the post
appears in B's saved list. Clicking like again does not increase the count.
Deleting B's own comment removes it; B cannot delete A's comments.

**Acceptance Scenarios**:

1. **Given** a logged-in user viewing a published post they have not liked, **When**
   they click like, **Then** the post's like count increments by exactly one and the
   button reflects a liked state for this user.
2. **Given** a logged-in user who has already liked a post, **When** they click like
   again, **Then** the like is removed (toggle behavior) and the count decrements by
   one; the same like is never counted twice.
3. **Given** a logged-in user viewing a published post, **When** they submit a
   non-empty comment, **Then** the comment appears under the post attributed to
   their display name with a timestamp, and the post's comment count increments.
4. **Given** a user looking at a comment they authored, **When** they click delete
   on that comment, **Then** the comment is removed and the comment count decrements;
   they cannot see a delete control on comments authored by other users.
5. **Given** a logged-in user viewing a post, **When** they click save, **Then** the
   post is added to their private saved list visible only on their own profile;
   clicking save again removes it.
6. **Given** an anonymous visitor, **When** they attempt to like, comment, or save,
   **Then** they are prompted to sign in or sign up; no interaction is recorded.

---

### User Story 4 - Remix a Published Post with AI (Priority: P2)

A logged-in Remixer sees a published post and wants to make their own version. They
click Remix, choose a remix mode (rewrite, continue, summarize, or change tone),
the system generates a new draft seeded from the original, and the draft is
pre-attributed to the original post and original author. The remixer edits and
publishes; the resulting post displays attribution to the original.

**Why this priority**: Remix is what makes MuseFlow a _flow_ rather than a
collection of one-shot posts. It depends on Stories 1 and 2 (something must exist
to remix) and is the principle V (Creator Attribution) showcase. It is P2 because
a viable MVP exists without it.

**Independent Test**: User A publishes post X. User B clicks Remix on X, chooses
"summarize", receives a generated summary draft that already shows "Remix of X by
A", edits it, publishes. The new post appears in the feed with visible attribution
to X and to A. X's remix count increments by one. Clicking the attribution on the
remix navigates to X.

**Acceptance Scenarios**:

1. **Given** a logged-in user viewing a published post, **When** they click Remix,
   **Then** they are prompted to choose one of: rewrite, continue, summarize,
   change tone (with tone sub-selection from the same five tones as Story 1).
2. **Given** a remix mode is selected, **When** generation completes, **Then** a new
   draft post is created that is pre-populated with AI-generated content based on
   the original, the safety check is run on the AI output, and the draft already
   carries attribution metadata pointing to the original post and original author.
3. **Given** a remix draft, **When** the remixer edits and publishes it, **Then** the
   published remix appears on the public feed showing attribution to the original
   post (clickable link) and the original author's display name, in addition to the
   remixer's own authorship.
4. **Given** a published remix, **When** any visitor views it, **Then** the
   attribution to the original is clearly visible and the original post's remix
   count has been incremented by one.
5. **Given** the original post was deleted (or its author deleted), **When** a
   visitor views a remix of it, **Then** attribution is preserved as a non-clickable
   reference (e.g., "Remix of a removed post") rather than silently disappearing.
6. **Given** the safety check rejects the AI-generated remix draft, **When** the
   remixer attempts to publish, **Then** publishing is blocked with a clear reason
   and the remixer can edit and retry, exactly as in Story 1.

---

### User Story 5 - View Own and Public Profiles (Priority: P3)

A user wants to see their own work organized in one place — published posts,
drafts, saved posts, and remixes they have created — and visit other users'
profiles to see what they have published. Public profiles only expose published
content; drafts and saves are strictly private.

**Why this priority**: Profiles aggregate value created by Stories 1–4 but do not
themselves create new value; they are the lowest-priority slice of the MVP loop.

**Independent Test**: User A logs in, opens their own profile, and sees four
sections: published posts, drafts, saved posts, remixes. User B (or an anonymous
visitor) navigates to A's public profile URL and sees only the published posts
section; drafts and saves are not present in the page or its underlying data.

**Acceptance Scenarios**:

1. **Given** a logged-in user, **When** they open their own profile, **Then** they
   see four distinct sections: published posts, drafts, saved posts, and remixes
   they have created, each listing relevant items with title, time, and counts.
2. **Given** any visitor (logged in or not), **When** they open another user's
   public profile, **Then** they see only that user's published posts (including
   published remixes) with author display name and a profile description if set;
   drafts and saved posts are absent.
3. **Given** a user is viewing their own profile, **When** they click a draft,
   **Then** they are taken to the editor for that draft to continue work.
4. **Given** a user is viewing their own saved list, **When** they click an item,
   **Then** they are taken to the original published post page; if the original was
   removed, the saved entry shows a "no longer available" state.

---

### Edge Cases

- **Empty input**: User submits an empty idea or whitespace-only idea — the create
  flow blocks generation and shows a helpful prompt.
- **AI generation failure**: The model call errors, times out, or returns no usable
  content — the user sees a clear failure message and a retry control; no partial
  draft is silently saved.
- **Safety rejection on AI output**: AI generates content that fails the safety
  check before the user can publish — the user is shown the rejection and can
  regenerate, edit, or abandon.
- **Safety rejection on publish**: The user has edited the content into something
  unsafe and clicks publish — publishing is blocked with reason; the draft remains
  in the user's drafts so work is not lost.
- **Race condition on like**: User taps like rapidly multiple times — the final
  count reflects exactly one like per user per post, regardless of clicks.
- **Concurrent remix and original deletion**: User A starts remixing user B's post,
  user B deletes the post while A is editing — A can still publish their remix;
  attribution shows the original as removed.
- **Author display name change**: Author renames themselves — historical attribution
  on remixes and comments updates to reflect the current display name (one
  identity, current name).
- **Account deletion**: User deletes their account — their published posts and
  remixes either become anonymized ("removed user") or are removed entirely
  according to platform policy; remixes that referenced their work continue to
  display attribution to a removed user.
- **Long input**: User submits an idea or edits a body that exceeds defined length
  limits — the editor blocks the overflow with a clear character-count indicator
  before submission.
- **Rate limit reached**: User has exceeded their AI generation rate limit — the
  generate and remix actions are disabled with a clear message indicating when they
  can try again.
- **Anonymous deep-link to a draft**: Someone with a stale link tries to visit
  another user's draft URL — they see a not-found or not-authorized response; no
  draft content leaks.

## Requirements _(mandatory)_

### Functional Requirements

**Authoring & Generation (US1)**

- **FR-001**: System MUST require authentication for creating, publishing, drafting,
  liking, commenting, saving, and remixing.
- **FR-002**: System MUST accept an idea (free text, length-limited) and a tone
  selection (one of: inspiring, analytical, playful, poetic, professional) and
  return an AI-generated title and body.
- **FR-003**: Users MUST be able to edit the AI-generated title and body before
  publishing or saving as draft.
- **FR-004**: Users MUST be able to regenerate AI output; regeneration MUST replace
  the prior AI output and MUST be subject to the same rate limits as initial
  generation.
- **FR-005**: System MUST persist drafts privately to the authoring user; no other
  user (logged in or anonymous) may access another user's drafts.
- **FR-006**: System MUST publish a post only after the user explicitly confirms
  publication; auto-publishing AI output is prohibited.

**Safety (cross-cutting, US1 + US4)**

- **FR-007**: System MUST run an automated safety check on AI-generated content
  before presenting it as publishable.
- **FR-008**: System MUST run an automated safety check on user-submitted content
  at the moment of publish (covering both originally authored and edited AI
  content).
- **FR-009**: When the safety check rejects content, the system MUST block
  publication, surface a human-readable reason categorizing the violation, and
  preserve the user's draft so work is not lost.
- **FR-010**: System MUST re-run the safety check on every transition into a public
  surface (initial publish, remix publish, edits to a published post if allowed,
  share-link generation if added later).

**Feed (US2)**

- **FR-011**: System MUST expose a public feed of published posts visible to any
  visitor, including anonymous visitors.
- **FR-012**: Each feed item MUST display title, body preview, author display name,
  relative publication time, like count, comment count, and remix count.
- **FR-013**: Feed default ordering MUST be reverse chronological by publication time.
- **FR-014**: Feed MUST update to include newly published posts within a short
  refresh cycle without requiring a full page reload.
- **FR-015**: Anonymous visitors MUST see interaction controls in a disabled or
  prompt-to-login state; submitting an interaction without authentication MUST be
  rejected and never recorded.

**Interaction (US3)**

- **FR-016**: System MUST allow each authenticated user to like a given published
  post at most once; clicking like on an already-liked post MUST remove the like
  (toggle), and the like count MUST always equal the count of distinct liking users.
- **FR-017**: Authenticated users MUST be able to post comments on published posts;
  each comment MUST record author, body, and timestamp.
- **FR-018**: Authenticated users MUST be able to delete their own comments;
  attempts to delete another user's comment MUST be rejected.
- **FR-019**: Authenticated users MUST be able to save a post to a private saved
  list and unsave to remove it; the saved list is not visible to anyone else.
- **FR-020**: Like, comment, and save state on a post MUST be reflected to the user
  in real time on the same session (post-action UI updates, optimistic or refreshed).

**Remix (US4)**

- **FR-021**: Authenticated users MUST be able to initiate a remix from any
  published post and choose one mode: rewrite, continue, summarize, or change tone
  (with sub-selection of one of the five tones).
- **FR-022**: System MUST generate a new draft seeded by the original post's
  content according to the selected remix mode.
- **FR-023**: Every remix draft MUST carry attribution metadata pointing to the
  original post and the original author at draft-creation time, and this metadata
  MUST persist through editing and publication.
- **FR-024**: Published remixes MUST display attribution to the original post and
  original author on the post detail view and on feed cards.
- **FR-025**: When a user publishes a remix, the original post's remix count MUST
  increment by exactly one; un-publishing or deleting the remix MUST decrement it.
- **FR-026**: If the original post is deleted after a remix is published,
  attribution on the remix MUST remain visible (as a non-clickable reference) and
  MUST NOT silently disappear.
- **FR-027**: Remix drafts and remix publishes MUST pass the same safety checks as
  ordinary drafts and publishes.

**Profile (US5)**

- **FR-028**: Users MUST be able to view their own profile containing four sections:
  published posts, drafts, saved posts, and remixes they have authored.
- **FR-029**: Users MUST be able to view another user's public profile containing
  only that user's published posts (including published remixes); drafts and saved
  lists MUST NOT be exposed on public profiles.

**Cost & Observability (cross-cutting)**

- **FR-030**: System MUST rate-limit AI generation per authenticated user and MUST
  surface a clear in-product message when the limit is reached, including when the
  user can retry.
- **FR-031**: System MUST log each AI generation call with at least: provider,
  model, latency, input/output token counts, feature surface (create vs. remix),
  and outcome (success / safety-rejected / error). Logs MUST NOT contain raw
  private draft content.

### Key Entities _(include if feature involves data)_

- **User**: A person with an account. Attributes include unique account identifier,
  display name, profile description (optional), authentication identity. Owns
  posts, drafts, comments, likes, saves, and remixes.
- **Post**: A published unit of content. Attributes include title, body, tone,
  author, publication timestamp, status (published / removed), like count, comment
  count, remix count, and (if it is a remix) attribution to a parent post and
  parent author.
- **Draft**: A private work-in-progress version of a post belonging to one user.
  Attributes mirror Post (title, body, tone, optional remix attribution) plus
  last-edited timestamp; never visible to anyone but the author.
- **Generation**: A record of an AI generation event used both in product flow and
  for cost tracking. Attributes include user, feature surface (create / remix),
  mode (for remixes: rewrite / continue / summarize / change-tone), provider,
  model, token counts, latency, safety check outcome.
- **Comment**: A reply to a published post. Attributes include author, parent post,
  body, timestamp. Owned by its author for deletion purposes.
- **Like**: A unique pairing of (user, post) recording an engagement. There can be
  at most one like per user per post.
- **Save**: A unique pairing of (user, post) representing a private bookmark.
- **Safety Check Result**: A record attached to AI outputs and to publish attempts,
  capturing the verdict (allow / reject), the category of violation if rejected,
  and a human-readable reason shown to the user on rejection.
- **Remix Attribution**: The directional link from a remix post to its parent post
  and parent author at the time of draft creation; persists even if the parent is
  later removed.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A new user can sign up, generate, and publish their first post in
  under 2 minutes from landing on the create page.
- **SC-002**: 90% of AI generations from a non-empty idea return a usable draft
  (i.e., not blocked by safety, not erroring) on the first attempt.
- **SC-003**: A logged-in user can produce a publishable remix draft from any
  published post in under 60 seconds (selection through generated draft visible
  for editing).
- **SC-004**: 100% of published remixes display visible attribution to the original
  post and original author when viewed on either the feed card or the post detail
  page.
- **SC-005**: After a successful publish, the post is visible in the public feed to
  another user's session within 10 seconds without that user manually refreshing.
- **SC-006**: 0% of clearly unsafe AI-generated content (per the safety category
  set) reaches the public feed; rejected items are blocked at safety check and
  surface a reason to the user 100% of the time.
- **SC-007**: Like counts equal the number of distinct liking users at all times;
  no user can cause a count to exceed +1 from their actions on a single post.
- **SC-008**: 0% of private drafts and 0% of saved-post lists are exposed on any
  public surface (feed, public profile, search).
- **SC-009**: Users complete the like / comment / save interaction on a post in
  fewer than 5 seconds from opening the post (median, normal connectivity).

## Assumptions

- **Authentication**: A standard email-and-password (or third-party OAuth) account
  system exists or will be provided; this spec does not redefine the auth flow,
  only assumes that "logged-in user" is unambiguous and that an authenticated
  session is available to the server on each request.
- **Display name**: Each user has a single display name shown publicly; uniqueness
  is enforced at sign-up but renames are allowed.
- **Anonymous browsing**: The public feed and public profiles are reachable without
  login; this is an explicit product choice that supports discovery.
- **Body preview length**: Feed cards display a truncated preview of approximately
  the first paragraph or ~200 characters of the body; full body is on the post
  detail page.
- **Comment depth**: Comments are flat (single-level, not threaded) for the MVP.
  Nested threading is out of scope.
- **Tone set**: The tone selector is fixed to the five named tones (inspiring,
  analytical, playful, poetic, professional) for the MVP; tones cannot be added by
  users.
- **Remix modes**: Remix is fixed to the four modes (rewrite, continue, summarize,
  change tone) for the MVP; "change tone" reuses the five-tone set.
- **Editability of published posts**: Authors can edit and delete their own
  published posts; edits trigger a re-run of the safety check before becoming
  publicly visible. Detailed edit-history UX is out of scope for the MVP.
- **Notifications**: Email or in-product notifications (e.g., "your post was
  liked") are out of scope for this MVP.
- **Follow / follower graph**: Following users and personalized feeds are out of
  scope for this MVP; the feed is a single global reverse-chronological list.
- **Search**: Free-text search across posts is out of scope for this MVP.
- **Media**: Images, video, and audio are out of scope; this MVP is text-only,
  consistent with the Fast MVP Iteration principle.
- **Internationalization**: User-facing strings are routed through a localization
  layer from the start; the launch language is English and additional languages
  are out of scope for the MVP delivery.
- **Provider abstraction**: The AI generation calls go through a provider-agnostic
  layer; selection of the underlying provider is a deployment-time configuration
  concern, not a user-visible feature.
- **Safety category set**: A baseline category set (e.g., hate, sexual content
  involving minors, violent threats, doxxing, illegal activity) is defined by the
  platform safety policy; the exact category catalog and thresholds are owned by
  that policy and are referenced, not redefined, by this spec.
- **Rate limit values**: Specific per-user generation quotas (e.g., N generations
  per hour) are determined by the cost-control configuration and are not fixed by
  this spec; this spec only requires that a limit exists, is enforced, and is
  surfaced to the user.

# Profile Contract

Profiles split into two views: the user's own profile (private — drafts and
saves visible) and any user's public profile (published-only).

## `GET /api/me`

Fetch the authenticated user's own profile shell. The four sub-collections
(published / drafts / saved / remixes) are paginated separately to keep the
shell payload small on mobile.

- **Auth**: required.
- **Response 200**:

  ```ts
  {
    user: {
      id: string;
      username: string;
      displayName: string;
      description: string | null;
      image: string | null;
      email: string; // shown only to self
      createdAt: string;
    }
    counts: {
      publishedPosts: number;
      drafts: number;
      saved: number;
      authoredRemixes: number;
    }
  }
  ```

- **Errors**: `unauthenticated`.

### `GET /api/me/posts`

Authenticated user's own published posts, newest-first.

- **Auth**: required.
- **Query**: `cursor?`, `limit?`.
- **Response 200**:

  ```ts
  { items: FeedCardProjection[]; nextCursor: string | null }
  ```

  (Same projection as feed; `author` will be the requester themselves.)

### `GET /api/me/drafts`

Same shape as `GET /api/drafts` (defined in posts.contract.md). Listed here
for routing clarity; either path is valid (the `/api/me/...` set is the
preferred pattern for namespacing the requester's own resources).

### `GET /api/me/saved`

Same shape as `GET /api/saves` (defined in interactions.contract.md).

### `GET /api/me/remixes`

Authenticated user's own _authored_ remixes (i.e., posts where they are the
remix author), newest-first.

- **Auth**: required.
- **Query**: `cursor?`, `limit?`.
- **Response 200**:

  ```ts
  { items: FeedCardProjection[]; nextCursor: string | null }
  ```

  Each item has `isRemix: true` and a populated `attribution` block.

### `PATCH /api/me`

Update the authenticated user's editable profile fields.

- **Auth**: required.
- **Request body** (all optional; at least one):

  ```ts
  {
    displayName?: string;     // length 2..40, unique
    username?: string;        // length 2..30, slug-safe, unique
    description?: string | null;  // length 0..240
    image?: string | null;
  }
  ```

- **Response 200**: same shape as `GET /api/me`.
- **Errors**:
  - `unauthenticated`, `validation_failed`
  - `conflict` — `displayName` or `username` already taken.
- **Behavior**: Display-name renames take effect immediately on all of the
  user's content (decision 13 in research.md).

---

## `GET /api/profile/[username]`

Fetch any user's _public_ profile shell.

- **Auth**: optional.
- **Response 200**:

  ```ts
  {
    user: {
      id: string;
      username: string;
      displayName: string;
      description: string | null;
      image: string | null;
      createdAt: string;
      // NOTE: email is NEVER included here, even for the requester themselves.
      // Use GET /api/me for self-fetching.
    }
    counts: {
      publishedPosts: number; // includes published remixes
    }
  }
  ```

- **Errors**: `not_found`.
- **Privacy**: This endpoint MUST NOT expose `drafts`, `saved`, or any
  draft-bound counts. The only public count surfaced is `publishedPosts`.

### `GET /api/profile/[username]/posts`

Public, paginated list of the user's published posts (including published
remixes).

- **Auth**: optional.
- **Query**: `cursor?`, `limit?`.
- **Response 200**: `{ items: FeedCardProjection[]; nextCursor: string | null }`
- **Errors**: `not_found` (username does not exist).

---

## Authorization summary

| Endpoint                              | Anonymous     | Self          | Other auth user |
| ------------------------------------- | ------------- | ------------- | --------------- |
| `GET /api/me*`                        | 401           | 200           | 200 (own data)  |
| `PATCH /api/me`                       | 401           | 200           | 200 (own data)  |
| `GET /api/profile/[username]*`        | 200           | 200           | 200             |
| Drafts and saves under `/api/me/...`  | 401           | 200           | 200 (own data)  |
| Drafts/saves under `/api/profile/...` | (not exposed) | (not exposed) | (not exposed)   |

---

## What is NOT in profiles (per Principle VII)

- Email, sign-in metadata, session info on public profiles.
- Liked posts on public or self profiles. (Likes are not surfaced as a
  browsable list at MVP — only as per-post counts.)
- Comments authored. (Out of MVP scope; can be added as a v1.1 profile tab.)
- Saved posts on public profiles. The saved list exists only at
  `GET /api/me/saved` and `GET /api/saves`, both of which require
  authentication and return only the requester's own data.

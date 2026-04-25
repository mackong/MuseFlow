# API Contracts: MVP Core Content Loop

**Feature**: 001-mvp-content-loop
**Date**: 2026-04-25
**Source of truth**: Zod schemas in `src/lib/contracts/*.ts` (to be added in
the implementation phase). This directory is the design specification of
those schemas.

These contracts are the _stable_ surface that backend services expose. Per
Constitution Principle IX (API-First Backend Design), the same contract files
are intended to be importable by a future Expo / React Native client; route
handlers in `src/app/api/**` are a thin transport adapter only.

## Conventions

- **Transport**: HTTP/JSON over HTTPS. All request and response bodies are
  JSON unless explicitly noted.
- **Authentication**: Cookie-based session via Auth.js v5. Endpoints marked
  `Auth: required` reject unauthenticated requests with `401`.
- **IDs**: cuid strings. Never expose internal numeric IDs.
- **Timestamps**: ISO 8601 strings (`2026-04-25T14:32:00Z`).
- **Pagination**: Cursor-based. Clients pass `cursor` (opaque string) and
  optional `limit` (default 20, max 50). Responses include `nextCursor`
  (string or null).
- **Errors**: All error responses use the shape:

  ```json
  {
    "error": {
      "code": "string-tag",
      "message": "human-readable",
      "details": {
        /* optional, error-specific */
      }
    }
  }
  ```

  Common codes used across endpoints:

  | Code                | HTTP | Meaning                                                                            |
  | ------------------- | ---- | ---------------------------------------------------------------------------------- |
  | `unauthenticated`   | 401  | Auth required and missing/invalid                                                  |
  | `forbidden`         | 403  | Authenticated but not allowed                                                      |
  | `not_found`         | 404  | Target does not exist                                                              |
  | `validation_failed` | 400  | Request body failed schema                                                         |
  | `safety_rejected`   | 422  | Content rejected by moderation. `details.categories` and `details.reason` provided |
  | `rate_limited`      | 429  | Per-user AI rate limit reached. `details.retryAfterSeconds` provided               |
  | `ai_provider_error` | 502  | AI generation failed upstream                                                      |
  | `conflict`          | 409  | Idempotent retry conflict (rare; toggle endpoints handle this internally)          |
  | `internal_error`    | 500  | Unexpected server error                                                            |

## Files

| File                                                   | Resources covered                                          |
| ------------------------------------------------------ | ---------------------------------------------------------- |
| [posts.contract.md](./posts.contract.md)               | Drafts, posts, edit, delete, publish, remix-draft creation |
| [interactions.contract.md](./interactions.contract.md) | Likes, saves, comments                                     |
| [ai.contract.md](./ai.contract.md)                     | AI generation (create + remix modes), rate-limit surface   |
| [feed.contract.md](./feed.contract.md)                 | Public feed listing                                        |
| [profile.contract.md](./profile.contract.md)           | Own profile + public profile                               |
| [moderation.contract.md](./moderation.contract.md)     | Server-internal moderation interface (no public route)     |

## Auth endpoints

Auth flows are owned by Auth.js (`/api/auth/[...nextauth]`). The session
cookie established there is the credential used by all endpoints below. Auth
endpoint shapes are the standard Auth.js contract and are not re-specified
in this directory.

## Versioning

These contracts are v1 (path prefix `/api`). Breaking changes require a new
prefix (`/api/v2/...`) and the previous version remains served until the
native client migration is complete.

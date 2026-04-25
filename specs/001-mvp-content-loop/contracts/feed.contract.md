# Feed Contract

## `GET /api/feed`

Public, paginated, reverse-chronological list of `PUBLISHED` posts.

- **Auth**: optional. Anonymous viewers receive `viewer` omitted on each card.
- **Query parameters**:

  | Name     | Type     | Default | Description |
  |----------|----------|---------|-------------|
  | `cursor` | string?  | none    | Opaque cursor returned by a prior page |
  | `limit`  | integer? | `20`    | Page size, clamped 1..50 |

- **Response 200**:

  ```ts
  {
    items: FeedCardProjection[];
    nextCursor: string | null;
  }
  ```

- **Errors**:
  - `validation_failed` if `limit` is out of range or `cursor` is malformed.

### FeedCardProjection

A trimmed-down post projection optimized for list rendering. The full body is
not sent on the feed; clients fetch it via `GET /api/posts/[id]` when the user
opens a post.

```ts
interface FeedCardProjection {
  id: string;
  author: AuthorProjection | null;       // null if author deleted account
  title: string;
  bodyPreview: string;                    // server-truncated, see below
  tone: Tone;
  publishedAt: string;                    // ISO 8601
  isRemix: boolean;
  attribution:                            // present iff isRemix
    | {
        parent: { id: string; title: string; author: AuthorProjection } | null;
        parentAuthorSnapshot: { id: string; displayName: string };
        remixMode: RemixMode;
      }
    | null;
  likeCount: number;
  commentCount: number;
  remixCount: number;
  viewer?: { liked: boolean; saved: boolean };
}
```

### Body preview rules

- Trim leading/trailing whitespace.
- Truncate at the first paragraph break OR 200 characters, whichever comes
  first.
- If truncated, append `…` and ensure no broken UTF-8 surrogate pairs.

### Cursor semantics

The cursor encodes `(publishedAt, id)` of the last item on the previous page.
The next page query is:

```sql
WHERE status = 'PUBLISHED'
  AND (publishedAt, id) < (:lastPublishedAt, :lastId)
ORDER BY publishedAt DESC, id DESC
LIMIT :limit
```

This gives stable pagination under concurrent inserts and matches the
composite index defined in `data-model.md`.

### Empty state

When there are zero published posts and the request has no `cursor`, the
response is `{ items: [], nextCursor: null }`. The client renders the
empty-state CTA defined in spec acceptance scenario US2-4.

### Cache and freshness

This endpoint is dynamic. No CDN caching layer is configured at the route
level for MVP (the SC-005 propagation requirement of "within 10 seconds"
takes precedence over caching). Per-feature cost is dominated by a single
indexed Postgres query plus the per-card join for the author and the
viewer-state subqueries.

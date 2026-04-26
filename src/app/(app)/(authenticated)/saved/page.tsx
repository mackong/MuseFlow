"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bookmark } from "lucide-react";

import { FeedCard } from "@/components/feed/FeedCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { SaveListItem, SaveListResponse } from "@/lib/contracts/save.contract";
import { ApiError, api } from "@/lib/http/client";

/**
 * /saved — the requester's own saved posts (Constitution Principle VII:
 * private to the user; never exposed on a public profile).
 *
 * Lives under (app)/(authenticated)/ so the parent layout redirects
 * anonymous visitors to /sign-in.
 */
export default function SavedPage() {
  const [items, setItems] = useState<SaveListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api<SaveListResponse>("/api/saves");
        if (!cancelled) {
          setItems(res.saves);
          setCursor(res.nextCursor);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.envelope.error.message : "Couldn't load saves.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api<SaveListResponse>(`/api/saves?cursor=${encodeURIComponent(cursor)}`);
      setItems((prev) => [...(prev ?? []), ...res.saves]);
      setCursor(res.nextCursor);
    } catch (err) {
      setError(err instanceof ApiError ? err.envelope.error.message : "Couldn't load more saves.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-6">
      <header className="flex items-center gap-2">
        <Bookmark aria-hidden="true" className="size-5" />
        <h1 className="text-xl font-semibold">Saved</h1>
      </header>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {items === null && !error && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {items !== null && items.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Nothing saved yet. Tap the bookmark on any post to keep it here.
          </p>
          <Button asChild size="sm">
            <Link href="/feed">Browse the feed</Link>
          </Button>
        </div>
      )}

      {items !== null && items.length > 0 && (
        <ul className="flex flex-col gap-3" data-testid="saved-list">
          {items.map((item) => (
            <li key={item.post.id}>
              <FeedCard post={item.post} />
            </li>
          ))}
        </ul>
      )}

      {cursor && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-center"
          onClick={() => void loadMore()}
          disabled={loadingMore}
        >
          {loadingMore ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
}

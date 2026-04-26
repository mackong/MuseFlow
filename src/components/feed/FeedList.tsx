"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import { FeedCard } from "@/components/feed/FeedCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { FeedCardProjection, FeedResponse } from "@/lib/contracts/feed.contract";
import { ApiError, api } from "@/lib/http/client";

/**
 * SWR-backed feed list (research.md decision 7).
 *
 * - First page via useSWR with key="/api/feed":
 *   * refresh every 30s
 *   * revalidate on focus (catches "user comes back to the tab")
 * - Additional pages via cursor — fetched imperatively into local state
 *   (SWR's infinite mode is overkill for MVP).
 * - When the user just published, /create issues an optimistic prepend
 *   via SWR's mutate (callable from elsewhere); the parent page can call
 *   `mutate('/api/feed')` to force a fresh first page.
 */

const PAGE_LIMIT = 20;

export function FeedList({ isAuthenticated }: { isAuthenticated: boolean }) {
  const { data, error, isLoading } = useSWR<FeedResponse>(
    "/api/feed",
    (key) => api<FeedResponse>(key),
    {
      refreshInterval: 30_000,
      revalidateOnFocus: true,
    },
  );

  const [more, setMore] = useState<FeedCardProjection[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null | "init">("init");
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  // First page determines whether more pages exist.
  const firstPageNext = data?.nextCursor ?? null;
  const cursor = nextCursor === "init" ? firstPageNext : nextCursor;

  async function loadMore(): Promise<void> {
    if (!cursor) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const res = await api<FeedResponse>(
        `/api/feed?cursor=${encodeURIComponent(cursor)}&limit=${PAGE_LIMIT}`,
      );
      setMore((prev) => [...prev, ...res.items]);
      setNextCursor(res.nextCursor);
    } catch (err) {
      setLoadMoreError(
        err instanceof ApiError ? err.envelope.error.message : "Couldn't load more.",
      );
    } finally {
      setLoadingMore(false);
    }
  }

  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Couldn't load the feed. Pull down to retry.
      </p>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="flex flex-col gap-2" data-testid="feed-skeletons">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (data.items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          No posts yet.{" "}
          {isAuthenticated ? "Start the first one." : "Sign up to start the first one."}
        </p>
        <Button asChild size="sm">
          <Link href={isAuthenticated ? "/create" : "/sign-in?callbackUrl=%2Fcreate"}>
            {isAuthenticated ? "Create a post" : "Sign in"}
          </Link>
        </Button>
      </div>
    );
  }

  const items = [...data.items, ...more];
  return (
    <ul className="flex flex-col gap-3" data-testid="feed-list">
      {items.map((post) => (
        <li key={post.id}>
          <FeedCard post={post} />
        </li>
      ))}
      {cursor && (
        <li className="flex flex-col items-center gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadMore()}
            disabled={loadingMore}
          >
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
          {loadMoreError && (
            <p role="alert" className="text-xs text-destructive">
              {loadMoreError}
            </p>
          )}
        </li>
      )}
    </ul>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { FeedCard } from "@/components/feed/FeedCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { FeedCardProjection, FeedResponse } from "@/lib/contracts/feed.contract";
import type { PublicProfileShell } from "@/lib/contracts/profile.contract";
import { ApiError, api } from "@/lib/http/client";

/**
 * /profile/[username] — public profile page.
 *
 * Anonymous-readable. Renders the public shell (no email, no drafts, no
 * saved counts) and the user's published posts (Constitution Principle
 * VII). Viewer state on each card is populated when a session exists.
 */
export default function PublicProfilePage() {
  const params = useParams<{ username: string }>();
  const username = params?.username ?? "";

  const [shell, setShell] = useState<PublicProfileShell | null>(null);
  const [items, setItems] = useState<FeedCardProjection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!username) return;
    let cancelled = false;
    void (async () => {
      try {
        const [shellRes, postsRes] = await Promise.all([
          api<PublicProfileShell>(`/api/profile/${encodeURIComponent(username)}`),
          api<FeedResponse>(`/api/profile/${encodeURIComponent(username)}/posts`),
        ]);
        if (!cancelled) {
          setShell(shellRes);
          setItems(postsRes.items);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else {
          setError(err instanceof ApiError ? err.envelope.error.message : "Couldn't load profile.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [username]);

  if (notFound) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
        <h1 className="text-xl font-semibold">Profile not found</h1>
        <p className="text-sm text-muted-foreground">No user with username @{username}.</p>
        <Button asChild size="sm" variant="outline">
          <Link href="/feed">Back to feed</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-6">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {shell === null && !error ? (
        <Skeleton className="h-24 w-full" />
      ) : shell ? (
        <header className="flex flex-col gap-1" data-testid="public-profile-header">
          <h1 className="text-xl font-semibold">{shell.user.displayName}</h1>
          <p className="text-sm text-muted-foreground">@{shell.user.username}</p>
          {shell.user.description && (
            <p className="whitespace-pre-wrap text-sm">{shell.user.description}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {shell.counts.publishedPosts} {shell.counts.publishedPosts === 1 ? "post" : "posts"}
          </p>
        </header>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Posts
        </h2>
        {items === null && !error ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : items && items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No posts yet.</p>
        ) : items ? (
          <ul className="flex flex-col gap-3" data-testid="public-profile-posts">
            {items.map((p) => (
              <li key={p.id}>
                <FeedCard post={p} />
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}

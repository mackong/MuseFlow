"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";

import { FeedCard } from "@/components/feed/FeedCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DraftListResponse, DraftProjection } from "@/lib/contracts/draft.contract";
import type { FeedCardProjection, FeedResponse } from "@/lib/contracts/feed.contract";
import type { OwnProfileShell } from "@/lib/contracts/profile.contract";
import type { SaveListItem, SaveListResponse } from "@/lib/contracts/save.contract";
import { ApiError, api } from "@/lib/http/client";

/**
 * /me — own profile page.
 *
 * Shows the requester's profile shell (with email + private counts) and
 * four tabs: Published / Drafts / Saved / Remixes. Each tab fetches its
 * own list lazily on first activation.
 *
 * Lives under (app)/(authenticated)/ so the parent layout redirects
 * anonymous visitors to /sign-in (Constitution Principle VII).
 */
export default function OwnProfilePage() {
  const [shell, setShell] = useState<OwnProfileShell | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api<OwnProfileShell>("/api/me");
        if (!cancelled) setShell(res);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.envelope.error.message : "Couldn't load profile.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-4 px-4 py-6">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {shell === null && !error ? (
        <Skeleton className="h-32 w-full" />
      ) : shell ? (
        <ProfileHeader shell={shell} />
      ) : null}

      <Tabs defaultValue="published" className="flex flex-col gap-3">
        <TabsList className="w-full">
          <TabsTrigger value="published" className="flex-1">
            Posts {shell ? `· ${shell.counts.publishedPosts}` : ""}
          </TabsTrigger>
          <TabsTrigger value="drafts" className="flex-1">
            Drafts {shell ? `· ${shell.counts.drafts}` : ""}
          </TabsTrigger>
          <TabsTrigger value="saved" className="flex-1">
            Saved {shell ? `· ${shell.counts.saved}` : ""}
          </TabsTrigger>
          <TabsTrigger value="remixes" className="flex-1">
            Remixes {shell ? `· ${shell.counts.authoredRemixes}` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="published">
          <PublishedTab />
        </TabsContent>
        <TabsContent value="drafts">
          <DraftsTab />
        </TabsContent>
        <TabsContent value="saved">
          <SavedTab />
        </TabsContent>
        <TabsContent value="remixes">
          <RemixesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProfileHeader({ shell }: { shell: OwnProfileShell }) {
  return (
    <header className="flex flex-col gap-3" data-testid="me-profile-header">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">{shell.user.displayName}</h1>
          <p className="text-sm text-muted-foreground">@{shell.user.username}</p>
          <p className="text-xs text-muted-foreground">{shell.user.email}</p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/me/edit" aria-label="Edit profile">
            <Pencil aria-hidden="true" /> Edit
          </Link>
        </Button>
      </div>
      {shell.user.description && (
        <p className="whitespace-pre-wrap text-sm">{shell.user.description}</p>
      )}
    </header>
  );
}

// -----------------------------------------------------------------------------
// Published posts tab — feed cards
// -----------------------------------------------------------------------------

function PublishedTab() {
  const [items, setItems] = useState<FeedCardProjection[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api<FeedResponse>("/api/me/posts");
        if (!cancelled) setItems(res.items);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.envelope.error.message : "Couldn't load posts.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <ErrorRow text={error} />;
  if (items === null) return <ListSkeleton />;
  if (items.length === 0) {
    return (
      <EmptyState text="Nothing published yet." cta={{ href: "/create", label: "Start writing" }} />
    );
  }
  return (
    <ul className="flex flex-col gap-3" data-testid="me-published-list">
      {items.map((p) => (
        <li key={p.id}>
          <FeedCard post={p} />
        </li>
      ))}
    </ul>
  );
}

// -----------------------------------------------------------------------------
// Drafts tab — small card list
// -----------------------------------------------------------------------------

function DraftsTab() {
  const [items, setItems] = useState<DraftProjection[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api<DraftListResponse>("/api/me/drafts");
        if (!cancelled) setItems(res.drafts);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.envelope.error.message : "Couldn't load drafts.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <ErrorRow text={error} />;
  if (items === null) return <ListSkeleton />;
  if (items.length === 0) {
    return <EmptyState text="No drafts yet." cta={{ href: "/create", label: "Start a draft" }} />;
  }
  return (
    <ul className="flex flex-col gap-2" data-testid="me-drafts-list">
      {items.map((d) => (
        <li key={d.id}>
          <Link
            href={`/draft/${d.id}`}
            className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Card className="transition-colors hover:bg-accent">
              <CardContent className="flex flex-col gap-1 p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="line-clamp-1 font-medium">{d.title || "Untitled"}</p>
                  <time className="shrink-0 text-xs text-muted-foreground" dateTime={d.updatedAt}>
                    {new Date(d.updatedAt).toLocaleDateString()}
                  </time>
                </div>
                {d.body && <p className="line-clamp-2 text-sm text-muted-foreground">{d.body}</p>}
                {d.lastSafetyCheck?.verdict === "REJECT" && (
                  <p className="text-xs text-destructive">
                    Last AI output flagged — needs edit before publishing.
                  </p>
                )}
              </CardContent>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// -----------------------------------------------------------------------------
// Saved tab — feed cards
// -----------------------------------------------------------------------------

function SavedTab() {
  const [items, setItems] = useState<SaveListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api<SaveListResponse>("/api/me/saved");
        if (!cancelled) setItems(res.saves);
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

  if (error) return <ErrorRow text={error} />;
  if (items === null) return <ListSkeleton />;
  if (items.length === 0) {
    return (
      <EmptyState text="Nothing saved yet." cta={{ href: "/feed", label: "Browse the feed" }} />
    );
  }
  return (
    <ul className="flex flex-col gap-3" data-testid="me-saved-list">
      {items.map((s) => (
        <li key={s.post.id}>
          <FeedCard post={s.post} />
        </li>
      ))}
    </ul>
  );
}

// -----------------------------------------------------------------------------
// Remixes tab — feed cards filtered to remixes only
// -----------------------------------------------------------------------------

function RemixesTab() {
  const [items, setItems] = useState<FeedCardProjection[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api<FeedResponse>("/api/me/remixes");
        if (!cancelled) setItems(res.items);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.envelope.error.message : "Couldn't load remixes.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <ErrorRow text={error} />;
  if (items === null) return <ListSkeleton />;
  if (items.length === 0) {
    return (
      <EmptyState
        text="You haven't remixed anyone yet."
        cta={{ href: "/feed", label: "Find a post to remix" }}
      />
    );
  }
  return (
    <ul className="flex flex-col gap-3" data-testid="me-remixes-list">
      {items.map((p) => (
        <li key={p.id}>
          <FeedCard post={p} />
        </li>
      ))}
    </ul>
  );
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function ErrorRow({ text }: { text: string }) {
  return (
    <p role="alert" className="text-sm text-destructive">
      {text}
    </p>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

function EmptyState({ text, cta }: { text: string; cta: { href: string; label: string } }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
      <Button asChild size="sm">
        <Link href={cta.href}>{cta.label}</Link>
      </Button>
    </div>
  );
}

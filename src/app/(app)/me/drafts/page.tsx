"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FilePenLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { DraftListResponse, DraftProjection } from "@/lib/contracts/draft.contract";
import { api } from "@/lib/http/client";

/**
 * /me/drafts — the requester's own drafts, newest-first.
 *
 * Uses `GET /api/drafts` paginated. For MVP we render only the first page;
 * "Load more" lands when the list grows past 20 items per session.
 */
export default function DraftsListPage() {
  const [drafts, setDrafts] = useState<DraftProjection[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api<DraftListResponse>("/api/drafts");
        if (!cancelled) setDrafts(res.drafts);
      } catch {
        if (!cancelled) setError("Couldn't load your drafts.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-4 px-4 py-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Drafts</h1>
        <Button asChild size="sm" variant="outline">
          <Link href="/create">
            <FilePenLine aria-hidden="true" /> New
          </Link>
        </Button>
      </header>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {drafts === null && !error && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {drafts !== null && drafts.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No drafts yet. Start one from the create tab.
          </p>
          <Button asChild size="sm">
            <Link href="/create">Start a draft</Link>
          </Button>
        </div>
      )}

      {drafts !== null && drafts.length > 0 && (
        <ul className="flex flex-col gap-2">
          {drafts.map((d) => (
            <li key={d.id}>
              <Link
                href={`/draft/${d.id}`}
                className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Card className="transition-colors hover:bg-accent">
                  <CardContent className="flex flex-col gap-1 p-4">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="line-clamp-1 font-medium">{d.title || "Untitled"}</p>
                      <time
                        className="shrink-0 text-xs text-muted-foreground"
                        dateTime={d.updatedAt}
                      >
                        {new Date(d.updatedAt).toLocaleDateString()}
                      </time>
                    </div>
                    {d.body && (
                      <p className="line-clamp-2 text-sm text-muted-foreground">{d.body}</p>
                    )}
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
      )}
    </div>
  );
}

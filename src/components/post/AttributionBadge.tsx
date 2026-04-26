import Link from "next/link";
import { GitFork } from "lucide-react";

import type { AttributionProjection } from "@/lib/contracts/post.contract";
import { cn } from "@/lib/utils";

const MODE_LABEL: Record<AttributionProjection["remixMode"], string> = {
  REWRITE: "Rewrite of",
  CONTINUE: "Continued from",
  SUMMARIZE: "Summary of",
  CHANGE_TONE: "Re-toned from",
};

/**
 * "Remix of <title> by <author>" badge for feed cards and post detail.
 *
 * Constitution Principle V: when the parent post still exists, the title
 * is a link. When the parent has been removed (FK SET NULL), we render
 * the snapshot author as plain text — never silently strip attribution.
 *
 * Server-component compatible (no client hooks). Pure presentational.
 */
export function AttributionBadge({
  attribution,
  className,
}: {
  attribution: AttributionProjection;
  className?: string;
}) {
  const verb = MODE_LABEL[attribution.remixMode];
  return (
    <p
      className={cn(
        "inline-flex flex-wrap items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs text-muted-foreground",
        className,
      )}
    >
      <GitFork aria-hidden="true" className="size-3 shrink-0" />
      <span className="shrink-0">{verb}</span>
      {attribution.parent ? (
        <>
          <Link
            href={`/post/${attribution.parent.id}`}
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            {attribution.parent.title}
          </Link>
          <span>by</span>
          <Link
            href={`/profile/${attribution.parent.author.username}`}
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            {attribution.parent.author.displayName}
          </Link>
        </>
      ) : (
        <>
          <span className="font-medium text-foreground">a removed post</span>
          <span>by</span>
          <span className="font-medium text-foreground">
            {attribution.parentAuthorSnapshot.displayName}
          </span>
        </>
      )}
    </p>
  );
}

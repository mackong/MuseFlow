import Link from "next/link";
import { Bookmark, Heart, MessageCircle, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { AttributionBadge } from "@/components/post/AttributionBadge";
import { Card, CardContent } from "@/components/ui/card";
import { RelativeTime } from "@/components/ui/RelativeTime";
import type { FeedCardProjection } from "@/lib/contracts/feed.contract";
import { cn } from "@/lib/utils";

const TONE_LABEL: Record<FeedCardProjection["tone"], string> = {
  INSPIRING: "Inspiring",
  ANALYTICAL: "Analytical",
  PLAYFUL: "Playful",
  POETIC: "Poetic",
  PROFESSIONAL: "Professional",
};

/**
 * Mobile-first feed card.
 *
 * The whole card links to /post/[id]. Inner links (attribution → parent
 * post / author) take precedence via event bubbling stops in the badge.
 *
 * Per-viewer state (liked/saved) is reflected as a filled icon when
 * present; anonymous viewers see hollow icons that still navigate them
 * to /post/[id] where the SignInPrompt fires on tap.
 */
export function FeedCard({ post }: { post: FeedCardProjection }) {
  return (
    <Link
      href={`/post/${post.id}`}
      className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Card className="transition-colors hover:bg-accent/50">
        <CardContent className="flex flex-col gap-2 p-4">
          <div className="flex flex-col gap-1">
            <h2 className="line-clamp-2 text-lg font-semibold leading-snug">{post.title}</h2>
            <p className="line-clamp-3 text-sm text-muted-foreground">{post.bodyPreview}</p>
          </div>

          {post.attribution && (
            <AttributionBadge attribution={post.attribution} className="self-start" />
          )}

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {post.author?.displayName ?? "Removed user"}
            </span>
            <span aria-hidden="true">·</span>
            <RelativeTime iso={post.publishedAt} />
            <span aria-hidden="true">·</span>
            <span>{TONE_LABEL[post.tone]}</span>
          </div>

          <div className="flex gap-4 text-xs text-muted-foreground">
            <Stat icon={Heart} count={post.likeCount} filled={post.viewer?.liked} label="like" />
            <Stat icon={MessageCircle} count={post.commentCount} filled={false} label="comment" />
            <Stat icon={Sparkles} count={post.remixCount} filled={false} label="remix" />
            <Stat icon={Bookmark} count={null} filled={post.viewer?.saved} label="save" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function Stat({
  icon: Icon,
  count,
  filled,
  label,
}: {
  icon: LucideIcon;
  count: number | null;
  filled: boolean | undefined;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={label}>
      <Icon aria-hidden="true" className={cn("size-4", filled && "fill-current text-foreground")} />
      {count !== null && <span>{count}</span>}
    </span>
  );
}

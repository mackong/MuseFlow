import { notFound } from "next/navigation";

import { AttributionBadge } from "@/components/post/AttributionBadge";
import { InteractionBar } from "@/components/post/InteractionBar";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { getCurrentUser } from "@/server/auth/session";
import { NotFoundError } from "@/server/errors";
import { getById } from "@/server/services/post.service";

interface PageProps {
  params: Promise<{ id: string }>;
}

const TONE_LABEL = {
  INSPIRING: "Inspiring",
  ANALYTICAL: "Analytical",
  PLAYFUL: "Playful",
  POETIC: "Poetic",
  PROFESSIONAL: "Professional",
} as const;

/**
 * /post/[id] — public post detail (US2).
 *
 * Server-rendered for fast first paint and good SEO. The InteractionBar
 * is a client island that handles like/save/comment/remix entry points;
 * for US2 it's a placeholder shell that fires the SignInPrompt on tap
 * for anonymous viewers. The full bar wires up to /api/likes etc. in US3.
 */
export default async function PostDetailPage({ params }: PageProps) {
  const { id } = await params;
  const viewer = await getCurrentUser();

  let post;
  try {
    post = await getById(id, viewer?.id ?? null);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  return (
    <article className="flex flex-col gap-4 px-4 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold leading-tight tracking-tight">{post.title}</h1>
        {post.attribution && <AttributionBadge attribution={post.attribution} />}
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {post.author?.displayName ?? "Removed user"}
          </span>
          <span aria-hidden="true">·</span>
          <RelativeTime iso={post.publishedAt} />
          <span aria-hidden="true">·</span>
          <span>{TONE_LABEL[post.tone]}</span>
          {post.editedAt && (
            <>
              <span aria-hidden="true">·</span>
              <span>edited</span>
            </>
          )}
        </p>
      </header>

      <section className="whitespace-pre-wrap text-base leading-relaxed">{post.body}</section>

      <InteractionBar
        postId={post.id}
        isOwnPost={viewer?.id === post.author?.id}
        viewer={post.viewer ?? null}
        likeCount={post.likeCount}
        commentCount={post.commentCount}
        remixCount={post.remixCount}
      />
    </article>
  );
}

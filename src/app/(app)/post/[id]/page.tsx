import { notFound } from "next/navigation";

import { AttributionBadge } from "@/components/post/AttributionBadge";
import { CommentList } from "@/components/post/CommentList";
import { InteractionBar } from "@/components/post/InteractionBar";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { getCurrentUser } from "@/server/auth/session";
import { NotFoundError } from "@/server/errors";
import { listCommentsForPost } from "@/server/services/comment.service";
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
 * /post/[id] — public post detail (US2 + US3).
 *
 * Server-rendered for fast first paint and good SEO. The first page of
 * comments is fetched server-side; the CommentList client island handles
 * delete + Load more. The InteractionBar is a client island that wires
 * up like/save/comment/remix actions against /api/likes etc. (US3).
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

  const initialComments = await listCommentsForPost({
    postId: post.id,
    limit: 20,
    viewerId: viewer?.id ?? null,
  });

  return (
    <article className="flex flex-col gap-6 px-4 py-6">
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

      <CommentList
        postId={post.id}
        isAuthenticated={viewer !== null}
        initialComments={initialComments.comments}
        initialNextCursor={initialComments.nextCursor}
      />
    </article>
  );
}

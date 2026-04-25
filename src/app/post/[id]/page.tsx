import { notFound } from "next/navigation";

import { getCurrentUser } from "@/server/auth/session";
import { NotFoundError } from "@/server/errors";
import { getById } from "@/server/services/post.service";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Public post detail. Lives OUTSIDE the (app) auth group so anonymous
 * visitors can read (per spec; full-bodied US2 page lands at T072).
 *
 * This is a minimal MVP rendering — the rich layout (interaction bar,
 * comments, attribution badge, viewer-state-aware controls) lands in US2
 * and US3 task slices. For US1's success-after-publish redirect we just
 * need the URL to resolve to the post's title and body.
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

  const publishedAt = new Date(post.publishedAt);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 py-6">
      <article className="flex flex-col gap-4">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{post.title}</h1>
          <p className="text-xs text-muted-foreground">
            {post.author?.displayName ?? "Removed user"} ·{" "}
            <time dateTime={post.publishedAt}>{publishedAt.toLocaleString()}</time> ·{" "}
            {post.tone.toLowerCase()}
          </p>
        </header>
        {post.attribution && (
          <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            Remix of{" "}
            <strong className="text-foreground">
              {post.attribution.parent ? post.attribution.parent.title : "a removed post"}
            </strong>{" "}
            by{" "}
            <strong className="text-foreground">
              {post.attribution.parentAuthorSnapshot.displayName}
            </strong>
            .
          </p>
        )}
        <section className="prose prose-sm max-w-none whitespace-pre-wrap leading-relaxed">
          {post.body}
        </section>
      </article>
      <footer className="flex gap-3 text-xs text-muted-foreground">
        <span>{post.likeCount} likes</span>
        <span>{post.commentCount} comments</span>
        <span>{post.remixCount} remixes</span>
      </footer>
    </main>
  );
}

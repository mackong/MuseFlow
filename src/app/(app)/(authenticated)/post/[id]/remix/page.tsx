import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/server/auth/session";
import { NotFoundError } from "@/server/errors";
import { getById } from "@/server/services/post.service";

import { RemixForm } from "./RemixForm";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * /post/[id]/remix — choose a remix mode and kick off the AI generation.
 *
 * Lives under (app)/(authenticated)/ so anonymous visitors are bounced
 * to /sign-in by the parent layout. Self-remixing is allowed at the
 * service layer, but here we redirect away from the user's own post —
 * the InteractionBar already disables the Remix button on own posts and
 * direct navigation here is unusual; bouncing prevents accidental
 * "remix yourself" flows.
 */
export default async function RemixEntryPage({ params }: PageProps) {
  const { id } = await params;
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/sign-in");

  let post;
  try {
    post = await getById(id, viewer.id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  if (post.author?.id === viewer.id) {
    redirect(`/post/${id}`);
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Remix</h1>
        <p className="text-sm text-muted-foreground">
          Pick how the AI should reshape this post — you can edit the result before publishing.
        </p>
      </header>

      <section className="rounded-md border border-border bg-muted/40 p-3">
        <p className="text-xs text-muted-foreground">
          Remixing{" "}
          <span className="font-medium text-foreground">
            {post.author?.displayName ?? "Removed user"}
          </span>
          ’s post:
        </p>
        <h2 className="mt-1 line-clamp-2 text-base font-semibold">{post.title}</h2>
      </section>

      <RemixForm sourcePostId={post.id} />
    </div>
  );
}

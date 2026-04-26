"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { CommentForm } from "@/components/post/CommentForm";
import { SignInPrompt } from "@/components/auth/SignInPrompt";
import { Button } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/RelativeTime";
import type { CommentListResponse, CommentProjection } from "@/lib/contracts/comment.contract";
import { ApiError, api } from "@/lib/http/client";

/**
 * CommentList for /post/[id].
 *
 * - Renders the server-fetched first page (initialComments + initialNextCursor)
 *   and supports cursor-based "Load more" via /api/posts/[id]/comments.
 * - The CommentForm is rendered for authenticated viewers; anonymous viewers
 *   see a "Sign in to comment" CTA that opens the SignInPrompt sheet.
 * - Delete affordance is gated on viewer.isAuthor — the server populates
 *   that flag so we don't need a separate viewerId prop here.
 */
export function CommentList({
  postId,
  isAuthenticated,
  initialComments,
  initialNextCursor,
}: {
  postId: string;
  isAuthenticated: boolean;
  initialComments: CommentProjection[];
  initialNextCursor: string | null;
}) {
  const [comments, setComments] = useState<CommentProjection[]>(initialComments);
  const [cursor, setCursor] = useState<string | null>(initialNextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api<CommentListResponse>(
        `/api/posts/${postId}/comments?cursor=${encodeURIComponent(cursor)}`,
      );
      setComments((prev) => [...prev, ...res.comments]);
      setCursor(res.nextCursor);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.envelope.error.message : "Couldn't load comments.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function deleteComment(commentId: string) {
    if (!window.confirm("Delete this comment?")) return;
    try {
      await api(`/api/comments/${commentId}`, { method: "DELETE" });
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.envelope.error.message : "Couldn't delete comment.",
      );
    }
  }

  return (
    <section
      id="comments"
      className="flex flex-col gap-4"
      aria-label="Comments"
      data-testid="comment-list"
    >
      <h2 className="text-lg font-semibold">
        Comments {comments.length > 0 && `(${comments.length})`}
      </h2>

      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="comment-items">
          {comments.map((c) => (
            <li key={c.id} className="flex flex-col gap-1 rounded-md border border-border p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium">{c.author?.displayName ?? "[removed]"}</p>
                <RelativeTime iso={c.createdAt} refreshSeconds={120} />
              </div>
              <p className="whitespace-pre-wrap text-sm">{c.body}</p>
              {c.viewer?.isAuthor && (
                <div className="self-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void deleteComment(c.id)}
                    data-testid={`delete-comment-${c.id}`}
                    className="text-destructive"
                  >
                    <Trash2 aria-hidden="true" />
                    Delete
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {cursor && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-center"
          onClick={() => void loadMore()}
          disabled={loadingMore}
        >
          {loadingMore ? "Loading…" : "Load more comments"}
        </Button>
      )}

      {isAuthenticated ? (
        <CommentForm postId={postId} onCreated={(c) => setComments((prev) => [...prev, c])} />
      ) : (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <p className="text-sm text-muted-foreground">Sign in to add a comment.</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setSignInOpen(true)}
            className="self-start"
          >
            Sign in
          </Button>
        </div>
      )}

      <SignInPrompt
        open={signInOpen}
        onOpenChange={setSignInOpen}
        callbackUrl={`/post/${postId}`}
      />
    </section>
  );
}

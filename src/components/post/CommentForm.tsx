"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CommentCreateResponse, CommentProjection } from "@/lib/contracts/comment.contract";
import { ApiError, api } from "@/lib/http/client";
import { cn } from "@/lib/utils";

const COMMENT_MAX = 1000;

/**
 * Mobile-first comment composer. On submit:
 *   - 422 safety_rejected → inline error with category list (Principle VI)
 *   - 200 → calls onCreated with the new comment so the parent list can
 *     append immediately
 */
export function CommentForm({
  postId,
  onCreated,
}: {
  postId: string;
  onCreated?: (comment: CommentProjection) => void;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [rejection, setRejection] = useState<{
    categories: string[];
    reason: string;
  } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true);
    setRejection(null);
    try {
      const res = await api<CommentCreateResponse>("/api/comments", {
        method: "POST",
        json: { postId, body: body.trim() },
      });
      setBody("");
      onCreated?.(res.comment);
    } catch (err) {
      if (err instanceof ApiError && err.code === "safety_rejected") {
        const d = err.details as { categories?: string[]; reason?: string } | undefined;
        setRejection({
          categories: d?.categories ?? [],
          reason: d?.reason ?? "Content flagged by safety moderation",
        });
      } else if (err instanceof ApiError) {
        toast.error(err.envelope.error.message);
      } else {
        toast.error("Couldn't post comment.");
      }
    } finally {
      setBusy(false);
    }
  }

  const atMax = body.length >= COMMENT_MAX;

  return (
    <form
      id="comments"
      onSubmit={onSubmit}
      className="flex flex-col gap-2"
      data-testid="comment-form"
    >
      <div className="flex items-center justify-between">
        <Label htmlFor="comment-body">Add a comment</Label>
        <span className={cn("text-xs", atMax ? "text-destructive" : "text-muted-foreground")}>
          {body.length}/{COMMENT_MAX}
        </span>
      </div>
      <Textarea
        id="comment-body"
        name="comment-body"
        rows={3}
        maxLength={COMMENT_MAX}
        placeholder="Add to the conversation…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={busy}
      />
      {rejection && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {rejection.reason}
          {rejection.categories.length > 0 && (
            <span className="ml-1 opacity-80">({rejection.categories.join(", ")})</span>
          )}
        </p>
      )}
      <div className="self-end">
        <Button type="submit" size="sm" disabled={busy || body.trim().length === 0}>
          {busy ? "Posting…" : "Post comment"}
        </Button>
      </div>
    </form>
  );
}

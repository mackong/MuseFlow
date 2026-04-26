"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bookmark, Heart, MessageCircle, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { SignInPrompt } from "@/components/auth/SignInPrompt";
import { Button } from "@/components/ui/button";
import type { LikeToggleResponse } from "@/lib/contracts/like.contract";
import type { ViewerState } from "@/lib/contracts/post.contract";
import type { SaveToggleResponse } from "@/lib/contracts/save.contract";
import { ApiError, api } from "@/lib/http/client";
import { cn } from "@/lib/utils";

/**
 * Interaction bar (T091): like / comment / save / remix.
 *
 * Behavior matrix:
 *   anonymous → opens SignInPrompt bottom sheet for ANY action
 *   own post  → like and remix are disabled (you can't like or remix your
 *               own post per the spec); save is allowed; comment is
 *               allowed and scrolls to the comment form
 *   others    → like / save toggle optimistically against /api/likes,
 *               /api/saves; comment scrolls to the comment form on the
 *               same page; remix navigates to /post/[id]/remix (US4 lands
 *               that route)
 *
 * Optimistic updates: state flips immediately on click; on API error we
 * revert and surface a toast. This keeps the UI snappy even when the
 * network is slow (Constitution Principle I — mobile-first responsiveness).
 */
export function InteractionBar({
  postId,
  isOwnPost,
  viewer,
  likeCount,
  commentCount,
  remixCount,
  /** id of an element on the same page to scroll to when "Comment" is tapped. */
  commentTargetId = "comments",
}: {
  postId: string;
  isOwnPost: boolean;
  viewer: ViewerState | null;
  likeCount: number;
  commentCount: number;
  remixCount: number;
  commentTargetId?: string;
}) {
  const router = useRouter();
  const [signInOpen, setSignInOpen] = useState(false);
  const [liked, setLiked] = useState(viewer?.liked ?? false);
  const [saved, setSaved] = useState(viewer?.saved ?? false);
  const [likes, setLikes] = useState(likeCount);
  const [busyLike, setBusyLike] = useState(false);
  const [busySave, setBusySave] = useState(false);
  const isAnonymous = viewer === null;

  function promptSignIn() {
    setSignInOpen(true);
  }

  async function onLike() {
    if (isAnonymous) return promptSignIn();
    if (busyLike) return;
    const prev = { liked, likes };
    setBusyLike(true);
    setLiked((v) => !v);
    setLikes((n) => (prev.liked ? n - 1 : n + 1));
    try {
      const res = await api<LikeToggleResponse>(`/api/likes/${postId}`, {
        method: "POST",
      });
      setLiked(res.liked);
      setLikes(res.likeCount);
    } catch (err) {
      setLiked(prev.liked);
      setLikes(prev.likes);
      toast.error(err instanceof ApiError ? err.envelope.error.message : "Couldn't update like.");
    } finally {
      setBusyLike(false);
    }
  }

  async function onSave() {
    if (isAnonymous) return promptSignIn();
    if (busySave) return;
    const prev = saved;
    setBusySave(true);
    setSaved((v) => !v);
    try {
      const res = await api<SaveToggleResponse>(`/api/saves/${postId}`, {
        method: "POST",
      });
      setSaved(res.saved);
    } catch (err) {
      setSaved(prev);
      toast.error(err instanceof ApiError ? err.envelope.error.message : "Couldn't update save.");
    } finally {
      setBusySave(false);
    }
  }

  function onComment() {
    if (isAnonymous) return promptSignIn();
    const target = document.getElementById(commentTargetId);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      const input = target.querySelector<HTMLTextAreaElement>("textarea");
      input?.focus();
    }
  }

  function onRemix() {
    if (isAnonymous) return promptSignIn();
    if (isOwnPost) return;
    router.push(`/post/${postId}/remix`);
  }

  return (
    <>
      <div className="grid grid-cols-4 gap-1 border-t border-border pt-3">
        <Action
          label="Like"
          count={likes}
          icon={Heart}
          filled={liked}
          disabled={isOwnPost || busyLike}
          onClick={onLike}
          dataTestId={`like-${postId}`}
        />
        <Action
          label="Comment"
          count={commentCount}
          icon={MessageCircle}
          onClick={onComment}
          dataTestId={`comment-${postId}`}
        />
        <Action
          label="Remix"
          count={remixCount}
          icon={Sparkles}
          disabled={isOwnPost}
          onClick={onRemix}
          dataTestId={`remix-${postId}`}
        />
        <Action
          label="Save"
          icon={Bookmark}
          filled={saved}
          disabled={busySave}
          onClick={onSave}
          dataTestId={`save-${postId}`}
        />
      </div>

      <SignInPrompt
        open={signInOpen}
        onOpenChange={setSignInOpen}
        callbackUrl={`/post/${postId}`}
      />
    </>
  );
}

function Action({
  label,
  count,
  icon: Icon,
  filled,
  disabled,
  onClick,
  dataTestId,
}: {
  label: string;
  count?: number;
  icon: LucideIcon;
  filled?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  dataTestId?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      data-testid={dataTestId}
      onClick={onClick}
      disabled={disabled}
      className="flex h-auto min-h-[56px] flex-col items-center justify-center gap-1 px-2 py-2 text-xs"
    >
      <Icon aria-hidden="true" className={cn("size-5", filled && "fill-current")} />
      <span>
        {label}
        {count !== undefined && count > 0 ? ` · ${count}` : ""}
      </span>
    </Button>
  );
}

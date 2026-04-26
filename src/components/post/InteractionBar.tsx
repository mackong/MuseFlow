"use client";

import { useState } from "react";
import { Bookmark, Heart, MessageCircle, Sparkles } from "lucide-react";

import { SignInPrompt } from "@/components/auth/SignInPrompt";
import { Button } from "@/components/ui/button";
import type { ViewerState } from "@/lib/contracts/post.contract";
import { cn } from "@/lib/utils";

/**
 * Interaction bar shown under each post detail (US2 shell).
 *
 * For US2 the buttons are wired to:
 *  - anonymous viewers: open the SignInPrompt bottom sheet
 *  - authenticated viewers: a TODO toast for now (full like/save/comment
 *    wiring lands in US3 at T091; remix lands in US4 at T108)
 *
 * The shell is committed now so the post detail page is complete; the
 * actual API calls slot in incrementally.
 */
export function InteractionBar({
  postId,
  isOwnPost,
  viewer,
  likeCount,
  commentCount,
  remixCount,
}: {
  postId: string;
  isOwnPost: boolean;
  viewer: ViewerState | null;
  likeCount: number;
  commentCount: number;
  remixCount: number;
}) {
  const [signInOpen, setSignInOpen] = useState(false);
  const isAnonymous = viewer === null;

  function handleAnonClick() {
    setSignInOpen(true);
  }

  return (
    <>
      <div className="grid grid-cols-4 gap-1 border-t border-border pt-3">
        <Action
          label="Like"
          count={likeCount}
          icon={Heart}
          filled={viewer?.liked}
          disabled={isOwnPost}
          onClick={isAnonymous ? handleAnonClick : undefined}
          dataTestId={`like-${postId}`}
        />
        <Action
          label="Comment"
          count={commentCount}
          icon={MessageCircle}
          onClick={isAnonymous ? handleAnonClick : undefined}
          dataTestId={`comment-${postId}`}
        />
        <Action
          label="Remix"
          count={remixCount}
          icon={Sparkles}
          disabled={isOwnPost}
          onClick={isAnonymous ? handleAnonClick : undefined}
          dataTestId={`remix-${postId}`}
        />
        <Action
          label="Save"
          icon={Bookmark}
          filled={viewer?.saved}
          onClick={isAnonymous ? handleAnonClick : undefined}
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
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
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

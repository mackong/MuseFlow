"use client";

import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Mobile-first safety-rejection banner per Constitution Principle VI.
 * The user sees the category list + a human-readable reason, plus the
 * recovery actions exposed by the parent (Regenerate / Edit / Discard).
 *
 * Each action callback is optional so the same component works in two
 * surfaces:
 *   - AI-output rejection (from /api/ai/generate): all three actions
 *   - Publish-time rejection (from /api/drafts/[id]/publish): only
 *     Edit and Discard make sense (the user has already edited)
 */
export function RejectionNotice({
  categories,
  reason,
  onRegenerate,
  onEdit,
  onDiscard,
  busy = false,
}: {
  categories: string[];
  reason: string;
  onRegenerate?: () => void | Promise<void>;
  onEdit?: () => void | Promise<void>;
  onDiscard?: () => void | Promise<void>;
  busy?: boolean;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
    >
      <div className="flex items-start gap-2">
        <ShieldAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <div className="flex flex-col gap-1">
          <p className="font-medium">Content blocked by safety review</p>
          <p>{reason}</p>
          {categories.length > 0 && (
            <p className="text-xs opacity-80">Flagged: {categories.join(", ")}</p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {onRegenerate && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void onRegenerate()}
            disabled={busy}
          >
            Regenerate
          </Button>
        )}
        {onEdit && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void onEdit()}
            disabled={busy}
          >
            Edit and try again
          </Button>
        )}
        {onDiscard && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void onDiscard()}
            disabled={busy}
          >
            Discard
          </Button>
        )}
      </div>
    </div>
  );
}

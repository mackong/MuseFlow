"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { RemixModeSelector } from "@/components/editor/RemixModeSelector";
import { RejectionNotice } from "@/components/safety/RejectionNotice";
import { Button } from "@/components/ui/button";
import type { RemixInitResponse } from "@/lib/contracts/remix.contract";
import type { RemixMode, Tone } from "@/lib/contracts/shared";
import { ApiError, api } from "@/lib/http/client";

/**
 * Client form for /post/[id]/remix.
 *
 * Two phases:
 *   1. "picking" — RemixModeSelector + Submit button. Submit calls
 *      POST /api/remix/[postId]; on success the API returns either
 *      ALLOW (we redirect to /draft/[id] for editing) or REJECT (we
 *      show the rejection notice and offer Regenerate / Edit / Discard).
 *   2. "rejected" — render RejectionNotice. Regenerate retries with
 *      the same mode/targetTone; Edit takes the user to /draft/[id]
 *      anyway so they can write something fresh; Discard deletes the
 *      empty draft and resets the picker.
 */

type Phase =
  | { kind: "picking" }
  | {
      kind: "rejected";
      draftId: string;
      categories: string[];
      reason: string;
    };

export function RemixForm({ sourcePostId }: { sourcePostId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<RemixMode | null>(null);
  const [targetTone, setTargetTone] = useState<Tone | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "picking" });
  const [busy, setBusy] = useState(false);

  const canSubmit = mode !== null && (mode !== "CHANGE_TONE" || targetTone !== null) && !busy;

  async function submit(): Promise<void> {
    if (!mode) return;
    if (mode === "CHANGE_TONE" && !targetTone) return;
    setBusy(true);
    try {
      const body = mode === "CHANGE_TONE" ? { mode, targetTone: targetTone! } : { mode };
      const res = await api<RemixInitResponse>(`/api/remix/${sourcePostId}`, {
        method: "POST",
        json: body,
      });

      if (res.aiOutputSafetyCheck.verdict === "REJECT") {
        setPhase({
          kind: "rejected",
          draftId: res.draft.id,
          categories: res.aiOutputSafetyCheck.categories,
          reason: res.aiOutputSafetyCheck.reason,
        });
        return;
      }

      // ALLOW: redirect to /draft/[id] for editing.
      toast.success("Remix draft created");
      router.push(`/draft/${res.draft.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "rate_limited") {
        const seconds =
          (err.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds ?? 60;
        toast.error("Remix rate limit reached", {
          description: `Try again in about ${Math.max(1, Math.round(seconds / 60))} minute(s).`,
        });
      } else if (err instanceof ApiError && err.code === "ai_provider_error") {
        toast.error("AI generation failed", { description: "Please try again." });
      } else if (err instanceof ApiError) {
        toast.error(err.envelope.error.message);
      } else {
        toast.error("Couldn't start the remix. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (phase.kind === "rejected") {
    return (
      <RejectionNotice
        categories={phase.categories}
        reason={phase.reason}
        busy={busy}
        onRegenerate={() => void submit()}
        onEdit={() => router.push(`/draft/${phase.draftId}`)}
        onDiscard={async () => {
          try {
            await api(`/api/drafts/${phase.draftId}`, { method: "DELETE" });
          } catch {
            // Best-effort; the user can clean up via /me/drafts.
          }
          setPhase({ kind: "picking" });
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <RemixModeSelector
        mode={mode}
        onModeChange={setMode}
        targetTone={targetTone}
        onTargetToneChange={setTargetTone}
        disabled={busy}
      />
      <Button type="button" onClick={() => void submit()} disabled={!canSubmit} className="w-full">
        <Sparkles aria-hidden="true" />
        {busy ? "Generating remix…" : "Generate remix"}
      </Button>
    </div>
  );
}

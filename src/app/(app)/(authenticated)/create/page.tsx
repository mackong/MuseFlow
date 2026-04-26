"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { PostEditor } from "@/components/editor/PostEditor";
import { ToneSelector } from "@/components/editor/ToneSelector";
import { RejectionNotice } from "@/components/safety/RejectionNotice";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AiGenerateResponse, AiGenerationMode } from "@/lib/contracts/ai.contract";
import type { DraftResponse } from "@/lib/contracts/draft.contract";
import type { PostResponse } from "@/lib/contracts/post.contract";
import type { Tone } from "@/lib/contracts/shared";
import { ApiError, api } from "@/lib/http/client";

const IDEA_MAX = 500;

type Phase =
  | { kind: "idea" }
  | {
      kind: "editor";
      draftId: string;
      title: string;
      body: string;
      tone: Tone;
      lastIdea: string;
    }
  | {
      kind: "rejected";
      reason: string;
      categories: string[];
      idea: string;
      tone: Tone;
    };

/**
 * /create — the entry point of the content loop (US1).
 *
 * Two phases live in one page:
 *   1. "idea" — user types an idea, picks a tone, taps Generate. We
 *      atomically: POST /api/drafts (empty draft) → POST /api/ai/generate
 *      → PATCH /api/drafts/[id] with the AI output.
 *   2. "editor" — PostEditor renders the AI-seeded draft. The user edits,
 *      auto-save fires PATCH /api/drafts/[id] under the hood, and Publish
 *      hits /api/drafts/[id]/publish then redirects to /post/[id].
 *
 * Safety rejection from /api/ai/generate flips us to a "rejected" phase
 * (with the user's idea preserved) so they can edit and retry without
 * losing context. Publish-time rejection is handled inline by the editor.
 */
export default function CreatePage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "idea" });
  const [idea, setIdea] = useState("");
  const [tone, setTone] = useState<Tone | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate(
    /** Optional override — used by Regenerate after a rejection. */
    overrides?: { idea?: string; tone?: Tone },
  ): Promise<void> {
    const ideaText = (overrides?.idea ?? idea).trim();
    const toneValue = overrides?.tone ?? tone;
    if (!ideaText || !toneValue) return;
    setBusy(true);
    try {
      // 1. Create the empty draft so we have an id to attach to.
      const { draft } = await api<DraftResponse>("/api/drafts", {
        method: "POST",
        json: { kind: "ORIGINAL", tone: toneValue },
      });

      // 2. Ask the AI provider for a title+body.
      const ai = await api<AiGenerateResponse>("/api/ai/generate", {
        method: "POST",
        json: { mode: "CREATE" satisfies AiGenerationMode, idea: ideaText, tone: toneValue },
      });

      if (ai.safety.verdict === "REJECT") {
        // Discard the empty draft we just made — user is bouncing off
        // safety; they shouldn't accumulate empty drafts.
        await api(`/api/drafts/${draft.id}`, { method: "DELETE" }).catch(() => {});
        setPhase({
          kind: "rejected",
          reason: ai.safety.reason,
          categories: ai.safety.categories,
          idea: ideaText,
          tone: toneValue,
        });
        return;
      }

      // 3. Persist the AI output into the draft so refresh = stay alive.
      if (ai.output) {
        await api<DraftResponse>(`/api/drafts/${draft.id}`, {
          method: "PATCH",
          json: { title: ai.output.title, body: ai.output.body },
        });
      }

      setPhase({
        kind: "editor",
        draftId: draft.id,
        title: ai.output?.title ?? "",
        body: ai.output?.body ?? "",
        tone: toneValue,
        lastIdea: ideaText,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "rate_limited") {
          const seconds =
            (err.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds ?? 60;
          toast.error("Generation rate limit reached", {
            description: `Try again in about ${Math.max(1, Math.round(seconds / 60))} minute(s).`,
          });
        } else if (err.code === "ai_provider_error") {
          toast.error("AI generation failed", { description: "Please try again." });
        } else {
          toast.error(err.envelope.error.message);
        }
      } else {
        toast.error("Couldn't generate. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function publishCurrent(): Promise<void> {
    if (phase.kind !== "editor") return;
    setBusy(true);
    try {
      const { post } = await api<PostResponse>(`/api/drafts/${phase.draftId}/publish`, {
        method: "POST",
      });
      toast.success("Published");
      router.push(`/post/${post.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "safety_rejected") {
        const d = err.details as { categories?: string[]; reason?: string } | undefined;
        toast.error("Publish blocked by safety review", {
          description: d?.reason ?? "Edit your post and try again.",
        });
      } else if (err instanceof ApiError) {
        toast.error(err.envelope.error.message);
      } else {
        toast.error("Couldn't publish. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  function saveAsDraft(): void {
    if (phase.kind !== "editor") return;
    toast.success("Saved as draft");
    router.push(`/draft/${phase.draftId}`);
  }

  // --- Phase: rejection ----------------------------------------------------
  if (phase.kind === "rejected") {
    return (
      <div className="flex flex-col gap-4 px-4 py-6">
        <h1 className="text-xl font-semibold">Create</h1>
        <RejectionNotice
          categories={phase.categories}
          reason={phase.reason}
          busy={busy}
          onRegenerate={() => generate({ idea: phase.idea, tone: phase.tone })}
          onEdit={() => {
            setIdea(phase.idea);
            setTone(phase.tone);
            setPhase({ kind: "idea" });
          }}
          onDiscard={() => {
            setIdea("");
            setTone(null);
            setPhase({ kind: "idea" });
          }}
        />
      </div>
    );
  }

  // --- Phase: editor (post-generation) -------------------------------------
  if (phase.kind === "editor") {
    return (
      <div className="flex flex-col gap-4 px-4 py-6">
        <h1 className="text-xl font-semibold">Create</h1>
        <PostEditor
          initialTitle={phase.title}
          initialBody={phase.body}
          busy={busy}
          onAutosave={async (next) => {
            await api(`/api/drafts/${phase.draftId}`, {
              method: "PATCH",
              json: next,
            });
          }}
        />
        <div className="sticky bottom-[calc(56px+env(safe-area-inset-bottom)+0.75rem)] flex flex-col gap-2 bg-background/90 pt-2 backdrop-blur">
          <Button onClick={publishCurrent} disabled={busy} className="w-full">
            {busy ? "Publishing…" : "Publish"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={saveAsDraft}
            disabled={busy}
          >
            Save as draft
          </Button>
        </div>
      </div>
    );
  }

  // --- Phase: idea (initial) -----------------------------------------------
  const canGenerate = idea.trim().length > 0 && tone !== null && !busy;
  return (
    <div className="flex flex-col gap-4 px-4 py-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Create</h1>
        <p className="text-sm text-muted-foreground">
          Type an idea and pick a tone — the AI drafts a post you can edit.
        </p>
      </header>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="idea">Your idea</Label>
          <span className="text-xs text-muted-foreground">
            {idea.length}/{IDEA_MAX}
          </span>
        </div>
        <Textarea
          id="idea"
          name="idea"
          rows={5}
          maxLength={IDEA_MAX}
          placeholder="e.g. the joy of walking at dawn"
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          disabled={busy}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Tone</Label>
        <ToneSelector value={tone} onChange={setTone} disabled={busy} />
      </div>

      <Button
        type="button"
        onClick={() => void generate()}
        disabled={!canGenerate}
        className="w-full"
      >
        <Sparkles aria-hidden="true" />
        {busy ? "Generating…" : "Generate"}
      </Button>
    </div>
  );
}

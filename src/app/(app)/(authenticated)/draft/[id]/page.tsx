"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PostEditor } from "@/components/editor/PostEditor";
import { ToneSelector } from "@/components/editor/ToneSelector";
import { AttributionBadge } from "@/components/post/AttributionBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { DraftProjection, DraftResponse } from "@/lib/contracts/draft.contract";
import type { PostResponse } from "@/lib/contracts/post.contract";
import type { Tone } from "@/lib/contracts/shared";
import { ApiError, api } from "@/lib/http/client";

/**
 * /draft/[id] — author-private draft editor.
 *
 * Loads the draft, renders the same PostEditor used on /create, plus a
 * ToneSelector to tweak the snapshotted tone before publish, and the
 * action bar (Publish, Discard).
 */
export default function DraftEditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const draftId = params.id;

  const [draft, setDraft] = useState<DraftProjection | null>(null);
  const [tone, setTone] = useState<Tone | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api<DraftResponse>(`/api/drafts/${draftId}`);
        if (!cancelled) {
          setDraft(res.draft);
          setTone(res.draft.tone);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError && err.code === "not_found"
              ? "Draft not found."
              : "Couldn't load this draft.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [draftId]);

  async function persistTone(next: Tone): Promise<void> {
    setTone(next);
    try {
      await api(`/api/drafts/${draftId}`, {
        method: "PATCH",
        json: { tone: next },
      });
    } catch {
      toast.error("Couldn't update tone.");
    }
  }

  async function publish(): Promise<void> {
    setBusy(true);
    try {
      const { post } = await api<PostResponse>(`/api/drafts/${draftId}/publish`, {
        method: "POST",
      });
      toast.success("Published");
      router.push(`/post/${post.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "safety_rejected") {
        const d = err.details as { reason?: string } | undefined;
        toast.error("Publish blocked by safety review", {
          description: d?.reason ?? "Edit your post and try again.",
        });
      } else if (err instanceof ApiError && err.code === "validation_failed") {
        toast.error("Add a title, body, and tone before publishing.");
      } else if (err instanceof ApiError) {
        toast.error(err.envelope.error.message);
      } else {
        toast.error("Couldn't publish. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function discard(): Promise<void> {
    if (!window.confirm("Discard this draft? This can't be undone.")) return;
    setBusy(true);
    try {
      await api(`/api/drafts/${draftId}`, { method: "DELETE" });
      toast.success("Draft discarded");
      router.push("/me/drafts");
    } catch {
      toast.error("Couldn't discard.");
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="flex flex-col gap-3 px-4 py-6">
        <h1 className="text-xl font-semibold">Draft</h1>
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="flex flex-col gap-4 px-4 py-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-6">
      <h1 className="text-xl font-semibold">Draft</h1>

      {draft.attribution && <AttributionBadge attribution={draft.attribution} />}

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium leading-none">Tone</span>
        <ToneSelector value={tone} onChange={(t) => void persistTone(t)} disabled={busy} />
      </div>

      <PostEditor
        initialTitle={draft.title ?? ""}
        initialBody={draft.body ?? ""}
        busy={busy}
        onAutosave={async (next) => {
          await api(`/api/drafts/${draftId}`, {
            method: "PATCH",
            json: next,
          });
        }}
      />

      <div className="sticky bottom-[calc(56px+env(safe-area-inset-bottom)+0.75rem)] flex flex-col gap-2 bg-background/90 pt-2 backdrop-blur">
        <Button onClick={() => void publish()} disabled={busy} className="w-full">
          {busy ? "Publishing…" : "Publish"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full text-destructive"
          onClick={() => void discard()}
          disabled={busy}
        >
          Discard draft
        </Button>
      </div>
    </div>
  );
}

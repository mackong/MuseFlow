"use client";

import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const TITLE_MAX = 120;
const BODY_MAX = 8000;
const AUTOSAVE_DELAY_MS = 800;

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface PostEditorProps {
  /** Initial title from server. Empty string for fresh drafts. */
  initialTitle: string;
  initialBody: string;
  /**
   * Called whenever the user has paused typing for AUTOSAVE_DELAY_MS, with
   * the current values. Throws → SaveStatus="error"; resolves → "saved".
   */
  onAutosave: (next: { title: string; body: string }) => Promise<void>;
  /** Pass true while a parent action (publish, regenerate) is in flight. */
  busy?: boolean;
}

/**
 * Mobile-first title + body editor with debounced auto-save.
 *
 * - 16px input font (no iOS zoom on focus — global rule from globals.css)
 * - Title input clamps to 120 chars; body textarea clamps to 8000
 * - Character counts show in muted-foreground; turn destructive at limit
 * - Auto-save fires AUTOSAVE_DELAY_MS after the last keystroke; the parent
 *   provides `onAutosave` so this component is decoupled from the route
 *   (used for both /create and /draft/[id])
 */
export function PostEditor({
  initialTitle,
  initialBody,
  onAutosave,
  busy = false,
}: PostEditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const lastSavedRef = useRef({ title: initialTitle, body: initialBody });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset internal state if the parent swaps the initial values (e.g.
  // after a successful AI regenerate).
  useEffect(() => {
    setTitle(initialTitle);
    setBody(initialBody);
    lastSavedRef.current = { title: initialTitle, body: initialBody };
  }, [initialTitle, initialBody]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (title === lastSavedRef.current.title && body === lastSavedRef.current.body) {
      return;
    }
    timerRef.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        await onAutosave({ title, body });
        lastSavedRef.current = { title, body };
        setSaveStatus("saved");
      } catch {
        setSaveStatus("error");
      }
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [title, body, onAutosave]);

  const titleAtMax = title.length >= TITLE_MAX;
  const bodyAtMax = body.length >= BODY_MAX;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="post-title">Title</Label>
          <span
            aria-live="polite"
            className={cn("text-xs", titleAtMax ? "text-destructive" : "text-muted-foreground")}
          >
            {title.length}/{TITLE_MAX}
          </span>
        </div>
        <Input
          id="post-title"
          name="title"
          autoComplete="off"
          maxLength={TITLE_MAX}
          placeholder="Give it a title…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={busy}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="post-body">Body</Label>
          <span
            aria-live="polite"
            className={cn("text-xs", bodyAtMax ? "text-destructive" : "text-muted-foreground")}
          >
            {body.length}/{BODY_MAX}
          </span>
        </div>
        <Textarea
          id="post-body"
          name="body"
          maxLength={BODY_MAX}
          rows={10}
          placeholder="What's the post about?"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={busy}
          className="min-h-[200px]"
        />
      </div>

      <p aria-live="polite" className="text-xs text-muted-foreground" data-save-status={saveStatus}>
        {saveStatus === "saving" && "Saving…"}
        {saveStatus === "saved" && "Saved"}
        {saveStatus === "error" && "Couldn't save — your last change is local only."}
        {saveStatus === "idle" && " "}
      </p>
    </div>
  );
}

"use client";

import { ToneSelector } from "@/components/editor/ToneSelector";
import { Label } from "@/components/ui/label";
import type { RemixMode, Tone } from "@/lib/contracts/shared";
import { cn } from "@/lib/utils";

interface ModeOption {
  value: RemixMode;
  label: string;
  hint: string;
}

const OPTIONS: readonly ModeOption[] = [
  { value: "REWRITE", label: "Rewrite", hint: "Reword in fresh language" },
  { value: "CONTINUE", label: "Continue", hint: "Add 1–2 paragraphs" },
  { value: "SUMMARIZE", label: "Summarize", hint: "2–4 sentence digest" },
  { value: "CHANGE_TONE", label: "Change tone", hint: "Re-tone the post" },
];

/**
 * Mobile-first remix-mode picker. Shown inline on /post/[id]/remix; the
 * design intent is "bottom-sheet-like" — full-width chips stacked at the
 * bottom of the page so the source preview keeps the top of the screen.
 *
 * CHANGE_TONE reveals the nested ToneSelector. Other modes hide it.
 */
export function RemixModeSelector({
  mode,
  onModeChange,
  targetTone,
  onTargetToneChange,
  disabled = false,
}: {
  mode: RemixMode | null;
  onModeChange: (next: RemixMode) => void;
  targetTone: Tone | null;
  onTargetToneChange: (next: Tone) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2" disabled={disabled}>
        <legend className="text-sm font-medium leading-none">Remix mode</legend>
        <div className="flex flex-col gap-2">
          {OPTIONS.map((opt) => {
            const selected = opt.value === mode;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={selected}
                data-mode={opt.value}
                onClick={() => onModeChange(opt.value)}
                className={cn(
                  "flex min-h-[56px] w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <div className="flex flex-col">
                  <span className="font-medium">{opt.label}</span>
                  <span
                    className={cn(
                      "text-xs",
                      selected ? "text-primary-foreground/80" : "text-muted-foreground",
                    )}
                  >
                    {opt.hint}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </fieldset>

      {mode === "CHANGE_TONE" && (
        <div className="flex flex-col gap-2">
          <Label>Target tone</Label>
          <ToneSelector
            value={targetTone}
            onChange={onTargetToneChange}
            disabled={disabled}
            name="target-tone"
          />
        </div>
      )}
    </div>
  );
}

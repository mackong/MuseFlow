"use client";

import type { Tone } from "@/lib/contracts/shared";
import { cn } from "@/lib/utils";

interface ToneOption {
  value: Tone;
  label: string;
  /** Short helper line that appears under the label on mobile. */
  hint: string;
}

const OPTIONS: readonly ToneOption[] = [
  { value: "INSPIRING", label: "Inspiring", hint: "Hopeful, motivating" },
  { value: "ANALYTICAL", label: "Analytical", hint: "Structured, evidence-led" },
  { value: "PLAYFUL", label: "Playful", hint: "Witty, conversational" },
  { value: "POETIC", label: "Poetic", hint: "Imagery, rhythm" },
  { value: "PROFESSIONAL", label: "Professional", hint: "Concise, neutral" },
];

/**
 * Mobile-first chip selector for the five tones from the spec.
 *
 * Each chip is its own button (≥ 44px touch target via py-3), arranged in
 * a fluid wrap on mobile. Selected state uses the primary color; aria-pressed
 * keeps screen-reader users in sync.
 */
export function ToneSelector({
  value,
  onChange,
  disabled = false,
  name = "tone",
}: {
  value: Tone | null;
  onChange: (tone: Tone) => void;
  disabled?: boolean;
  /** Used for the data-tone attribute on each chip — handy for e2e tests. */
  name?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="sr-only">Choose a tone</legend>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((opt) => {
          const selected = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              data-tone={opt.value}
              data-name={name}
              onClick={() => onChange(opt.value)}
              className={cn(
                "flex min-h-[56px] flex-1 basis-[calc(50%-0.25rem)] flex-col items-start justify-center rounded-md border px-3 py-2 text-left text-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                "disabled:cursor-not-allowed disabled:opacity-50",
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <span className="font-medium">{opt.label}</span>
              <span
                className={cn(
                  "text-xs",
                  selected ? "text-primary-foreground/80" : "text-muted-foreground",
                )}
              >
                {opt.hint}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

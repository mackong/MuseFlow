import type { AIGenerationRequest } from "./provider.interface";

/**
 * Prompt templates for each generation mode.
 *
 * Constraints all prompts must enforce:
 *  - Output is strict JSON `{ "title": string, "body": string }`.
 *  - Title ≤ 120 chars; body ≤ 8000 chars.
 *  - No meta commentary ("Sure! Here's…", explanations, apologies).
 *  - Respect the requested tone where applicable.
 *
 * These strings are tuned without changing the wire contract; ai.contract.ts
 * guarantees the output shape, prompts.ts only governs style.
 */

const SYSTEM_BASE =
  "You are MuseFlow, an assistant that turns ideas into shareable posts. " +
  "Output strictly valid JSON with exactly two string fields: " +
  '"title" (max 120 characters) and "body" (max 8000 characters). ' +
  'No prose, no preamble, no markdown code fences. Example: {"title":"...","body":"..."}.';

const TONE_GUIDANCE: Record<string, string> = {
  INSPIRING: "Use an inspiring, motivating voice. Reach for hope and possibility.",
  ANALYTICAL: "Use a clear, analytical voice. Lead with evidence and structured reasoning.",
  PLAYFUL: "Use a playful, witty voice. Light, conversational, with the occasional aside.",
  POETIC: "Use a poetic voice. Imagery, rhythm, and concise lines.",
  PROFESSIONAL: "Use a professional voice. Concise, neutral, suitable for a work audience.",
};

export interface RenderedPrompt {
  system: string;
  user: string;
}

export function renderPrompt(req: AIGenerationRequest): RenderedPrompt {
  switch (req.mode) {
    case "CREATE":
      return {
        system: `${SYSTEM_BASE} ${TONE_GUIDANCE[req.tone] ?? ""}`,
        user:
          `Idea: ${req.idea}\n\n` +
          "Write a short, focused post that develops this idea. " +
          "The title should be concrete and inviting (≤ 120 chars). " +
          "The body should be 2–4 short paragraphs.",
      };

    case "REWRITE":
      return {
        system: SYSTEM_BASE,
        user:
          `Original title: ${req.source.title}\n` +
          `Original body:\n${req.source.body}\n\n` +
          "Rewrite this post in your own words. Preserve the core meaning but " +
          "make it cleaner and more engaging. Return a new title and a new body.",
      };

    case "CONTINUE":
      return {
        system: SYSTEM_BASE,
        user:
          `Original title: ${req.source.title}\n` +
          `Original body:\n${req.source.body}\n\n` +
          "Continue this post by 1–2 paragraphs. Match the existing voice. " +
          "Return the same title (or a slight refinement) and the FULL body, " +
          "original text plus your continuation.",
      };

    case "SUMMARIZE":
      return {
        system: SYSTEM_BASE,
        user:
          `Original title: ${req.source.title}\n` +
          `Original body:\n${req.source.body}\n\n` +
          "Summarize this post in 2–4 short sentences. " +
          'Title should start with "Summary: ".',
      };

    case "CHANGE_TONE":
      return {
        system: `${SYSTEM_BASE} ${TONE_GUIDANCE[req.targetTone] ?? ""}`,
        user:
          `Original title: ${req.source.title}\n` +
          `Original body:\n${req.source.body}\n\n` +
          `Re-tone this post to a ${req.targetTone.toLowerCase()} voice. ` +
          "Preserve all factual content. Return a new title and body.",
      };
  }
}

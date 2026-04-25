import OpenAI from "openai";

import type {
  ModerationRequest,
  ModerationResult,
  Moderator,
  SafetyCategory,
} from "./moderator.interface";

/**
 * OpenAI Moderation backend.
 *
 * The OpenAI Moderation API returns a flat object whose keys are the
 * canonical category names. We pass them through directly because our
 * `SafetyCategory` union is a strict subset of OpenAI's categories.
 *
 * Free of charge, returns category-level breakdown — matches Principle VI's
 * "human-readable reason on rejection" requirement.
 */
export class OpenAIModerator implements Moderator {
  readonly name = "openai";
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(opts: { apiKey: string; model: string; baseURL?: string }) {
    this.model = opts.model;
    this.client = new OpenAI({
      apiKey: opts.apiKey,
      ...(opts.baseURL ? { baseURL: opts.baseURL } : {}),
    });
  }

  async check(req: ModerationRequest): Promise<ModerationResult> {
    const start = Date.now();
    const response = await this.client.moderations.create({
      model: this.model,
      input: req.text,
    });

    const result = response.results[0];
    if (!result) {
      // Treat as a transport-level failure; caller decides fail-closed posture.
      throw new Error("OpenAI moderation returned no results");
    }

    const flagged = result.flagged === true;
    const categories = flagged
      ? sortedTrueCategories(result.categories as unknown as Record<string, boolean>)
      : [];

    return {
      verdict: flagged ? "REJECT" : "ALLOW",
      categories,
      reason: flagged ? renderReason(categories) : null,
      rawProvider: this.name,
      latencyMs: Date.now() - start,
    };
  }
}

/**
 * Filter the provider's category map down to entries that match our
 * canonical `SafetyCategory` union AND are flagged true. Sorted alphabetically
 * for stable display.
 */
function sortedTrueCategories(map: Record<string, boolean>): SafetyCategory[] {
  const allowed: SafetyCategory[] = [
    "hate",
    "hate/threatening",
    "harassment",
    "harassment/threatening",
    "self-harm",
    "sexual",
    "sexual/minors",
    "violence",
    "violence/graphic",
  ];
  return allowed.filter((k) => map[k] === true).sort();
}

function renderReason(categories: SafetyCategory[]): string {
  if (categories.length === 0) return "Content flagged by safety moderation";
  if (categories.length === 1) {
    return `Content flagged for ${categories[0]} content`;
  }
  return `Content flagged for: ${categories.join(", ")}`;
}

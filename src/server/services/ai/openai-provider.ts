import OpenAI from "openai";

import { AiGenerateOutputSchema } from "@/lib/contracts/ai.contract";
import { AIProviderError } from "@/server/errors";

import { renderPrompt } from "./prompts";
import type { AIGenerationRequest, AIGenerationResult, AIProvider } from "./provider.interface";

/**
 * MVP AI provider — talks to any OpenAI-compatible Chat Completions endpoint.
 *
 * Constitution Principle VIII: this file is the ONE place in the repo
 * allowed to import the `openai` SDK. The lint rule in eslint.config.mjs
 * forbids `import "openai"` everywhere else. To swap providers (Anthropic,
 * Gemini, local Ollama), add a sibling file implementing AIProvider — no
 * call sites change.
 *
 * Behavior:
 *  - Renders the per-mode prompt via prompts.ts.
 *  - Calls Chat Completions with response_format=json_object so the model
 *    is instructed to emit JSON.
 *  - Validates the parsed JSON against AiGenerateOutputSchema.
 *  - Retries ONCE on parse/validation failure with a stricter system
 *    suffix; a second failure raises AIProviderError.
 *  - Reports inputTokens/outputTokens when the provider returns usage info;
 *    null otherwise.
 */
export class OpenAIProvider implements AIProvider {
  readonly name = "openai";
  readonly model: string;

  private readonly client: OpenAI;

  constructor(opts: {
    apiKey: string;
    model: string;
    /** OpenAI-compatible endpoint override (Together, OpenRouter, Groq, vLLM, Ollama, …). */
    baseURL?: string;
  }) {
    this.model = opts.model;
    this.client = new OpenAI({
      apiKey: opts.apiKey,
      ...(opts.baseURL ? { baseURL: opts.baseURL } : {}),
    });
  }

  async generate(req: AIGenerationRequest): Promise<AIGenerationResult> {
    const { system, user } = renderPrompt(req);

    const attempt = async (extraSystem = ""): Promise<AIGenerationResult> => {
      const response = await this.client.chat.completions.create({
        model: this.model,
        response_format: { type: "json_object" },
        temperature: 0.8,
        messages: [
          { role: "system", content: extraSystem ? `${system}\n\n${extraSystem}` : system },
          { role: "user", content: user },
        ],
      });

      const raw = response.choices[0]?.message?.content?.trim();
      if (!raw) {
        throw new AIProviderError("Provider returned empty content");
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new AIProviderError("Provider output was not valid JSON");
      }
      const validated = AiGenerateOutputSchema.safeParse(parsed);
      if (!validated.success) {
        throw new AIProviderError(
          `Provider output failed schema: ${validated.error.issues
            .map((i) => i.path.join(".") + " " + i.message)
            .join("; ")}`,
        );
      }

      return {
        output: validated.data,
        inputTokens: response.usage?.prompt_tokens ?? null,
        outputTokens: response.usage?.completion_tokens ?? null,
        rawProvider: this.name,
        rawModel: response.model ?? this.model,
      };
    };

    try {
      return await attempt();
    } catch (err) {
      if (err instanceof AIProviderError) {
        // Retry once with a stricter reminder.
        return await attempt(
          'CRITICAL: Your previous response failed JSON validation. Output ONLY a JSON object with keys "title" and "body". No prose, no fences.',
        );
      }
      throw err;
    }
  }
}

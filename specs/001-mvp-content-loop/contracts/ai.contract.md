# AI Generation Contract

The user-facing AI generation endpoint is `POST /api/ai/generate`. It is used
by the create flow (US1) and indirectly by the remix init flow (which is a
higher-level endpoint that wraps this generation plus draft creation — see
`interactions.contract.md`).

## `POST /api/ai/generate`

- **Auth**: required.
- **Request body** (discriminated union by `mode`):

  ```ts
  // Create from idea
  {
    mode: "CREATE";
    idea: string;          // length 1..500
    tone: Tone;
  }

  // Remix variants — used internally by the remix endpoint, NOT recommended
  // for direct client use (clients should call POST /api/remix/[postId] instead).
  {
    mode: "REWRITE" | "CONTINUE" | "SUMMARIZE";
    sourcePostId: string;   // a published post the requester can read
  }

  {
    mode: "CHANGE_TONE";
    sourcePostId: string;
    targetTone: Tone;
  }
  ```

- **Response 200** (success):

  ```ts
  {
    generationId: string;       // for client-side correlation; references Generation row
    output: { title: string; body: string };
    safety: { verdict: "ALLOW" };
    usage?: {                    // omitted if provider didn't report
      inputTokens: number | null;
      outputTokens: number | null;
    };
    latencyMs: number;
    provider: string;            // e.g., "openai"
    model: string;               // e.g., "gpt-4o-mini"
  }
  ```

- **Response 200 (safety rejected)** — note: HTTP 200 with `safety.verdict` set
  to `REJECT`. Returning 200 (rather than 422) here lets the editor render the
  rejection inline alongside any partial output. The standalone publish path
  uses `422 safety_rejected`; this generation path is informational because
  there is nothing yet to publish.

  ```ts
  {
    generationId: string;
    output: null;                // text not surfaced to user when rejected
    safety: {
      verdict: "REJECT";
      categories: string[];
      reason: string;
    };
    usage?: { inputTokens: number | null; outputTokens: number | null; };
    latencyMs: number;
    provider: string;
    model: string;
  }
  ```

- **Errors** (HTTP 4xx/5xx):
  - `unauthenticated` (401)
  - `validation_failed` (400) — body shape, idea length, missing
    `targetTone` for `CHANGE_TONE`, missing/inaccessible `sourcePostId`
  - `not_found` (404) — `sourcePostId` does not exist or is REMOVED
  - `rate_limited` (429) — per-user generation quota exceeded.
    `details.retryAfterSeconds` indicates the wait.
  - `ai_provider_error` (502) — upstream provider returned an error or output
    failed JSON parse twice in a row.

- **Side effects (always)**:
  - One `Generation` row is recorded with `userId`, `surface`,
    `mode`, `provider`, `model`, `latencyMs`, `status`, `errorMessage` if
    any, and `safetyCheckId` linking to the SafetyCheck.
  - One `SafetyCheck` row is recorded with `surface = AI_OUTPUT` (unless the
    AI call itself errored before producing any output).

## Rate-limit headers

When the rate limit is enforced, the response (success or failure) includes
the following headers — useful for client-side UX:

| Header                  | Meaning |
|-------------------------|---------|
| `X-RateLimit-Limit`     | Window size (e.g. `20`) |
| `X-RateLimit-Remaining` | Calls left in the current window |
| `X-RateLimit-Reset`     | Unix timestamp when the window resets |

On `429 rate_limited`, the body includes `details.retryAfterSeconds` and the
response sets `Retry-After` (RFC-compliant).

## AIProvider interface (server-internal)

The MVP's `openai-provider.ts` implements this interface. Replacing it with
`anthropic-provider.ts`, `gemini-provider.ts`, etc. requires NO changes to
`ai.service.ts` or any feature code. This is the central enforcement point of
Constitution Principle VIII.

```ts
// src/server/services/ai/provider.interface.ts
export interface AIGenerationRequest {
  mode: "CREATE" | "REWRITE" | "CONTINUE" | "SUMMARIZE" | "CHANGE_TONE";
  idea?: string;                             // for mode = CREATE
  source?: { title: string; body: string };  // for remix modes
  tone?: Tone;                                // for CREATE and CHANGE_TONE
}

export interface AIGenerationResult {
  output: { title: string; body: string };
  inputTokens: number | null;
  outputTokens: number | null;
  rawProvider: string;
  rawModel: string;
}

export interface AIProvider {
  readonly name: string;     // "openai", "anthropic", ...
  readonly model: string;    // configured model id
  generate(req: AIGenerationRequest): Promise<AIGenerationResult>;
}
```

The service layer wraps every `provider.generate(...)` call with:
1. Rate-limit check (throws `RateLimitedError` → 429).
2. Latency timer.
3. JSON-shape validation of `output` against
   `AiGenerateOutputSchema` (Zod).
4. Moderation call on the output.
5. `Generation` + `SafetyCheck` row writes.
6. Mapping any thrown provider errors to `ai_provider_error`.

The provider implementation MUST NOT itself touch the DB or call the
moderation service — those concerns belong to the service layer. This
discipline is what makes a provider swap a single-file change.

## Prompt design (informative, not normative)

Concrete prompt strings live in `src/server/services/ai/prompts.ts`. The
contract guarantees the *shape* of the output but not its style; prompts can
be tuned without changing this contract.

System messages MUST instruct the model to:
- Return strict JSON `{ "title": string, "body": string }`.
- Respect the requested tone.
- Avoid adding meta commentary about the request (no "Sure! Here's…").
- Keep title ≤ 120 characters, body ≤ 8000 characters.

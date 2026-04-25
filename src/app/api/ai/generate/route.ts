import { NextResponse } from "next/server";

import { AiGenerateRequestSchema, type AiGenerateResponse } from "@/lib/contracts/ai.contract";
import { getCurrentUser } from "@/server/auth/session";
import {
  AIProviderError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
  toHttpResponse,
} from "@/server/errors";
import { generate } from "@/server/services/ai/ai.service";
import { prisma } from "@/server/db/prisma";
import type { AIGenerationRequest } from "@/server/services/ai/provider.interface";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UnauthenticatedError("Sign in to generate content");

    const body = await req.json().catch(() => null);
    const parsed = AiGenerateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("Invalid request body", {
        issues: parsed.error.issues,
      });
    }
    const input = parsed.data;

    // CREATE mode is fully self-contained. Remix modes need to load the
    // source post (a published one the user can read) and adapt the
    // discriminated request to the provider's `source`-shape variant.
    let providerReq: AIGenerationRequest;
    let parentPostId: string | undefined;
    let surface: "CREATE" | "REMIX";

    if (input.mode === "CREATE") {
      surface = "CREATE";
      providerReq = { mode: "CREATE", idea: input.idea, tone: input.tone };
    } else {
      surface = "REMIX";
      const post = await prisma.post.findFirst({
        where: { id: input.sourcePostId, status: "PUBLISHED" },
        select: { id: true, title: true, body: true },
      });
      if (!post) throw new NotFoundError("Source post not found");
      parentPostId = post.id;
      providerReq =
        input.mode === "CHANGE_TONE"
          ? {
              mode: "CHANGE_TONE",
              source: { title: post.title, body: post.body },
              targetTone: input.targetTone,
            }
          : {
              mode: input.mode,
              source: { title: post.title, body: post.body },
            };
    }

    const result = await generate({
      userId: user.id,
      surface,
      request: providerReq,
      ...(parentPostId ? { parentPostId } : {}),
    });

    const responseBody: AiGenerateResponse = {
      generationId: result.generationId,
      output: result.output,
      safety: result.safety,
      usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
      latencyMs: result.latencyMs,
      provider: result.provider,
      model: result.model,
    };
    return NextResponse.json(responseBody, {
      status: 200,
      headers: {
        "X-RateLimit-Limit": String(result.rateLimit.limit),
        "X-RateLimit-Remaining": String(result.rateLimit.remaining),
        "X-RateLimit-Reset": String(Math.floor(result.rateLimit.resetAt.getTime() / 1000)),
      },
    });
  } catch (err) {
    const httpErr = toHttpResponse(err);
    // Surface AIProviderError details if useful for debugging in dev
    if (err instanceof AIProviderError && process.env.NODE_ENV === "development") {
      console.error("[ai/generate] provider error:", err.message);
    }
    return NextResponse.json(httpErr.body, {
      status: httpErr.status,
      ...(httpErr.headers ? { headers: httpErr.headers } : {}),
    });
  }
}

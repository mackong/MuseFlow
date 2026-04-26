import { NextResponse } from "next/server";

import { RemixInitRequestSchema, type RemixInitResponse } from "@/lib/contracts/remix.contract";
import { getCurrentUser } from "@/server/auth/session";
import { UnauthenticatedError, ValidationError, toHttpResponse } from "@/server/errors";
import { createRemixDraft } from "@/server/services/remix.service";

interface RouteContext {
  params: Promise<{ postId: string }>;
}

export async function POST(req: Request, ctx: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UnauthenticatedError("Sign in to remix a post");
    const { postId } = await ctx.params;

    const raw = await req.json().catch(() => null);
    const parsed = RemixInitRequestSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError("Invalid request body", { issues: parsed.error.issues });
    }

    const result = await createRemixDraft({
      userId: user.id,
      sourcePostId: postId,
      mode: parsed.data.mode,
      ...(parsed.data.mode === "CHANGE_TONE" ? { targetTone: parsed.data.targetTone } : {}),
    });

    const body: RemixInitResponse = result;
    return NextResponse.json(body, { status: 201 });
  } catch (err) {
    const httpErr = toHttpResponse(err);
    return NextResponse.json(httpErr.body, {
      status: httpErr.status,
      ...(httpErr.headers ? { headers: httpErr.headers } : {}),
    });
  }
}

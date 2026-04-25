import { NextResponse } from "next/server";

import type { PostResponse } from "@/lib/contracts/post.contract";
import { getCurrentUser } from "@/server/auth/session";
import { UnauthenticatedError, toHttpResponse } from "@/server/errors";
import { publishDraft } from "@/server/services/post.service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_req: Request, ctx: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UnauthenticatedError("Sign in to publish");
    const { id } = await ctx.params;

    const post = await publishDraft({ userId: user.id, draftId: id });
    const body: PostResponse = { post };
    return NextResponse.json(body, { status: 201 });
  } catch (err) {
    const httpErr = toHttpResponse(err);
    return NextResponse.json(httpErr.body, {
      status: httpErr.status,
      ...(httpErr.headers ? { headers: httpErr.headers } : {}),
    });
  }
}

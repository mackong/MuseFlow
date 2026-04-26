import { NextResponse } from "next/server";

import type { LikeToggleResponse } from "@/lib/contracts/like.contract";
import { getCurrentUser } from "@/server/auth/session";
import { UnauthenticatedError, toHttpResponse } from "@/server/errors";
import { toggleLike } from "@/server/services/like.service";

interface RouteContext {
  params: Promise<{ postId: string }>;
}

export async function POST(_req: Request, ctx: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UnauthenticatedError("Sign in to like a post");
    const { postId } = await ctx.params;
    const result = await toggleLike(user.id, postId);
    const body: LikeToggleResponse = result;
    return NextResponse.json(body, { status: 200 });
  } catch (err) {
    const httpErr = toHttpResponse(err);
    return NextResponse.json(httpErr.body, { status: httpErr.status });
  }
}

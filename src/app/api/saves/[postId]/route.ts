import { NextResponse } from "next/server";

import type { SaveToggleResponse } from "@/lib/contracts/save.contract";
import { getCurrentUser } from "@/server/auth/session";
import { UnauthenticatedError, toHttpResponse } from "@/server/errors";
import { toggleSave } from "@/server/services/save.service";

interface RouteContext {
  params: Promise<{ postId: string }>;
}

export async function POST(_req: Request, ctx: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UnauthenticatedError("Sign in to save a post");
    const { postId } = await ctx.params;
    const result = await toggleSave(user.id, postId);
    const body: SaveToggleResponse = result;
    return NextResponse.json(body, { status: 200 });
  } catch (err) {
    const httpErr = toHttpResponse(err);
    return NextResponse.json(httpErr.body, { status: httpErr.status });
  }
}

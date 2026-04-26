import { NextResponse } from "next/server";

import { getCurrentUser } from "@/server/auth/session";
import { UnauthenticatedError, toHttpResponse } from "@/server/errors";
import { deleteOwnComment } from "@/server/services/comment.service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UnauthenticatedError("Sign in to delete a comment");
    const { id } = await ctx.params;
    await deleteOwnComment(user.id, id);
    return new Response(null, { status: 204 });
  } catch (err) {
    const httpErr = toHttpResponse(err);
    return NextResponse.json(httpErr.body, { status: httpErr.status });
  }
}

import { NextResponse } from "next/server";

import { CommentListQuerySchema, type CommentListResponse } from "@/lib/contracts/comment.contract";
import { getCurrentUser } from "@/server/auth/session";
import { ValidationError, toHttpResponse } from "@/server/errors";
import { listCommentsForPost } from "@/server/services/comment.service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: Request, ctx: RouteContext) {
  try {
    const { id: postId } = await ctx.params;
    const url = new URL(req.url);
    const parsed = CommentListQuerySchema.safeParse({
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) {
      throw new ValidationError("Invalid query", { issues: parsed.error.issues });
    }
    const user = await getCurrentUser();
    const result = await listCommentsForPost({
      postId,
      limit: parsed.data.limit,
      ...(parsed.data.cursor ? { cursor: parsed.data.cursor } : {}),
      viewerId: user?.id ?? null,
    });
    const body: CommentListResponse = result;
    return NextResponse.json(body, { status: 200 });
  } catch (err) {
    const httpErr = toHttpResponse(err);
    return NextResponse.json(httpErr.body, { status: httpErr.status });
  }
}

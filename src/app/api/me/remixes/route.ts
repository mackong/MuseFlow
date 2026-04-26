import { NextResponse } from "next/server";

import { FeedQuerySchema, type FeedResponse } from "@/lib/contracts/feed.contract";
import { getCurrentUser } from "@/server/auth/session";
import { UnauthenticatedError, ValidationError, toHttpResponse } from "@/server/errors";
import { listPublicFeed } from "@/server/services/feed.service";

/**
 * GET /api/me/remixes — the authenticated user's own remixes
 * (published posts where parentId IS NOT NULL). Same projection as
 * the feed.
 */
export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UnauthenticatedError("Sign in to view your remixes");

    const url = new URL(req.url);
    const parsed = FeedQuerySchema.safeParse({
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) {
      throw new ValidationError("Invalid query", { issues: parsed.error.issues });
    }

    const result = await listPublicFeed({
      viewerId: user.id,
      authorId: user.id,
      onlyRemixes: true,
      limit: parsed.data.limit,
      ...(parsed.data.cursor ? { cursor: parsed.data.cursor } : {}),
    });
    const body: FeedResponse = result;
    return NextResponse.json(body, { status: 200 });
  } catch (err) {
    const httpErr = toHttpResponse(err);
    return NextResponse.json(httpErr.body, { status: httpErr.status });
  }
}

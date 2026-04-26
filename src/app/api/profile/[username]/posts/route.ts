import { NextResponse } from "next/server";

import { FeedQuerySchema, type FeedResponse } from "@/lib/contracts/feed.contract";
import { getCurrentUser } from "@/server/auth/session";
import { ValidationError, toHttpResponse } from "@/server/errors";
import { listPublicFeed } from "@/server/services/feed.service";
import { resolveUserIdByUsername } from "@/server/services/profile.service";

/**
 * GET /api/profile/[username]/posts — that user's published posts.
 *
 * Anonymous-readable. Viewer state is populated when a session exists so
 * the same page can render heart/bookmark fill in the signed-in case.
 */
export async function GET(req: Request, { params }: { params: Promise<{ username: string }> }) {
  try {
    const { username } = await params;
    const url = new URL(req.url);
    const parsed = FeedQuerySchema.safeParse({
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) {
      throw new ValidationError("Invalid query", { issues: parsed.error.issues });
    }

    const authorId = await resolveUserIdByUsername(username);
    const viewer = await getCurrentUser();

    const result = await listPublicFeed({
      authorId,
      viewerId: viewer?.id ?? null,
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

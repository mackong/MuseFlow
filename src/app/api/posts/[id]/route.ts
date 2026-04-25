import { NextResponse } from "next/server";

import type { PostResponse } from "@/lib/contracts/post.contract";
import { getCurrentUser } from "@/server/auth/session";
import { toHttpResponse } from "@/server/errors";
import { getById } from "@/server/services/post.service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const user = await getCurrentUser();
    const post = await getById(id, user?.id ?? null);
    const body: PostResponse = { post };
    return NextResponse.json(body, { status: 200 });
  } catch (err) {
    const httpErr = toHttpResponse(err);
    return NextResponse.json(httpErr.body, { status: httpErr.status });
  }
}

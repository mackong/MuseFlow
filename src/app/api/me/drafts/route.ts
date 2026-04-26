import { NextResponse } from "next/server";

import { DraftListQuerySchema, type DraftListResponse } from "@/lib/contracts/draft.contract";
import { getCurrentUser } from "@/server/auth/session";
import { UnauthenticatedError, ValidationError, toHttpResponse } from "@/server/errors";
import { listOwnDrafts } from "@/server/services/draft.service";

/**
 * GET /api/me/drafts — alias for GET /api/drafts. The /api/me/* family
 * is the preferred shape for "the requester's own X"; /api/drafts is
 * kept for backward compat. Both paths delegate to the same service.
 */
export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UnauthenticatedError("Sign in to view your drafts");

    const url = new URL(req.url);
    const parsed = DraftListQuerySchema.safeParse({
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) {
      throw new ValidationError("Invalid query", { issues: parsed.error.issues });
    }

    const result = await listOwnDrafts({
      userId: user.id,
      limit: parsed.data.limit,
      ...(parsed.data.cursor ? { cursor: parsed.data.cursor } : {}),
    });
    const body: DraftListResponse = result;
    return NextResponse.json(body, { status: 200 });
  } catch (err) {
    const httpErr = toHttpResponse(err);
    return NextResponse.json(httpErr.body, { status: httpErr.status });
  }
}

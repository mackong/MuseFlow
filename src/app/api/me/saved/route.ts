import { NextResponse } from "next/server";

import { SaveListQuerySchema, type SaveListResponse } from "@/lib/contracts/save.contract";
import { getCurrentUser } from "@/server/auth/session";
import { UnauthenticatedError, ValidationError, toHttpResponse } from "@/server/errors";
import { listOwnSaves } from "@/server/services/save.service";

/**
 * GET /api/me/saved — alias for GET /api/saves. The /api/me/* family is
 * the preferred shape for "the requester's own X"; /api/saves is kept
 * for backward compat. Both paths delegate to the same service.
 */
export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UnauthenticatedError("Sign in to view your saved posts");

    const url = new URL(req.url);
    const parsed = SaveListQuerySchema.safeParse({
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) {
      throw new ValidationError("Invalid query", { issues: parsed.error.issues });
    }

    const result = await listOwnSaves({
      userId: user.id,
      limit: parsed.data.limit,
      ...(parsed.data.cursor ? { cursor: parsed.data.cursor } : {}),
    });
    const body: SaveListResponse = result;
    return NextResponse.json(body, { status: 200 });
  } catch (err) {
    const httpErr = toHttpResponse(err);
    return NextResponse.json(httpErr.body, { status: httpErr.status });
  }
}

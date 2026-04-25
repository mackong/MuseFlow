import { NextResponse } from "next/server";

import {
  DraftCreateSchema,
  DraftListQuerySchema,
  type DraftListResponse,
  type DraftResponse,
} from "@/lib/contracts/draft.contract";
import { getCurrentUser } from "@/server/auth/session";
import { UnauthenticatedError, ValidationError, toHttpResponse } from "@/server/errors";
import { createOriginalDraft, listOwnDrafts } from "@/server/services/draft.service";

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

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UnauthenticatedError("Sign in to create a draft");

    const body = await req.json().catch(() => ({}));
    const parsed = DraftCreateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("Invalid request body", { issues: parsed.error.issues });
    }

    const draft = await createOriginalDraft({
      authorId: user.id,
      ...(parsed.data.tone ? { tone: parsed.data.tone } : {}),
    });
    const responseBody: DraftResponse = { draft };
    return NextResponse.json(responseBody, { status: 201 });
  } catch (err) {
    const httpErr = toHttpResponse(err);
    return NextResponse.json(httpErr.body, { status: httpErr.status });
  }
}

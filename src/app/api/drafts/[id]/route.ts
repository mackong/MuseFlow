import { NextResponse } from "next/server";

import { DraftPatchSchema, type DraftResponse } from "@/lib/contracts/draft.contract";
import { getCurrentUser } from "@/server/auth/session";
import { UnauthenticatedError, ValidationError, toHttpResponse } from "@/server/errors";
import { deleteOwnDraft, getOwnDraft, patchOwnDraft } from "@/server/services/draft.service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, ctx: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UnauthenticatedError("Sign in to view your draft");
    const { id } = await ctx.params;
    const draft = await getOwnDraft(user.id, id);
    const body: DraftResponse = { draft };
    return NextResponse.json(body, { status: 200 });
  } catch (err) {
    const httpErr = toHttpResponse(err);
    return NextResponse.json(httpErr.body, { status: httpErr.status });
  }
}

export async function PATCH(req: Request, ctx: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UnauthenticatedError("Sign in to update your draft");
    const { id } = await ctx.params;

    const raw = await req.json().catch(() => null);
    const parsed = DraftPatchSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError("Invalid request body", { issues: parsed.error.issues });
    }

    const draft = await patchOwnDraft({
      userId: user.id,
      draftId: id,
      patch: parsed.data,
    });
    const body: DraftResponse = { draft };
    return NextResponse.json(body, { status: 200 });
  } catch (err) {
    const httpErr = toHttpResponse(err);
    return NextResponse.json(httpErr.body, { status: httpErr.status });
  }
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UnauthenticatedError("Sign in to delete your draft");
    const { id } = await ctx.params;
    await deleteOwnDraft(user.id, id);
    return new Response(null, { status: 204 });
  } catch (err) {
    const httpErr = toHttpResponse(err);
    return NextResponse.json(httpErr.body, { status: httpErr.status });
  }
}

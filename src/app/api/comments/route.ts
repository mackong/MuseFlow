import { NextResponse } from "next/server";

import { CommentCreateSchema, type CommentCreateResponse } from "@/lib/contracts/comment.contract";
import { getCurrentUser } from "@/server/auth/session";
import { UnauthenticatedError, ValidationError, toHttpResponse } from "@/server/errors";
import { createComment } from "@/server/services/comment.service";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UnauthenticatedError("Sign in to comment");

    const raw = await req.json().catch(() => null);
    const parsed = CommentCreateSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError("Invalid request body", { issues: parsed.error.issues });
    }

    const comment = await createComment({
      userId: user.id,
      postId: parsed.data.postId,
      body: parsed.data.body,
      viewerId: user.id,
    });
    const body: CommentCreateResponse = { comment };
    return NextResponse.json(body, { status: 201 });
  } catch (err) {
    const httpErr = toHttpResponse(err);
    return NextResponse.json(httpErr.body, { status: httpErr.status });
  }
}

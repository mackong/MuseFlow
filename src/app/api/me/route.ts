import { NextResponse } from "next/server";

import { type OwnProfileShell, ProfilePatchSchema } from "@/lib/contracts/profile.contract";
import { getCurrentUser } from "@/server/auth/session";
import { UnauthenticatedError, ValidationError, toHttpResponse } from "@/server/errors";
import { getOwnShell, updateProfile } from "@/server/services/profile.service";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UnauthenticatedError("Sign in to view your profile");
    const shell: OwnProfileShell = await getOwnShell(user.id);
    return NextResponse.json(shell, { status: 200 });
  } catch (err) {
    const httpErr = toHttpResponse(err);
    return NextResponse.json(httpErr.body, { status: httpErr.status });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UnauthenticatedError("Sign in to update your profile");
    const raw = await req.json().catch(() => null);
    const parsed = ProfilePatchSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError("Invalid request body", { issues: parsed.error.issues });
    }
    const shell: OwnProfileShell = await updateProfile({
      userId: user.id,
      patch: parsed.data,
    });
    return NextResponse.json(shell, { status: 200 });
  } catch (err) {
    const httpErr = toHttpResponse(err);
    return NextResponse.json(httpErr.body, { status: httpErr.status });
  }
}

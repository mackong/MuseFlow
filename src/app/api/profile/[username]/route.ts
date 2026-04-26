import { NextResponse } from "next/server";

import { type PublicProfileShell } from "@/lib/contracts/profile.contract";
import { toHttpResponse } from "@/server/errors";
import { getPublic } from "@/server/services/profile.service";

/**
 * GET /api/profile/[username] — public profile shell.
 *
 * Anonymous-readable. NEVER includes email, drafts count, or saved count
 * (Constitution Principle VII).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ username: string }> }) {
  try {
    const { username } = await params;
    const shell: PublicProfileShell = await getPublic(username);
    return NextResponse.json(shell, { status: 200 });
  } catch (err) {
    const httpErr = toHttpResponse(err);
    return NextResponse.json(httpErr.body, { status: httpErr.status });
  }
}

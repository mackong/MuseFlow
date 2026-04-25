import { redirect } from "next/navigation";

import { BottomNav } from "@/components/nav/BottomNav";
import { getCurrentUser } from "@/server/auth/session";

/**
 * Layout for the authenticated `(app)` route group: feed, create, post detail,
 * saved, profile. Anonymous visitors are redirected to /sign-in with a
 * callbackUrl pointing back to where they tried to go.
 *
 * Note: the public feed at `/feed` is also reachable to anonymous viewers
 * (per spec). When that page lands at T071, it MUST live OUTSIDE this group
 * (or the group must be split) so anonymous browsing keeps working.
 */
export default async function AppShellLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      {/* Content area: fills viewport minus bottom nav, scrolls independently */}
      <main className="flex-1 pb-[calc(56px+env(safe-area-inset-bottom))]">{children}</main>
      <BottomNav />
    </div>
  );
}

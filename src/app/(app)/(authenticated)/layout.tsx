import { redirect } from "next/navigation";

import { getCurrentUser } from "@/server/auth/session";

/**
 * Auth gate for routes nested under (app)/(authenticated)/*.
 *
 * Anonymous visitors get bounced to /sign-in. The outer (app)/layout.tsx
 * is what supplies the chrome (BottomNav, max-width column, bottom-inset
 * padding) — that one is shared with the public surfaces (/feed,
 * /post/[id]) so anonymous browsing keeps working.
 */
export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }
  return <>{children}</>;
}

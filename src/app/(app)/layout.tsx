import { BottomNav } from "@/components/nav/BottomNav";

/**
 * Outer app shell layout — applies to BOTH anonymous-readable surfaces
 * (/feed, /post/[id], /profile/[username]) and authenticated ones
 * (/create, /draft/[id], /me/...). Just the chrome (max-width column +
 * BottomNav + content padding for the bottom inset).
 *
 * Auth gating happens in the nested `(authenticated)/layout.tsx` — that
 * way a logged-out visitor lands on /feed cleanly while attempting
 * /create still bounces to /sign-in.
 */
export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <main className="flex-1 pb-[calc(56px+env(safe-area-inset-bottom))]">{children}</main>
      <BottomNav />
    </div>
  );
}

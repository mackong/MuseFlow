"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, Home, PenSquare, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Mobile-first bottom tab navigation.
 *
 * Constitution Principle I (touch targets ≥ 44px): every tab has
 * `min-h-[56px]` and the icon+label spans the full tab height. Principle II
 * (app-like PWA behavior): fixed at the viewport bottom, full-width, four
 * equal columns, inset for iOS home-indicator safe area.
 *
 * Active state is matched against the current pathname's first segment so
 * `/post/abc/remix` highlights "Create" only if we route remix under
 * `/create/...`; otherwise the deepest match wins via `startsWith`.
 */
interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Path prefixes that should mark this tab active. */
  activeWhen: string[];
}

const ITEMS: NavItem[] = [
  { href: "/feed", label: "Feed", icon: Home, activeWhen: ["/feed", "/post"] },
  {
    href: "/create",
    label: "Create",
    icon: PenSquare,
    activeWhen: ["/create", "/draft"],
  },
  { href: "/saved", label: "Saved", icon: Bookmark, activeWhen: ["/saved"] },
  { href: "/me", label: "Profile", icon: User, activeWhen: ["/me", "/profile"] },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/80"
    >
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {ITEMS.map(({ href, label, icon: Icon, activeWhen }) => {
          const active = activeWhen.some(
            (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
          );
          return (
            <li key={href} className="contents">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[56px] flex-col items-center justify-center gap-1 px-2 py-1 text-xs font-medium transition-colors",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon aria-hidden="true" className={cn("size-5", active && "stroke-[2.5]")} />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

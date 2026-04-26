"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * Bottom-sheet prompt shown when an anonymous user taps an
 * authenticated-only action (like / comment / save / remix).
 *
 * Mobile-first defaults via shadcn Sheet (side="bottom"). The actual
 * link points at /sign-in with a callbackUrl so the user comes back to
 * where they were after auth.
 */
export function SignInPrompt({
  open,
  onOpenChange,
  callbackUrl = "/feed",
  description = "Sign in to like, comment, save, and remix posts.",
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  callbackUrl?: string;
  description?: string;
}) {
  const href = `/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader className="text-left">
          <SheetTitle>Sign in to continue</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="mt-4 flex flex-col gap-2">
          <Button asChild className="w-full">
            <Link href={href}>Sign in</Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href={href}>Create account</Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

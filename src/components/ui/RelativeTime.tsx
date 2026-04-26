"use client";

import { useEffect, useState } from "react";

/**
 * Hydration-safe relative time formatter.
 *
 * Server renders the absolute ISO date (or a passed `fallback`) so SSR
 * markup is deterministic; the client swaps in the relative form on mount.
 * Avoids the React hydration warning that comes from rendering "30s ago"
 * on the server (where Date.now() differs from the client wall clock).
 */
export function RelativeTime({
  iso,
  fallback,
  /** Refresh cadence in seconds. Default 60s — fine for feed cards. */
  refreshSeconds = 60,
}: {
  iso: string;
  fallback?: string;
  refreshSeconds?: number;
}) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    function update() {
      if (cancelled) return;
      setText(formatRelative(iso));
    }
    update();
    const id = setInterval(update, refreshSeconds * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [iso, refreshSeconds]);

  return (
    <time dateTime={iso} suppressHydrationWarning>
      {text ?? fallback ?? new Date(iso).toLocaleDateString()}
    </time>
  );
}

/**
 * Lightweight Intl.RelativeTimeFormat wrapper. We only need an English
 * "ago" surface for MVP; localization slot is open via Intl.
 */
function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diffMs = Date.now() - t;
  const fmt = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const sec = Math.round(diffMs / 1000);
  if (sec < 45) return fmt.format(-sec, "second");
  const min = Math.round(diffMs / 60_000);
  if (min < 45) return fmt.format(-min, "minute");
  const hr = Math.round(diffMs / 3_600_000);
  if (hr < 22) return fmt.format(-hr, "hour");
  const day = Math.round(diffMs / 86_400_000);
  if (day < 26) return fmt.format(-day, "day");
  const mo = Math.round(diffMs / (30 * 86_400_000));
  if (mo < 11) return fmt.format(-mo, "month");
  const yr = Math.round(diffMs / (365 * 86_400_000));
  return fmt.format(-yr, "year");
}

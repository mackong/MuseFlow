"use client";

import { useEffect } from "react";

/**
 * Mounts on every page. Registers /sw.js once on first load and on
 * subsequent navigations is a no-op (the browser dedupes).
 *
 * Disabled in development by default — Next.js HMR + a SW makes for a
 * confusing reload loop. Set NEXT_PUBLIC_ENABLE_SW=1 to opt in.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const isProd = process.env.NODE_ENV === "production";
    const optIn = process.env.NEXT_PUBLIC_ENABLE_SW === "1";
    if (!isProd && !optIn) return;

    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // Swallow — SW registration is best-effort and must never break the app.
    });
  }, []);

  return null;
}

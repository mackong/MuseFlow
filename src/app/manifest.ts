import type { MetadataRoute } from "next";

/**
 * PWA manifest (App Router convention).
 *
 * Mobile-first installable PWA — Constitution Principle I (Mobile-First) +
 * II (Progressive Web App). The manifest gives Android Chrome the
 * "Add to Home screen" prompt; iOS Safari uses the apple-touch-icon
 * meta in the root layout.
 *
 * Icons are placeholder SVGs in /public/icons/ — swap for brand
 * assets once they exist (T120 follow-up).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MuseFlow",
    short_name: "MuseFlow",
    description: "AI-assisted writing — drafts, remixes, and a public feed.",
    start_url: "/feed",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b0b0f",
    theme_color: "#0b0b0f",
    categories: ["social", "productivity", "lifestyle"],
    icons: [
      {
        src: "/icons/icon-192.svg",
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}

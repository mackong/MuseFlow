import type { MetadataRoute } from "next";

/**
 * /robots.txt — App Router convention.
 *
 * Public surfaces (feed, post detail, public profiles) are open to
 * search engines; signed-in surfaces and the API are off-limits.
 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/feed", "/post/", "/profile/"],
        disallow: ["/api/", "/me", "/me/", "/draft/", "/create", "/saved", "/sign-in"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}

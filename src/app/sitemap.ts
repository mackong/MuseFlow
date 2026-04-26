import type { MetadataRoute } from "next";

import { prisma } from "@/server/db/prisma";

/**
 * /sitemap.xml — App Router convention.
 *
 * Lists the public surfaces: /feed, /post/[id] for every PUBLISHED post,
 * /profile/[username] for every identity-complete user. Drafts, saved
 * lists, and /me/* never appear here (Constitution Principle VII).
 *
 * Page size is bounded — Google accepts up to 50k URLs per sitemap;
 * MVP cap of 1k posts and 1k profiles keeps render cheap. When the corpus
 * grows past that, split into a sitemap index.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${base}/feed`, changeFrequency: "hourly", priority: 0.9 },
  ];

  let postEntries: MetadataRoute.Sitemap = [];
  let profileEntries: MetadataRoute.Sitemap = [];
  try {
    const posts = await prisma.post.findMany({
      where: { status: "PUBLISHED" },
      select: { id: true, publishedAt: true, editedAt: true },
      orderBy: { publishedAt: "desc" },
      take: 1000,
    });
    postEntries = posts.map((p) => ({
      url: `${base}/post/${p.id}`,
      lastModified: p.editedAt ?? p.publishedAt,
      changeFrequency: "weekly",
      priority: 0.7,
    }));

    const users = await prisma.user.findMany({
      where: { username: { not: null }, displayName: { not: null } },
      select: { username: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 1000,
    });
    profileEntries = users
      .filter((u): u is { username: string; updatedAt: Date } => u.username !== null)
      .map((u) => ({
        url: `${base}/profile/${encodeURIComponent(u.username)}`,
        lastModified: u.updatedAt,
        changeFrequency: "weekly",
        priority: 0.5,
      }));
  } catch {
    // Database unavailable at build time (e.g. Vercel preview without
    // DATABASE_URL): fall back to the static entries only. The sitemap
    // is regenerated on every request anyway.
  }

  return [...staticEntries, ...postEntries, ...profileEntries];
}

import { PrismaClient } from "@prisma/client";

/**
 * Hot-reload-safe Prisma client singleton.
 *
 * In dev, Next.js HMR reloads modules frequently; without this guard we'd
 * accumulate connections and exhaust the pool. In prod (Vercel serverless),
 * each lambda gets a fresh module so the global is harmless.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

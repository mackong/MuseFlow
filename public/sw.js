/* MuseFlow service worker — vanilla, no build-time deps.
 *
 * Strategy (Constitution Principle II):
 *   - Static assets (Next.js /_next/static/*, /icons/*, font URLs):
 *     cache-first with a long-lived versioned cache.
 *   - HTML navigations: network-first with offline-shell fallback so the
 *     app shell loads even on a flaky network.
 *   - /api/* and /feed: network-only (we never want to serve a stale
 *     viewer-state-bearing response).
 *
 * Bumping CACHE_VERSION invalidates everything.
 */

const CACHE_VERSION = "v1";
const STATIC_CACHE = `museflow-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `museflow-runtime-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline";

const PRECACHE_URLS = [
  "/offline",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
  "/icons/icon-maskable.svg",
  "/icons/apple-touch-icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch(() => undefined),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n !== STATIC_CACHE && n !== RUNTIME_CACHE).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Same-origin only — never intercept third-party (auth callbacks etc.)
  if (url.origin !== self.location.origin) return;

  // Network-only for API + feed (avoid stale viewer state).
  if (url.pathname.startsWith("/api/") || url.pathname === "/feed") {
    return; // default fetch
  }

  // Cache-first for static and icon assets.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/manifest.json"
  ) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Network-first for HTML navigations with offline fallback.
  const accept = req.headers.get("accept") || "";
  if (req.mode === "navigate" || accept.includes("text/html")) {
    event.respondWith(networkFirst(req));
    return;
  }
});

async function cacheFirst(req) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return new Response("offline", { status: 503 });
  }
}

async function networkFirst(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req);
    if (hit) return hit;
    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;
    return new Response("offline", { status: 503 });
  }
}

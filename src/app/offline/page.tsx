/**
 * /offline — fallback shell served by the service worker when the
 * network is unreachable for an HTML navigation. Kept intentionally
 * tiny so it pre-caches cheaply.
 */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-xl font-semibold">You&rsquo;re offline</h1>
      <p className="text-sm text-muted-foreground">
        MuseFlow needs a connection to load this page. Check your network and try again.
      </p>
    </main>
  );
}

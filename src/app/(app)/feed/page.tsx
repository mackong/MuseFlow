import { FeedList } from "@/components/feed/FeedList";
import { getCurrentUser } from "@/server/auth/session";

/**
 * /feed — public, paginated, reverse-chronological feed of published
 * posts. Lives under the chrome-only (app) layout so anonymous visitors
 * still see the BottomNav and can navigate to /sign-in.
 *
 * Initial render is server-side; FeedList (client) takes over with SWR
 * for the 30s revalidation cycle.
 */
export default async function FeedPage() {
  const user = await getCurrentUser();
  return (
    <div className="flex flex-col gap-4 px-4 py-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Feed</h1>
        <p className="text-sm text-muted-foreground">
          {user ? "What's new on MuseFlow." : "What's new on MuseFlow. Sign in to interact."}
        </p>
      </header>
      <FeedList isAuthenticated={!!user} />
    </div>
  );
}

import { SignInForm } from "./SignInForm";

/**
 * Server-rendered shell for /sign-in. Detects whether GitHub OAuth is
 * configured (matching the conditional in src/server/auth/auth.config.ts)
 * and passes that as a prop so the client form renders the correct number
 * of provider buttons without exposing GITHUB_CLIENT_ID to the bundle.
 */
export default function SignInPage({
  searchParams,
}: {
  searchParams?: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const githubEnabled = !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
  return <SignInPageInner githubEnabled={githubEnabled} searchParams={searchParams} />;
}

async function SignInPageInner({
  githubEnabled,
  searchParams,
}: {
  githubEnabled: boolean;
  searchParams?: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const callbackUrl = typeof params.callbackUrl === "string" ? params.callbackUrl : "/";
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <SignInForm githubEnabled={githubEnabled} callbackUrl={callbackUrl} initialError={error} />
    </div>
  );
}

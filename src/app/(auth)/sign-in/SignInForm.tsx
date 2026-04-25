"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Github, Mail } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ERROR_MESSAGES: Record<string, string> = {
  EmailCreateAccount: "We couldn't create an account for that email. Try another.",
  EmailSignin: "Sending the magic link failed. Try again in a moment.",
  OAuthAccountNotLinked: "This email is already linked to a different sign-in method.",
  OAuthCallback: "Sign-in was cancelled or failed. Please try again.",
  Verification: "That magic link expired or was already used. Send a new one.",
  CredentialsSignin: "Invalid credentials.",
  default: "Something went wrong while signing in. Please try again.",
};

export function SignInForm({
  githubEnabled,
  callbackUrl,
  initialError,
}: {
  githubEnabled: boolean;
  callbackUrl: string;
  initialError: string | null;
}) {
  const [email, setEmail] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [githubLoading, setGithubLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    initialError ? (ERROR_MESSAGES[initialError] ?? ERROR_MESSAGES.default!) : null,
  );

  async function handleEmailSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    setEmailLoading(true);
    try {
      const result = await signIn("nodemailer", {
        email: email.trim(),
        callbackUrl,
        redirect: false,
      });
      if (result?.error) {
        setError(ERROR_MESSAGES[result.error] ?? ERROR_MESSAGES.default!);
      } else {
        toast.success("Magic link sent — check your email", {
          description: "(Or your dev server console in local dev.)",
          duration: 8000,
        });
      }
    } catch {
      setError(ERROR_MESSAGES.default!);
    } finally {
      setEmailLoading(false);
    }
  }

  async function handleGithub() {
    setError(null);
    setGithubLoading(true);
    // GitHub OAuth requires a full-page redirect; let next-auth handle it.
    await signIn("github", { callbackUrl });
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle>Sign in to MuseFlow</CardTitle>
        <CardDescription>Turn raw ideas into interactive content flows.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-3" onSubmit={handleEmailSubmit}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={emailLoading || githubLoading}
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={emailLoading || githubLoading || email.trim().length === 0}
          >
            <Mail aria-hidden="true" />
            {emailLoading ? "Sending…" : "Send magic link"}
          </Button>
        </form>

        {githubEnabled && (
          <>
            <div className="my-4 flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
              <span aria-hidden="true" className="h-px flex-1 bg-border" />
              or
              <span aria-hidden="true" className="h-px flex-1 bg-border" />
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleGithub}
              disabled={emailLoading || githubLoading}
            >
              <Github aria-hidden="true" />
              {githubLoading ? "Redirecting…" : "Continue with GitHub"}
            </Button>
          </>
        )}

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}
      </CardContent>
      <CardFooter className="flex-col items-start gap-1 text-xs text-muted-foreground">
        <p>By continuing, you agree to our terms and privacy policy.</p>
        <p>Dev tip: when no SMTP is configured, the magic link is logged to your server console.</p>
      </CardFooter>
    </Card>
  );
}

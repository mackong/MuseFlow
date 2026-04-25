import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import GitHub from "next-auth/providers/github";
import Nodemailer from "next-auth/providers/nodemailer";

import { prisma } from "@/server/db/prisma";

import { ensurePublicIdentity } from "./ensurePublicIdentity";

/**
 * Auth.js v5 configuration.
 *
 * - Adapter: Prisma (User / Account / Session / VerificationToken from schema).
 * - Session strategy: `database` (sessions persisted, not JWT). Required by
 *   the spec so we can revoke sessions and so middleware can do real auth.
 * - Providers:
 *   • Email (Nodemailer): magic-link sign-in. In dev (no `EMAIL_SERVER`) the
 *     verification email is logged to the server console — no SMTP needed.
 *   • GitHub: only registered when both `GITHUB_CLIENT_ID` and
 *     `GITHUB_CLIENT_SECRET` are present.
 * - events.createUser: fixes the schema's chicken-and-egg — Auth.js's
 *   adapter creates User rows with only Auth.js-known fields (`name`,
 *   `email`, `image`). We then populate the spec-required `displayName`
 *   and `username` (with disambiguation) so every authenticated user has a
 *   complete public identity before any service touches them.
 */

const githubEnabled = !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);

const emailFrom = process.env.EMAIL_FROM ?? "MuseFlow <noreply@museflow.local>";

const emailProvider = process.env.EMAIL_SERVER
  ? Nodemailer({ server: process.env.EMAIL_SERVER, from: emailFrom })
  : Nodemailer({
      // sendVerificationRequest fully overrides delivery, so the `server`
      // value is never used. We pass a structurally valid placeholder to
      // satisfy nodemailer's option shape.
      server: { host: "localhost", port: 25, auth: { user: "noop", pass: "noop" } },
      from: emailFrom,
      sendVerificationRequest: async ({ identifier, url }) => {
        console.log(
          `\n========================================\n` +
            `📨 [Auth] Magic link for ${identifier}\n` +
            `   ${url}\n` +
            `========================================\n`,
        );
      },
    });

export const { auth, signIn, signOut, handlers } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  providers: [
    emailProvider,
    ...(githubEnabled
      ? [
          GitHub({
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
          }),
        ]
      : []),
  ],
  pages: {
    // Custom mobile-first sign-in page (lands at T031).
    signIn: "/sign-in",
  },
  events: {
    async createUser({ user }) {
      if (user.id) {
        await ensurePublicIdentity(user.id);
      }
    },
  },
});

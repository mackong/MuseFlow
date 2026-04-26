import { randomBytes } from "node:crypto";

import { expect, test } from "./fixtures";

/**
 * US4 e2e: remix flow on a Pixel 5 mobile viewport.
 *
 * The signedIn fixture creates User B (the remixer). The test inserts
 * User A and a published post owned by A directly via Prisma, then
 * drives the UI: open /post/[X] → tap Remix → /post/[X]/remix → pick
 * SUMMARIZE → Generate → land on /draft/[Y] with the AI-seeded title +
 * the parent attribution badge visible. Optionally publishes to verify
 * parent.remixCount increments — covered by the unit test, but doing it
 * here proves the end-to-end persistence of attribution.
 */

test("US4: signed-in user remixes another user's post and lands on the draft editor", async ({
  signedIn: page,
  prisma,
}) => {
  // 1. Insert User A and a published post.
  const authorId = `cuid${randomBytes(10).toString("hex")}`;
  await prisma.user.create({
    data: {
      id: authorId,
      email: `${authorId}@example.test`,
      displayName: `Author ${authorId.slice(-4)}`,
      username: `author${authorId.slice(-6)}`,
      emailVerified: new Date(),
    },
  });
  const post = await prisma.post.create({
    data: {
      authorId,
      title: "On the joy of walking at dawn",
      body: "It is a wonder of the morning.",
      tone: "INSPIRING",
      publishedAt: new Date(),
      status: "PUBLISHED",
    },
  });

  // 2. Open /post/[X] and click Remix.
  await page.goto(`/post/${post.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/joy of walking at dawn/i);
  await page.locator(`[data-testid="remix-${post.id}"]`).click();

  // 3. Land on /post/[X]/remix.
  await page.waitForURL(new RegExp(`/post/${post.id}/remix$`), { timeout: 5_000 });
  await expect(page.getByRole("heading", { name: "Remix" })).toBeVisible();
  await expect(page.locator(`text=Remixing`)).toBeVisible();

  // 4. Pick SUMMARIZE mode.
  await page.locator('button[data-mode="SUMMARIZE"]').click();

  // 5. Generate.
  await page.getByRole("button", { name: /Generate remix/i }).click();

  // 6. Should redirect to /draft/[Y].
  await page.waitForURL(/\/draft\/[^/]+$/, { timeout: 15_000 });
  // Editor surface visible.
  await expect(page.locator('input[name="title"]')).toBeVisible();
  // Title was pre-filled with the fake provider's deterministic summary.
  await expect(page.locator('input[name="title"]')).toHaveValue(/Summary:/);
  // Attribution badge visible on the draft.
  await expect(page.locator("text=Summary of")).toBeVisible();

  // 7. Verify the Draft row in the DB carries parentId + remixMode +
  // parentAuthorSnapshot.
  const drafts = await prisma.draft.findMany({
    where: { parentId: post.id },
  });
  expect(drafts).toHaveLength(1);
  expect(drafts[0]!.remixMode).toBe("SUMMARIZE");
  const snap = drafts[0]!.parentAuthorSnapshot as { id: string; displayName: string };
  expect(snap.id).toBe(authorId);
  expect(snap.displayName).toContain("Author");
});

test("US4: TRIGGER_REJECT in source body surfaces the rejection notice on the remix entry page", async ({
  signedIn: page,
  prisma,
}) => {
  // The fake provider echoes the source body, so a body containing
  // TRIGGER_REJECT triggers the fake moderator's REJECT verdict.
  const authorId = `cuid${randomBytes(10).toString("hex")}`;
  await prisma.user.create({
    data: {
      id: authorId,
      email: `${authorId}@example.test`,
      displayName: `Author ${authorId.slice(-4)}`,
      username: `author${authorId.slice(-6)}`,
      emailVerified: new Date(),
    },
  });
  const post = await prisma.post.create({
    data: {
      authorId,
      title: "Border case",
      body: "TRIGGER_REJECT please",
      tone: "INSPIRING",
      publishedAt: new Date(),
      status: "PUBLISHED",
    },
  });

  await page.goto(`/post/${post.id}/remix`);
  await page.locator('button[data-mode="REWRITE"]').click();
  await page.getByRole("button", { name: /Generate remix/i }).click();

  // Rejection alert renders on /post/[X]/remix (we don't redirect to
  // /draft on REJECT — user picks Regenerate / Edit / Discard).
  const alert = page.getByRole("alert").filter({ hasText: /Content blocked by safety review/i });
  await expect(alert).toBeVisible({ timeout: 15_000 });

  // Draft was still created (per FR-009: rejection MUST preserve the
  // user's draft) — verify it exists with the parent attribution.
  const drafts = await prisma.draft.findMany({ where: { parentId: post.id } });
  expect(drafts).toHaveLength(1);
});

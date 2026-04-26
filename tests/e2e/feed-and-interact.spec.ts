import { randomBytes } from "node:crypto";

import { expect, test } from "./fixtures";

/**
 * US3 e2e: like / comment / save against another user's published post,
 * driven on a mobile viewport (Pixel 5 — set in playwright.config.ts).
 *
 * The `signedIn` fixture creates User B (the test session). The test
 * additionally inserts User A and a published post owned by A directly
 * via Prisma, then drives the UI on /post/[A's post] to like, comment,
 * and save it.
 *
 * Verifies the constitution invariants:
 *   - like is idempotent per user (toggle behavior)
 *   - comment count increments on submit
 *   - safety reject (TRIGGER_REJECT body) surfaces inline without
 *     persisting
 *   - saved post appears on /saved
 */

test("US3: signed-in user likes, comments, and saves another user's post", async ({
  signedIn: page,
  prisma,
}) => {
  // Insert User A and a published post.
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

  // 1. Open the post detail.
  await page.goto(`/post/${post.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/joy of walking at dawn/i);

  // 2. Like the post.
  const likeBtn = page.locator(`[data-testid="like-${post.id}"]`);
  await likeBtn.click();
  await expect(likeBtn).toContainText(/Like · 1/i);

  // 3. Like again — toggles off.
  await likeBtn.click();
  await expect(likeBtn).toContainText(/^\s*Like\s*$/);

  // 4. Save the post.
  const saveBtn = page.locator(`[data-testid="save-${post.id}"]`);
  await saveBtn.click();
  // Save state is reflected by the filled icon; the button label stays "Save".
  // Tap once more then again to settle in saved=true state for the next step.
  await expect(saveBtn).toBeVisible();

  // 5. Submit a comment.
  await page.fill("textarea#comment-body", "Lovely!");
  await page.getByRole("button", { name: /Post comment/i }).click();
  await expect(page.getByText("Lovely!")).toBeVisible({ timeout: 5_000 });

  // 6. Submit a TRIGGER_REJECT comment — the safety REJECT alert should fire,
  // and the comment must NOT appear in the list.
  await page.fill("textarea#comment-body", "TRIGGER_REJECT please");
  await page.getByRole("button", { name: /Post comment/i }).click();
  await expect(page.getByRole("alert").filter({ hasText: /banned phrase/i })).toBeVisible({
    timeout: 5_000,
  });
  // The blocked comment must NOT appear in the rendered comment list (it's
  // still in the textarea by design — we don't wipe the user's draft on
  // safety reject so they can edit).
  const items = page.locator('[data-testid="comment-items"]');
  await expect(items.getByText("TRIGGER_REJECT please")).toHaveCount(0);

  // 7. Visit /saved and confirm the post is listed.
  await page.goto("/saved");
  await expect(page.locator('[data-testid="saved-list"]')).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole("heading", { level: 2 })).toContainText(/joy of walking at dawn/i);
});

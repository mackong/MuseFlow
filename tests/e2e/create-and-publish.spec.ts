import { expect, test } from "./fixtures";

/**
 * US1 happy path on a mobile viewport (Playwright's Pixel 5 device profile
 * is set in playwright.config.ts).
 *
 * Flow exercised:
 *   sign-in (cookie injected) → /create → idea + tone → Generate
 *   → editor renders with AI-seeded content → Publish
 *   → URL becomes /post/[id] and the title is rendered.
 *
 * The dev server is launched with MUSEFLOW_AI_PROVIDER=fake and
 * MUSEFLOW_MODERATOR=fake, so generation is deterministic and never hits
 * an external LLM in CI.
 */

test("US1: signed-in user creates and publishes an AI-assisted post", async ({
  signedIn: page,
}) => {
  // 1. Land on /create.
  await page.goto("/create");
  await expect(page.getByRole("heading", { name: "Create" })).toBeVisible();

  // 2. Enter an idea.
  await page.fill("textarea#idea", "the joy of walking at dawn");

  // 3. Pick a tone (chip with data-tone="INSPIRING").
  await page.click('button[data-tone="INSPIRING"]');

  // 4. Generate.
  await page.getByRole("button", { name: /Generate/i }).click();

  // 5. Editor appears with the fake provider's deterministic title.
  const titleInput = page.locator('input[name="title"]');
  await expect(titleInput).toBeVisible({ timeout: 15_000 });
  await expect(titleInput).toHaveValue(/joy of walking at dawn/i, {
    timeout: 5_000,
  });

  // 6. Publish.
  await page.getByRole("button", { name: "Publish" }).click();

  // 7. URL becomes /post/[id] and the post title is rendered.
  await page.waitForURL(/\/post\/[^/]+$/, { timeout: 10_000 });
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toContainText(/joy of walking at dawn/i);
});

test("US1: TRIGGER_REJECT idea surfaces the safety-rejection notice and preserves the idea", async ({
  signedIn: page,
}) => {
  await page.goto("/create");
  await page.fill("textarea#idea", "TRIGGER_REJECT thank you");
  await page.click('button[data-tone="PLAYFUL"]');
  await page.getByRole("button", { name: /Generate/i }).click();

  // Rejection notice renders inside an alert region.
  const alert = page.getByRole("alert").filter({
    hasText: /Content blocked by safety review/i,
  });
  await expect(alert).toBeVisible({ timeout: 15_000 });

  // The user's idea is preserved when they choose "Edit and try again".
  await page.getByRole("button", { name: /Edit and try again/i }).click();
  await expect(page.locator("textarea#idea")).toHaveValue("TRIGGER_REJECT thank you");
});

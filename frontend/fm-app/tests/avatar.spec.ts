import { test, expect } from "@playwright/test";

test("UI reachable & Avatar visible", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const avatar = page.locator('[data-testid="avatar-bot"]');
  await expect(avatar).toHaveCount(1, { timeout: 10000 });
});



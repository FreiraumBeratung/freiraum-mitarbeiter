import { test, expect } from "@playwright/test";

test("backend ui smoke reachable", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const resp = await page.request.get("http://127.0.0.1:30521/ui/smoke");
  expect(resp.ok()).toBeTruthy();
});



import { test, expect } from "@playwright/test";

const BACKEND_URL = "http://127.0.0.1:30521";
const FRONTEND_URL = "http://localhost:5173";

test.describe("Voice Intent → OSM Results", () => {
  test("Voice Intent führt zu OSM Results Seite", async ({ page, context }) => {
    // Mock Backend Response
    await context.route(`${BACKEND_URL}/voice/intent`, async (route) => {
      const request = route.request();
      if (request.method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            intent: {
              category: "shk",
              city: "Arnsberg",
              valid: true,
            },
            result: {
              found: 1,
              leads: [
                {
                  company: "Demo GmbH",
                  city: "Arnsberg",
                  category: "shk",
                  score: 80,
                  email: "info@demo.de",
                  phone: "+49123456789",
                  website: "https://demo.de",
                  source: "enriched",
                  lat: 51.45,
                  lon: 7.97,
                },
              ],
              category: "shk",
              city: "Arnsberg",
            },
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Navigate to Control Center
    await page.goto(`${FRONTEND_URL}/control-center`);
    await expect(page.locator("text=Control Center")).toBeVisible();

    // Simulate Voice Intent (via direct navigation with state)
    // In a real scenario, this would be triggered by the voice controller
    await page.evaluate(() => {
      // Dispatch voice-osm-success event
      const event = new CustomEvent("voice-osm-success", {
        detail: {
          result: {
            found: 1,
            leads: [
              {
                company: "Demo GmbH",
                city: "Arnsberg",
                category: "shk",
                score: 80,
                email: "info@demo.de",
                phone: "+49123456789",
                website: "https://demo.de",
                source: "enriched",
                lat: 51.45,
                lon: 7.97,
              },
            ],
            category: "shk",
            city: "Arnsberg",
          },
        },
      });
      document.dispatchEvent(event);
    });

    // Wait for navigation to results page
    await page.waitForURL("**/leads/osm/results", { timeout: 5000 });

    // Verify results page elements
    await expect(page.locator("text=OSM Lead-Ergebnisse")).toBeVisible();
    await expect(page.locator("text=Demo GmbH")).toBeVisible();
    await expect(page.locator("text=Arnsberg")).toBeVisible();

    // Verify export buttons
    await expect(page.locator("button:has-text('Excel')")).toBeVisible();
    await expect(page.locator("button:has-text('PDF')")).toBeVisible();

    // Verify filters
    await expect(page.locator("text=Score Min")).toBeVisible();
    await expect(page.locator("text=Nur mit E-Mail")).toBeVisible();
    await expect(page.locator("text=Nur mit Telefon")).toBeVisible();

    // Verify table
    await expect(page.locator("table")).toBeVisible();
    await expect(page.locator("td:has-text('Demo GmbH')")).toBeVisible();
  });
});



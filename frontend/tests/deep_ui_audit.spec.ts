import { test, expect } from '@playwright/test';

test('App loads and avatar placeholder visible', async ({ page }) => {
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
  const selectors = ['[data-testid="avatar-bot"]', '#avatar-bot', '.avatar-bot', '[data-role="avatar"]'];
  let found = false;
  for (const sel of selectors) {
    const el = page.locator(sel);
    if (await el.count() > 0) {
      found = true;
      break;
    }
  }
  expect(found).toBeTruthy();
});









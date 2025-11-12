const { test, expect } = require('@playwright/test');



test('AvatarBot sichtbar & Sprechblase', async ({ page }) => {

  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });

  const bot = page.locator('[data-testid="avatar-bot"]');

  await expect(bot).toBeVisible({ timeout: 15000 });

  await expect(bot.locator('text=Hey, ich habe was für dich!')).toBeVisible();

});



test('Navigation deutsch vorhanden', async ({ page }) => {

  await page.goto('http://localhost:5173');

  // tolerant: irgendeines der deutschen Labels muss auftauchen

  const possible = ['Einstellungen', 'Berichte', 'Nachfassungen', 'Wissensbasis', 'Angebote', 'Lead-Suche', 'Entscheidungen'];

  let found = false;

  for (const label of possible) {

    if (await page.locator(`text=${label}`).first().isVisible().catch(()=>false)) { found = true; break; }

  }

  expect(found).toBeTruthy();

});


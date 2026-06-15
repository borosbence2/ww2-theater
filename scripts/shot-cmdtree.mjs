// Throwaway: screenshot the establishment template drilled down to squad level.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const SHOTS = process.env.SHOT_DIR || '/tmp';
const BASE = 'http://localhost:5173/';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

async function expand(text) {
  const row = page.locator('.orbat-row.has-kids', { hasText: text }).first();
  if (await row.count()) {
    await row.click();
    await page.waitForTimeout(350);
  }
}

async function drill(name, query, path) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.fill('.omnibox input', query);
  await page.waitForSelector('.omnibox-results li', { timeout: 10000 });
  await page.keyboard.press('Enter');
  await page.waitForSelector('.detail-panel', { timeout: 10000 });
  await page.waitForTimeout(2000);
  for (const step of path) await expand(step);
  const txt = (await page.locator('.detail-panel').textContent().catch(() => '')) ?? '';
  console.log(name, '| squad rows visible:', /Schützengruppe|Rifle Squad|Tank & crew/.test(txt));
  await page.locator('.detail-panel').screenshot({ path: `${SHOTS}/${name}.png` });
}

await drill('ww2-tmpl-de', '305. Infanterie', ['Schützen-Bataillon', 'Schützen-Kompanie', 'Schützenzug']);
await drill('ww2-tmpl-su', '13th Guards Rifle Division', ['Rifle Battalion', 'Rifle Company', 'Rifle Platoon']);

await browser.close();
console.log('done');

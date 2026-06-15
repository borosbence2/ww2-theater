// Throwaway: screenshot a card showing the Wikipedia description + commanders.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const SHOTS = process.env.SHOT_DIR || '/tmp';
const BASE = 'http://localhost:5173/';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

async function pick(name, query) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.fill('.omnibox input', query);
  await page.waitForSelector('.omnibox-results li', { timeout: 10000 });
  await page.keyboard.press('Enter');
  await page.waitForSelector('.detail-panel', { timeout: 10000 });
  await page.waitForTimeout(2500);
  const has = await page.locator('.unit-summary').count();
  console.log(name, '| summary block:', has > 0);
  await page.locator('.detail-panel').screenshot({ path: `${SHOTS}/${name}.png` });
}

await pick('ww2-desc-front', '1st Ukrainian Front');
await pick('ww2-desc-corps', '10th Mechanized Corps');

await browser.close();
console.log('done');

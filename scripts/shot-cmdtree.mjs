// Throwaway: screenshot the unit panel's ORBAT tree + establishment template.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const SHOTS = process.env.SHOT_DIR || '/tmp';
const BASE = 'http://localhost:5173/';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });

async function pick(name, query) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.fill('.omnibox input', query);
  await page.waitForSelector('.omnibox-results li', { timeout: 10000 });
  await page.keyboard.press('Enter');
  await page.waitForSelector('.detail-panel', { timeout: 10000 });
  await page.waitForTimeout(2500);
  const txt = (await page.locator('.detail-panel').textContent().catch(() => '')) ?? '';
  console.log(name, '| establishment:', /Establishment/.test(txt), '| orbat:', /Order of battle/.test(txt));
  const panel = page.locator('.detail-panel');
  await panel.screenshot({ path: `${SHOTS}/${name}.png` });
}

await pick('ww2-orbat-div', '305. Infanterie');
await pick('ww2-orbat-army', '6. Armee');
await pick('ww2-orbat-tankcorps', '13th Guards Rifle Division');

await browser.close();
console.log('done');

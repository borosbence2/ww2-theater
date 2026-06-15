// Throwaway: screenshot a Soviet front + army panel to confirm enriched
// commanders + Wikidata/Wikipedia links render.
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
  const txt = (await page.locator('.detail-panel').textContent().catch(() => '')) ?? '';
  const cmds = (txt.match(/Commanders/) ? 'yes' : 'no');
  console.log(name, '| commanders section:', cmds, '| wiki:', /Wikipedia/.test(txt));
  await page.locator('.detail-panel').screenshot({ path: `${SHOTS}/${name}.png` });
}

await pick('ww2-cmd-front', '1st Ukrainian Front');
await pick('ww2-cmd-army', '5th Shock Army');

await browser.close();
console.log('done');

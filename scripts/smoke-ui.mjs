// Phase 0 UI smoke test: drives the dev server with headless Chrome via
// Playwright. Verifies the layer panel, omnibox city search, detail panel,
// selection deep link (?city=), and layer-toggle deep link (?layers=).
// Run: NODE_PATH=<playwright dir> node scripts/smoke-ui.mjs [baseUrl]

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.argv[2] ?? 'http://localhost:5173';
const SHOTS = process.env.SHOT_DIR ?? '/tmp';
const errors = [];
let failed = false;

const check = (name, ok) => {
  console.log(`${ok ? '  ✔' : '  ✗'} ${name}`);
  if (!ok) failed = true;
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});

await page.goto(BASE, { waitUntil: 'domcontentloaded' });

// Shell: title overlay, layer panel, omnibox, timebar.
await page.waitForSelector('.layer-panel', { timeout: 15000 });
check('layer panel rendered', true);
check('omnibox rendered', (await page.locator('.omnibox input').count()) === 1);
check('timebar rendered', (await page.locator('.timebar').count()) === 1);
check(
  'legend swatches present',
  (await page.locator('.legend-swatch').count()) >= 6,
);

// Give MapLibre a moment to fetch layers, then snapshot the initial view.
await page.waitForTimeout(4000);
await page.screenshot({ path: `${SHOTS}/ww2-initial.png` });

// Search "Stalingrad" and select it.
await page.fill('.omnibox input', 'Stalingrad');
await page.waitForSelector('.omnibox-results li', { timeout: 10000 });
const firstHit = await page.locator('.omnibox-results li').first().textContent();
check(`search returns Stalingrad (got: ${firstHit?.trim()})`, /Stalingrad/.test(firstHit ?? ''));
await page.keyboard.press('Enter');

// Detail panel with control history; URL gains ?city=.
await page.waitForSelector('.detail-panel', { timeout: 10000 });
check('detail panel opened', true);
const panelText = await page.locator('.detail-panel').textContent();
check('panel shows documented control history', /Documented control/.test(panelText ?? ''));
check('panel shows a holder for the current date', /-held on /.test(panelText ?? ''));
await page.waitForTimeout(1500); // URL writes are throttled + flyTo settles
check('URL has ?city=Stalingrad', page.url().includes('city=Stalingrad'));
await page.screenshot({ path: `${SHOTS}/ww2-stalingrad.png` });

// Jump the timeline via a date link (1942-08-23 → Axis-held days later).
const dateLinks = page.locator('.detail-panel .date-link');
if ((await dateLinks.count()) > 0) {
  await dateLinks.first().click();
  await page.waitForTimeout(1200);
  const holder = await page.locator('.detail-holder').textContent();
  check(`date link jumps timeline (holder now: ${holder?.trim()})`, /held on/.test(holder ?? ''));
}

// Toggle the front layer off; URL should gain ?layers= without "front".
await page.locator('.layer-row', { hasText: 'Front line' }).locator('input').click();
await page.waitForTimeout(1200);
const url = new URL(page.url());
const layersParam = url.searchParams.get('layers');
check(`layers param after hiding front: ${layersParam}`, layersParam !== null && !layersParam.split(',').includes('front'));
await page.screenshot({ path: `${SHOTS}/ww2-front-off.png` });

// Close the panel; ?city= should disappear.
await page.locator('.detail-panel header button').click();
await page.waitForTimeout(1200);
check('closing panel clears ?city=', !page.url().includes('city='));

const realErrors = errors.filter((e) => !/WebGL|GPU|swiftshader|Failed to load resource/i.test(e));
check(`no console/page errors (${errors.length} total, ${realErrors.length} relevant)`, realErrors.length === 0);
if (realErrors.length) console.log(realErrors.join('\n'));

await browser.close();
process.exit(failed ? 1 : 0);

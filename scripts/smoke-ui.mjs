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
await page.locator('.detail-close').click();
await page.waitForTimeout(1200);
check('closing panel clears ?city=', !page.url().includes('city='));

// Unit search (Phase 1): selecting a unit jumps the timeline into its
// lifespan, opens the unit panel, and deep-links via ?unit=.
await page.fill('.omnibox input', '6. Armee');
await page.waitForSelector('.omnibox-results li', { timeout: 10000 });
await page.keyboard.press('Enter');
await page.waitForSelector('.detail-panel', { timeout: 10000 });
await page.waitForTimeout(1800); // detail fetch + flyTo + URL throttle
const unitPanel = await page.locator('.detail-panel').textContent();
check('unit panel shows 6. Armee', /6\. Armee/.test(unitPanel ?? ''));
check('unit panel shows chain of command (Heeresgruppe B)', /Heeresgruppe B/.test(unitPanel ?? ''));
check('unit panel lists Paulus in command (Phase 4.3)', /Friedrich Paulus/.test(unitPanel ?? ''));
check('URL has ?unit=de-h-armee-6', page.url().includes('unit=de-h-armee-6'));
const tbDate = (await page.locator('.timebar-date').textContent()) ?? '';
check(`timeline jumped into unit lifespan (${tbDate.trim()})`, /194[23]/.test(tbDate));
await page.screenshot({ path: `${SHOTS}/ww2-unit.png` });

// Navigate the OOB: the parent link selects Heeresgruppe B (unmapped scaffold).
await page
  .locator('.detail-history', { hasText: 'Chain of command' })
  .locator('button')
  .first()
  .click();
await page.waitForTimeout(1000);
const hgrPanel = await page.locator('.detail-panel').textContent();
check('parent navigation opens Heeresgruppe B', /Heeresgruppe B/.test(hgrPanel ?? ''));
// HGr B is now a derived army group (top tier), not an unmapped scaffold.
check('army group shows a derived position', /derived daily/.test(hgrPanel ?? ''));

// Soviet side reachable too. (Use the full name: with corps + cavalry now
// indexed, bare "13th Guards" is legitimately ambiguous.)
await page.fill('.omnibox input', '13th Guards Rifle Division');
await page.waitForSelector('.omnibox-results li', { timeout: 10000 });
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
const gdPanel = await page.locator('.detail-panel').textContent();
check('13th Guards panel opens with 62nd Army parent', /62nd Army/.test(gdPanel ?? ''));
await page.screenshot({ path: `${SHOTS}/ww2-13guards.png` });

// Path mode (Phase 2): select 6. Armee again, toggle Show path -> ?track=1.
await page.fill('.omnibox input', '6. Armee');
await page.waitForSelector('.omnibox-results li', { timeout: 10000 });
await page.keyboard.press('Enter');
await page.waitForSelector('.unit-controls', { timeout: 10000 });
await page.locator('.unit-controls label', { hasText: 'Show path' }).locator('input').click();
await page.waitForTimeout(1300);
check('path toggle writes ?track=1', page.url().includes('track=1'));
await page.screenshot({ path: `${SHOTS}/ww2-path.png` });
await page.locator('.unit-controls label', { hasText: 'Show path' }).locator('input').click();
await page.waitForTimeout(1300);
check('path toggle off clears ?track=', !page.url().includes('track=1'));

// Battles (Phase 2): search jumps the timeline into the battle and deep-links.
await page.fill('.omnibox input', 'Battle of Kursk');
await page.waitForSelector('.omnibox-results li', { timeout: 10000 });
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
const battlePanel = await page.locator('.detail-panel').textContent();
check('Kursk panel shows ongoing status', /Battle of Kursk/.test(battlePanel ?? '') && /ongoing|begun|over/.test(battlePanel ?? ''));
check('Kursk panel links Wikipedia', (await page.locator('.detail-panel a', { hasText: 'Wikipedia' }).count()) > 0);
check('URL has ?battle=', page.url().includes('battle=Q'));
const kurskDate = (await page.locator('.timebar-date').textContent()) ?? '';
check(`timeline jumped to Kursk (${kurskDate.trim()})`, /1943/.test(kurskDate));
await page.screenshot({ path: `${SHOTS}/ww2-battle.png` });

// Imported scaffolds (Phase 3): any Wikidata division is findable with an
// honest "not mapped yet" page.
await page.fill('.omnibox input', 'Hitlerjugend');
await page.waitForSelector('.omnibox-results li', { timeout: 10000 });
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
const importedPanel = await page.locator('.detail-panel').textContent();
check('imported division panel opens (12th SS)', /Hitlerjugend/.test(importedPanel ?? ''));
check('scaffold marked not mapped + auto-imported', /Not mapped yet/.test(importedPanel ?? '') && /Auto-imported from Wikidata/.test(importedPanel ?? ''));
check('Wikidata commanders attached (Kurt Meyer)', /Commanders/.test(importedPanel ?? '') && /Meyer/.test(importedPanel ?? ''));

// People panel (Phase 4.1): archive links prefill with the name; the wizard
// resolves a unit; ?person= deep-links.
await page.locator('.people-button').click();
await page.waitForSelector('.people-panel', { timeout: 10000 });
await page.fill('.people-panel input[aria-label="Person name"]', 'Ivanov');
await page.waitForTimeout(1300);
const cwgcHref = await page
  .locator('.people-archives a', { hasText: 'CWGC' })
  .getAttribute('href');
check(`CWGC link prefilled (${cwgcHref?.slice(0, 70)})`, /Surname=Ivanov/.test(cwgcHref ?? ''));
check('URL has ?person=Ivanov', page.url().includes('person=Ivanov'));
// Alias search: the English form resolves to the curated German label.
await page.fill('.people-panel input[aria-label="Unit name"]', '305th Infantry');
await page.waitForTimeout(800);
await page.locator('.people-panel .date-link', { hasText: '305. Infanterie' }).first().click();
await page.waitForTimeout(1500);
const wizardPanel = await page.locator('.detail-panel').textContent();
check('wizard resolves 305. Infanterie-Division (curated)', /305\. Infanterie-Division/.test(wizardPanel ?? ''));
await page.screenshot({ path: `${SHOTS}/ww2-people.png` });

// Drill-down (Phase 4.2): the division's regiments appear in its order of
// battle and are selectable; sub-division markers render only around it.
await page.fill('.omnibox input', '13th Guards Rifle Division');
await page.waitForSelector('.omnibox-results li', { timeout: 10000 });
await page.keyboard.press('Enter');
await page.waitForSelector('.detail-panel', { timeout: 10000 });
await page.waitForTimeout(1500);
const divPanel = await page.locator('.detail-panel').textContent();
check('13th Guards lists Rodimtsev as commander', /Rodimtsev/.test(divPanel ?? ''));
check('13th Guards order of battle lists its regiments', /42nd Guards Rifle Regiment/.test(divPanel ?? ''));
// ORBAT rows (Phase: templates) replace the old children list; doctrinal
// establishment template appears for the division's type + era.
check('13th Guards shows an establishment template', /Establishment/.test(divPanel ?? '') && /Rifle Regiment/.test(divPanel ?? ''));
// Phase 5.1: actual strength returns shown against the nominal establishment.
check('13th Guards shows strength returns', /Strength returns/.test(divPanel ?? '') && /crossed the Volga/.test(divPanel ?? ''));
// Phase 5b: equipment catalog — the formation's notable kit with specs/links.
check('13th Guards shows equipment catalog', /Equipment/.test(divPanel ?? '') && /ZiS-3/.test(divPanel ?? ''));
await page.locator('.detail-panel .orbat-row', { hasText: '42nd Guards Rifle Regiment' }).first().click();
await page.waitForTimeout(1500);
const rrPanel = await page.locator('.detail-panel').textContent();
check('regiment panel opens with 13th Guards parent', /13th Guards Rifle Division/.test(rrPanel ?? ''));
check("regiment shows Pavlov's House keyframe", /Pavlov/.test(rrPanel ?? ''));
check('URL has ?unit=su-gd-rr-42', page.url().includes('unit=su-gd-rr-42'));
await page.screenshot({ path: `${SHOTS}/ww2-regiment.png` });

// Eastern Front simulation (SCALE_PLAN S1+S3): an OOB-derived unit is
// searchable, jumps into its lifespan, and explains its derived position.
await page.fill('.omnibox input', '5th Shock Army');
await page.waitForSelector('.omnibox-results li', { timeout: 10000 });
await page.keyboard.press('Enter');
await page.waitForSelector('.detail-panel', { timeout: 10000 });
await page.waitForTimeout(1800);
const shockPanel = await page.locator('.detail-panel').textContent();
check('5th Shock Army panel opens (OOB-created unit)', /5th Shock Army/.test(shockPanel ?? ''));
check('panel explains derived position', /derived daily/.test(shockPanel ?? ''));
check('panel shows an OOB chain of command (front)', /Front/.test(shockPanel ?? ''));

// Soviet armored formations: tank/mech corps from the boevoi sostav armored
// column are findable with chains + derived positions.
await page.fill('.omnibox input', '2nd Guards Tank Corps');
await page.waitForSelector('.omnibox-results li', { timeout: 10000 });
await page.keyboard.press('Enter');
await page.waitForSelector('.detail-panel', { timeout: 10000 });
await page.waitForTimeout(1800);
const tcPanel = await page.locator('.detail-panel').textContent();
check('2nd Guards Tank Corps panel opens', /2nd Guards Tank Corps/.test(tcPanel ?? ''));
check('tank corps shows derived note + subordination', /derived daily/.test(tcPanel ?? '') && /Subordination/.test(tcPanel ?? ''));
// Phase 5b: unit imagery (Commons thumbnail + attribution caption).
check('2nd Guards Tank Corps shows an image (Commons)', /Wikimedia Commons/.test(tcPanel ?? ''));

// Path/follow work for sector-derived units (armies), not just curated.
await page.fill('.omnibox input', '5th Shock Army');
await page.waitForSelector('.omnibox-results li', { timeout: 10000 });
await page.keyboard.press('Enter');
await page.waitForSelector('.unit-controls', { timeout: 10000 });
check('derived army shows path/follow controls', (await page.locator('.unit-controls').count()) === 1);
await page.locator('.unit-controls label', { hasText: 'Show path' }).locator('input').click();
await page.waitForTimeout(1300);
check('derived army path writes ?track=1', page.url().includes('track=1'));
// Data-level: the derived army has a multi-point monthly route to draw.
const derivedRoute = await page.evaluate(async () => {
  const r = await fetch('/data/units/derived/eastern.json');
  const d = await r.json();
  const u = d.units.find((x) => x.id === 'su-shock-army-5');
  return u ? u.segs.reduce((n, s) => n + s.kfs.length, 0) : 0;
});
check(`derived army has a route (${derivedRoute} keyframes)`, derivedRoute >= 2);
await page.locator('.unit-controls label', { hasText: 'Follow' }).locator('input').click();
await page.waitForTimeout(800);
check('derived army follow toggles on', (await page.locator('.unit-controls label', { hasText: 'Follow' }).locator('input').isChecked()));
await page.screenshot({ path: `${SHOTS}/ww2-army-path.png` });
await page.locator('.detail-close').click();
await page.waitForTimeout(800);

// Rifle corps echelon: full front->army->corps->division chain.
await page.fill('.omnibox input', '11th Guards Rifle Corps');
await page.waitForSelector('.omnibox-results li', { timeout: 10000 });
await page.keyboard.press('Enter');
await page.waitForSelector('.detail-panel', { timeout: 10000 });
await page.waitForTimeout(1800);
const corpsPanel = await page.locator('.detail-panel').textContent();
check('rifle corps panel opens (OOB)', /11th Guards Rifle Corps/.test(corpsPanel ?? ''));
check('rifle corps shows an Army parent', /Army/.test(corpsPanel ?? ''));

// Axis-allied army scaffold (Don flank at Stalingrad).
await page.fill('.omnibox input', '3rd Romanian Army');
await page.waitForSelector('.omnibox-results li', { timeout: 10000 });
await page.keyboard.press('Enter');
await page.waitForSelector('.detail-panel', { timeout: 10000 });
await page.waitForTimeout(1500);
const roPanel = await page.locator('.detail-panel').textContent();
check('Romanian 3rd Army panel opens', /3rd Romanian Army/.test(roPanel ?? ''));

// Waffen-SS division (LdW identity).
await page.fill('.omnibox input', 'Das Reich');
await page.waitForSelector('.omnibox-results li', { timeout: 10000 });
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
const ssPanel = await page.locator('.detail-panel').textContent();
check('SS Das Reich resolves to 2nd SS Panzer Division', /2nd SS Panzer Division/.test(ssPanel ?? ''));

// German divisional OOB (S2): a Lexikon-derived division shows its army
// chain and the derived-position note.
await page.fill('.omnibox input', '110th Infantry Division');
await page.waitForSelector('.omnibox-results li', { timeout: 10000 });
await page.keyboard.press('Enter');
await page.waitForSelector('.detail-panel', { timeout: 10000 });
await page.waitForTimeout(1800);
const dePanel = await page.locator('.detail-panel').textContent();
check('110th ID panel opens (Lexikon OOB)', /110th Infantry Division/.test(dePanel ?? ''));
check('110th ID shows derived note', /derived daily/.test(dePanel ?? ''));
check('110th ID subordination lists a German army', /Armee|Army/.test(dePanel ?? ''));

// Full-front view at Kursk: derived markers render along the whole line.
await page.goto(`${BASE}/?date=1943-07-04&z=5.6&lat=52.2&lng=35.8`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.timebar', { timeout: 15000 });
await page.waitForTimeout(5000);
await page.screenshot({ path: `${SHOTS}/ww2-eastern-sim.png` });
check('eastern-sim screenshot taken', true);

// Armoured brigades (the 1941-42 armour gap): independent tank brigades from
// the boevoi sostav are searchable + derived.
await page.fill('.omnibox input', '1st Guards Tank Brigade');
await page.waitForSelector('.omnibox-results li', { timeout: 10000 });
await page.keyboard.press('Enter');
await page.waitForSelector('.detail-panel', { timeout: 10000 });
await page.waitForTimeout(1500);
const bdePanel = await page.locator('.detail-panel').textContent();
check('1st Guards Tank Brigade panel opens', /1st Guards Tank Brigade/.test(bdePanel ?? ''));
check('tank brigade is derived (chain of command)', /derived daily/.test(bdePanel ?? '') && /(Army|Front|Corps)/.test(bdePanel ?? ''));

// German army groups (top tier, derived from the Lexikon Heeresgruppe column):
// searchable, and present in the derived set so the zoomed-out view is symmetric.
await page.fill('.omnibox input', 'Heeresgruppe Mitte');
await page.waitForSelector('.omnibox-results li', { timeout: 10000 });
await page.keyboard.press('Enter');
await page.waitForSelector('.detail-panel', { timeout: 10000 });
await page.waitForTimeout(1500);
const agPanel = await page.locator('.detail-panel').textContent();
check('Heeresgruppe Mitte panel opens', /Heeresgruppe Mitte/.test(agPanel ?? ''));
const agDerived = await page.evaluate(async () => {
  const d = await (await fetch('/data/units/derived/eastern.json')).json();
  return d.units.filter((u) => u.echelon === 'army-group').length;
});
check(`German army groups derived (${agDerived})`, agDerived >= 5);

// Territorial tide fill: the layer is registered with a toggle + legend.
check('tide fill layer in the panel', (await page.locator('.layer-row', { hasText: 'Territorial control' }).count()) === 1);

// Pocket placement: encircled garrison units carry absolute (length-3)
// keyframes that put them inside the ring instead of on the main line.
const pocketKf = await page.evaluate(async () => {
  const d = await (await fetch('/data/units/derived/eastern.json')).json();
  const u = d.units.find((x) => x.id === 'de-h-armee-16'); // Courland garrison
  if (!u) return 0;
  return u.segs.some((s) => s.kfs.some((k) => k.length === 3)) ? 1 : 0;
});
check('Courland garrison has in-pocket (absolute) placement', pocketKf === 1);

// Courland besiegers: Soviet blockaders pinned just outside the ring (absolute
// keyframes on the land-facing side) instead of on the far-south main line.
const besiegerKf = await page.evaluate(async () => {
  const d = await (await fetch('/data/units/derived/eastern.json')).json();
  const u = d.units.find((x) => x.id === 'su-army-22'); // 2nd Baltic Front, Courland blockade
  if (!u) return 0;
  return u.segs.some((s) => s.kfs.some((k) => k.length === 3 && k[0] >= 19441010 && k[2] > 55.5)) ? 1 : 0;
});
check('Courland besieger placed outside the ring (absolute)', besiegerKf === 1);

// Formation ordinals: a re-formed unit shows its formation history (the
// reconciliation registry surfaced in the panel).
await page.fill('.omnibox input', '16. Panzer-Division');
await page.waitForSelector('.omnibox-results li', { timeout: 10000 });
await page.keyboard.press('Enter');
await page.waitForSelector('.detail-panel', { timeout: 10000 });
await page.waitForTimeout(1200);
const formPanel = await page.locator('.detail-panel').textContent();
check('16. Panzer-Division shows formation history', /Formations/.test(formPanel ?? '') && /formation/.test(formPanel ?? ''));
check('formation history names the fate', /destroyed at Stalingrad/i.test(formPanel ?? ''));

const realErrors = errors.filter((e) => !/WebGL|GPU|swiftshader|Failed to load resource/i.test(e));
check(`no console/page errors (${errors.length} total, ${realErrors.length} relevant)`, realErrors.length === 0);
if (realErrors.length) console.log(realErrors.join('\n'));

await browser.close();
process.exit(failed ? 1 : 0);

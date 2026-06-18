// Fetch Lexikon der Wehrmacht division pages (SCALE_PLAN S2). Harvests
// division links from the category indexes (Infanterie, schnelle Truppen),
// keeps those matching German divisions in our unit set, and caches each
// page's content frame (X.htm -> X-R.htm) into data/raw/ldw/ (gitignored).
// Polite: sequential, ~700 ms between requests, skips cached files.
//
// Run: node data/pipeline/fetch-ldw.mjs

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'https://www.lexikon-der-wehrmacht.de/Gliederungen/';
const RAW = 'data/raw/ldw';
const UA = 'ww2-theater-etl/0.1 (borosbence10@gmail.com; one-time cached crawl)';
// Master lists per division family (frameset content frames).
const INDEXES = [
  'Infanteriedivisionen/Gliederung-R.htm',
  'Panzerdivisionen/Gliederung-R.htm',
  'Gebirgsdivisionen/Gliederung-R.htm',
  'Kavalleriedivisionen/Gliederung-R.htm',
  'Grenadierdivisionen/Gliederung-R.htm',
  'SchnelleTruppen-R.htm',
  'SichDiv/Index-R.htm',
  'SS-Divisionen/Gliederung-R.htm',
  'GebirgsdivisionenSS/Gliederung-R.htm',
];

mkdirSync(RAW, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const decode = (buf) => new TextDecoder('windows-1252').decode(buf);

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

// German divisions we know about (number+type match like the SU importer).
const known = new Set();
{
  const addLabel = (label) => {
    const m = label.match(/^(\d+)(?:st|nd|rd|th)? /);
    if (m) known.add(label.toLowerCase());
  };
  for (const u of JSON.parse(readFileSync('data/curated/units/imported-divisions.json', 'utf8')).units) {
    if (u.country === 'DE') for (const n of u.names) addLabel(n.name);
  }
  for (const f of readdirSync('data/curated/units/de')) {
    if (!f.endsWith('.json')) continue;
    const u = JSON.parse(readFileSync(join('data/curated/units/de', f), 'utf8'));
    for (const n of u.names ?? []) known.add(n.name.toLowerCase());
  }
}

// Name-based pages (the early SS divisions that became 1.-6. SS): not
// reachable through any parseable master list; seeded explicitly.
const SEED = [
  ['SS-Divisionen/SSDivLSSAH-R.htm', 'SS-Division Leibstandarte SS Adolf Hitler'],
  ['SS-Divisionen/SSDivReich-R.htm', 'SS-Division Das Reich'],
  ['SS-Divisionen/SSDivTK-R.htm', 'SS-Division Totenkopf'],
  ['SS-Divisionen/SSDivPolizei-R.htm', 'SS-Polizei-Division'],
  ['SS-Divisionen/SSDivWiking-R.htm', 'SS-Division Wiking'],
  ['GebirgsdivisionenSS/6GebDSS-R.htm', 'SS-Gebirgs-Division Nord'],
];

(async () => {
  // 1. Harvest division links from the category indexes.
  const targets = new Map(); // file name -> {url, label}
  for (const idx of INDEXES) {
    const buf = await get(BASE + idx);
    await sleep(700);
    if (!buf) {
      console.log('index missing:', idx);
      continue;
    }
    const html = decode(buf);
    const dir = idx.includes('/') ? idx.slice(0, idx.lastIndexOf('/') + 1) : '';
    for (const m of html.matchAll(/href="([^"]+?\.htm)"[^>]*>\s*([^<]{3,70})/g)) {
      const [, href, rawLabel] = m;
      const label = rawLabel.replace(/\s+/g, ' ').trim();
      if (/KStN|Gliederung|Index/i.test(href)) continue;
      if (!/[Dd]ivision/.test(label)) continue;
      // Numbered divisions only — skip named/RAD/Festung/ad-hoc 1945 divisions
      // (mostly West/local-defence, never on the Eastern Front line).
      if (!/^\d/.test(label)) continue;
      // Resolve relative to the index's directory. Some indexes link the
      // frameset (X.htm -> X-R.htm content frame); the Panzer/Gebirgs/Kavallerie
      // indexes link the content frame (X-R.htm) directly — accept both.
      const abs = new URL(href, BASE + dir).href;
      const content = /-R\.htm$/i.test(abs) ? abs : abs.replace(/\.htm$/i, '-R.htm');
      const file = content.split('/').pop();
      if (!targets.has(file)) targets.set(file, { url: content, label });
    }
  }
  for (const [path, label] of SEED) {
    const file = path.split('/').pop();
    if (!targets.has(file)) targets.set(file, { url: BASE + path, label });
  }
  console.log(`Harvested ${targets.size} division pages from ${INDEXES.length} indexes + ${SEED.length} seeds`);

  // 2. Fetch each content frame (cached).
  let fetched = 0;
  let cached = 0;
  let missing = 0;
  for (const [file, t] of targets) {
    const out = join(RAW, file);
    if (existsSync(out) && statSync(out).size > 5000) {
      cached++;
      continue;
    }
    const buf = await get(t.url);
    await sleep(700);
    if (buf && buf.length > 5000) {
      writeFileSync(out, buf);
      fetched++;
    } else {
      missing++;
      console.log('  miss:', t.label, t.url.replace(BASE, ''));
    }
  }
  writeFileSync(
    join(RAW, '_index.json'),
    JSON.stringify([...targets.entries()].map(([file, t]) => ({ file, ...t })), null, 1),
  );
  console.log(`Fetched ${fetched}, cached ${cached}, missing ${missing}`);
})();

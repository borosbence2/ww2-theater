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
  'Panzergrenadierdivisionen/Gliederung-R.htm',
  'Gebirgsdivisionen/Gliederung-R.htm',
  'leichteDivisionen/Gliederung-R.htm',
  'Kavalleriedivisionen/Gliederung-R.htm',
  'Grenadierdivisionen/Gliederung-R.htm',
  'SchnelleTruppen-R.htm',
  'SichDiv/Index-R.htm',
  'SS-Divisionen/Gliederung-R.htm',
  'GebirgsdivisionenSS/Gliederung-R.htm',
];

// These indexes are small and almost entirely Eastern-Front formations, so we
// harvest every numbered page (bootstrapping LdW-only divisions we have no
// Wikidata scaffold for, e.g. 14./16./24. Panzer). The large infantry/grenadier/
// security indexes stay filtered by `known` — they are full of occupation and
// West-front static divisions that never reached the East.
const BOOTSTRAP = new Set([
  'Panzerdivisionen/Gliederung-R.htm',
  'Panzergrenadierdivisionen/Gliederung-R.htm',
  'Gebirgsdivisionen/Gliederung-R.htm',
  'leichteDivisionen/Gliederung-R.htm',
  'Kavalleriedivisionen/Gliederung-R.htm',
  'SS-Divisionen/Gliederung-R.htm',
  'GebirgsdivisionenSS/Gliederung-R.htm',
]);

// LdW filename suffix -> division family; mirror of familyOfEnglish() below.
// Many index links wrap an image (empty link text), so we key identity off the
// reliable href (e.g. 10ID.htm) and synthesize a German label from this map.
const SUFFIX_FAMILY = {
  ID: 'inf', PD: 'pz', PGD: 'pgd', PGrenD: 'pgd', GebD: 'geb', GebDiv: 'geb',
  leDiv: 'jg', leD: 'jg', KavDiv: 'kav', GD: 'gren', SichDiv: 'sich',
};
const GERMAN_NAME = {
  inf: 'Infanterie-Division', pz: 'Panzer-Division', pgd: 'Panzergrenadier-Division',
  geb: 'Gebirgs-Division', jg: 'Jäger-Division', kav: 'Kavallerie-Division',
  gren: 'Grenadier-Division', sich: 'Sicherungs-Division',
};
// Foot-mobile families (infantry/jäger/mountain/grenadier) are fuzzy in both
// sources — LdW files a Jäger division as 101ID or 101leDiv, we may know it as
// infantry or jäger. Collapse them so number+normalized-family matches across.
const normFamily = (f) =>
  ({ inf: 'foot', jg: 'foot', geb: 'foot', gren: 'foot' })[f] ?? f;
const familyOfEnglish = (label) => {
  const l = label.toLowerCase();
  if (/panzergrenadier/.test(l)) return 'pgd';
  if (/panzer/.test(l)) return 'pz';
  if (/mountain|gebirg/.test(l)) return 'geb';
  if (/jäger|jager|light/.test(l)) return 'jg';
  if (/cavalry|kavall/.test(l)) return 'kav';
  if (/security|sicher/.test(l)) return 'sich';
  if (/grenadier/.test(l)) return 'gren';
  if (/infantry|infanterie/.test(l)) return 'inf';
  return null;
};

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
  // `${number}|${normalized-family}` for every German division we track, so the
  // harvest fetches LdW pages only for EF-relevant formations (not all 308
  // infanterie divisions, most of which were occupation/West and never on the
  // Eastern Front). We key off the built index.json (the current unit universe:
  // Wikidata scaffolds *and* divisions a prior LdW pass created), parsing the id
  // — using only the Wikidata scaffolds would drop the ~144 LdW-only divisions.
  const familyOfId = (id) => {
    if (/panzergrenadier/.test(id)) return 'pgd';
    if (/panzer/.test(id)) return 'pz';
    if (/mountain|gebirg/.test(id)) return 'geb';
    if (/jager|jäger|light/.test(id)) return 'jg';
    if (/cavalry|kavall/.test(id)) return 'kav';
    if (/security|sicher/.test(id)) return 'sich';
    if (/grenadier/.test(id)) return 'gren';
    if (/infantry|infanterie/.test(id)) return 'inf';
    return null;
  };
  const addId = (id) => {
    const m = id.match(/^de-(\d+)/);
    const f = familyOfId(id);
    if (m && f) known.add(`${Number(m[1])}|${normFamily(f)}`);
  };
  const IDX = 'public/data/units/index.json';
  if (existsSync(IDX)) {
    const idx = JSON.parse(readFileSync(IDX, 'utf8'));
    for (const u of idx.units ?? idx) if (/^de-/.test(u.id) && u.echelon === 'division') addId(u.id);
  }
  // Fallback / union with the raw Wikidata scaffolds (fresh checkout safety).
  for (const u of JSON.parse(readFileSync('data/curated/units/imported-divisions.json', 'utf8')).units) {
    if (u.country === 'DE') addId(u.id);
  }
  for (const f of readdirSync('data/curated/units/de')) {
    if (!f.endsWith('.json')) continue;
    addId(JSON.parse(readFileSync(join('data/curated/units/de', f), 'utf8')).id ?? '');
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
  // Eastern-Front infantry the `known` filter drops (no Wikidata scaffold):
  // 44. ID (Hoch- und Deutschmeister, destroyed at Stalingrad) and the three
  // Croatian Legion divisions raised for the East.
  ['Infanteriedivisionen/44ID-R.htm', '44. Infanterie-Division'],
  ['Infanteriedivisionen/369ID-R.htm', '369. Infanterie-Division'],
  ['Infanteriedivisionen/373ID-R.htm', '373. Infanterie-Division'],
  ['Infanteriedivisionen/392ID-R.htm', '392. Infanterie-Division'],
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
    for (const m of html.matchAll(/href="([^"]+?\.htm)"/gi)) {
      const href = m[1];
      if (/KStN|Gliederung|Index|inhalt/i.test(href)) continue;
      const fname = href.split('/').pop();
      // Numbered division page: <number><family-suffix>[-R].htm (e.g. 10ID.htm,
      // 10PD.htm, 101leDiv.htm). The link text is often an image (empty), so we
      // identify by the href and synthesize the German label from the suffix.
      const sm = fname.match(/^(\d+)([A-Za-z]+?)(-R)?\.htm$/);
      if (!sm) continue;
      const num = Number(sm[1]);
      const fam = SUFFIX_FAMILY[sm[2]];
      if (!fam) continue; // not a division family we map (regt/brigade/etc.)
      // Bootstrap indexes: take every page. Filtered indexes: tracked only.
      if (!BOOTSTRAP.has(idx) && !known.has(`${num}|${normFamily(fam)}`)) continue;
      const label = `${num}. ${GERMAN_NAME[fam]}`;
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
    // 1500 B: some real EF divisions have brief pages (e.g. 47. ID at ~4.4 KB,
    // a short Unterstellung table); only the bare frameset stubs are smaller.
    if (existsSync(out) && statSync(out).size > 1500) {
      cached++;
      continue;
    }
    const buf = await get(t.url);
    await sleep(700);
    if (buf && buf.length > 1500) {
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

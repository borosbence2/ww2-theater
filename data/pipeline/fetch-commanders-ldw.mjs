// Dated German commanders from Lexikon der Wehrmacht. The army and army-group
// content pages carry an "Oberbefehlshaber:" section listing each holder with a
// German date range (e.g. "Generalfeldmarschall Friedrich Paulus — 1. Januar
// 1942 - Kapitulation"). Parsed into dated tenures, into a committed
// intermediate keyed by unit id:  data/curated/units/oob/commanders-ldw.json
// build-units.mjs attaches these first (dated, authoritative) for German units.
//
// Run: node data/pipeline/fetch-commanders-ldw.mjs   (after build-units once).
// Pages cache under data/raw/ldw/commands/ (gitignored); polite + resumable.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const INDEX = 'public/data/units/index.json';
const OUT = 'data/curated/units/oob/commanders-ldw.json';
const RAW = 'data/raw/ldw/commands';
const BASE = 'https://www.lexikon-der-wehrmacht.de/Gliederungen/';
const UA = 'ww2-theater-etl/0.1 (borosbence10@gmail.com; cached crawl)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(RAW, { recursive: true });

const MONTHS = {
  januar: 1, februar: 2, märz: 3, maerz: 3, april: 4, mai: 5, juni: 6,
  juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12,
};
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
function gdate(s) {
  let m = s.match(/(\d{1,2})\.\s*([A-Za-zäöüÄÖÜ]+)\s+(\d{4})/);
  if (m && MONTHS[m[2].toLowerCase()]) return iso(m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  m = s.match(/([A-Za-zäöüÄÖÜ]+)\s+(\d{4})/);
  if (m && MONTHS[m[1].toLowerCase()]) return iso(m[2], MONTHS[m[1].toLowerCase()], 1);
  return null;
}
const strip = (h) =>
  h
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&szlig;/g, 'ß')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** LdW content-page path for a German army / army-group unit, or null. */
function pageFor(label) {
  let m = label.match(/^(\d+)\.\s*Armee$/);
  if (m) return `Armeen/${m[1]}Armee-R.htm`;
  m = label.match(/^Heeresgruppe\s+(.+)$/);
  if (m) {
    const x = m[1]
      .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ä/g, 'a').replace(/ß/g, 'ss')
      .replace(/\s+/g, '');
    return `Heeresgruppen/Heeresgruppe${x}-R.htm`;
  }
  return null;
}

async function getPage(path) {
  const cacheKey = path.replace(/[/]/g, '_');
  const cached = join(RAW, cacheKey);
  if (existsSync(cached)) return readFileSync(cached, 'utf8');
  const res = await fetch(BASE + path, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const html = new TextDecoder('windows-1252').decode(Buffer.from(await res.arrayBuffer()));
  writeFileSync(cached, html);
  await sleep(700);
  return html;
}

/** Parse the Oberbefehlshaber section into [{name, from, to, link}]. */
function parseCommanders(html) {
  // Anchor on the section HEADER ("Oberbefehlshaber:" / "Kommandierender
  // General:" with the colon), not a prose mention ("Oberbefehlshaber der …").
  let start = html.search(/(?:Oberbefehlshaber|Kommandierende[rn]?\s+General)\s*:/i);
  if (start < 0) return [];
  // From the end of the section header to the next major <strong> header.
  const after = html.slice(start);
  const hdrEnd = after.search(/<\/strong>/i);
  const body = after.slice(hdrEnd < 0 ? 0 : hdrEnd);
  const next = body.search(/<strong>/i);
  const section = next < 0 ? body : body.slice(0, next);

  const out = [];
  for (const block of section.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) ?? []) {
    const a = block.match(/<a[^>]*href="([^"]*Personenregister[^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!a) continue;
    const name = strip(a[2]);
    if (!name) continue;
    const dateText = strip(block.slice(block.indexOf('</a>') + 4));
    const [fromStr, toStr] = dateText.split(/\s[-–]\s/);
    const from = fromStr ? gdate(fromStr) : null;
    const to = toStr ? gdate(toStr) : null;
    const link = 'https://www.lexikon-der-wehrmacht.de/' + a[1].replace(/^(\.\.\/)+/, '');
    if (!out.some((c) => c.name === name && c.from === from)) out.push({ name, from, to, link });
  }
  return out;
}

// --- main ------------------------------------------------------------------
const index = JSON.parse(readFileSync(INDEX, 'utf8')).units;
const targets = index.filter(
  (u) => u.side === 'axis' && (u.echelon === 'army' || u.echelon === 'army-group') && pageFor(u.label),
);
if (process.env.SAMPLE) targets.length = Math.min(targets.length, Number(process.env.SAMPLE));
console.log(`Fetching LdW commanders for ${targets.length} German formations…`);

const out = {};
let cmdTotal = 0;
for (const u of targets) {
  const path = pageFor(u.label);
  const html = await getPage(path);
  if (!html) {
    console.log(`  ✗ ${u.id}  ${u.label}  (no page)`);
    continue;
  }
  const commanders = parseCommanders(html);
  if (!commanders.length) {
    console.log(`  · ${u.id}  ${u.label}  (no commanders parsed)`);
    continue;
  }
  out[u.id] = { page: BASE + path, commanders };
  cmdTotal += commanders.length;
  console.log(`  ✓ ${u.id}  ${u.label}  (${commanders.length}) e.g. ${commanders[0].name} [${commanders[0].from ?? '?'}..${commanders[0].to ?? '?'}]`);
}

writeFileSync(
  OUT,
  JSON.stringify(
    {
      note: 'Dated German commanders (Oberbefehlshaber) from Lexikon der Wehrmacht army/army-group pages, keyed by unit id. Attached first (dated) by build-units for German formations.',
      source: 'Lexikon der Wehrmacht',
      units: out,
    },
    null,
    1,
  ),
);
console.log(`Wrote ${Object.keys(out).length} units / ${cmdTotal} commander records -> ${OUT}`);

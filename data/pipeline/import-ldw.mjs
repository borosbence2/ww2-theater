// Lexikon der Wehrmacht parser (SCALE_PLAN S2). Division pages cached by
// fetch-ldw.mjs carry an "Unterstellung" table — Datum | Armeekorps | Armee |
// Heeresgruppe | Ort — in year blocks (a standalone "1941" row precedes each
// block). We extract per-division army-assignment EVENTS for the whole war:
//   data/curated/units/oob/de-monthly.json
// Identity matching is rule-based (number + family class) against our unit
// set, exactly like the Soviet importer; unmatched pages land in the report.
//
// Run: node data/pipeline/import-ldw.mjs   (after fetch-ldw.mjs)

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const RAW = 'data/raw/ldw';
const UNITS_DIR = 'data/curated/units';
const OUT = join(UNITS_DIR, 'oob', 'de-monthly.json');

const decode = (buf) => new TextDecoder('windows-1252').decode(buf);

const MONTHS = {
  januar: 1, februar: 2, märz: 3, marz: 3, april: 4, mai: 5, juni: 6,
  juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12,
};

// Family classes, shared between German labels and our English labels.
function classOfGerman(label) {
  const l = label.toLowerCase();
  if (l.includes('panzergrenadier')) return 'pgd';
  if (l.includes('panzer')) return 'pz';
  if (l.includes('(mot')) return 'mot';
  if (l.includes('gebirgs')) return 'geb';
  if (l.includes('jäger') || l.includes('jager') || l.includes('leichte')) return 'jg';
  if (l.includes('kavallerie')) return 'kav';
  if (l.includes('sicherung')) return 'sich';
  if (l.includes('volksgrenadier') || l.includes('volks-grenadier')) return 'vgd';
  if (l.includes('grenadier')) return 'gren';
  if (l.includes('infanterie')) return 'inf';
  return null;
}
function classOfEnglish(label) {
  const l = label.toLowerCase();
  if (l.includes('panzergrenadier')) return 'pgd';
  if (l.includes('panzer')) return 'pz';
  if (l.includes('motorized') || l.includes('motorised')) return 'mot';
  if (l.includes('mountain')) return 'geb';
  if (l.includes('jäger') || l.includes('jager') || l.includes('light infantry')) return 'jg';
  if (l.includes('cavalry')) return 'kav';
  if (l.includes('security')) return 'sich';
  if (l.includes('volksgrenadier') || l.includes('volks grenadier') || l.includes('people')) return 'vgd';
  if (l.includes('grenadier')) return 'gren';
  if (l.includes('infantry')) return 'inf';
  return null;
}
/** Acceptable fallbacks when the exact class is absent on one side. */
const CLASS_FALLBACK = { mot: ['pgd', 'inf'], pgd: ['mot'], jg: ['inf'], gren: ['vgd', 'inf'], vgd: ['gren'] };

// Index our German divisions by (number|class).
const byKey = new Map();
{
  const indexUnit = (u) => {
    if (u.country !== 'DE' || u.echelon !== 'division') return;
    for (const n of u.names ?? []) {
      for (const name of [n.name, ...(n.aliases ?? [])]) {
        const m = name.match(/^(\d+)(?:st|nd|rd|th)? /);
        const cls = classOfEnglish(name) ?? classOfGerman(name);
        if (m && cls && !byKey.has(`${m[1]}|${cls}`)) byKey.set(`${m[1]}|${cls}`, u.id);
      }
    }
  };
  for (const f of readdirSync(join(UNITS_DIR, 'de'))) {
    if (f.endsWith('.json')) indexUnit(JSON.parse(readFileSync(join(UNITS_DIR, 'de', f), 'utf8')));
  }
  for (const u of JSON.parse(readFileSync(join(UNITS_DIR, 'imported-divisions.json'), 'utf8')).units) {
    indexUnit(u);
  }
}

function resolveUnit(num, cls) {
  if (byKey.has(`${num}|${cls}`)) return byKey.get(`${num}|${cls}`);
  for (const fb of CLASS_FALLBACK[cls] ?? []) {
    if (byKey.has(`${num}|${fb}`)) return byKey.get(`${num}|${fb}`);
  }
  return null;
}

// Army cell -> unit id (creating scaffolds for armies we don't know yet).
const armyScaffolds = new Map();
function armyId(cell, year) {
  const t = cell.replace(/\s+/g, ' ').trim();
  let m;
  if ((m = t.match(/Panzergruppe (\d)/)) || (m = t.match(/(\d)\. ?Panzerarmee/)) || (m = t.match(/Pz\.? ?AOK\.? ?(\d)/))) {
    return `de-h-pzarmee-${m[1]}`;
  }
  if ((m = t.match(/(\d+)\. ?Armee(?!korps)/)) || (m = t.match(/AOK\.? ?(\d+)/))) {
    const n = Number(m[1]);
    if (n === 6) return year >= 1943 ? 'de-h-armee-6-2' : 'de-h-armee-6';
    if (n === 8 && year < 1943) return null; // 1939 8. Armee incarnation not authored
    const id = `de-h-armee-${n}`;
    if (!armyScaffolds.has(id)) armyScaffolds.set(id, n);
    return id;
  }
  return null; // OKH, BdE, Armeeabteilungen (v1), z.Vfg., blank
}

// ---------------------------------------------------------------------------

const index = existsSync(join(RAW, '_index.json'))
  ? JSON.parse(readFileSync(join(RAW, '_index.json'), 'utf8'))
  : [];
const labelByFile = new Map(index.map((e) => [e.file, e.label]));

const ARMY_RE = /Armee(?!korps)|Panzergruppe|Pz\.? ?AOK|AOK/;
const divisions = [];
const report = { unmatchedPages: [], rows: 0, events: 0, noArmy: 0 };

for (const file of readdirSync(RAW)) {
  if (!file.endsWith('.htm')) continue;
  const label = labelByFile.get(file) ?? file;
  const m = label.replace(/\s+/g, ' ').match(/^(\d+)\.? /);
  const cls = classOfGerman(label);
  const id = m && cls ? resolveUnit(m[1], cls) : null;
  if (!id) {
    report.unmatchedPages.push(label);
    continue;
  }

  const html = decode(readFileSync(join(RAW, file)));
  // Linear scan in document order: year headings (<big><big>1941</big></big>
  // paragraphs between tables — or standalone year rows in some pages) set
  // the year; data rows add events.
  const events = [];
  let year = null;
  for (const tok of html.matchAll(
    /<big><big>\s*(19[34]\d)\s*<\/big><\/big>|<tr[^>]*>([\s\S]*?)<\/tr>/g,
  )) {
    if (tok[1]) {
      year = Number(tok[1]);
      continue;
    }
    const cells = [...tok[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) =>
      c[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\s+/g, ' ').trim(),
    );
    if (!cells.length) continue;
    const joined = cells.join(' ').trim();
    const ym = joined.match(/^(19[34]\d)$/);
    if (ym) {
      year = Number(ym[1]);
      continue;
    }
    if (!year || cells[0] === 'Datum') continue;
    const dm = (cells[0] ?? '').match(/^(?:(\d{1,2})\. ?)?(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)/i);
    if (!dm) continue;
    report.rows++;
    const day = dm[1] ? Number(dm[1]) : 1;
    const month = MONTHS[dm[2].toLowerCase()];
    const armyCell = cells.slice(1).find((c) => ARMY_RE.test(c));
    const aid = armyCell ? armyId(armyCell, year) : null;
    if (!aid) report.noArmy++;
    const date = `${year}-${String(month).padStart(2, '0')}-${String(Math.min(day, 28)).padStart(2, '0')}`;
    events.push([date, aid]);
    report.events++;
  }
  if (events.length) {
    // Dedupe consecutive same-army events, keep chronological order.
    events.sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const merged = [];
    for (const e of events) {
      if (merged.length && merged[merged.length - 1][1] === e[1]) continue;
      merged.push(e);
    }
    divisions.push({ id, label, events: merged });
  }
}

mkdirSync(join(UNITS_DIR, 'oob'), { recursive: true });
writeFileSync(
  OUT,
  JSON.stringify(
    {
      note: 'German division -> army assignment events parsed from Lexikon der Wehrmacht Unterstellung tables (fetch-ldw.mjs). Events hold until the next event; null army = off-front/OKH reserve/unparsed (division hidden from sector derivation).',
      source: 'https://www.lexikon-der-wehrmacht.de/ (cited; identity + assignment facts only)',
      armies: [...armyScaffolds.entries()].map(([id, n]) => ({ id, n })),
      divisions: divisions.sort((a, b) => a.id.localeCompare(b.id)),
    },
    null,
    1,
  ),
);
console.log(
  `Parsed ${divisions.length} German divisions, ${report.events} assignment events ` +
    `(${report.noArmy} off-front/unmapped) -> ${OUT}`,
);
if (report.unmatchedPages.length) {
  console.log(`Unmatched pages: ${report.unmatchedPages.length}`);
  for (const p of report.unmatchedPages.slice(0, 15)) console.log('  ?', p);
}

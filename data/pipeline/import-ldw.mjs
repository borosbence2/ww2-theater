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
  // SS formations number independently of the Heer — separate key space.
  const ss = /ss-|waffen/.test(l) ? 'ss-' : '';
  if (l.includes('panzergrenadier')) return ss + 'pgd';
  if (l.includes('panzer')) return ss + 'pz';
  if (l.includes('(mot')) return ss + 'mot';
  if (l.includes('gebirgs')) return ss + 'geb';
  if (l.includes('jäger') || l.includes('jager') || l.includes('leichte')) return ss + 'jg';
  if (l.includes('kavallerie')) return ss + 'kav';
  if (l.includes('sicherung')) return ss + 'sich';
  if (l.includes('volksgrenadier') || l.includes('volks-grenadier')) return 'vgd';
  if (l.includes('grenadier')) return ss + 'gren';
  if (l.includes('infanterie')) return ss + 'inf';
  return null;
}
function classOfEnglish(label) {
  const l = label.toLowerCase();
  const ss = /ss|waffen/.test(l) ? 'ss-' : '';
  if (l.includes('panzergrenadier')) return ss + 'pgd';
  if (l.includes('panzer')) return ss + 'pz';
  if (l.includes('motorized') || l.includes('motorised')) return ss + 'mot';
  if (l.includes('mountain')) return ss + 'geb';
  if (l.includes('jäger') || l.includes('jager') || l.includes('light infantry')) return ss + 'jg';
  if (l.includes('cavalry')) return ss + 'kav';
  if (l.includes('security')) return ss + 'sich';
  if (l.includes('volksgrenadier') || l.includes('volks grenadier') || l.includes('people')) return 'vgd';
  if (l.includes('grenadier')) return ss + 'gren';
  if (l.includes('infantry')) return ss + 'inf';
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
  const ss = cls.startsWith('ss-') ? 'ss-' : '';
  for (const fb of CLASS_FALLBACK[cls.replace(/^ss-/, '')] ?? []) {
    if (byKey.has(`${num}|${ss}${fb}`)) return byKey.get(`${num}|${ss}${fb}`);
  }
  return null;
}

// Army cell -> unit id (creating scaffolds for armies we don't know yet).
const armyScaffolds = new Map();
const aabtScaffolds = new Map(); // Armeeabteilungen without an army lineage
function armyId(cell, year) {
  const t = cell.replace(/\s+/g, ' ').trim();
  let m;
  // Armeeabteilungen with a known army lineage map into that incarnation.
  if (/Hollidt/i.test(t)) return 'de-h-armee-6-2'; // became 6. Armee (II), Mar 43
  if (/Kempf/i.test(t)) return 'de-h-armee-8'; // became 8. Armee, Aug 43
  if ((m = t.match(/Armeeabteilung ([A-Za-zäöüß-]+)/))) {
    const slug = m[1].toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
    const id = `de-h-aabt-${slug}`;
    if (!aabtScaffolds.has(id)) aabtScaffolds.set(id, `Armeeabteilung ${m[1]}`);
    return id;
  }
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
  return null; // OKH, BdE, z.Vfg., blank
}

// Heeresgruppe column -> army-group unit id. Eastern Front groups only;
// western (C, D, G, Oberrhein, H) and Balkan (E, F) are skipped.
const HGR = {
  nord: ['de-h-hgr-nord', 'Heeresgruppe Nord', 'Army Group North'],
  mitte: ['de-h-hgr-mitte', 'Heeresgruppe Mitte', 'Army Group Centre'],
  süd: ['de-h-hgr-sued', 'Heeresgruppe Süd', 'Army Group South'],
  sud: ['de-h-hgr-sued', 'Heeresgruppe Süd', 'Army Group South'],
  a: ['de-h-hgr-a', 'Heeresgruppe A', 'Army Group A'],
  b: ['de-h-hgr-b', 'Heeresgruppe B', 'Army Group B'],
  don: ['de-h-hgr-don', 'Heeresgruppe Don', 'Army Group Don'],
  nordukraine: ['de-h-hgr-nordukraine', 'Heeresgruppe Nordukraine', 'Army Group North Ukraine'],
  'nord-ukraine': ['de-h-hgr-nordukraine', 'Heeresgruppe Nordukraine', 'Army Group North Ukraine'],
  südukraine: ['de-h-hgr-suedukraine', 'Heeresgruppe Südukraine', 'Army Group South Ukraine'],
  sudukraine: ['de-h-hgr-suedukraine', 'Heeresgruppe Südukraine', 'Army Group South Ukraine'],
  kurland: ['de-h-hgr-kurland', 'Heeresgruppe Kurland', 'Army Group Courland'],
  weichsel: ['de-h-hgr-weichsel', 'Heeresgruppe Weichsel', 'Army Group Vistula'],
  ostmark: ['de-h-hgr-ostmark', 'Heeresgruppe Ostmark', 'Army Group Ostmark'],
};
const hgrScaffolds = new Map();
function hgrId(cell) {
  const key = (cell ?? '').replace(/\(.*/, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const hit = HGR[key];
  if (!hit) return null;
  if (!hgrScaffolds.has(hit[0])) hgrScaffolds.set(hit[0], { id: hit[0], name: hit[1], en: hit[2] });
  return hit[0];
}

// ---------------------------------------------------------------------------

const index = existsSync(join(RAW, '_index.json'))
  ? JSON.parse(readFileSync(join(RAW, '_index.json'), 'utf8'))
  : [];
const labelByFile = new Map(index.map((e) => [e.file, e.label]));

const ARMY_RE = /Armee(?!korps)|Panzergruppe|Pz\.? ?AOK|AOK/;
const divisions = [];
const report = { unmatchedPages: [], rows: 0, events: 0, noArmy: 0 };

const ORD = (n) => {
  const s = ['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : Math.min(n % 10, 4) % 4] ?? 'th';
  return `${n}${s}`;
};
const CLASS_EN = {
  inf: ['Infantry', 'infantry'],
  pz: ['Panzer', 'armoured'],
  pgd: ['Panzergrenadier', 'motorized'],
  mot: ['Motorized', 'motorized'],
  geb: ['Mountain', 'infantry'],
  jg: ['Jäger', 'infantry'],
  kav: ['Cavalry', 'cavalry'],
  sich: ['Security', 'infantry'],
  vgd: ['Volksgrenadier', 'infantry'],
  gren: ['Grenadier', 'infantry'],
};
const createdUnits = new Map();

// Name-based SS pages -> (number, class): these formations carried names
// before numbers; our index knows them as "2nd SS Panzer Division" etc.
const SS_IDENTITY = {
  'SSDivLSSAH-R.htm': [1, 'ss-pz'],
  'SSDivReich-R.htm': [2, 'ss-pz'],
  'SSDivTK-R.htm': [3, 'ss-pz'],
  'SSDivPolizei-R.htm': [4, 'ss-pgd'],
  'SSDivWiking-R.htm': [5, 'ss-pz'],
  '6GebDSS-R.htm': [6, 'ss-geb'],
};

for (const file of readdirSync(RAW)) {
  if (!file.endsWith('.htm')) continue;
  const label = labelByFile.get(file) ?? file;
  let m = label.replace(/\s+/g, ' ').match(/^(\d+)\.? /);
  let cls = classOfGerman(label);
  if (SS_IDENTITY[file]) {
    m = [null, String(SS_IDENTITY[file][0])];
    cls = SS_IDENTITY[file][1];
  }
  let id = m && cls ? resolveUnit(m[1], cls) : null;
  if (!id && m && cls) {
    // Lexikon is authoritative for identity: create the unit our Wikidata
    // import lacked, with the same slug scheme the importer uses.
    const n = Number(m[1]);
    const isSS = cls.startsWith('ss-');
    const [enBase, type] = CLASS_EN[cls.replace(/^ss-/, '')];
    const en = isSS ? `SS ${enBase}` : enBase;
    id = `de-${ORD(n)}-${en.toLowerCase().replace(/ä/g, 'a').replace(/ /g, '-')}-division`;
    if (!createdUnits.has(id)) {
      createdUnits.set(id, {
        id,
        country: 'DE',
        branch: isSS ? 'waffen-ss' : 'heer',
        echelon: 'division',
        type,
        short: `${n}. ${en === 'Infantry' ? 'ID' : en.slice(0, 3)}`,
        names: [{ from: '1939-09-01', name: `${ORD(n)} ${en} Division`, aliases: [label] }],
        existence: [{ from: '1939-09-01' }],
        parents: [],
        positions: [],
        links: {},
        notes: 'Identity from Lexikon der Wehrmacht (absent from the Wikidata division tree). Lifecycle dates coarse.',
      });
    }
    byKey.set(`${m[1]}|${cls}`, id);
  }
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
    const armyIdx = cells.findIndex((c, i) => i >= 1 && ARMY_RE.test(c));
    const aid = armyIdx >= 0 ? armyId(cells[armyIdx], year) : null;
    if (!aid) report.noArmy++;
    // Heeresgruppe is the cell after the army (Datum|Korps|Armee|HGr|Ort).
    const hid = armyIdx >= 0 ? hgrId(cells[armyIdx + 1]) : null;
    const date = `${year}-${String(month).padStart(2, '0')}-${String(Math.min(day, 28)).padStart(2, '0')}`;
    events.push([date, aid, hid]);
    report.events++;
  }
  if (events.length) {
    // Dedupe consecutive events with the same (army, army-group).
    events.sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const merged = [];
    for (const e of events) {
      const last = merged[merged.length - 1];
      if (last && last[1] === e[1] && last[2] === e[2]) continue;
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
      armyGroups: [...hgrScaffolds.values()],
      armeeabteilungen: [...aabtScaffolds.entries()].map(([id, name]) => ({ id, name })),
      created: [...createdUnits.values()],
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

// Boevoi sostav parser (SCALE_PLAN S1). Monthly "Боевой состав Советской
// Армии" transcription pages (data/raw/bs/*.html, cp1251, fetched by
// fetch-bs.mjs) -> data/curated/units/oob/su-monthly.json:
//   - per month: active-army fronts -> armies -> rifle/guards/cavalry/
//     airborne/mountain divisions (v1 scope; corps & brigades later)
//   - identity skeletons for every parsed front/army/division that does not
//     already exist in the curated/imported unit set
//
// Parsing is rule-based, no fuzzing: "54 и 59 гв., 243 сд" expands by
// right-to-left (type, guards) propagation; corps parentheses are unwrapped
// (their divisions belong to the army at v1 granularity). Unparsed tokens
// land in the report, not in the data.
//
// Run: node data/pipeline/import-bs.mjs

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const RAW_DIR = 'data/raw/bs';
const UNITS_DIR = 'data/curated/units';
const OUT = join(UNITS_DIR, 'oob', 'su-monthly.json');

const decoder = new TextDecoder('windows-1251');
// NOT an NFD fold: NFD decomposes Cyrillic й into и + combining breve, which
// would break dictionary lookups. Plain lowercase is correct for Russian.
const ru = (s) => s.toLowerCase().replace(/ё/g, 'е');

// ---------------------------------------------------------------------------
// Existing units: resolve parsed designations against curated + imported ids.

const existing = new Map(); // key "(n|gv|type)" -> id
const existingIds = new Set();
function indexUnit(u) {
  existingIds.add(u.id);
  for (const n of u.names ?? []) {
    for (const name of [n.name, ...(n.aliases ?? [])]) {
      const m = name.match(/^(\d+)(?:st|nd|rd|th) (Guards )?(Rifle|Cavalry|Airborne|Mountain Rifle|Motor Rifle|Motorized|Tank) Division/i);
      if (m) {
        const key = `${m[1]}|${m[2] ? 1 : 0}|${m[3].toLowerCase()}`;
        if (!existing.has(key)) existing.set(key, u.id);
      }
    }
  }
}
for (const dir of readdirSync(UNITS_DIR, { withFileTypes: true })) {
  if (!dir.isDirectory() || dir.name === 'oob') continue;
  for (const file of readdirSync(join(UNITS_DIR, dir.name))) {
    if (file.endsWith('.json')) indexUnit(JSON.parse(readFileSync(join(UNITS_DIR, dir.name, file), 'utf8')));
  }
}
try {
  for (const u of JSON.parse(readFileSync(join(UNITS_DIR, 'imported-divisions.json'), 'utf8')).units) {
    indexUnit(u);
  }
} catch {
  /* scaffolds optional */
}

// ---------------------------------------------------------------------------
// Designation tables

const FRONTS = {
  'северный': ['su-front-northern', 'Northern Front'],
  'северо-западный': ['su-front-northwestern', 'Northwestern Front'],
  'западный': ['su-front-western', 'Western Front'],
  'юго-западный': ['su-front-southwestern', 'Southwestern Front'],
  'южный': ['su-front-southern', 'Southern Front'],
  'резервный': ['su-front-reserve', 'Reserve Front'],
  'центральный': ['su-front-central', 'Central Front'],
  'брянский': ['su-front-bryansk', 'Bryansk Front'],
  'ленинградский': ['su-front-leningrad', 'Leningrad Front'],
  'карельский': ['su-front-karelian', 'Karelian Front'],
  'калининский': ['su-front-kalinin', 'Kalinin Front'],
  'волховский': ['su-front-volkhov', 'Volkhov Front'],
  'крымский': ['su-front-crimean', 'Crimean Front'],
  'закавказский': ['su-front-transcaucasian', 'Transcaucasian Front'],
  'кавказский': ['su-front-caucasian', 'Caucasian Front'],
  'северо-кавказский': ['su-front-north-caucasus', 'North Caucasus Front'],
  'сталинградский': ['su-front-stalingrad', 'Stalingrad Front'],
  'юго-восточный': ['su-front-southeastern', 'Southeastern Front'],
  'донской': ['su-front-don', 'Don Front'],
  'воронежский': ['su-front-voronezh', 'Voronezh Front'],
  'степной': ['su-front-steppe', 'Steppe Front'],
  'прибалтийский': ['su-front-baltic', 'Baltic Front'],
};
const NUMBERED_FRONTS = {
  'прибалтийский': ['baltic', 'Baltic'],
  'белорусский': ['belorussian', 'Belorussian'],
  'украинский': ['ukrainian', 'Ukrainian'],
};
const SKIP_FRONTS = /дальневосточн|забайкальск|московск|резерв ставки|зона обороны/;

const ORD = (n) => {
  const s = ['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : Math.min(n % 10, 4) % 4] ?? 'th';
  return `${n}${s}`;
};

// Division type abbreviations -> [en type word, unit type, slug part]
const DIV_TYPES = {
  'сд': ['Rifle', 'infantry', 'rifle-division'],
  'гсд': ['Mountain Rifle', 'infantry', 'mountain-rifle-division'],
  'кд': ['Cavalry', 'cavalry', 'cavalry-division'],
  'гкд': ['Mountain Cavalry', 'cavalry', 'mountain-cavalry-division'],
  'вдд': ['Airborne', 'infantry', 'airborne-division'],
  'мд': ['Motorized', 'motorized', 'motorized-division'],
  'мсд': ['Motor Rifle', 'motorized', 'motor-rifle-division'],
  'тд': ['Tank', 'armoured', 'tank-division'],
};
/** Tokens that are deliberately out of v1 scope (no report noise). */
const SKIP_TOKEN = /(бр|полк|УР|опаб|опулб|обс|орб|зап\.|б\/н|пд|тк|мк|ск|кк|оск|армии|остал|часть|части|погран|ОН|мкк|ид|управлен|дн|ад|бад|иад)/;

// ---------------------------------------------------------------------------
// Parsing

const stats = { months: 0, assignments: 0, unresolvedTokens: new Map(), createdUnits: new Map() };

function createUnit(id, skeleton) {
  if (!existingIds.has(id) && !stats.createdUnits.has(id)) stats.createdUnits.set(id, skeleton);
  return id;
}

function frontUnit(headerRaw) {
  const header = headerRaw.replace(/:$/, '').trim();
  if (SKIP_FRONTS.test(ru(header))) return null;
  const num = header.match(/^(\d)(?:-й)? ([А-Яа-яёЁ-]+) фронт/);
  if (num && NUMBERED_FRONTS[ru(num[2])]) {
    const [slug, en] = NUMBERED_FRONTS[ru(num[2])];
    const n = Number(num[1]);
    return createUnit(`su-front-${n}-${slug}`, {
      kind: 'front', name: `${ORD(n)} ${en} Front`, ru: header, type: 'hq',
    });
  }
  const m = header.match(/^([А-Яа-яёЁ-]+) фронт/);
  if (m && FRONTS[ru(m[1])]) {
    const [id, en] = FRONTS[ru(m[1])];
    return createUnit(id, { kind: 'front', name: en, ru: header, type: 'hq' });
  }
  return undefined; // unknown header — caller reports
}

function armyUnit(cell) {
  const t = cell.replace(/\s+/g, ' ').trim();
  if (/^всего/i.test(t)) return null; // per-front totals row
  if (/фронтового подчинения|армейского подчинения/.test(t)) return 'FRONT_DIRECT';
  if (/воздушная|сапер|зенитн|ПВО/.test(t)) return null; // air/engineer/AA armies
  let m;
  if ((m = t.match(/^(\d+)(?:-я)? армия/))) {
    return createUnit(`su-army-${m[1]}`, { kind: 'army', name: `${ORD(+m[1])} Army`, ru: t, type: 'hq' });
  }
  if ((m = t.match(/^(\d+)(?:-я)? гвардейская армия/))) {
    return createUnit(`su-gd-army-${m[1]}`, { kind: 'army', name: `${ORD(+m[1])} Guards Army`, ru: t, type: 'hq' });
  }
  if ((m = t.match(/^(\d+)(?:-я)? ударная армия/))) {
    return createUnit(`su-shock-army-${m[1]}`, { kind: 'army', name: `${ORD(+m[1])} Shock Army`, ru: t, type: 'hq' });
  }
  if ((m = t.match(/^(\d+)(?:-я)? гвардейская танковая армия/))) {
    return createUnit(`su-gd-tank-army-${m[1]}`, { kind: 'army', name: `${ORD(+m[1])} Guards Tank Army`, ru: t, type: 'armoured' });
  }
  if ((m = t.match(/^(\d+)(?:-я)? танковая армия/))) {
    return createUnit(`su-tank-army-${m[1]}`, { kind: 'army', name: `${ORD(+m[1])} Tank Army`, ru: t, type: 'armoured' });
  }
  if ((m = t.match(/^(\d+)(?:-я)? (отдельная )?резервная армия/))) {
    return createUnit(`su-reserve-army-${m[1]}`, { kind: 'army', name: `${ORD(+m[1])} Reserve Army`, ru: t, type: 'hq' });
  }
  if ((m = t.match(/^(\d+)(?:-я)? отдельная армия/))) {
    return createUnit(`su-army-${m[1]}`, { kind: 'army', name: `${ORD(+m[1])} Army`, ru: t, type: 'hq' });
  }
  if (/групп/.test(ru(t))) return 'FRONT_DIRECT'; // operational groups -> front level, v1
  return undefined;
}

function divisionUnit(n, guards, abbr) {
  const [en, type, slugPart] = DIV_TYPES[abbr];
  const key = `${n}|${guards ? 1 : 0}|${en.toLowerCase()}`;
  if (existing.has(key)) return existing.get(key);
  const id = `su-${ORD(n)}${guards ? '-guards' : ''}-${slugPart}`;
  return createUnit(id, {
    kind: 'division',
    name: `${ORD(n)} ${guards ? 'Guards ' : ''}${en} Division`,
    ru: `${n} ${guards ? 'гв. ' : ''}${abbr}`,
    type,
  });
}

const RIFLE_CORPS = {
  'ск': ['Rifle Corps', 'rifle-corps', 'infantry'],
  'кк': ['Cavalry Corps', 'cavalry-corps', 'cavalry'],
};

function rifleCorpsUnit(n, guards, abbr) {
  const [en, slugPart, type] = RIFLE_CORPS[abbr];
  const id = `su-${ORD(n)}${guards ? '-guards' : ''}-${slugPart}`;
  return createUnit(id, {
    kind: 'corps',
    name: `${ORD(n)} ${guards ? 'Guards ' : ''}${en}`,
    ru: `${n} ${guards ? 'гв. ' : ''}${abbr}`,
    type,
  });
}

/**
 * Expand a rifle/cavalry cell into { divisions, corps } where corps are
 * `{unit, divisions}` — the full chain front -> army -> corps -> division.
 */
function parseDivisions(cellRaw, report) {
  const cell = cellRaw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cell || cell === '–' || cell === '-') return { divisions: [], corps: [] };

  // Extract corps with their parenthesized members first:
  // "7 гв. ск (5 гв. сд, 112 сбр)" -> corps unit + members parsed inside.
  const corps = [];
  let rest = cell.replace(
    /(\d+)\s*(гв\.?\s*)?(ск|кк)\s*\(([^()]*)\)/g,
    (_, n, gv, abbr, inner) => {
      const unit = rifleCorpsUnit(Number(n), Boolean(gv), abbr);
      corps.push({ unit, divisions: parseList(inner, report) });
      return ', ';
    },
  );
  // Bare corps without listed members: "14 ск" (members listed elsewhere).
  rest = rest.replace(/(^|, ?)(\d+)\s*(гв\.?\s*)?(ск|кк)(?=,|$| )/g, (_, pre, n, gv, abbr) => {
    corps.push({ unit: rifleCorpsUnit(Number(n), Boolean(gv), abbr), divisions: [] });
    return pre;
  });

  return { divisions: parseList(rest, report), corps };
}

/** Token list -> division ids (right-to-left type propagation). */
function parseList(raw, report) {
  // Remaining (non-corps) parentheses unwrap into the flat list.
  let flat = raw.replace(/\(([^()]*)\)/g, ', $1, ');
  flat = flat.replace(/ и /g, ', ');

  const out = [];
  const tokens = flat.split(',').map((t) => t.trim()).filter(Boolean);
  let curType = null;
  let curGuards = false;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const tok = tokens[i];
    // Explicit type suffix: "243 сд", "59 гв. сд", "9 гв. кд"
    let m = tok.match(/^(\d+) (гв\.? )?(сд|гсд|кд|гкд|вдд|мд|мсд)( НКВД)?$/);
    if (m) {
      if (m[4]) continue; // NKVD divisions out of scope v1
      curType = m[3];
      curGuards = Boolean(m[2]);
      out.push(divisionUnit(Number(m[1]), curGuards, curType));
      continue;
    }
    // Guards-only token inherits the type from the right: "59 гв."
    m = tok.match(/^(\d+) гв\.?$/);
    if (m && curType) {
      out.push(divisionUnit(Number(m[1]), true, curType));
      curGuards = true;
      continue;
    }
    // Bare number inherits (type, guards): "54" in "54 и 59 гв., 243 сд".
    // curType is poisoned (null) left of a skipped group, so numbers that
    // belong to a brigade/corps list are dropped, never mis-typed.
    m = tok.match(/^(\d+)$/);
    if (m) {
      if (curType) out.push(divisionUnit(Number(m[1]), curGuards, curType));
      continue;
    }
    // Corps designators and everything out of scope: skip and poison.
    if (SKIP_TOKEN.test(tok) || /^[–-]$/.test(tok)) {
      curType = null;
      curGuards = false;
      continue;
    }
    curType = null;
    curGuards = false;
    report.set(tok, (report.get(tok) ?? 0) + 1);
  }
  return out.reverse();
}

const ARMOR_CORPS = {
  'тк': ['Tank Corps', 'tank-corps', 'armoured'],
  'мк': ['Mechanized Corps', 'mechanized-corps', 'motorized'],
};
// Tank/mech/motor-rifle BRIGADES — the Red Army's operational armour before the
// tank corps/armies formed (independent under armies in 1941-42, or components
// of a tank/mech corps later). Infantry brigades (сбр/лыжбр/морская) stay out
// of scope (rifle divisions cover infantry).
const ARMOR_BRIGADES = {
  'тбр': ['Tank Brigade', 'tank-brigade', 'armoured'],
  'мбр': ['Mechanized Brigade', 'mechanized-brigade', 'motorized'],
  'мсбр': ['Motor Rifle Brigade', 'motor-rifle-brigade', 'motorized'],
};
// No \b after Cyrillic — JS word boundaries are ASCII-only; use substrings/$.
const ARMOR_SKIP = /(сбр|лыжбр|истр|тп$|отп|сап|отб|обб|одн|дн$|мдн|полк|бронепоезд|бепо|мцп|мцб|батал|рота|завод|УР|б\/н|зенап|аап|пап$|иптап|мп$)/;

function armorCorpsUnit(n, guards, abbr) {
  const [en, slugPart, type] = ARMOR_CORPS[abbr];
  const id = `su-${ORD(n)}${guards ? '-guards' : ''}-${slugPart}`;
  return createUnit(id, {
    kind: 'corps',
    name: `${ORD(n)} ${guards ? 'Guards ' : ''}${en}`,
    ru: `${n} ${guards ? 'гв. ' : ''}${abbr}`,
    type,
  });
}

function brigadeUnit(n, guards, abbr) {
  const [en, slugPart, type] = ARMOR_BRIGADES[abbr];
  const id = `su-${ORD(n)}${guards ? '-guards' : ''}-${slugPart}`;
  return createUnit(id, {
    kind: 'brigade',
    name: `${ORD(n)} ${guards ? 'Guards ' : ''}${en}`,
    ru: `${n} ${guards ? 'гв. ' : ''}${abbr}`,
    type,
  });
}

/** Tank/mech division + tank/mech/motor-rifle brigade tokens (right-to-left
 *  type propagation), for both the army-level list and a corps' members. */
function parseArmorList(raw, report) {
  let flat = raw.replace(/\(([^()]*)\)/g, ', $1, ').replace(/ и /g, ', ');
  const out = [];
  const tokens = flat.split(',').map((t) => t.trim()).filter(Boolean);
  let cur = null; // { make, abbr, guards }
  for (let i = tokens.length - 1; i >= 0; i--) {
    const tok = tokens[i];
    let m = tok.match(/^(\d+) (гв\.? )?(тд|мд)$/);
    if (m) {
      cur = { make: divisionUnit, abbr: m[3], guards: Boolean(m[2]) };
      out.push(divisionUnit(Number(m[1]), cur.guards, cur.abbr));
      continue;
    }
    m = tok.match(/^(\d+) (гв\.? )?(тбр|мсбр|мбр)$/);
    if (m) {
      cur = { make: brigadeUnit, abbr: m[3], guards: Boolean(m[2]) };
      out.push(brigadeUnit(Number(m[1]), cur.guards, cur.abbr));
      continue;
    }
    m = tok.match(/^(\d+)( гв\.?)?$/);
    if (m) {
      if (!cur) continue; // left of a skipped group: dropped, never mis-typed
      out.push(cur.make(Number(m[1]), Boolean(m[2]) || cur.guards, cur.abbr));
      continue;
    }
    cur = null;
    if (!ARMOR_SKIP.test(tok) && !/^[–-]$/.test(tok)) {
      report.set(`ARMOR? ${tok}`, (report.get(`ARMOR? ${tok}`) ?? 0) + 1);
    }
  }
  return out.reverse();
}

/** Armoured cell -> { loose: [ids], corps: [{unit, divisions}] } — tank/mech
 *  corps with their brigade/division members, plus independent armour. */
function parseArmor(cellRaw, report) {
  const cell = cellRaw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cell || cell === '–' || cell === '-') return { loose: [], corps: [] };

  const corps = [];
  let rest = cell.replace(/(\d+)\s*(гв\.?\s*)?(тк|мк)\s*\(([^()]*)\)/g, (_, n, gv, abbr, inner) => {
    corps.push({ unit: armorCorpsUnit(Number(n), Boolean(gv), abbr), divisions: parseArmorList(inner, report) });
    return ', ';
  });
  rest = rest.replace(/(^|, ?)(\d+)\s*(гв\.?\s*)?(тк|мк)(?=,|$| )/g, (_, pre, n, gv, abbr) => {
    corps.push({ unit: armorCorpsUnit(Number(n), Boolean(gv), abbr), divisions: [] });
    return pre;
  });
  return { loose: parseArmorList(rest, report), corps };
}

function parseMonth(file) {
  const html = decoder.decode(readFileSync(join(RAW_DIR, file)));
  const date = `${file.slice(0, 4)}-${file.slice(4, 6)}-${file.slice(6, 8)}`;
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? [];

  const entries = [];
  let inActive = false;
  let front = null;
  for (const row of rows) {
    const cells = (row.match(/<td[^>]*>[\s\S]*?<\/td>/g) ?? []).map((c) =>
      c.replace(/^<td[^>]*>|<\/td>$/g, ''),
    );
    const text = (c) => c.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    if (cells.length === 1) {
      const t = text(cells[0]);
      if (/^1\./.test(t)) inActive = true;
      else if (/^[23]\./.test(t)) inActive = false;
      else if (inActive && /фронт:?$/i.test(t)) {
        front = frontUnit(t);
        if (front === undefined) {
          stats.unresolvedTokens.set(`FRONT? ${t}`, (stats.unresolvedTokens.get(`FRONT? ${t}`) ?? 0) + 1);
          front = null;
        }
      } else if (inActive && /отдельные армии/i.test(ru(t))) {
        front = null; // separate armies: list-only at v1
      }
      continue;
    }
    if (!inActive || cells.length < 2 || !front) continue;

    const army = armyUnit(text(cells[0]));
    if (army === undefined) {
      const t = text(cells[0]);
      if (t && !/^Наименование/.test(t)) {
        stats.unresolvedTokens.set(`ARMY? ${t}`, (stats.unresolvedTokens.get(`ARMY? ${t}`) ?? 0) + 1);
      }
      continue;
    }
    if (army === null) continue;

    const { divisions, corps } = parseDivisions(cells[1], stats.unresolvedTokens);
    const armor = cells[3] ? parseArmor(cells[3], stats.unresolvedTokens) : { loose: [], corps: [] };
    const allCorps = [...corps, ...armor.corps];
    if (!divisions.length && !allCorps.length && !armor.loose.length && army === 'FRONT_DIRECT') continue;
    entries.push({
      front,
      army: army === 'FRONT_DIRECT' ? null : army,
      divisions,
      corps: allCorps,
      armor: armor.loose,
    });
    stats.assignments +=
      divisions.length + armor.loose.length + allCorps.reduce((s, c) => s + 1 + c.divisions.length, 0);
  }
  stats.months++;
  return { date, entries };
}

// ---------------------------------------------------------------------------
// Run

const files = readdirSync(RAW_DIR).filter((f) => /^\d{8}\.html$/.test(f)).sort();
const months = files.map(parseMonth);

// Skeletons for everything new this parse discovered.
const created = [...stats.createdUnits.entries()].map(([id, s]) => ({
  id,
  country: 'SU',
  branch: 'rkka',
  echelon: s.kind,
  type: s.type,
  short: s.kind === 'division' ? s.name.replace(/(\d+\w\w).*/, '$1') : s.name.replace(/ (Front|Army)$/, ''),
  names: [{ from: '1941-06-22', name: s.name, aliases: s.ru ? [s.ru] : [] }],
  existence: [{ from: '1941-06-22' }],
  parents: [],
  positions: [],
  links: {},
  imported: true,
  notes:
    'Identity from the monthly Boevoi sostav Sovetskoi Armii listings (auto-parsed). Lifecycle dates are placeholders; multiple formations under one number are not yet distinguished.',
}));

mkdirSync(join(UNITS_DIR, 'oob'), { recursive: true });
writeFileSync(
  OUT,
  JSON.stringify(
    {
      note: 'Generated by import-bs.mjs from Boevoi sostav Sovetskoi Armii (teatrskazka transcription via Wayback). Do not hand-edit.',
      source: 'boevoi-sostav-sa',
      months,
      units: created.sort((a, b) => a.id.localeCompare(b.id)),
    },
    null,
    1,
  ),
);

console.log(
  `Parsed ${stats.months} months, ${stats.assignments} division-assignments, ` +
    `${created.length} new unit skeletons -> ${OUT}`,
);
const unresolved = [...stats.unresolvedTokens.entries()].sort((a, b) => b[1] - a[1]);
console.log(`Unresolved tokens: ${unresolved.length} distinct`);
for (const [tok, n] of unresolved.slice(0, 25)) console.log(`  ${n}× ${tok}`);

// Air-formation scaffold importer (theater-wide air, Track 1). Wikidata items for
// Luftwaffe and Soviet VVS flying formations -> identity-only skeletons flagged
// `air:true`: identity, coarse lifecycle, links — NO positions. Makes every air
// formation *findable* (search + honest "not mapped yet" page, disc glyph in the
// panel). Curated air files (data/curated/units/{de,su}/de-lw-*, su-va-* …) win by
// QID and by normalized name (nicknames/quotes stripped), same as import-divisions.
//
// Input : data/raw/wikidata-air-{de,su}.json   (SPARQL, see README)
//   DE: ?item wdt:P241 wd:Q2564009 (Luftwaffe) ; P31/P279* military unit
//   SU: ?item wdt:P17 wd:Q15180 (USSR) ; P31/P279* military unit ; class ~ aviation
// Output: data/curated/units/imported-air.json (single reviewable file)
//
// Run: node data/pipeline/import-air.mjs

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const UNITS_DIR = 'data/curated/units';
const OUT = join(UNITS_DIR, 'imported-air.json');

const fold = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[łŁ]/g, 'l').toLowerCase();
// Drop quoted nicknames + parentheticals so 'Kampfgeschwader 55 "Greif"' (curated)
// dedupes against Wikidata's bare 'Kampfgeschwader 55'.
const stripNick = (s) =>
  fold(s).replace(/["“”«»][^"“”«»]*["“”«»]/g, '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();

// Curated units win: collect their QIDs + all names/aliases (folded + stripped).
const curatedQids = new Set();
const curatedNames = new Set();
for (const dir of readdirSync(UNITS_DIR, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  for (const file of readdirSync(join(UNITS_DIR, dir.name))) {
    if (!file.endsWith('.json')) continue;
    const u = JSON.parse(readFileSync(join(UNITS_DIR, dir.name, file), 'utf8'));
    if (u.links?.wikidata) curatedQids.add(u.links.wikidata);
    for (const n of u.names ?? []) {
      for (const name of [n.name, ...(n.aliases ?? [])]) {
        curatedNames.add(fold(name));
        curatedNames.add(stripNick(name));
      }
    }
  }
}

// --- classification: name -> {echelon, type} or null (not a flying formation) ---

function classifyDE(name) {
  const l = name.toLowerCase();
  // Non-flying / non-combat Luftwaffe formations (ground / AA / training /
  // replacement / ferry / target-towing / support) — skip.
  if (/feld-?division|luftwaffen-?feld|fallschirm|paratroop|\bflak|ausbildung|erg[äa]nzung|ersatz|flugzeug[üu]berf|[üu]berf[üu]hrung|fliegerziel|zielgeschwader|nachrichten|bodenst[äa]nd|sturmregiment|luftgau|festung|bau-?bataillon|wachbataillon/i.test(l))
    return null;
  let echelon = null;
  if (/luftflotte/i.test(l)) echelon = 'army';
  else if (/fliegerkorps|flieger-korps/i.test(l)) echelon = 'corps';
  else if (/fliegerdivision|flieger-division|fliegerf[üu]hrer/i.test(l)) echelon = 'division';
  else if (/geschwader/i.test(l)) echelon = 'division';
  else if (/gruppe/i.test(l) && /(geschwader|aufkl|jagd|kampf|sturzkampf|schlacht|zerst|nachtjagd|transport|stuka)/i.test(l))
    echelon = 'regiment';
  else if (/staffel/i.test(l) && /(geschwader|aufkl|jagd|kampf|sturzkampf|schlacht|zerst|nachtjagd|transport|stuka)/i.test(l))
    echelon = 'battalion';
  else return null;

  let type = 'fighter';
  if (/nachtjagd/i.test(l)) type = 'night-fighter';
  else if (/zerst[öo]rer/i.test(l)) type = 'heavy-fighter';
  else if (/sturzkampf|stuka/i.test(l)) type = 'dive-bomber';
  else if (/schlacht/i.test(l)) type = 'ground-attack';
  else if (/kampf/i.test(l)) type = 'bomber';
  else if (/jagd/i.test(l)) type = 'fighter';
  else if (/transport/i.test(l)) type = 'transport';
  else if (/aufkl/i.test(l)) type = 'recon';
  else if (/lehrgeschwader/i.test(l)) type = 'fighter';
  // Commands fly nothing themselves.
  if (echelon === 'army' || echelon === 'corps' || /fliegerdivision|flieger-division|fliegerf[üu]hrer/i.test(l))
    type = 'air-hq';
  return { echelon, type };
}

function classifySU(name) {
  const l = name.toLowerCase();
  let echelon = null;
  if (/air army/i.test(l) || /воздушн\w* арми/i.test(name)) echelon = 'army';
  else if (/aviation corps/i.test(l) || /авиа\w*корпус|авиационный корпус/i.test(name)) echelon = 'corps';
  else if (/aviation division|air division/i.test(l) || /авиа\w*дивизи|авиационная дивизи/i.test(name)) echelon = 'division';
  else if (/aviation regiment|air regiment/i.test(l) || /авиа\w*полк|авиационный полк/i.test(name)) echelon = 'regiment';
  else if (/aviation group/i.test(l)) echelon = 'regiment';
  else return null;

  // Training / school / reserve aviation — low value as scaffolds, skip.
  if (/\bschool|training|reserve|школьн|учебн|запасн/i.test(name)) return null;
  let type = 'fighter';
  if (/assault|штурмов/i.test(name)) type = 'ground-attack';
  else if (/night bomber|long-?range|bomber|бомбардировочн|бомбардировщ/i.test(name)) type = 'bomber';
  else if (/fighter|истребительн/i.test(name)) type = 'fighter';
  else if (/reconn|разведыв/i.test(name)) type = 'recon';
  else if (/transport|транспортн/i.test(name)) type = 'transport';
  else if (/mixed|composite|смешанн/i.test(name)) type = 'fighter';
  if (echelon === 'army' || echelon === 'corps') type = 'air-hq';
  return { echelon, type };
}

// --- short map labels ------------------------------------------------------

const roman = (s, kw) => (s.match(new RegExp(`\\b([IVX]+)\\.?\\s*${kw}`, 'i')) ?? [])[1];

// Luftwaffe Geschwader abbreviation from the NAME (not the type) so Lehr-/Nacht-
// variants don't collapse onto JG/KG.
const GABBR = [
  [/nachtjagdgeschwader/i, 'NJG'],
  [/jagdgeschwader/i, 'JG'],
  [/sturzkampfgeschwader/i, 'StG'],
  [/nachtschlacht/i, 'NSG'],
  [/schlachtgeschwader/i, 'SG'],
  [/zerst[öo]rergeschwader/i, 'ZG'],
  [/kampfgeschwader/i, 'KG'],
  [/transportgeschwader/i, 'TG'],
  [/lehrgeschwader/i, 'LG'],
];
function shortDE(name, type, echelon) {
  const num = (name.match(/(\d+)/) ?? [])[1];
  if (echelon === 'army') return num ? `LF ${num}` : 'Luftflotte';
  if (echelon === 'corps') { const r = roman(name, 'flieger'); return r ? `${r}. FK` : num ? `${num}. FK` : 'FK'; }
  if (/fliegerdivision|flieger-division/i.test(name)) return num ? `${num}. FlDiv` : 'FlDiv';
  if (/fliegerf[üu]hrer/i.test(name)) return 'FlFü';
  let abbr = GABBR.find(([re]) => re.test(name))?.[1];
  if (!abbr && /aufkl/i.test(name)) abbr = 'Aufkl';
  if (!abbr) abbr = { fighter: 'JG', bomber: 'KG', 'dive-bomber': 'StG', 'ground-attack': 'SG', 'heavy-fighter': 'ZG', 'night-fighter': 'NJG', transport: 'TG', recon: 'Aufkl' }[type] || 'G';
  const grp = roman(name, '(?:gruppe|/)');
  if (echelon === 'regiment' && grp) return `${grp}./${abbr} ${num ?? ''}`.trim();
  return num ? `${abbr} ${num}` : name.slice(0, 12);
}

function shortSU(name, type, echelon) {
  const num = (name.match(/(\d+)/) ?? [])[1];
  const gd = /guards|гвард/i.test(name) ? 'Gv ' : '';
  if (echelon === 'army') return num ? `${num} VA` : 'VA';
  if (echelon === 'corps') return num ? `${num} ${gd}AK` : 'AK';
  const DIV = { fighter: 'IAD', 'ground-attack': 'ShAD', bomber: 'BAD', recon: 'RAD', transport: 'TAD' };
  const REG = { fighter: 'IAP', 'ground-attack': 'ShAP', bomber: 'BAP', recon: 'RAP', transport: 'TAP' };
  const abbr = (echelon === 'division' ? DIV : REG)[type] || (echelon === 'division' ? 'AD' : 'AP');
  return num ? `${num} ${gd}${abbr}` : name.slice(0, 12);
}

// Slug from the readable short (e.g. "JG 26" -> de-lw-jg-26, "101 IAD" ->
// su-vvs-101-iad) so Cyrillic-named units get stable, readable ids instead of
// collapsing to their bare number. Falls back to the folded name if the short
// carries no letters.
function slugOf(country, short, name) {
  const prefix = country === 'SU' ? 'su-vvs-' : 'de-lw-';
  const base = fold(short).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (base && /[a-z]/.test(base)) return prefix + base;
  return (
    prefix +
    fold(name).replace(/["“”«»]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)
  );
}

// Representative aircraft per role + nation (catalog ids in src/data/aircraft.ts).
// Identity scaffolds carry no strength returns, so these are the *typical* types
// flown by a formation of this role/era — enough for the range ring + an honest
// "representative aircraft" panel, not an exact inventory.
const REP_AIRCRAFT = {
  SU: {
    fighter: ['yak-9', 'la-5'],
    'ground-attack': ['il-2'],
    bomber: ['pe-2', 'il-4'],
    'dive-bomber': ['pe-2'],
    'heavy-fighter': ['yak-9'],
    'night-fighter': ['po-2'],
    recon: ['pe-2'],
    transport: [],
    'air-hq': ['yak-9', 'il-2'],
  },
  DE: {
    fighter: ['bf-109g', 'fw-190a'],
    'heavy-fighter': ['bf-110'],
    'dive-bomber': ['ju-87d'],
    'ground-attack': ['fw-190a', 'ju-87g', 'hs-129'],
    bomber: ['he-111h', 'ju-88a'],
    'night-fighter': ['bf-110'],
    recon: ['fw-189'],
    transport: ['ju-52'],
    'air-hq': ['bf-109g', 'ju-87d'],
  },
};
const repAircraft = (country, type) => (REP_AIRCRAFT[country]?.[type] ?? []).map((id) => ({ id }));

const dateOf = (b) => (b && /^\d{4}-\d{2}-\d{2}/.test(b.value) ? b.value.slice(0, 10) : null);

const skeletons = new Map();
const stats = { rows: 0, notAir: 0, noLabel: 0, postWar: 0, dupCurated: 0, kept: 0 };

for (const country of ['DE', 'SU']) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(`data/raw/wikidata-air-${country.toLowerCase()}.json`, 'utf8'));
  } catch {
    console.log(`No data/raw/wikidata-air-${country.toLowerCase()}.json — skipping ${country}.`);
    continue;
  }
  for (const row of raw.results.bindings) {
    stats.rows++;
    const qid = row.item.value.split('/').pop();
    const nameEn = row.nameEn?.value;
    const nameNative = (country === 'DE' ? row.nameDe : row.nameRu)?.value;
    const name = nameEn || nameNative;
    if (skeletons.has(qid)) {
      const s = skeletons.get(qid);
      for (const extra of [nameEn, nameNative]) {
        if (extra && extra !== s.names[0].name && !s.names[0].aliases.includes(extra)) s.names[0].aliases.push(extra);
      }
      if (!s.links['wikipedia.en'] && row.article?.value) s.links['wikipedia.en'] = row.article.value;
      continue;
    }
    if (!name || /^Q\d+$/.test(name)) { stats.noLabel++; continue; }

    const cls = country === 'DE' ? classifyDE(name) : classifySU(name);
    if (!cls) { stats.notAir++; continue; }

    const inception = dateOf(row.inception);
    const dissolved = dateOf(row.dissolved);
    const inceptionY = inception ? Number(inception.slice(0, 4)) : null;
    const dissolvedY = dissolved ? Number(dissolved.slice(0, 4)) : null;
    const ww2 = row.ww2?.value === 'true';
    // DE Luftwaffe (Q2564009) is the WW2 air force; keep unless explicitly post-war.
    // SU keeps WW2-flagged or inception<=1945 (drops Cold-War-only + dateless).
    const inWindow =
      country === 'DE'
        ? inceptionY === null || (inceptionY <= 1945 && (dissolvedY === null || dissolvedY >= 1935))
        : ww2 || (inceptionY !== null && inceptionY <= 1945 && (dissolvedY === null || dissolvedY >= 1938));
    if (!inWindow) { stats.postWar++; continue; }

    if (curatedQids.has(qid) || curatedNames.has(fold(name)) || curatedNames.has(stripNick(name))) {
      stats.dupCurated++;
      continue;
    }

    const from = inception ?? '1939-09-01';
    const existence = { from };
    if (dissolved && dissolved > from) existence.to = dissolved;
    const links = { wikidata: qid };
    if (row.article?.value) links['wikipedia.en'] = row.article.value;
    const aliases = [];
    for (const extra of [nameEn, nameNative]) if (extra && extra !== name) aliases.push(extra);
    const short = country === 'SU' ? shortSU(name, cls.type, cls.echelon) : shortDE(name, cls.type, cls.echelon);

    skeletons.set(qid, {
      id: slugOf(country, short, name),
      country,
      branch: country === 'SU' ? 'vvs' : 'luftwaffe',
      echelon: cls.echelon,
      type: cls.type,
      air: true,
      aircraft: repAircraft(country, cls.type),
      short,
      names: [{ from, name, aliases }],
      existence: [existence],
      parents: [],
      positions: [],
      links,
      imported: true,
      notes:
        'Auto-imported from Wikidata (air identity scaffold): lifecycle coarse/unverified, no mapped position yet. Curating means authoring a file under data/curated/units/ — it replaces this scaffold.',
    });
    stats.kept++;
  }
}

// Slug collisions (homonyms): disambiguate with the QID.
const byId = new Map();
for (const s of skeletons.values()) {
  if (byId.has(s.id)) {
    const other = byId.get(s.id);
    if (!other._disambiguated) {
      byId.delete(other.id);
      other.id = `${other.id}-${other.links.wikidata.toLowerCase()}`;
      other._disambiguated = true;
      byId.set(other.id, other);
    }
    s.id = `${s.id}-${s.links.wikidata.toLowerCase()}`;
    s._disambiguated = true;
  }
  byId.set(s.id, s);
}
const out = [...byId.values()].map(({ _disambiguated, ...s }) => s).sort((a, b) => a.id.localeCompare(b.id));

writeFileSync(
  OUT,
  JSON.stringify({ note: 'Generated by import-air.mjs — do not hand-edit; curate units as files under {country}/ instead.', units: out }, null, 1),
);
console.log(
  `Imported ${out.length} air scaffolds -> ${OUT}\n` +
    `  rows ${stats.rows}, skipped: ${stats.notAir} non-flying, ${stats.noLabel} unlabeled, ${stats.postWar} outside WW2 window, ${stats.dupCurated} already curated`,
);
const by = {};
for (const s of out) by[`${s.country}/${s.echelon}`] = (by[`${s.country}/${s.echelon}`] ?? 0) + 1;
console.log('  ' + Object.entries(by).sort().map(([k, n]) => `${k}: ${n}`).join(', '));

// Division scaffold importer (Phase 3.1). Wikidata division items for Nazi
// Germany and the USSR -> skeleton unit records: identity, coarse lifecycle,
// links — NO positions. Skeletons make every division *findable* (search +
// honest "not mapped yet" page); position curation promotes a unit to a
// hand-authored file under data/curated/units/{country}/ which then takes
// precedence (dedupe by QID and by normalized name vs curated aliases).
//
// Input : data/raw/wikidata-divisions-{de,su}.json   (SPARQL, see README)
// Output: data/curated/units/imported-divisions.json (single reviewable file)
//
// Run: node data/pipeline/import-divisions.mjs

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const UNITS_DIR = 'data/curated/units';
const OUT = join(UNITS_DIR, 'imported-divisions.json');

const fold = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[łŁ]/g, 'l')
    .toLowerCase();

// Curated units win: collect their QIDs and all names/aliases.
const curatedQids = new Set();
const curatedNames = new Set();
for (const dir of readdirSync(UNITS_DIR, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  for (const file of readdirSync(join(UNITS_DIR, dir.name))) {
    if (!file.endsWith('.json')) continue;
    const u = JSON.parse(readFileSync(join(UNITS_DIR, dir.name, file), 'utf8'));
    if (u.links?.wikidata) curatedQids.add(u.links.wikidata);
    for (const n of u.names ?? []) {
      curatedNames.add(fold(n.name));
      for (const a of n.aliases ?? []) curatedNames.add(fold(a));
    }
  }
}

function typeOf(name) {
  if (/panzergrenadier|motori[sz]ed|motor rifle|mechani/i.test(name)) return 'motorized';
  if (/panzer|tank/i.test(name)) return 'armoured';
  if (/cavalry/i.test(name)) return 'cavalry';
  if (/artillery|flak|mortar|rocket/i.test(name)) return 'artillery';
  return 'infantry';
}

function branchOf(country, name, branchLabel) {
  if (country === 'SU') return 'rkka';
  const hay = `${name} ${branchLabel ?? ''}`;
  if (/\bSS\b|waffen/i.test(hay)) return 'waffen-ss';
  if (/luftwaffe|parachute|fallschirm|air landing|field division/i.test(hay)) return 'luftwaffe-field';
  if (/kriegsmarine|naval/i.test(hay)) return 'kriegsmarine';
  return 'heer';
}

const ABBR = {
  DE: { armoured: 'Pz', motorized: 'PzG', infantry: 'ID', cavalry: 'KD', artillery: 'Art' },
  SU: { armoured: 'TD', motorized: 'MD', infantry: 'SD', cavalry: 'CD', artillery: 'AD' },
};

function shortOf(country, name, type) {
  const num = name.match(/^(\d+)/)?.[1];
  if (!num) return name.replace(/ \(.*\)$/, '').slice(0, 14);
  if (country === 'SU' && /guards/i.test(name)) return `${num} Gv`;
  return `${num} ${ABBR[country][type]}`;
}

function slugOf(country, name) {
  return (
    country.toLowerCase() +
    '-' +
    fold(name)
      .replace(/ \(.*\)$/, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60)
  );
}

const skeletons = new Map();
const stats = { rows: 0, noLabel: 0, postWar: 0, dupCurated: 0, kept: 0 };

for (const country of ['DE', 'SU']) {
  const raw = JSON.parse(
    readFileSync(`data/raw/wikidata-divisions-${country.toLowerCase()}.json`, 'utf8'),
  );
  for (const row of raw.results.bindings) {
    stats.rows++;
    const qid = row.item.value.split('/').pop();
    if (skeletons.has(qid)) {
      // Merge extra rows for the same item (e.g. several branch labels).
      const s = skeletons.get(qid);
      const native = row.nameNative?.value;
      if (native && !s.names[0].aliases.includes(native)) s.names[0].aliases.push(native);
      if (!s.links['wikipedia.en'] && row.article?.value) s.links['wikipedia.en'] = row.article.value;
      continue;
    }
    const name = row.nameEn?.value;
    if (!name || /^Q\d+$/.test(name)) {
      stats.noLabel++;
      continue;
    }

    // Wikidata "unknown value" serializes as a genid URI, not a date.
    const dateOf = (b) => (b && /^\d{4}-\d{2}-\d{2}/.test(b.value) ? b.value.slice(0, 10) : null);
    const inception = dateOf(row.inception);
    const dissolved = dateOf(row.dissolved);

    // WW2 window: explicit P607 WW2, or inception <= 1945 with dissolution
    // not before 1938. Nazi-German items are period by definition of P17.
    const ww2 = row.ww2?.value === 'true';
    const inceptionY = inception ? Number(inception.slice(0, 4)) : null;
    const dissolvedY = dissolved ? Number(dissolved.slice(0, 4)) : null;
    const inWindow =
      ww2 ||
      country === 'DE' ||
      (inceptionY !== null && inceptionY <= 1945 && (dissolvedY === null || dissolvedY >= 1938));
    if (!inWindow) {
      stats.postWar++;
      continue;
    }

    if (curatedQids.has(qid) || curatedNames.has(fold(name))) {
      stats.dupCurated++;
      continue;
    }

    const type = typeOf(name);
    const from = inception ?? '1939-09-01';
    const existence = { from };
    if (dissolved && dissolved > from) existence.to = dissolved;
    const links = { wikidata: qid };
    if (row.article?.value) links['wikipedia.en'] = row.article.value;

    skeletons.set(qid, {
      id: slugOf(country, name),
      country,
      branch: branchOf(country, name, row.branchLabel?.value),
      echelon: 'division',
      type,
      short: shortOf(country, name, type),
      names: [
        {
          from,
          name,
          aliases: row.nameNative?.value && row.nameNative.value !== name ? [row.nameNative.value] : [],
        },
      ],
      existence: [existence],
      parents: [],
      positions: [],
      links,
      imported: true,
      notes:
        'Auto-imported from Wikidata (identity scaffold): lifecycle dates coarse/unverified, no mapped positions yet. Curating this unit means authoring a file under data/curated/units/ — it will replace this scaffold.',
    });
    stats.kept++;
  }
}

// Readable-slug collisions (homonym divisions): disambiguate with the QID.
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
const out = [...byId.values()]
  .map(({ _disambiguated, ...s }) => s)
  .sort((a, b) => a.id.localeCompare(b.id));

writeFileSync(OUT, JSON.stringify({ note: 'Generated by import-divisions.mjs — do not hand-edit; curate units as files under {country}/ instead.', units: out }, null, 1));
console.log(
  `Imported ${out.length} division scaffolds -> ${OUT}\n` +
    `  rows ${stats.rows}, skipped: ${stats.noLabel} unlabeled, ${stats.postWar} outside WW2 window, ${stats.dupCurated} already curated`,
);
const byCountry = {};
for (const s of out) byCountry[s.country] = (byCountry[s.country] ?? 0) + 1;
console.log('  ' + Object.entries(byCountry).map(([c, n]) => `${c}: ${n}`).join(', '));

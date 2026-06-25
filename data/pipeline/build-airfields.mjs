// Airfield ETL (air forces): curated airfield catalog -> public catalog + a
// point GeoJSON for the map layer. Validates ids/coords and (best-effort) that
// every air-unit `base` reference resolves to a catalog id, so dangling bases
// surface here rather than silently dropping a unit's position in build-units.
//
// Input : data/curated/airfields/eastern.json
//         data/curated/units/{de,su,...}/*.json  (for the base referential check)
// Output: public/data/airfields/eastern.json      (committed; catalog for search/panel)
//         public/data/airfields/eastern.geojson   (committed; map point source)
//
// Run BEFORE build-units (build-units reads the curated catalog to resolve a
// keyframe's `base` -> coords): node data/pipeline/build-airfields.mjs

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const IN = 'data/curated/airfields/eastern.json';
const UNITS_DIR = 'data/curated/units';
const OUT_DIR = 'public/data/airfields';
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const round = (n) => Number(n.toFixed(3));
const errors = [];

const catalog = JSON.parse(readFileSync(IN, 'utf8')).airfields ?? [];
const byId = new Map();

for (const af of catalog) {
  if (!af.id || typeof af.id !== 'string') errors.push(`airfield missing id: ${JSON.stringify(af)}`);
  if (byId.has(af.id)) errors.push(`${af.id}: duplicate id`);
  byId.set(af.id, af);
  if (!Number.isFinite(af.lon) || !Number.isFinite(af.lat)) errors.push(`${af.id}: non-finite coords`);
  if (af.lon < -25 || af.lon > 60 || af.lat < 30 || af.lat > 72) errors.push(`${af.id}: coords outside Europe bbox`);
  for (const n of af.names ?? []) {
    if (!ISO.test(n.from)) errors.push(`${af.id}: name.from "${n.from}" not ISO`);
  }
}

// Referential check: every air-unit position `base` must exist in the catalog.
let baseRefs = 0;
for (const dir of readdirSync(UNITS_DIR, { withFileTypes: true })) {
  if (!dir.isDirectory() || dir.name === 'oob' || dir.name === 'registry') continue;
  for (const file of readdirSync(join(UNITS_DIR, dir.name))) {
    if (!file.endsWith('.json')) continue;
    let u;
    try {
      u = JSON.parse(readFileSync(join(UNITS_DIR, dir.name, file), 'utf8'));
    } catch {
      continue;
    }
    if (!u.air) continue;
    for (const p of u.positions ?? []) {
      if (!p.base) continue;
      baseRefs++;
      if (!byId.has(p.base)) errors.push(`${u.id}: position references unknown airfield "${p.base}"`);
    }
  }
}

if (errors.length) {
  console.error(`build-airfields: ${errors.length} error(s):`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}

// Compact catalog (flat fields the loader expects).
const flat = catalog.map((af) => ({
  id: af.id,
  name: af.name,
  lon: round(af.lon),
  lat: round(af.lat),
  country: af.country ?? '',
  ...(af.notes ? { notes: af.notes } : {}),
}));

const features = flat.map((af) => ({
  type: 'Feature',
  properties: { id: af.id, name: af.name, country: af.country },
  geometry: { type: 'Point', coordinates: [af.lon, af.lat] },
}));

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/eastern.json`, JSON.stringify({ airfields: flat }));
writeFileSync(`${OUT_DIR}/eastern.geojson`, JSON.stringify({ type: 'FeatureCollection', features }));

console.log(`Wrote ${flat.length} airfields (${baseRefs} air-unit base references resolved).`);

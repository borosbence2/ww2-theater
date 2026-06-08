// ETL: Natural Earth populated places -> a compact Europe cities GeoJSON with
// capital flags, population and scalerank (for zoom-dependent label density),
// applying period (WWII-era) name overrides.
//
// Input : data/raw/ne_10m_populated_places.geojson   (download, gitignored)
// Output: public/data/cities/cities.geojson          (committed)
//
// Fetch the raw source once, then run:
//   curl -o data/raw/ne_10m_populated_places.geojson \
//     https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places.geojson
//   node data/pipeline/build-cities.mjs
//
// Source: Natural Earth (public domain). See DATA_SOURCES.md.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const IN = 'data/raw/ne_10m_populated_places.geojson';
const OUT_DIR = 'public/data/cities';

const BBOX = { minLon: -25, minLat: 30, maxLon: 60, maxLat: 72 };
const MAX_SCALERANK = 7; // drop the least-significant places

// Period (WWII-era) names, keyed by Natural Earth NAMEASCII.
const WWII_NAMES = {
  Volgograd: 'Stalingrad',
  'St. Petersburg': 'Leningrad',
  Kaliningrad: 'Königsberg',
  Gdansk: 'Danzig',
  Wroclaw: 'Breslau',
  Chisinau: 'Kishinev',
  'Nizhny Novgorod': 'Gorky',
  Samara: 'Kuybyshev',
};

const round = (n) => Number(n.toFixed(3));

const gj = JSON.parse(readFileSync(IN, 'utf8'));
const out = [];
const matched = new Set();

for (const f of gj.features) {
  const [lon, lat] = f.geometry.coordinates;
  if (lon < BBOX.minLon || lon > BBOX.maxLon || lat < BBOX.minLat || lat > BBOX.maxLat) continue;
  const p = f.properties;
  if (p.SCALERANK > MAX_SCALERANK) continue;

  const override = WWII_NAMES[p.NAMEASCII];
  if (override) matched.add(p.NAMEASCII);

  out.push({
    type: 'Feature',
    properties: {
      name: override ?? p.NAME,
      country: p.ADM0NAME,
      capital: p.ADM0CAP === 1 ? 1 : 0,
      pop: p.POP_MAX ?? 0,
      scalerank: p.SCALERANK,
    },
    geometry: { type: 'Point', coordinates: [round(lon), round(lat)] },
  });
}

// Sort by importance so capitals/big cities win label collisions deterministically.
out.sort((a, b) => a.properties.scalerank - b.properties.scalerank || b.properties.pop - a.properties.pop);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/cities.geojson`, JSON.stringify({ type: 'FeatureCollection', features: out }));

const unmatched = Object.keys(WWII_NAMES).filter((k) => !matched.has(k));
console.log(`Wrote ${out.length} cities (${out.filter((f) => f.properties.capital).length} capitals).`);
console.log(`Applied ${matched.size} WWII name overrides: ${[...matched].join(', ')}`);
if (unmatched.length) console.log(`(unmatched overrides — check NE names: ${unmatched.join(', ')})`);

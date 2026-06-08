// ETL: CShapes-2.0 (global, exact-dated sovereign borders) -> a small,
// WWII-windowed GeoJSON the app loads once and filters by date.
//
// Input : data/raw/CShapes-2.0.geojson        (download, gitignored)
// Output: public/data/borders/cshapes-europe-ww2.geojson  (committed)
//         public/data/borders/index.json
//
// Fetch the raw source once, then run the script:
//   curl -o data/raw/CShapes-2.0.geojson https://icr.ethz.ch/data/cshapes/CShapes-2.0.geojson
//   node data/pipeline/build-borders.mjs
//
// Source: CShapes 2.0, ETH ICR (academic / non-commercial). See DATA_SOURCES.md.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const RAW = 'data/raw/CShapes-2.0.geojson';
const OUT_DIR = 'public/data/borders';
const OUT_GEOJSON = `${OUT_DIR}/cshapes-europe-ww2.geojson`;
const OUT_LABELS = `${OUT_DIR}/cshapes-europe-ww2-labels.geojson`;
const OUT_INDEX = `${OUT_DIR}/index.json`;

// Timeline window (inclusive start, exclusive end) as YYYYMMDD integers.
const WINDOW_START = 19380101;
const WINDOW_END = 19470101;

// Keep features whose capital sits in/around the European theater (incl. the
// Mediterranean rim / North African coast). Whole geometries are kept as-is.
const CAP_BBOX = { minLng: -30, minLat: 28, maxLng: 55, maxLat: 75 };

const COORD_PRECISION = 3; // ~110 m; shrinks the file substantially.

const num = (y, m, d) => y * 10000 + m * 100 + d;

/** Deterministic pastel fill per country so the same state keeps its color. */
function colorForGwcode(gwcode) {
  const hue = (gwcode * 47) % 360;
  return hslToHex(hue, 42, 60);
}

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const c = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Signed area of a closed ring (shoelace). */
function ringArea(r) {
  let a = 0;
  for (let i = 0, n = r.length - 1; i < n; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
  return a / 2;
}

/** Area-weighted centroid of a ring; falls back to the first vertex if degenerate. */
function ringCentroid(r) {
  let x = 0, y = 0, a = 0;
  for (let i = 0, n = r.length - 1; i < n; i++) {
    const cross = r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
    a += cross;
    x += (r[i][0] + r[i + 1][0]) * cross;
    y += (r[i][1] + r[i + 1][1]) * cross;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-9) return r[0];
  return [Number((x / (6 * a)).toFixed(3)), Number((y / (6 * a)).toFixed(3))];
}

/** A single label anchor for a feature: centroid of its largest outer ring. */
function labelPoint(geom) {
  let ring = null;
  if (geom.type === 'Polygon') ring = geom.coordinates[0];
  else if (geom.type === 'MultiPolygon') {
    let best = -1;
    for (const poly of geom.coordinates) {
      const area = Math.abs(ringArea(poly[0]));
      if (area > best) { best = area; ring = poly[0]; }
    }
  }
  return ring ? ringCentroid(ring) : null;
}

/** Round every coordinate in a geometry to COORD_PRECISION decimals, in place. */
function roundCoords(node) {
  if (typeof node[0] === 'number') {
    node[0] = Number(node[0].toFixed(COORD_PRECISION));
    node[1] = Number(node[1].toFixed(COORD_PRECISION));
    return;
  }
  for (const child of node) roundCoords(child);
}

function inCapBox(p) {
  return (
    p.caplong > CAP_BBOX.minLng &&
    p.caplong < CAP_BBOX.maxLng &&
    p.caplat > CAP_BBOX.minLat &&
    p.caplat < CAP_BBOX.maxLat
  );
}

console.log('Reading', RAW, '...');
const gj = JSON.parse(readFileSync(RAW, 'utf8'));

const out = [];
for (const f of gj.features) {
  const p = f.properties;
  const start = num(p.gwsyear, p.gwsmonth, p.gwsday);
  const end = num(p.gweyear, p.gwemonth, p.gweday);

  // Validity must intersect the WWII window, capital within the theater.
  if (end <= WINDOW_START || start >= WINDOW_END) continue;
  if (!inCapBox(p)) continue;
  if (!f.geometry) continue;

  roundCoords(f.geometry.coordinates);

  out.push({
    type: 'Feature',
    properties: {
      name: p.cntry_name,
      gwcode: p.gwcode,
      start,
      end,
      color: colorForGwcode(p.gwcode),
    },
    geometry: f.geometry,
  });
}

const fc = { type: 'FeatureCollection', features: out };

// One label anchor per feature so country names don't repeat per island/part.
const labels = {
  type: 'FeatureCollection',
  features: out
    .map((f) => {
      const pt = labelPoint(f.geometry);
      if (!pt) return null;
      return {
        type: 'Feature',
        properties: { name: f.properties.name, start: f.properties.start, end: f.properties.end },
        geometry: { type: 'Point', coordinates: pt },
      };
    })
    .filter(Boolean),
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_GEOJSON, JSON.stringify(fc));
writeFileSync(OUT_LABELS, JSON.stringify(labels));

const index = {
  layer: 'borders',
  source: 'CShapes 2.0 (ETH ICR) — de jure sovereign borders',
  license: 'Academic / non-commercial',
  generated: new Date().toISOString().slice(0, 10),
  window: [WINDOW_START, WINDOW_END],
  featureCount: out.length,
  note: 'Exact-dated sovereign borders. Filter by start <= date < end. De facto wartime occupation is handled by the control layer (M2).',
};
writeFileSync(OUT_INDEX, JSON.stringify(index, null, 2));

const bytes = Buffer.byteLength(JSON.stringify(fc));
console.log(`Wrote ${out.length} features -> ${OUT_GEOJSON} (${(bytes / 1024).toFixed(0)} kB)`);
console.log(`Wrote ${labels.features.length} label points -> ${OUT_LABELS}`);
console.log(`Wrote manifest -> ${OUT_INDEX}`);

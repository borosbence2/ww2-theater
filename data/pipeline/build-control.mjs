// ETL: Stanford "European Borders WWII" monthly shapefiles -> per-month TopoJSON
// of territorial CONTROL by side (Axis / Axis-occupied / Allied / Neutral).
//
// Pipeline: reproject (Europe Albers/ED50 -> WGS84) -> drop tiny islands ->
// build topology -> topology-aware simplify -> quantize -> TopoJSON. TopoJSON
// (shared arcs + integer coords) keeps each month ~40 kB; the app decodes it
// client-side with topojson-client.
//
// Input : data/raw/stanford_ww2/EuropeanBorders_WWII/<Month_DD_YYYY>.shp (+ .dbf)
// Output: public/data/control/<YYYY-MM>.json      (TopoJSON, committed)
//         public/data/control/index.json          (manifest + legend)
//
// Fetch the raw source once (Internet Archive snapshot), unzip, then run:
//   node data/pipeline/build-control.mjs
//
// Source: Stanford Spatial History Project, European Borders WWII
// (academic / non-commercial). See DATA_SOURCES.md.

import { open } from 'shapefile';
import proj4 from 'proj4';
import { topology } from 'topojson-server';
import { presimplify, simplify } from 'topojson-simplify';
import { quantize } from 'topojson-client';
import { readdirSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';

const SRC_DIR = 'data/raw/stanford_ww2/EuropeanBorders_WWII';
const OUT_DIR = 'public/data/control';

const SRC_PROJ =
  '+proj=aea +lat_1=43 +lat_2=62 +lat_0=30 +lon_0=10 +x_0=0 +y_0=0 ' +
  '+ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs';

const MIN_PART_AREA = 0.05; // deg^2 bbox; drops tiny islands / micro-states
const SIMPLIFY_WEIGHT = 0.02; // topology-aware simplification threshold
const QUANTIZATION = 1e4; // ~1 km integer grid

const MONTHS = {
  January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
  July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
};

const SIDES = {
  axis: { label: 'Axis', color: '#b5402f' },
  occupied: { label: 'Axis-occupied', color: '#e0a08c' },
  allied: { label: 'Allied', color: '#2f6fb0' },
  neutral: { label: 'Neutral', color: '#aab0b8' },
};

// The source `Foreign_Po` field is inconsistent over time (e.g. "Belligerent"
// in 1939, blank in some months), so for the major powers we assert their side
// from the known alliance timeline. `null` here means "defer to Foreign_Po".
function coreSide(name, d) {
  switch (name) {
    case 'Germany':
      return 'axis';
    case 'Italy':
      return d < 19400610 ? 'neutral' : d < 19430908 ? 'axis' : 'allied';
    case 'Soviet Union':
      return d < 19410622 ? 'neutral' : 'allied';
    case 'Hungary':
      return d < 19401120 ? 'neutral' : 'axis';
    case 'Romania':
      return d < 19401123 ? 'neutral' : d < 19440823 ? 'axis' : 'allied';
    case 'Bulgaria':
      return d < 19410301 ? 'neutral' : d < 19440908 ? 'axis' : 'allied';
    case 'Slovakia':
      return d < 19390314 ? 'neutral' : 'axis';
    case 'Finland':
      return d >= 19410625 && d < 19440919 ? 'axis' : 'neutral';
    case 'Vichy France':
      return d < 19421111 ? 'axis' : 'neutral';
    case 'United Kingdom':
      return d < 19390903 ? 'neutral' : 'allied';
    case 'France':
      return d < 19390903 ? 'neutral' : d < 19400625 ? 'allied' : null; // occupied after -> Foreign_Po
    default:
      return null;
  }
}

/** Resolve a feature to a side: occupation first, then the core timeline, then the raw label. */
function sideFor(name, foreignPo, d) {
  const s = (foreignPo == null ? '' : String(foreignPo)).toLowerCase();
  if (s.includes('occupied') || s.includes('protectorate')) return 'occupied';
  const core = coreSide(name, d);
  if (core) return core;
  if (s.startsWith('alli')) return 'allied';
  if (s.includes('axis')) return 'axis';
  return 'neutral';
}

const isBlank = (v) => v == null || String(v).trim() === '' || /^null$/i.test(String(v));
const SKIP_NULL_RATIO = 0.8; // months where most statuses are blank are data gaps

const reproject = (n) => (typeof n[0] === 'number' ? proj4(SRC_PROJ, 'EPSG:4326', n) : n.map(reproject));

function bboxArea(ring) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const [x, y] of ring) {
    if (x < minx) minx = x; if (x > maxx) maxx = x;
    if (y < miny) miny = y; if (y > maxy) maxy = y;
  }
  return (maxx - minx) * (maxy - miny);
}

/** Drop polygon parts whose bbox is smaller than MIN_PART_AREA. */
function prune(geom) {
  if (!geom) return null;
  if (geom.type === 'Polygon') {
    return bboxArea(geom.coordinates[0]) >= MIN_PART_AREA ? geom : null;
  }
  if (geom.type === 'MultiPolygon') {
    const parts = geom.coordinates.filter((p) => bboxArea(p[0]) >= MIN_PART_AREA);
    return parts.length ? { type: 'MultiPolygon', coordinates: parts } : null;
  }
  return geom;
}

function parseDate(filename) {
  const m = filename.match(/^([A-Za-z]+)_(\d+)_(\d{4})\.shp$/);
  if (!m || !MONTHS[m[1]]) return null;
  const month = MONTHS[m[1]];
  const year = Number(m[3]);
  return {
    year,
    month,
    startNum: year * 10000 + month * 100 + 1,
    monthKey: `${year}-${String(month).padStart(2, '0')}`,
  };
}

const files = readdirSync(SRC_DIR)
  .filter((f) => /^[A-Za-z]+_\d+_\d{4}\.shp$/.test(f))
  .map((f) => ({ file: f, ...parseDate(f) }))
  .filter((e) => e && e.year)
  .sort((a, b) => a.startNum - b.startNum);

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

const months = [];
const skipped = [];
for (const entry of files) {
  const base = `${SRC_DIR}/${entry.file.replace(/\.shp$/, '')}`;
  const source = await open(`${base}.shp`, `${base}.dbf`);

  const features = [];
  let blank = 0;
  while (true) {
    const r = await source.read();
    if (r.done) break;
    const f = r.value;
    if (!f.geometry) continue;
    f.geometry.coordinates = reproject(f.geometry.coordinates);
    const geometry = prune(f.geometry);
    if (!geometry) continue;
    if (isBlank(f.properties.Foreign_Po)) blank++;
    const side = sideFor(f.properties.Name, f.properties.Foreign_Po, entry.startNum);
    features.push({
      type: 'Feature',
      properties: { name: f.properties.Name, side, color: SIDES[side].color },
      geometry,
    });
  }

  // Skip data-gap months (mostly blank statuses); the previous month carries over.
  if (!features.length || blank / features.length > SKIP_NULL_RATIO) {
    skipped.push(entry.monthKey);
    continue;
  }

  let topo = simplify(presimplify(topology({ control: { type: 'FeatureCollection', features } })), SIMPLIFY_WEIGHT);
  topo = quantize(topo, QUANTIZATION);

  const fileName = `${entry.monthKey}.json`;
  writeFileSync(`${OUT_DIR}/${fileName}`, JSON.stringify(topo));
  months.push({ month: entry.monthKey, start: entry.startNum, file: fileName });
}

// Each kept month is valid until the next kept month (last one to +infinity).
months.forEach((m, i) => {
  m.end = i + 1 < months.length ? months[i + 1].start : 99999999;
});
if (skipped.length) console.log(`Skipped ${skipped.length} gap months: ${skipped.join(', ')}`);

const index = {
  layer: 'control',
  object: 'control',
  source: 'Stanford Spatial History Project — European Borders WWII',
  license: 'Academic / non-commercial',
  generated: new Date().toISOString().slice(0, 10),
  granularity: 'monthly (nearest-keyframe; daily interpolation is future work)',
  sides: SIDES,
  months,
  note: 'Territorial control by administration type, reprojected from Europe Albers/ED50 to WGS84, simplified, tiny islands dropped. Source has occasional errors; Italy pre-Sept-1943 corrected to Axis. Late-war boundaries are approximate.',
};
writeFileSync(`${OUT_DIR}/index.json`, JSON.stringify(index, null, 2));
console.log(`Wrote ${months.length} monthly TopoJSON files + index.json to ${OUT_DIR}`);

// Densify the city-control dots for display. The 137 hand-curated cities are the
// front's *validation* anchors (independent capture/liberation dates); this adds
// many more populated places whose control timeline is *derived from the
// authored front* (a city's side = which side of the line it sits on, pockets
// included). Derived cities are flagged `derived:true` so build-fronts skips
// them in validation (they mirror the line, so they can't independently check
// it) and so they can be regenerated if the front is re-traced.
//
// Run after build-fronts (needs the built front): node data/pipeline/densify-control.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { addDays, dateNum, diffDays } from './lib/dates.mjs';
import { axisPolygon, inRing } from './lib/geometry.mjs';
import { coordsFor } from './lib/interpolate.mjs';

const CONTROL = 'data/curated/city-control.json';
const FRONT = 'public/data/front/eastern-keyframes.json';
const NE = 'data/raw/ne_10m_populated_places.geojson';
const POP_MIN = 50000;
const DWELL = 6; // a side must hold this many days to count as a handover (anti-jitter)
const DEDUP_DEG = 0.25; // skip a place this close to an already-listed city

if (!existsSync(NE)) {
  console.log('Natural Earth places not present (gitignored) — skipping densify.');
  process.exit(0);
}
const control = JSON.parse(readFileSync(CONTROL, 'utf8'));
const front = JSON.parse(readFileSync(FRONT, 'utf8'));
const main = front.features.find((f) => f.id === 'main');
const pockets = front.features.filter((f) => f.closed);

// Dedup against the curated cities (ignore any previously-derived, we replace them).
const taken = control.cities.filter((c) => !c.derived).map((c) => [c.lon, c.lat]);
const near = (lon, lat) => taken.some(([x, y]) => Math.abs(x - lon) < DEDUP_DEG && Math.abs(y - lat) < DEDUP_DEG);

const ne = JSON.parse(readFileSync(NE, 'utf8'));
const cands = [];
for (const f of ne.features) {
  const [lon, lat] = f.geometry.coordinates;
  const pop = f.properties.POP_MAX || f.properties.GN_POP || 0;
  if (pop < POP_MIN) continue;
  if (lat < 43.5 || lat > 59.5 || lon < 15 || lon > 46) continue; // front's working envelope
  if (near(lon, lat)) continue;
  const name = f.properties.NAME || f.properties.NAMEASCII;
  if (!name) continue;
  taken.push([lon, lat]); // dedup among candidates too
  cands.push({ name, lon: Number(lon.toFixed(2)), lat: Number(lat.toFixed(2)) });
}

// Sample the front side for every candidate on every day.
const start = main.keyframes[0].date;
const total = diffDays(start, '1945-05-08');
const series = cands.map(() => []);
for (let n = 0; n <= total; n++) {
  const iso = addDays(start, n);
  const line = coordsFor(main, iso);
  if (!line) continue;
  const ys = line.map((c) => c[1]);
  const loY = Math.min(...ys) - 0.5;
  const hiY = Math.max(...ys) + 0.5;
  const poly = axisPolygon(line);
  const rings = pockets.map((p) => ({ p, r: coordsFor(p, iso) })).filter((x) => x.r);
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i];
    if (c.lat < loY || c.lat > hiY) continue;
    let side = null;
    for (const { p, r } of rings) if (inRing(r, c.lon, c.lat)) { side = p.encircled; break; }
    if (!side) side = inRing(poly, c.lon, c.lat) ? 'axis' : 'soviet';
    series[i].push([iso, side]);
  }
}

// Collapse each series to init + dwell-filtered changes.
const fmtCh = (ch) => `{ "date": "${ch.date}", "side": "${ch.side}" }`;
const fmtCity = (c) =>
  `    { "name": ${JSON.stringify(c.name)}, "lon": ${c.lon}, "lat": ${c.lat}, "init": "${c.init}", "changes": [${c.changes
    .map(fmtCh)
    .join(', ')}], "derived": true }`;
const lines = [];
for (let i = 0; i < cands.length; i++) {
  const s = series[i];
  if (!s.length) continue;
  const init = s[0][1];
  const changes = [];
  let cur = init;
  for (let k = 0; k < s.length; k++) {
    if (s[k][1] !== cur) {
      let holds = true;
      for (let j = k; j < Math.min(k + DWELL, s.length); j++) if (s[j][1] !== s[k][1]) { holds = false; break; }
      if (holds) { changes.push({ date: s[k][0], side: s[k][1] }); cur = s[k][1]; }
    }
  }
  lines.push(fmtCity({ ...cands[i], init, changes }));
}

// Write back preserving the curated cities' exact text; replace any old derived block.
let text = readFileSync(CONTROL, 'utf8').replace(/\r\n/g, '\n');
text = text.replace(/,\n {4}\{[^\n]*"derived": true[^\n]*\}/g, ''); // strip previously-derived lines
const closeIdx = text.lastIndexOf('\n  ]');
const out = text.slice(0, closeIdx) + ',\n' + lines.join(',\n') + text.slice(closeIdx);
writeFileSync(CONTROL, out);
console.log(`Densified: +${lines.length} front-derived display cities (pop>=${POP_MIN}); ${taken.length} total tracked.`);

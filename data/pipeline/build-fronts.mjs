// ETL v2: curated front FEATURES -> resampled keyframes the app interpolates
// between by date. The curated file holds independent features: the main front
// (open polyline) plus pockets/sieges (closed rings) with their own lifespans.
//
// Per feature, every keyframe is resampled to a fixed point count so
// consecutive keyframes have point correspondence and morph smoothly:
//   - kind=front : evenly spaced along arc length (open line)
//   - pocket/siege: evenly spaced around the ring, forced counter-clockwise,
//     then cyclically rotated to best align with the previous keyframe
//     (otherwise interpolated rings visibly "swirl")
//
// After building, the output is VALIDATED against the settlement-control
// timeline (data/curated/city-control.json): for every day, every city must
// fall on the side of the interpolated front that its documented capture/
// liberation dates say it should. Mismatches are reported (not fatal) — they
// are the worklist telling you where to add or adjust keyframes.
//
// Shared mechanics (resampling, interpolation, side tests, date math) live in
// data/pipeline/lib/ — the same code the unit ETL (Phase 1+) builds on.
//
// Input : data/curated/eastern-front.json    (hand-authored, committed)
//         data/curated/city-control.json     (validation + runtime copy)
// Output: public/data/front/eastern-keyframes.json
//         public/data/cities/control.json    (verbatim copy for the app)
//
// Run: node data/pipeline/build-fronts.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { OPEN_END, addDays, dateNum, diffDays } from './lib/dates.mjs';
import {
  alignRing,
  axisPolygon,
  inRing,
  kmFromFront,
  resampleOpen,
  resampleRing,
} from './lib/geometry.mjs';
import { coordsFor } from './lib/interpolate.mjs';

const IN = 'data/curated/eastern-front.json';
const CITIES_IN = 'data/curated/city-control.json';
const OUT_DIR = 'public/data/front';
const OUT = `${OUT_DIR}/eastern-keyframes.json`;
const CITIES_OUT_DIR = 'public/data/cities';
const CITIES_OUT = `${CITIES_OUT_DIR}/control.json`;

const LINE_POINTS = 240;
const RING_POINTS = 64;
// Distribute open-front sample points by a latitude-weighted metric so keyframes
// stay feature-aligned when interpolated (see resampleOpen). 0.2 = latitude
// dominates; tuned against the city-validation worklist (1139 -> ~1055).
const FRONT_LON_WEIGHT = 0.2;

// ---------------------------------------------------------------------------
// Build

const src = JSON.parse(readFileSync(IN, 'utf8'));

const features = src.features.map((f) => {
  if (!f.id || !['front', 'pocket', 'siege'].includes(f.kind)) {
    throw new Error(`Feature ${f.id ?? '?'}: missing id or bad kind "${f.kind}"`);
  }
  if (!f.keyframes?.length) throw new Error(`Feature ${f.id}: no keyframes`);
  const closed = f.kind !== 'front';
  if (closed && !f.to) throw new Error(`Feature ${f.id}: pockets/sieges need an explicit "to" date`);
  if (closed && !['axis', 'soviet'].includes(f.encircled)) {
    throw new Error(`Feature ${f.id}: pockets/sieges need "encircled": axis|soviet`);
  }

  let prev = null;
  const keyframes = f.keyframes.map((k) => {
    let coords;
    if (closed) {
      coords = resampleRing(k.waypoints, RING_POINTS);
      if (prev) coords = alignRing(prev, coords);
      prev = coords;
    } else {
      coords = resampleOpen(k.waypoints, LINE_POINTS, FRONT_LON_WEIGHT);
    }
    return { date: k.date, label: k.label, start: dateNum(k.date), coords };
  });
  for (let i = 1; i < keyframes.length; i++) {
    if (keyframes[i].start <= keyframes[i - 1].start) {
      throw new Error(`Feature ${f.id}: keyframes not strictly ascending at ${keyframes[i].date}`);
    }
  }

  const from = f.from ?? f.keyframes[0].date;
  return {
    id: f.id,
    kind: f.kind,
    label: f.label,
    encircled: f.encircled,
    closed,
    from,
    to: f.to ?? null,
    fromNum: dateNum(from),
    toNum: f.to ? dateNum(f.to) : OPEN_END,
    // Units trapped in this pocket (placed inside the ring by build-units).
    ...(f.garrison ? { garrison: f.garrison } : {}),
    // Formations blockading the pocket (placed just outside the ring, land-side).
    ...(f.besiegers ? { besiegers: f.besiegers } : {}),
    keyframes,
  };
});

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, JSON.stringify({ theater: src.theater, features }));
for (const f of features) {
  console.log(
    `  ${f.id} (${f.kind}${f.encircled ? ', ' + f.encircled : ''}): ` +
      `${f.keyframes.length} keyframes, ${f.from} -> ${f.to ?? 'open'}`,
  );
}
console.log(`Wrote ${features.length} features -> ${OUT}`);

// Runtime copy of the settlement-control timeline for the city-control dots.
mkdirSync(CITIES_OUT_DIR, { recursive: true });
writeFileSync(CITIES_OUT, readFileSync(CITIES_IN));
console.log(`Copied city control timeline -> ${CITIES_OUT}`);

// ---------------------------------------------------------------------------
// Validation: every city on the documented side of the front, every day.

const control = JSON.parse(readFileSync(CITIES_IN, 'utf8'));
const main = features.find((f) => f.kind === 'front');
const VAL_START = main.keyframes[0].date;
const VAL_END = main.to ?? main.keyframes[main.keyframes.length - 1].date;

/** Documented holder of a city on `iso` per its capture/liberation dates. */
function expectedSide(city, iso) {
  const d = dateNum(iso);
  let side = city.init;
  for (const c of city.changes) {
    if (dateNum(c.date) <= d) side = c.side;
    else break;
  }
  return side;
}

console.log(`\nValidating city sides ${VAL_START} -> ${VAL_END} ...`);
const totalDays = diffDays(VAL_START, VAL_END);
const runs = new Map(); // city -> array of {from,to,got,expected,maxKm}
let mismatchDays = 0;

for (let n = 0; n <= totalDays; n++) {
  const iso = addDays(VAL_START, n);
  const line = coordsFor(main, iso);
  if (!line) continue;
  const lats = line.map((c) => c[1]);
  const latMin = Math.min(...lats) - 0.5;
  const latMax = Math.max(...lats) + 0.5;
  const axisPoly = axisPolygon(line);

  const pockets = features
    .filter((f) => f.closed)
    .map((f) => ({ f, ring: coordsFor(f, iso) }))
    .filter((p) => p.ring);

  for (const city of control.cities) {
    if (city.lat < latMin || city.lat > latMax) continue; // outside front coverage
    let got = null;
    for (const { f, ring } of pockets) {
      if (inRing(ring, city.lon, city.lat)) {
        got = { side: f.encircled, km: 0 };
        break;
      }
    }
    if (!got) {
      got = {
        side: inRing(axisPoly, city.lon, city.lat) ? 'axis' : 'soviet',
        km: kmFromFront(line, city.lon, city.lat),
      };
    }

    const expected = expectedSide(city, iso);
    if (got.side === expected) continue;
    mismatchDays++;
    let list = runs.get(city.name);
    if (!list) runs.set(city.name, (list = []));
    const lastRun = list[list.length - 1];
    if (lastRun && lastRun.to === addDays(iso, -1) && lastRun.got === got.side) {
      lastRun.to = iso;
      lastRun.maxKm = Math.max(lastRun.maxKm, got.km);
    } else {
      list.push({ from: iso, to: iso, got: got.side, expected, maxKm: got.km });
    }
  }
}

if (!runs.size) {
  console.log('All cities consistent with the front on every day. ✔');
} else {
  for (const [name, list] of [...runs.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    for (const r of list) {
      const days = diffDays(r.from, r.to) + 1;
      console.log(
        `  ✗ ${name}: drawn ${r.got}, documented ${r.expected} — ` +
          `${r.from}..${r.to} (${days}d, ≤${r.maxKm.toFixed(0)} km from front)`,
      );
    }
  }
  console.log(
    `${runs.size} cities with mismatches, ${mismatchDays} city-days total. ` +
      'Each run is a place/date where keyframes need densifying or adjusting.',
  );
}

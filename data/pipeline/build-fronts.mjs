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
// Input : data/curated/eastern-front.json    (hand-authored, committed)
//         data/curated/city-control.json     (validation + runtime copy)
// Output: public/data/front/eastern-keyframes.json
//         public/data/cities/control.json    (verbatim copy for the app)
//
// Run: node data/pipeline/build-fronts.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const IN = 'data/curated/eastern-front.json';
const CITIES_IN = 'data/curated/city-control.json';
const OUT_DIR = 'public/data/front';
const OUT = `${OUT_DIR}/eastern-keyframes.json`;
const CITIES_OUT_DIR = 'public/data/cities';
const CITIES_OUT = `${CITIES_OUT_DIR}/control.json`;

const LINE_POINTS = 240;
const RING_POINTS = 64;
const OPEN_END = 99999999; // toNum for features without an end date

const dateNum = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return y * 10000 + m * 100 + d;
};
const toUTC = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const diffDays = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 86_400_000);
const addDays = (iso, n) => {
  const d = new Date(toUTC(iso) + n * 86_400_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};
const round3 = (pts) => pts.map(([x, y]) => [Number(x.toFixed(3)), Number(y.toFixed(3))]);

// ---------------------------------------------------------------------------
// Resampling

/** Resample an open polyline to n evenly-spaced points (by planar arc length). */
function resampleOpen(pts, n) {
  const seg = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const len = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    seg.push(len);
    total += len;
  }
  const out = [];
  for (let k = 0; k < n; k++) {
    const target = total * (k / (n - 1));
    let acc = 0;
    let i = 0;
    while (i < seg.length && acc + seg[i] < target) acc += seg[i++];
    if (i >= seg.length) {
      out.push([...pts[pts.length - 1]]);
      continue;
    }
    const f = seg[i] === 0 ? 0 : (target - acc) / seg[i];
    const a = pts[i];
    const b = pts[i + 1];
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return round3(out);
}

/** Signed area (shoelace); positive = counter-clockwise in lon/lat. */
function signedArea(ring) {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

/** Resample a closed ring to n evenly-spaced points, forced counter-clockwise.
 *  Input is authored open (no duplicate closing point); output is too. */
function resampleRing(pts, n) {
  let ring = pts;
  const [fx, fy] = ring[0];
  const [lx, ly] = ring[ring.length - 1];
  if (fx === lx && fy === ly) ring = ring.slice(0, -1);
  if (signedArea(ring) < 0) ring = [...ring].reverse();

  const seg = [];
  let total = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    seg.push(len);
    total += len;
  }
  const out = [];
  for (let k = 0; k < n; k++) {
    const target = total * (k / n);
    let acc = 0;
    let i = 0;
    while (i < seg.length - 1 && acc + seg[i] < target) acc += seg[i++];
    const f = seg[i] === 0 ? 0 : (target - acc) / seg[i];
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return round3(out);
}

/** Cyclically rotate `ring` to minimize total squared distance to `prev`. */
function alignRing(prev, ring) {
  const n = ring.length;
  let best = 0;
  let bestCost = Infinity;
  for (let shift = 0; shift < n; shift++) {
    let cost = 0;
    for (let i = 0; i < n; i++) {
      const [px, py] = prev[i];
      const [qx, qy] = ring[(i + shift) % n];
      cost += (qx - px) ** 2 + (qy - py) ** 2;
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = shift;
    }
  }
  return ring.map((_, i) => ring[(i + best) % n]);
}

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
      coords = resampleOpen(k.waypoints, LINE_POINTS);
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

/** Interpolated coords of a feature on `iso`, or null when inactive.
 *  Active while fromNum <= d < toNum (`to` is the first day it is gone). */
function coordsFor(f, iso) {
  const d = dateNum(iso);
  if (d < f.fromNum || d >= f.toNum) return null;
  const kfs = f.keyframes;
  if (d <= kfs[0].start) return kfs[0].coords;
  const last = kfs[kfs.length - 1];
  if (d >= last.start) return last.coords;
  let k0 = kfs[0];
  let k1 = kfs[1];
  for (let i = 0; i < kfs.length - 1; i++) {
    if (d >= kfs[i].start && d < kfs[i + 1].start) {
      k0 = kfs[i];
      k1 = kfs[i + 1];
      break;
    }
  }
  const span = diffDays(k0.date, k1.date);
  const t = span > 0 ? diffDays(k0.date, iso) / span : 0;
  return k0.coords.map(([x, y], i) => {
    const [qx, qy] = k1.coords[i];
    return [x + (qx - x) * t, y + (qy - y) * t];
  });
}

/** Distance from a point to the front polyline in ~km (local flat approx). */
function kmFromFront(coords, lon, lat) {
  const kx = 111 * Math.cos((lat * Math.PI) / 180); // km per deg lon at this lat
  const ky = 111;
  let bestD2 = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const [ax, ay] = coords[i];
    const [bx, by] = coords[i + 1];
    const abx = (bx - ax) * kx;
    const aby = (by - ay) * ky;
    const apx = (lon - ax) * kx;
    const apy = (lat - ay) * ky;
    const len2 = abx * abx + aby * aby;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby) / len2));
    const dx = apx - abx * t;
    const dy = apy - aby * t;
    bestD2 = Math.min(bestD2, dx * dx + dy * dy);
  }
  return Math.sqrt(bestD2);
}

/** Close the N->S front against a generous western box -> Axis-side polygon.
 *  Robust for cities far from the line (a nearest-segment cross test is not). */
function axisPolygon(line) {
  const lats = line.map((c) => c[1]);
  const yMin = Math.min(...lats) - 2;
  const yMax = Math.max(...lats) + 2;
  const xMin = 0; // far west of the whole theater

  return [
    ...line,
    [line[line.length - 1][0], yMin],
    [xMin, yMin],
    [xMin, yMax],
    [line[0][0], yMax],
  ];
}

/** Ray-cast point-in-ring (ring is open, no duplicate closing point). */
function inRing(ring, lon, lat) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

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

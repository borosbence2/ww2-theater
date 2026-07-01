// Control-tide land mask ETL. The "tide" (territorial control) is painted at
// runtime by splitting a real land polygon along the daily operational front
// (client-side, so the fill always matches the interpolated + evidence-deformed
// front line — see src/layers/controlFill.ts). This script produces that static
// land polygon: the belligerent CONTINENTAL landmass of the European theatre,
// dissolved into one MultiPolygon, so the client only has to intersect it with
// each side's half of the front.
//
// Model (an Eastern-Front map, two spheres): the whole German-controlled west/
// rear is the Axis sphere, the USSR the Soviet sphere, divided by our front.
// So we KEEP every continental belligerent (France, Low Countries, Norway,
// Denmark, Germany, Italy, Poland, the Balkans, Finland, the Baltics, the USSR)
// and DROP the neutrals (Sweden, Switzerland, Iberia, Turkey) — left unpainted —
// plus the off-continent islands (UK, Ireland, Iceland, Malta, Cyprus) and the
// out-of-theatre North-Africa / Middle-East states.
//
// The client also shades OCCUPIED territory lighter than the home nations, so
// we emit two extra masks it can intersect each sphere with: the Axis home
// nations (Germany, Italy and the co-belligerents) and the Soviet homeland
// (the USSR). Land in a sphere but outside its homeland reads as "occupied".
//
// Input : public/data/borders/cshapes-europe-ww2.geojson
// Output: public/data/control-tide/land.json
//         ({ bbox, land, coreAxis, coreSoviet } — all MultiPolygon coords)
//
// Run: node data/pipeline/build-control-tide.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import polygonClipping from 'polygon-clipping';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const SRC = resolve(ROOT, 'public/data/borders/cshapes-europe-ww2.geojson');
const OUT_DIR = resolve(ROOT, 'public/data/control-tide');
const OUT = resolve(OUT_DIR, 'land.json');

// Dropped from the painted land (matched as case-insensitive substrings of the
// cshapes `name`). Neutrals + off-continent islands + out-of-theatre states.
const DROP = [
  'sweden', 'switzerland', 'spain', 'portugal', // neutrals (Iberia + the Alps)
  'ireland', 'united kingdom', 'iceland', 'malta', 'cyprus', // off-continent isles
  'turkey', 'ottoman', // neutral, and Anatolia is out of theatre
  'morocco', 'algeria', 'tunisia', 'libya', 'egypt', 'iran', 'persia', 'iraq',
  'syria', 'lebanon', 'jordan', 'palestine', // North Africa + Middle East
];

// The Axis HOME nations (their own soil reads full-strength; everything else in
// the Axis sphere is occupied and reads lighter). Matched as name substrings.
const CORE_AXIS = ['germany', 'austria', 'italy', 'hungary', 'rumania', 'bulgaria', 'finland', 'slovakia'];
// The Soviet homeland (the USSR — cshapes "Russia (Soviet Union)"). The Soviet
// sphere beyond it (Poland, eastern Germany, the Balkans in 1944-45) is "held".
const CORE_SOVIET = ['russia', 'soviet'];

// Theatre window: the USSR variants run to the Pacific, so clip every country
// to this rectangle first (also kills the antimeridian wrap). The front never
// passes ~48°E, so a 60°E east edge leaves a clean Soviet-blue rear; the deep
// interior beyond it is uniformly Soviet and needs no painting.
const THEATRE = [[[-11, 34], [60, 34], [60, 72], [-11, 72], [-11, 34]]];

const fc = JSON.parse(readFileSync(SRC, 'utf8'));
const has = (name, list) => list.some((d) => name.toLowerCase().includes(d));

// Collect every non-dropped variant's polygon(s), clipped to the theatre, as
// polygon-clipping "geoms" (a Polygon is Ring[]; a MultiPolygon is Polygon[]).
// Temporal duplicates just dissolve in the union, so we take the physical land
// across all border eras. Core-Axis / core-Soviet variants are collected twice.
const geoms = [];
const coreAxisGeoms = [];
const coreSovietGeoms = [];
let kept = 0;
for (const f of fc.features) {
  const name = f.properties?.name ?? '';
  if (has(name, DROP)) continue;
  const clipped = polygonClipping.intersection(f.geometry.coordinates, THEATRE);
  if (!clipped.length) continue; // wholly outside the theatre window
  kept++;
  for (const poly of clipped) {
    geoms.push(poly); // each is a Polygon (Ring[])
    if (has(name, CORE_AXIS)) coreAxisGeoms.push(poly);
    if (has(name, CORE_SOVIET)) coreSovietGeoms.push(poly);
  }
}

console.log(`cshapes features: ${fc.features.length}, kept (belligerent land): ${kept}`);
console.log('dissolving…');
const landRaw = polygonClipping.union(geoms[0], ...geoms.slice(1)); // -> MultiPolygon coords
const coreAxisRaw = polygonClipping.union(coreAxisGeoms[0], ...coreAxisGeoms.slice(1));
const coreSovietRaw = polygonClipping.union(coreSovietGeoms[0], ...coreSovietGeoms.slice(1));

// The tide is a translucent background fill, and it is re-clipped against the
// front on every date change — so simplify the coastlines hard (~3 km) to keep
// that clip fast. Douglas–Peucker per ring; rings that collapse are dropped.
const EPS = 0.03; // degrees (~3 km)
const perpDist = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (!len2) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  const cx = a[0] + t * dx, cy = a[1] + t * dy;
  return Math.hypot(p[0] - cx, p[1] - cy);
};
const dp = (pts, eps) => {
  if (pts.length < 4) return pts;
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = -1, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = perpDist(pts[i], pts[a], pts[b]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > eps) { keep[idx] = true; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
};
const simplify = (mp) => mp
  .map((poly) => poly.map((ring) => dp(ring, EPS)).filter((ring) => ring.length >= 4))
  .filter((poly) => poly.length && poly[0].length >= 4);
const land = simplify(landRaw);
const coreAxis = simplify(coreAxisRaw);
const coreSoviet = simplify(coreSovietRaw);
// Pre-split the land into home vs occupied/held partitions so the client only
// has to run four plain ring-intersections per frame (no costly boolean
// differences at runtime): occupied = land MINUS the home nations.
const notCoreAxis = polygonClipping.difference(land, coreAxis);
const notCoreSoviet = polygonClipping.difference(land, coreSoviet);

// Bounding box (padded by the client for the front-split closure box).
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
let rings = 0, verts = 0;
for (const poly of land) for (const ring of poly) {
  rings++;
  for (const [x, y] of ring) {
    verts++;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
}
const bbox = [minX, minY, maxX, maxY];

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, JSON.stringify({
  note: 'Belligerent continental land of the European theatre, dissolved. Split client-side along the daily front into the Axis (west) and Soviet (east) spheres; each sphere is shaded darker on its home nations (coreAxis / coreSoviet) and lighter on occupied/held ground.',
  source: 'CShapes (cshapes-europe-ww2.geojson)',
  generated: new Date().toISOString().slice(0, 10),
  bbox,
  land, // MultiPolygon coordinates (used to clip pocket enclaves)
  coreAxis, // Axis home nations (Germany, Italy, co-belligerents)
  notCoreAxis, // land minus the Axis home nations (→ Axis-occupied)
  coreSoviet, // the USSR
  notCoreSoviet, // land minus the USSR (→ Soviet-held)
}));

const kb = (Buffer.byteLength(readFileSync(OUT)) / 1024).toFixed(0);
console.log(`polygons: ${land.length}, rings: ${rings}, vertices: ${verts}`);
console.log(`coreAxis polys: ${coreAxis.length}, coreSoviet polys: ${coreSoviet.length}`);
console.log(`bbox: [${bbox.map((n) => n.toFixed(1)).join(', ')}]`);
console.log(`wrote ${OUT}  (${kb} KB)`);

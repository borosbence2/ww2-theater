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
// Input : public/data/borders/cshapes-europe-ww2.geojson
// Output: public/data/control-tide/land.json  ({ bbox, land: MultiPolygon coords })
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

// Theatre window: the USSR variants run to the Pacific, so clip every country
// to this rectangle first (also kills the antimeridian wrap). The front never
// passes ~48°E, so a 60°E east edge leaves a clean Soviet-blue rear; the deep
// interior beyond it is uniformly Soviet and needs no painting.
const THEATRE = [[[-11, 34], [60, 34], [60, 72], [-11, 72], [-11, 34]]];

const fc = JSON.parse(readFileSync(SRC, 'utf8'));
const drop = (name) => DROP.some((d) => name.toLowerCase().includes(d));

// Collect every non-dropped variant's polygon(s), clipped to the theatre, as
// polygon-clipping "geoms" (a Polygon is Ring[]; a MultiPolygon is Polygon[]).
// Temporal duplicates just dissolve in the union, so we take the physical land
// across all border eras.
const geoms = [];
let kept = 0;
for (const f of fc.features) {
  const name = f.properties?.name ?? '';
  if (drop(name)) continue;
  const clipped = polygonClipping.intersection(f.geometry.coordinates, THEATRE);
  if (!clipped.length) continue; // wholly outside the theatre window
  kept++;
  for (const poly of clipped) geoms.push(poly); // each is a Polygon (Ring[])
}

console.log(`cshapes features: ${fc.features.length}, kept (belligerent land): ${kept}`);
console.log('dissolving…');
const land = polygonClipping.union(geoms[0], ...geoms.slice(1)); // -> MultiPolygon coords

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
  note: 'Belligerent continental land of the European theatre, dissolved. Split client-side along the daily front into the Axis (west) and Soviet (east) spheres.',
  source: 'CShapes (cshapes-europe-ww2.geojson)',
  generated: new Date().toISOString().slice(0, 10),
  bbox,
  land, // MultiPolygon coordinates
}));

const kb = (Buffer.byteLength(readFileSync(OUT)) / 1024).toFixed(0);
console.log(`polygons: ${land.length}, rings: ${rings}, vertices: ${verts}`);
console.log(`bbox: [${bbox.map((n) => n.toFixed(1)).join(', ')}]`);
console.log(`wrote ${OUT}  (${kb} KB)`);

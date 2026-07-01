// Territorial control fill (the "tide") — two-sided, as a staff-map occupation
// overlay rather than a flat wash. The daily front line splits a fixed "theatre"
// landmass into two complementary (non-overlapping) regions: the Axis-held west,
// closed front→rear, and the Soviet-held east, closed front→eastern boundary.
// Each region is drawn with a faint flat tint plus a diagonal HATCH (Axis "\"
// red, Soviet "/" blue), so the basemap breathes through and the two sides read
// at a glance by colour AND hatch direction, meeting cleanly at the front.
//
// Honest scope: schematic. Best 1941–44 when the front runs coast-to-coast; the
// closures fall back to the nearest theatre-boundary point once the front goes
// inland (1945). Soviet pockets behind Axis lines are blue islands; Axis pockets
// behind Soviet lines are red islands.

import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { FeatureCollection, Position } from 'geojson';
import { mainFrontLineOn, pocketRingsOn, loadFrontFeatures } from './front';

const SOURCE_ID = 'control-fill';
const SOVIET_TINT_ID = 'control-fill-soviet';
const SOVIET_HATCH_ID = 'control-fill-soviet-hatch';
const AXIS_TINT_ID = 'control-fill-axis';
const AXIS_HATCH_ID = 'control-fill-axis-hatch';
export const CONTROL_FILL_LAYER_IDS = [SOVIET_TINT_ID, AXIS_TINT_ID, SOVIET_HATCH_ID, AXIS_HATCH_ID];

// Clean (not greyed) so the hatch reads as held territory; the front line and
// unit counters stay the loudest marks.
const AXIS_COLOR = '#8a2f1c';
const SOVIET_COLOR = '#3c5f8c';

// Fixed "theatre" landmass boundary, ordered: SW Black-Sea corner → up the WEST
// (rear) → Baltic → across the NORTH → down the deep EAST → SW along the
// Caucasus/Black-Sea coast. The daily front cuts it into west (Axis) and east
// (Soviet) halves that share the front as their common edge.
const THEATER_MASK: [number, number][] = [
  [27.9, 43.2], [28.5, 44.8], [27.0, 45.6], [25.0, 47.0], [22.8, 48.2],
  [22.0, 49.2], [20.5, 49.5], [19.2, 50.2], [18.5, 51.5], [18.3, 52.8],
  [18.7, 54.4], [21.0, 55.3], [21.1, 57.0], [24.1, 57.3], [24.8, 59.4],
  [30.4, 60.0], [37.0, 60.8], [45.0, 60.2], [50.0, 57.5], [50.5, 52.0],
  [49.5, 47.5], [48.0, 45.0], [45.5, 43.4], [41.5, 43.0], [39.0, 43.6],
  [38.0, 44.6], [35.0, 45.6], [33.6, 46.2], [32.5, 46.1], [31.6, 46.6],
  [30.8, 46.5], [30.5, 46.0], [29.7, 45.2], [28.6, 43.9],
];
// Southern Baltic + Gulf of Finland coast, WEST→EAST (Danzig → Leningrad).
const BALTIC: [number, number][] = [
  [18.7, 54.4], [19.7, 54.4], [21.0, 55.3], [21.1, 56.2], [21.1, 57.0],
  [23.2, 57.1], [24.1, 57.3], [24.5, 58.4], [24.8, 59.4], [26.5, 59.5],
  [28.2, 59.4], [29.6, 59.9], [30.4, 59.95],
];
// North-west Black Sea coast, WEST→EAST (Bulgaria → Danube → Odessa → Perekop).
const BLACKSEA: [number, number][] = [
  [27.9, 43.2], [28.6, 43.9], [29.7, 45.2], [30.5, 46.0], [30.8, 46.5],
  [31.6, 46.6], [32.5, 46.1], [33.6, 46.2],
];
// Fixed rear boundary, Black Sea terminus → Baltic terminus (S→N).
const REAR: [number, number][] = [
  [27.9, 43.2], [28.5, 44.8], [27.0, 45.6], [25.0, 47.0], [22.8, 48.2],
  [22.0, 49.2], [20.5, 49.5], [19.2, 50.2], [18.5, 51.5], [18.3, 52.8],
  [18.7, 54.4],
];

let lastDate = '';

function nearestIndex(coast: [number, number][], pt: [number, number]): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < coast.length; i++) {
    const dx = coast[i][0] - pt[0];
    const dy = coast[i][1] - pt[1];
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

function controlGeoms(dateISO: string): FeatureCollection {
  const line = mainFrontLineOn(dateISO);
  if (!line || line.length < 2) return EMPTY;
  const north = line[0];
  const south = line[line.length - 1];

  // --- Axis (west) ring: front (N→S) → south closure → rear (S→N) → Baltic. ---
  const axisRing: [number, number][] = [...line];
  const bsIdx = nearestIndex(BLACKSEA, south);
  const bs = BLACKSEA[bsIdx];
  const reachesSea = Math.hypot(bs[0] - south[0], bs[1] - south[1]) < 1.5;
  let rearStart = 1;
  if (reachesSea) {
    for (let i = bsIdx; i >= 0; i--) axisRing.push(BLACKSEA[i]);
  } else {
    rearStart = nearestIndex(REAR, south);
  }
  for (let i = rearStart; i < REAR.length; i++) axisRing.push(REAR[i]);
  const balIdx = nearestIndex(BALTIC, north);
  for (let i = 1; i <= balIdx; i++) axisRing.push(BALTIC[i]);
  axisRing.push(north);

  // --- Soviet (east) ring: front (N→S) → back up the EASTERN theatre boundary
  // (mask, from the front's south point around to its north point). ---
  const sovietRing: [number, number][] = [...line];
  const sIdx = nearestIndex(THEATER_MASK, south);
  const nIdx = nearestIndex(THEATER_MASK, north);
  const N = THEATER_MASK.length;
  // Walk the mask from sIdx toward nIdx the way that traces the deep east
  // (decreasing index; the array runs east-side high→low between N and S).
  for (let i = sIdx; i !== nIdx; i = (i - 1 + N) % N) sovietRing.push(THEATER_MASK[i]);
  sovietRing.push(THEATER_MASK[nIdx]);

  // Pockets. Soviet pockets are blue islands (and holes in the Axis red);
  // Axis pockets are red islands (and holes in the Soviet blue).
  const pockets = pocketRingsOn(dateISO);
  const sovietPocketRings: Position[][] = pockets.filter((p) => p.encircled === 'soviet').map((p) => p.ring);
  const axisPocketRings: Position[][] = pockets.filter((p) => p.encircled === 'axis').map((p) => p.ring);

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { side: 'soviet' },
        geometry: {
          type: 'MultiPolygon',
          coordinates: [[sovietRing, ...axisPocketRings], ...sovietPocketRings.map((r) => [r])],
        },
      },
      {
        type: 'Feature',
        properties: { side: 'axis' },
        geometry: {
          type: 'MultiPolygon',
          coordinates: [[axisRing, ...sovietPocketRings], ...axisPocketRings.map((r) => [r])],
        },
      },
    ],
  };
}

/** Build a small repeating diagonal-hatch image (screen-space, DPR-aware). */
function hatchImage(color: string, back: boolean): { id: string; image: { width: number; height: number; data: Uint8ClampedArray }; pixelRatio: number } {
  const pr = Math.max(1, Math.round((typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1));
  const T = 11;
  const cv = document.createElement('canvas');
  cv.width = T * pr;
  cv.height = T * pr;
  const ctx = cv.getContext('2d')!;
  ctx.scale(pr, pr);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.15;
  ctx.lineCap = 'square';
  ctx.beginPath();
  if (back) {
    ctx.moveTo(0, 0);
    ctx.lineTo(T, T);
  } else {
    ctx.moveTo(0, T);
    ctx.lineTo(T, 0);
  }
  ctx.stroke();
  const img = ctx.getImageData(0, 0, T * pr, T * pr);
  return { id: back ? 'ctrl-hatch-axis' : 'ctrl-hatch-soviet', image: { width: img.width, height: img.height, data: img.data }, pixelRatio: pr };
}

export async function addControlFillLayer(map: MapLibreMap, date: string): Promise<void> {
  // The tide is derived from the front line; ensure the front data is loaded
  // before building it (this layer is added before the front layer).
  await loadFrontFeatures();
  lastDate = date;
  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data: controlGeoms(date),
    attribution: 'Territorial control: derived from the curated front (schematic)',
  });
  for (const back of [false, true]) {
    const h = hatchImage(back ? AXIS_COLOR : SOVIET_COLOR, back);
    if (!map.hasImage(h.id)) map.addImage(h.id, h.image, { pixelRatio: h.pixelRatio });
  }
  const firstLayer = map.getStyle().layers?.find((l) => l.id.startsWith('borders'))?.id;
  // Faint flat tints first (under the hatch); then the hatches.
  map.addLayer({ id: SOVIET_TINT_ID, type: 'fill', source: SOURCE_ID, filter: ['==', ['get', 'side'], 'soviet'], paint: { 'fill-color': SOVIET_COLOR, 'fill-opacity': 0.13 } }, firstLayer);
  map.addLayer({ id: AXIS_TINT_ID, type: 'fill', source: SOURCE_ID, filter: ['==', ['get', 'side'], 'axis'], paint: { 'fill-color': AXIS_COLOR, 'fill-opacity': 0.17 } }, firstLayer);
  map.addLayer({ id: SOVIET_HATCH_ID, type: 'fill', source: SOURCE_ID, filter: ['==', ['get', 'side'], 'soviet'], paint: { 'fill-pattern': 'ctrl-hatch-soviet', 'fill-opacity': 0.4 } }, firstLayer);
  map.addLayer({ id: AXIS_HATCH_ID, type: 'fill', source: SOURCE_ID, filter: ['==', ['get', 'side'], 'axis'], paint: { 'fill-pattern': 'ctrl-hatch-axis', 'fill-opacity': 0.5 } }, firstLayer);
}

export function updateControlFillDate(map: MapLibreMap, date: string): void {
  if (date === lastDate) return;
  lastDate = date;
  const src = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
  if (src) src.setData(controlGeoms(date));
}

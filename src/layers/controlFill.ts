// Territorial control fill (the "tide") — two-sided. A fixed Soviet-blue
// "theatre" base (the contestable European-USSR / eastern-Europe landmass, with
// the Black Sea cut out) underlies a red Axis polygon closed between the daily
// front and a fixed rear boundary. Red shows where the Axis holds; the blue
// base shows through everywhere else (and through pocket holes), so red meets
// blue at the front. No polygon-clipping library — coasts are authored
// polylines and the front endpoints join the coast at their nearest point.
//
// Honest scope: schematic. Best 1941–44 when the front runs coast-to-coast;
// the southern closure switches to the rear boundary once the front goes inland
// (1945). Soviet pockets behind Axis lines are holes (show blue); Axis pockets
// behind Soviet lines are red islands.

import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { FeatureCollection, Position } from 'geojson';
import { mainFrontLineOn, pocketRingsOn } from './front';

const SOURCE_ID = 'control-fill';
const FILL_SOVIET_ID = 'control-fill-soviet';
const FILL_ID = 'control-fill-axis';
export const CONTROL_FILL_LAYER_IDS = [FILL_SOVIET_ID, FILL_ID];

// Desaturated toward grey so the tide reads as held territory, not as ink —
// the front line and the unit counters stay the loudest marks on the map.
const AXIS_COLOR = '#ab6356';
const SOVIET_COLOR = '#5c83ae';

// Fixed "theatre" landmass that can be Axis- or Soviet-held: west edge = rear
// boundary, north = Baltic coast then NE across the USSR, east = a deep arc,
// south = back along the Black Sea's north shore. Filled blue beneath the Axis
// red; the Black Sea is cut out as a hole so open water is never painted.
const THEATER_MASK: [number, number][] = [
  [27.9, 43.2], [28.5, 44.8], [27.0, 45.6], [25.0, 47.0], [22.8, 48.2],
  [22.0, 49.2], [20.5, 49.5], [19.2, 50.2], [18.5, 51.5], [18.3, 52.8],
  [18.7, 54.4], [21.0, 55.3], [21.1, 57.0], [24.1, 57.3], [24.8, 59.4],
  [30.4, 60.0], [37.0, 60.8], [45.0, 60.2], [50.0, 57.5], [50.5, 52.0],
  [49.5, 47.5], [48.0, 45.0], [45.5, 43.4], [41.5, 43.0], [39.0, 43.6],
  [38.0, 44.6], [35.0, 45.6], [33.6, 46.2], [32.5, 46.1], [31.6, 46.6],
  [30.8, 46.5], [30.5, 46.0], [29.7, 45.2], [28.6, 43.9],
];
const BLACK_SEA_HOLE: [number, number][] = [
  [28.8, 44.2], [31.5, 43.2], [35.0, 42.4], [39.0, 42.6], [41.2, 43.2],
  [40.5, 44.6], [37.0, 45.0], [33.5, 45.4], [30.5, 45.0], [28.8, 44.6],
];

// Southern Baltic + Gulf of Finland coast, WEST→EAST (Danzig → Leningrad).
const BALTIC: [number, number][] = [
  [18.7, 54.4], [19.7, 54.4], [21.0, 55.3], [21.1, 56.2], [21.1, 57.0],
  [23.2, 57.1], [24.1, 57.3], [24.5, 58.4], [24.8, 59.4], [26.5, 59.5],
  [28.2, 59.4], [29.6, 59.9], [30.4, 59.95],
];
// North-west Black Sea coast, WEST→EAST (Bulgaria → Danube → Odessa → Perekop).
// Stops at the Perekop neck: Crimea (a peninsula, its own pocket) is excluded.
const BLACKSEA: [number, number][] = [
  [27.9, 43.2], [28.6, 43.9], [29.7, 45.2], [30.5, 46.0], [30.8, 46.5],
  [31.6, 46.6], [32.5, 46.1], [33.6, 46.2],
];
// Fixed rear boundary, Black Sea terminus → Baltic terminus (S→N): roughly the
// 1937 Reich eastern edge through the General Government and the Carpathians.
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

function axisPolygon(dateISO: string): FeatureCollection {
  const line = mainFrontLineOn(dateISO);
  if (!line || line.length < 2) return EMPTY;
  const north = line[0];
  const south = line[line.length - 1];

  // Ring: front (N→S) → close the south → rear (S→N) → Baltic coast → close.
  const ring: [number, number][] = [...line];

  // South closure. If the front still reaches the Black Sea, follow the coast
  // to the west terminus then up the rear. If the southern end has gone inland
  // (1945, Balkans/Hungary), skip the coast — joining it would wrongly enclose
  // now-Soviet Romania — and close straight onto the nearest rear point.
  const bsIdx = nearestIndex(BLACKSEA, south);
  const bs = BLACKSEA[bsIdx];
  const reachesSea = Math.hypot(bs[0] - south[0], bs[1] - south[1]) < 1.5;
  let rearStart = 1; // default: from the Black Sea terminus (REAR[0]) upward
  if (reachesSea) {
    for (let i = bsIdx; i >= 0; i--) ring.push(BLACKSEA[i]);
  } else {
    rearStart = nearestIndex(REAR, south);
  }
  for (let i = rearStart; i < REAR.length; i++) ring.push(REAR[i]); // S→N

  const balIdx = nearestIndex(BALTIC, north);
  for (let i = 1; i <= balIdx; i++) ring.push(BALTIC[i]); // west → nearest north
  ring.push(north);

  // Pockets: Soviet pockets behind Axis lines (Leningrad, Sevastopol, Odessa…)
  // are holes punched in the Axis area; Axis pockets behind Soviet lines
  // (Stalingrad, Demyansk, Korsun, Crimea, Courland…) are red islands.
  const pockets = pocketRingsOn(dateISO);
  const holes: Position[][] = pockets.filter((p) => p.encircled === 'soviet').map((p) => p.ring);
  const islands: Position[][][] = pockets
    .filter((p) => p.encircled === 'axis')
    .map((p) => [p.ring]);

  return {
    type: 'FeatureCollection',
    features: [
      // Soviet-blue base: the whole theatre mask, Black Sea cut out.
      {
        type: 'Feature',
        properties: { side: 'soviet' },
        geometry: { type: 'Polygon', coordinates: [THEATER_MASK, BLACK_SEA_HOLE] },
      },
      // Axis red on top: front-closed area + pocket islands, Soviet pockets cut out.
      {
        type: 'Feature',
        properties: { side: 'axis' },
        geometry: { type: 'MultiPolygon', coordinates: [[ring, ...holes], ...islands] },
      },
    ],
  };
}

export async function addControlFillLayer(map: MapLibreMap, date: string): Promise<void> {
  lastDate = date;
  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data: axisPolygon(date),
    attribution: 'Territorial control: derived from the curated front (schematic)',
  });
  // Beneath every other historical layer (just above the basemap land).
  const firstLayer = map.getStyle().layers?.find((l) => l.id.startsWith('borders'))?.id;
  map.addLayer(
    {
      id: FILL_SOVIET_ID,
      type: 'fill',
      source: SOURCE_ID,
      filter: ['==', ['get', 'side'], 'soviet'],
      paint: { 'fill-color': SOVIET_COLOR, 'fill-opacity': 0.1 },
    },
    firstLayer,
  );
  map.addLayer(
    {
      id: FILL_ID,
      type: 'fill',
      source: SOURCE_ID,
      filter: ['==', ['get', 'side'], 'axis'],
      paint: { 'fill-color': AXIS_COLOR, 'fill-opacity': 0.11 },
    },
    firstLayer,
  );
}

export function updateControlFillDate(map: MapLibreMap, date: string): void {
  if (date === lastDate) return;
  lastDate = date;
  const src = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
  if (src) src.setData(axisPolygon(date));
}

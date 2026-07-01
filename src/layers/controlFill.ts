// Territorial control (the "tide") — the real belligerent landmass PAINTED by
// who controls it, rather than a band or an offset line (which pinched at sharp
// corners). We take the static belligerent-land polygon (built offline, see
// data/pipeline/build-control-tide.mjs) and split it along the daily operational
// front into two spheres: the Axis-controlled west and the Soviet-controlled
// east. Because the split uses `mainFrontLineOn` — the SAME interpolated,
// evidence-deformed line the front layer draws — the colour boundary always sits
// exactly under the front line. Pockets are painted as enclaves in the encircled
// side's colour (Stalingrad = a red island inside the blue, and so on).
//
// The clip runs client-side (polygon-clipping) so it tracks the daily line with
// no keyframe lag; it is coalesced to one recompute per frame for scrubbing.

import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';
import polygonClipping from 'polygon-clipping';
import { mainFrontLineOn, pocketRingsOn, loadFrontFeatures } from './front';

const SOURCE_ID = 'control-fill';
const SPHERE_ID = 'control-fill-sphere';
const POCKET_ID = 'control-fill-pocket';
export const CONTROL_FILL_LAYER_IDS = [SPHERE_ID, POCKET_ID];

// Match the front palette (Axis red, Soviet/Allied blue).
const AXIS_COLOR = '#b5402f';
const SOVIET_COLOR = '#2f6fb0';

type Ring = [number, number][];
type MultiPoly = Ring[][];

let LAND: MultiPoly = [];
let BBOX: [number, number, number, number] = [-11, 34, 60, 72];
let landPromise: Promise<void> | null = null;
function loadLand(): Promise<void> {
  if (!landPromise) {
    landPromise = fetch(`${import.meta.env.BASE_URL}data/control-tide/land.json`)
      .then((r) => r.json())
      .then((d: { land: MultiPoly; bbox: [number, number, number, number] }) => {
        LAND = d.land;
        BBOX = d.bbox;
      });
  }
  return landPromise;
}

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

function mpFeature(mp: MultiPoly, props: Record<string, unknown>): Feature | null {
  if (!mp || !mp.length) return null;
  return {
    type: 'Feature',
    properties: props,
    geometry: { type: 'MultiPolygon', coordinates: mp as unknown as number[][][][] },
  };
}

/** The belligerent land split along the front on `date` (Axis + Soviet spheres,
 *  plus pocket enclaves). */
function controlFill(dateISO: string): FeatureCollection {
  const line = mainFrontLineOn(dateISO) as Ring | null;
  if (!line || line.length < 2 || !LAND.length) return EMPTY;

  // Close each side of the front against a box beyond the land, then intersect
  // with the real land so only actual territory is painted (no sea, no box
  // edges). The front is extended straight to the box top/bottom so the far
  // north/south flanks fall to the nearest side.
  const [minX, minY, maxX, maxY] = BBOX;
  const PAD = 6;
  const W = minX - PAD, E = maxX + PAD, T = maxY + PAD, B = minY - PAD;
  const N = line[0], S = line[line.length - 1];
  const divide: Ring = [[N[0], T], ...line, [S[0], B]];
  const westRing: Ring = [...divide, [W, B], [W, T], [N[0], T]];
  const eastRing: Ring = [...divide, [E, B], [E, T], [N[0], T]];

  const axis = polygonClipping.intersection(LAND as never, [westRing] as never) as MultiPoly;
  const soviet = polygonClipping.intersection(LAND as never, [eastRing] as never) as MultiPoly;

  const features: Feature[] = [];
  const a = mpFeature(axis, { side: 'axis', kind: 'sphere' });
  if (a) features.push(a);
  const s = mpFeature(soviet, { side: 'soviet', kind: 'sphere' });
  if (s) features.push(s);

  // Pockets: an enclave in the encircled side's colour, clipped to land so
  // coastal pockets (Sevastopol, Odessa) don't bleed into the sea.
  for (const p of pocketRingsOn(dateISO)) {
    const enc = polygonClipping.intersection(LAND as never, [p.ring] as never) as MultiPoly;
    const f = mpFeature(enc, { side: p.encircled, kind: 'pocket' });
    if (f) features.push(f);
  }
  return { type: 'FeatureCollection', features };
}

const bySide = [
  'match', ['get', 'side'], 'axis', AXIS_COLOR, 'soviet', SOVIET_COLOR, '#888888',
] as const;

let lastDate = '';

export async function addControlFillLayer(map: MapLibreMap, date: string): Promise<void> {
  // Need both the land polygon and the front features before the first paint.
  await Promise.all([loadFrontFeatures(), loadLand()]);
  lastDate = date;
  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data: controlFill(date),
    attribution: 'Territorial control: the belligerent land split along the operational front',
  });
  const before = map.getStyle().layers?.find((l) => l.id.startsWith('borders'))?.id;
  map.addLayer(
    {
      id: SPHERE_ID,
      type: 'fill',
      source: SOURCE_ID,
      filter: ['==', ['get', 'kind'], 'sphere'],
      paint: { 'fill-color': bySide as never, 'fill-opacity': 0.42, 'fill-antialias': true },
    },
    before,
  );
  map.addLayer(
    {
      id: POCKET_ID,
      type: 'fill',
      source: SOURCE_ID,
      filter: ['==', ['get', 'kind'], 'pocket'],
      paint: { 'fill-color': bySide as never, 'fill-opacity': 0.5, 'fill-antialias': true },
    },
    before,
  );
}

// Coalesce rapid date changes (timeline scrub/play) to one clip per frame.
let pending: string | null = null;
let scheduled = false;
export function updateControlFillDate(map: MapLibreMap, date: string): void {
  if (date === lastDate) return;
  lastDate = date;
  pending = date;
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    const d = pending;
    pending = null;
    if (d == null) return;
    const src = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    if (src) src.setData(controlFill(d));
  });
}

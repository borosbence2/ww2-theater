// Front layer. Loads curated, date-stamped front FEATURES — the main front
// (open polyline) plus encirclement pockets and sieges (closed rings), each
// with its own keyframe track and lifespan — and renders the situation for the
// current date by interpolating every active feature between its two
// bracketing keyframes (by real day count). Keyframes are resampled to a fixed
// point count by the ETL, so each feature stays connected and glides as you
// scrub or play. Schematic but grounded; see data/curated/eastern-front.json.

import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';
import { dateToNum, diffDays } from '../time/dates';

const SOURCE_ID = 'front';
const BAND_AXIS_ID = 'front-band-axis';
const BAND_SOVIET_ID = 'front-band-soviet';
const POCKET_FILL_ID = 'front-pocket-fill';
const POCKET_CASING_ID = 'front-pocket-casing';
const POCKET_LINE_ID = 'front-pocket-line';
const SIEGE_LINE_ID = 'front-siege-line';
const CASING_ID = 'front-casing';
const LINE_ID = 'front-line';
const DATA_URL = `${import.meta.env.BASE_URL}data/front/eastern-keyframes.json`;

/** All MapLibre layer ids, for registry visibility toggling. */
export const FRONT_LAYER_IDS = [
  BAND_AXIS_ID,
  BAND_SOVIET_ID,
  POCKET_FILL_ID,
  POCKET_CASING_ID,
  POCKET_LINE_ID,
  SIEGE_LINE_ID,
  CASING_ID,
  LINE_ID,
];

/** Side colors, matching the control palette (Axis red, Soviet/Allied blue). */
const AXIS_COLOR = '#b5402f';
const SOVIET_COLOR = '#2f6fb0';

export interface FrontKeyframe {
  date: string;
  label?: string;
  start: number;
  coords: [number, number][];
}

export interface FrontFeature {
  id: string;
  kind: 'front' | 'pocket' | 'siege';
  label?: string;
  encircled?: 'axis' | 'soviet';
  closed: boolean;
  fromNum: number;
  toNum: number;
  keyframes: FrontKeyframe[];
}

let features: FrontFeature[] = [];

/** Loaded front features (used by the dev keyframe editor for ghost lines). */
export function getFrontFeatures(): FrontFeature[] {
  return features;
}

/** Interpolated main front line (N→S) on a date, or null. Shared with the
 *  control-fill layer so it tracks the same daily line the front draws. */
export function mainFrontLineOn(dateISO: string): [number, number][] | null {
  const main = features.find((f) => f.kind === 'front');
  return main ? coordsFor(main, dateISO, dateToNum(dateISO)) : null;
}

/** Active pockets/sieges on a date as closed rings, by encircled side — for
 *  the control fill (Axis pockets = red islands, Soviet pockets = holes). */
export function pocketRingsOn(
  dateISO: string,
): { encircled: 'axis' | 'soviet'; ring: [number, number][] }[] {
  const d = dateToNum(dateISO);
  const out: { encircled: 'axis' | 'soviet'; ring: [number, number][] }[] = [];
  for (const f of features) {
    if (!f.closed || !f.encircled) continue;
    const coords = coordsFor(f, dateISO, d);
    if (coords && coords.length > 2) out.push({ encircled: f.encircled, ring: [...coords, coords[0]] });
  }
  return out;
}

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

/** Interpolated coords of one feature, or null while it is not active.
 *  Active while fromNum <= d < toNum (`to` is the first day it is gone). */
function coordsFor(f: FrontFeature, dateISO: string, d: number): [number, number][] | null {
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
  const t = span > 0 ? diffDays(k0.date, dateISO) / span : 0;
  return k0.coords.map(([x, y], i) => {
    const [qx, qy] = k1.coords[i];
    return [x + (qx - x) * t, y + (qy - y) * t] as [number, number];
  });
}

/** All active features interpolated to an ISO date. */
function collectionFor(dateISO: string): FeatureCollection {
  if (!features.length) return EMPTY;
  const d = dateToNum(dateISO);
  const out: Feature[] = [];
  for (const f of features) {
    const coords = coordsFor(f, dateISO, d);
    if (!coords) continue;
    const properties = { id: f.id, kind: f.kind, encircled: f.encircled ?? '' };
    out.push(
      f.closed
        ? {
            type: 'Feature',
            properties,
            geometry: { type: 'Polygon', coordinates: [[...coords, coords[0]]] },
          }
        : {
            type: 'Feature',
            properties,
            geometry: { type: 'LineString', coordinates: coords },
          },
    );
  }
  return { type: 'FeatureCollection', features: out };
}

export async function addFrontLayer(map: MapLibreMap, date: string): Promise<void> {
  const data = await fetch(DATA_URL).then((r) => r.json());
  features = data.features;

  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data: collectionFor(date),
    attribution: 'Front line: curated (approximate)',
  });

  const layout = { 'line-cap': 'round', 'line-join': 'round' } as const;
  const isFront = ['==', ['get', 'kind'], 'front'] as const;
  const isPocket = ['==', ['get', 'kind'], 'pocket'] as const;
  const isSiege = ['==', ['get', 'kind'], 'siege'] as const;
  const encircledColor = [
    'match', ['get', 'encircled'], 'axis', AXIS_COLOR, SOVIET_COLOR,
  ] as const;

  // Soft side tint along the main front: Axis to the west (line runs N->S, so
  // a positive offset is to the right of travel = west), Soviet to the east.
  map.addLayer({
    id: BAND_AXIS_ID,
    type: 'line',
    source: SOURCE_ID,
    filter: isFront as never,
    layout,
    paint: {
      'line-color': AXIS_COLOR,
      'line-opacity': 0.13,
      'line-width': ['interpolate', ['linear'], ['zoom'], 3, 14, 7, 36],
      'line-offset': ['interpolate', ['linear'], ['zoom'], 3, 8, 7, 20],
      'line-blur': ['interpolate', ['linear'], ['zoom'], 3, 8, 7, 18],
    },
  });
  map.addLayer({
    id: BAND_SOVIET_ID,
    type: 'line',
    source: SOURCE_ID,
    filter: isFront as never,
    layout,
    paint: {
      'line-color': SOVIET_COLOR,
      'line-opacity': 0.13,
      'line-width': ['interpolate', ['linear'], ['zoom'], 3, 14, 7, 36],
      'line-offset': ['interpolate', ['linear'], ['zoom'], 3, -8, 7, -20],
      'line-blur': ['interpolate', ['linear'], ['zoom'], 3, 8, 7, 18],
    },
  });

  // Pockets and sieges: translucent fill colored by who is inside.
  map.addLayer({
    id: POCKET_FILL_ID,
    type: 'fill',
    source: SOURCE_ID,
    filter: ['!=', ['get', 'kind'], 'front'] as never,
    paint: {
      'fill-color': encircledColor as never,
      'fill-opacity': ['match', ['get', 'kind'], 'siege', 0.08, 0.16] as never,
    },
  });

  // Main front line: a wide, soft, low-opacity glow beneath a thin crisp core,
  // so the line reads as a quiet boundary and the unit counters stay the
  // loudest thing on the map. (Replaces the old bright white casing.)
  map.addLayer({
    id: CASING_ID,
    type: 'line',
    source: SOURCE_ID,
    filter: isFront as never,
    layout,
    paint: {
      'line-color': '#0d131d',
      'line-opacity': 0.18,
      'line-width': ['interpolate', ['linear'], ['zoom'], 3, 5, 7, 12],
      'line-blur': ['interpolate', ['linear'], ['zoom'], 3, 3, 7, 6],
    },
  });
  map.addLayer({
    id: LINE_ID,
    type: 'line',
    source: SOURCE_ID,
    filter: isFront as never,
    layout,
    paint: {
      'line-color': '#16181c',
      'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1.6, 7, 3.2],
    },
  });

  // Pocket outline: same style as the front, thinner (it IS a front, locally).
  map.addLayer({
    id: POCKET_CASING_ID,
    type: 'line',
    source: SOURCE_ID,
    filter: isPocket as never,
    layout,
    paint: {
      'line-color': 'rgba(248,248,250,0.9)',
      'line-width': ['interpolate', ['linear'], ['zoom'], 3, 2.5, 7, 5.5],
    },
  });
  map.addLayer({
    id: POCKET_LINE_ID,
    type: 'line',
    source: SOURCE_ID,
    filter: isPocket as never,
    layout,
    paint: {
      'line-color': '#16181c',
      'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1.2, 7, 2.8],
    },
  });

  // Siege ring: dashed — the city inside still holds.
  map.addLayer({
    id: SIEGE_LINE_ID,
    type: 'line',
    source: SOURCE_ID,
    filter: isSiege as never,
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: {
      'line-color': '#16181c',
      'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1.2, 7, 2.8],
      'line-dasharray': [2, 2],
    },
  });
}

export function frontReady(map: MapLibreMap): boolean {
  return Boolean(map.getSource(SOURCE_ID));
}

/** Re-interpolate all front features to the given date. */
export function updateFrontDate(map: MapLibreMap, date: string): void {
  const src = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
  if (!src) return;
  src.setData(collectionFor(date));
}

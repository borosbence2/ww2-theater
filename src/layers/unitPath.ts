// Unit path mode (Phase 2). When tracking is on for the selected unit, draws
// its full route: per-segment lines (dashed for rail/gap segments — the unit
// jumped, it didn't glide), a solid "traveled so far" overlay up to the
// current date, and keyframe dots with dates on zoom. Selection-driven, so it
// lives outside the layer registry; MapView updates it on selection/date.

import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';
import { dateToNum } from '../time/dates';
import { loadUnitTracks, positionOn, type UnitTrack } from '../data/units';

const SOURCE_ID = 'unit-path';
const ROUTE_ID = 'unit-path-route';
const ROUTE_DASH_ID = 'unit-path-route-dash';
const TRAVELED_ID = 'unit-path-traveled';
const KF_DOT_ID = 'unit-path-kf';
const KF_LABEL_ID = 'unit-path-kf-label';

export const UNIT_PATH_LAYER_IDS = [ROUTE_ID, ROUTE_DASH_ID, TRAVELED_ID, KF_DOT_ID, KF_LABEL_ID];

const SIDE_COLOR = { axis: '#b5402f', soviet: '#2f6fb0' } as const;

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

function pathCollection(track: UnitTrack, dateISO: string): FeatureCollection {
  const d = dateToNum(dateISO);
  const color = SIDE_COLOR[track.side];
  const out: Feature[] = [];

  // Full route, one feature per segment so rail/gap segments can dash.
  for (let i = 1; i < track.keyframes.length; i++) {
    const a = track.keyframes[i - 1];
    const b = track.keyframes[i];
    out.push({
      type: 'Feature',
      properties: { role: b.move === 'march' ? 'route' : 'route-dash', color },
      geometry: { type: 'LineString', coordinates: [a.at, b.at] },
    });
  }

  // Traveled portion: keyframes already passed + the interpolated position.
  const now = positionOn(track, dateISO, d);
  const passed = track.keyframes.filter((k) => k.start <= d).map((k) => k.at);
  if (now && passed.length) {
    out.push({
      type: 'Feature',
      properties: { role: 'traveled', color },
      geometry: { type: 'LineString', coordinates: [...passed, now] },
    });
  }

  // Keyframe dots with dates.
  for (const k of track.keyframes) {
    out.push({
      type: 'Feature',
      properties: { role: 'kf', color, date: k.date, passed: k.start <= d },
      geometry: { type: 'Point', coordinates: k.at },
    });
  }
  return { type: 'FeatureCollection', features: out };
}

/** Add empty path source + layers; `beforeId` keeps lines under unit symbols. */
export function addUnitPathLayers(map: MapLibreMap, beforeId?: string): void {
  map.addSource(SOURCE_ID, { type: 'geojson', data: EMPTY });

  const isRole = (role: string) => ['==', ['get', 'role'], role] as never;
  map.addLayer(
    {
      id: ROUTE_ID,
      type: 'line',
      source: SOURCE_ID,
      filter: isRole('route'),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['get', 'color'] as never, 'line-width': 2, 'line-opacity': 0.35 },
    },
    beforeId,
  );
  map.addLayer(
    {
      id: ROUTE_DASH_ID,
      type: 'line',
      source: SOURCE_ID,
      filter: isRole('route-dash'),
      layout: { 'line-cap': 'butt', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'] as never,
        'line-width': 2,
        'line-opacity': 0.35,
        'line-dasharray': [1.5, 2.5],
      },
    },
    beforeId,
  );
  map.addLayer(
    {
      id: TRAVELED_ID,
      type: 'line',
      source: SOURCE_ID,
      filter: isRole('traveled'),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['get', 'color'] as never, 'line-width': 3, 'line-opacity': 0.85 },
    },
    beforeId,
  );
  map.addLayer(
    {
      id: KF_DOT_ID,
      type: 'circle',
      source: SOURCE_ID,
      filter: isRole('kf'),
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 2.2, 8, 3.5],
        'circle-color': ['get', 'color'] as never,
        'circle-opacity': ['case', ['get', 'passed'] as never, 0.9, 0.4],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1,
      },
    },
    beforeId,
  );
  map.addLayer(
    {
      id: KF_LABEL_ID,
      type: 'symbol',
      source: SOURCE_ID,
      filter: isRole('kf'),
      minzoom: 6,
      layout: {
        'text-field': ['get', 'date'],
        'text-size': 9,
        'text-offset': [0, 0.9],
        'text-anchor': 'top',
        'text-optional': true,
      },
      paint: {
        'text-color': '#555c66',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1,
      },
    },
    beforeId,
  );
}

/** Show the path for a unit (or clear with null). */
export async function updateUnitPath(
  map: MapLibreMap,
  unitId: string | null,
  date: string,
): Promise<void> {
  const src = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
  if (!src) return;
  if (!unitId) {
    src.setData(EMPTY);
    return;
  }
  const track = (await loadUnitTracks()).find((t) => t.id === unitId);
  src.setData(track ? pathCollection(track, date) : EMPTY);
}

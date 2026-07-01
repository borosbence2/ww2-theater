// Territorial control (the "tide") — a two-sided glow band hugging the front,
// rather than a filled polygon. Filling "each side of the front" as territory
// needs a real land polygon (and closing against coasts/boxes is fragile: it
// either overlaps once the front runs inland, or paints neutrals and the sea).
//
// Instead we draw the front polyline offset perpendicular to each side: a warm-
// red band on the Axis side, a steel-blue band on the Soviet side, each soft-
// blurred so it fades from the front into the rear. This can never overlap, is
// bounded to the front (no neutrals/sea painted), and works for any front shape
// or date. Pockets get a colour ring on their encircled side.

import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';
import { mainFrontLineOn, pocketRingsOn, loadFrontFeatures } from './front';

const SOURCE_ID = 'control-fill';
const AXIS_BAND_ID = 'control-fill-axis';
const SOVIET_BAND_ID = 'control-fill-soviet';
const AXIS_POCKET_ID = 'control-fill-axis-hatch';
const SOVIET_POCKET_ID = 'control-fill-soviet-hatch';
export const CONTROL_FILL_LAYER_IDS = [SOVIET_BAND_ID, AXIS_BAND_ID, SOVIET_POCKET_ID, AXIS_POCKET_ID];

const AXIS_COLOR = '#b0472f';
const SOVIET_COLOR = '#3f6ba0';

// Band geometry (screen pixels): the front line is offset by ±OFFSET so a line
// of WIDTH sits just to one side of the front, softened by BLUR into the rear.
const WIDTH = 66;
const OFFSET = 36;
const BLUR = 52;

let lastDate = '';
const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

function controlLines(dateISO: string): FeatureCollection {
  const line = mainFrontLineOn(dateISO);
  if (!line || line.length < 2) return EMPTY;
  const features: Feature[] = [
    { type: 'Feature', properties: { kind: 'front' }, geometry: { type: 'LineString', coordinates: line } },
  ];
  for (const p of pocketRingsOn(dateISO)) {
    features.push({ type: 'Feature', properties: { kind: 'pocket', side: p.encircled }, geometry: { type: 'LineString', coordinates: p.ring } });
  }
  return { type: 'FeatureCollection', features };
}

export async function addControlFillLayer(map: MapLibreMap, date: string): Promise<void> {
  // The tide is derived from the front line; ensure the front data is loaded
  // before building it (this layer is added before the front layer).
  await loadFrontFeatures();
  lastDate = date;
  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data: controlLines(date),
    attribution: 'Territorial control: derived from the curated front (schematic)',
  });
  const firstLayer = map.getStyle().layers?.find((l) => l.id.startsWith('borders'))?.id;
  const frontFilter: ['==', ['get', string], string] = ['==', ['get', 'kind'], 'front'];
  const pocketFilter = (side: string) => ['all', ['==', ['get', 'kind'], 'pocket'], ['==', ['get', 'side'], side]];
  // Soviet band = front offset to the EAST (negative), Axis band to the WEST
  // (positive); the front polyline is ordered north→south so "right" is west.
  map.addLayer(
    { id: SOVIET_BAND_ID, type: 'line', source: SOURCE_ID, filter: frontFilter, paint: { 'line-color': SOVIET_COLOR, 'line-width': WIDTH, 'line-offset': -OFFSET, 'line-blur': BLUR, 'line-opacity': 0.5 } },
    firstLayer,
  );
  map.addLayer(
    { id: AXIS_BAND_ID, type: 'line', source: SOURCE_ID, filter: frontFilter, paint: { 'line-color': AXIS_COLOR, 'line-width': WIDTH, 'line-offset': OFFSET, 'line-blur': BLUR, 'line-opacity': 0.5 } },
    firstLayer,
  );
  // Pockets: a soft colour ring on the encircled side's colour.
  map.addLayer(
    { id: SOVIET_POCKET_ID, type: 'line', source: SOURCE_ID, filter: pocketFilter('soviet') as never, paint: { 'line-color': SOVIET_COLOR, 'line-width': 26, 'line-blur': 22, 'line-opacity': 0.5 } },
    firstLayer,
  );
  map.addLayer(
    { id: AXIS_POCKET_ID, type: 'line', source: SOURCE_ID, filter: pocketFilter('axis') as never, paint: { 'line-color': AXIS_COLOR, 'line-width': 26, 'line-blur': 22, 'line-opacity': 0.5 } },
    firstLayer,
  );
}

export function updateControlFillDate(map: MapLibreMap, date: string): void {
  if (date === lastDate) return;
  lastDate = date;
  const src = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
  if (src) src.setData(controlLines(date));
}

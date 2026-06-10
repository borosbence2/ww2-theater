// Country borders layer (M1). Loads the date-stamped CShapes GeoJSON once, then
// shows only the features valid on the current date via a MapLibre filter
// expression — cheap to update, so it stays smooth during playback.

import type {
  FilterSpecification,
  GeoJSONSource,
  Map as MapLibreMap,
} from 'maplibre-gl';
import { dateToNum } from '../time/dates';

const SOURCE_ID = 'borders';
const LABELS_SOURCE_ID = 'borders-labels';
const FILL_ID = 'borders-fill';
const LINE_ID = 'borders-line';
const LABEL_ID = 'borders-label';

/** All MapLibre layer ids, for registry visibility toggling. */
export const BORDERS_LAYER_IDS = [FILL_ID, LINE_ID, LABEL_ID];

const BASE = import.meta.env.BASE_URL;
const DATA_URL = `${BASE}data/borders/cshapes-europe-ww2.geojson`;
const LABELS_URL = `${BASE}data/borders/cshapes-europe-ww2-labels.geojson`;

/** Features valid on `date`: start <= date < end (end is exclusive). */
function dateFilter(date: string): FilterSpecification {
  const d = dateToNum(date);
  return [
    'all',
    ['<=', ['get', 'start'], d],
    ['>', ['get', 'end'], d],
  ] as unknown as FilterSpecification;
}

/** Add the borders source + fill/outline/label layers. Call after style load. */
export async function addBordersLayer(map: MapLibreMap, date: string): Promise<void> {
  const [data, labelData] = await Promise.all([
    fetch(DATA_URL).then((r) => r.json()),
    fetch(LABELS_URL).then((r) => r.json()),
  ]);

  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data,
    attribution: 'Borders: CShapes 2.0 (ETH ICR)',
  });
  // Separate point source: one label anchor per country (no per-island repeats).
  map.addSource(LABELS_SOURCE_ID, { type: 'geojson', data: labelData });

  const filter = dateFilter(date);

  map.addLayer({
    id: FILL_ID,
    type: 'fill',
    source: SOURCE_ID,
    filter,
    paint: {
      'fill-color': ['get', 'color'],
      // Hidden in favor of the M2 control fill (de facto control is the focus).
      // Kept as a layer so a future "political view" toggle (M6) can re-enable it.
      'fill-opacity': 0,
    },
  });

  map.addLayer({
    id: LINE_ID,
    type: 'line',
    source: SOURCE_ID,
    filter,
    paint: {
      'line-color': '#10141b',
      'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.6, 7, 1.6],
    },
  });

  map.addLayer({
    id: LABEL_ID,
    type: 'symbol',
    source: LABELS_SOURCE_ID,
    filter,
    layout: {
      'text-field': ['get', 'name'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 3, 9, 6, 13],
      'text-transform': 'uppercase',
      'text-letter-spacing': 0.08,
      'text-max-width': 7,
      // Country names are context; let city labels win ties, and don't crowd.
      'symbol-sort-key': 1,
      'text-padding': 6,
    },
    paint: {
      'text-color': '#3a4150',
      'text-halo-color': 'rgba(255,255,255,0.65)',
      'text-halo-width': 1.2,
      // Country names are context when zoomed out; fade as cities take over.
      'text-opacity': ['interpolate', ['linear'], ['zoom'], 3, 1, 6, 0.35],
    },
  });
}

/** True once the borders source has been added to the map. */
export function bordersReady(map: MapLibreMap): boolean {
  return Boolean(map.getSource(SOURCE_ID) as GeoJSONSource | undefined);
}

/** Re-filter the borders layers to the given date. */
export function updateBordersDate(map: MapLibreMap, date: string): void {
  if (!bordersReady(map)) return;
  const filter = dateFilter(date);
  map.setFilter(FILL_ID, filter);
  map.setFilter(LINE_ID, filter);
  map.setFilter(LABEL_ID, filter);
}

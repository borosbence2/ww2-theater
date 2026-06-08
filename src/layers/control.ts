// Territorial control layer (M2). Shows which side controls each territory
// (Axis / Axis-occupied / Allied / Neutral) as colored fills. Data is monthly
// (Stanford), so we load the file for the month containing the current date and
// swap it as the date crosses month boundaries (nearest-keyframe; daily
// interpolation is future work). The moving front is the boundary between the
// Axis-occupied and Allied/Soviet fills.

import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { feature } from 'topojson-client';
import { dateToNum } from '../time/dates';

const SOURCE_ID = 'control';
const FILL_ID = 'control-fill';
const OBJECT = 'control'; // TopoJSON object key written by the ETL
const BASE = import.meta.env.BASE_URL;

interface MonthEntry {
  month: string;
  start: number;
  end: number;
  file: string;
}
interface ControlIndex {
  source: string;
  sides: Record<string, { label: string; color: string }>;
  months: MonthEntry[];
}

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

let indexPromise: Promise<ControlIndex> | null = null;
function loadIndex(): Promise<ControlIndex> {
  if (!indexPromise) {
    indexPromise = fetch(`${BASE}data/control/index.json`).then((r) => r.json());
  }
  return indexPromise;
}

const monthCache = new Map<string, Promise<FeatureCollection>>();
function loadMonth(file: string): Promise<FeatureCollection> {
  let p = monthCache.get(file);
  if (!p) {
    // Files are TopoJSON; decode to GeoJSON for MapLibre.
    p = fetch(`${BASE}data/control/${file}`)
      .then((r) => r.json())
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((topo: any) => feature(topo, topo.objects[OBJECT]) as unknown as FeatureCollection);
    monthCache.set(file, p);
  }
  return p;
}

/** The monthly keyframe whose validity interval contains `date`. */
function monthForDate(index: ControlIndex, date: string): MonthEntry | null {
  const months = index.months;
  if (!months.length) return null;
  const d = dateToNum(date);
  if (d < months[0].start) return null; // before coverage begins
  for (const m of months) if (d >= m.start && d < m.end) return m;
  return months[months.length - 1]; // after last keyframe: hold last
}

let currentFile: string | null = null;

/** Add the control source + fill layer (beneath border outlines). */
export async function addControlLayer(map: MapLibreMap, date: string): Promise<void> {
  const index = await loadIndex();
  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data: EMPTY,
    attribution: `Control: ${index.source}`,
  });

  // Sit under the political outlines/labels from the borders layer if present.
  const before = map.getLayer('borders-line') ? 'borders-line' : undefined;
  map.addLayer(
    {
      id: FILL_ID,
      type: 'fill',
      source: SOURCE_ID,
      paint: {
        'fill-color': ['get', 'color'],
        'fill-opacity': 0.55,
      },
    },
    before,
  );

  await updateControlDate(map, date);
}

/** True once the control source exists on the map. */
export function controlReady(map: MapLibreMap): boolean {
  return Boolean(map.getSource(SOURCE_ID));
}

/** Swap the control data to the month covering `date` (no-op if unchanged). */
export async function updateControlDate(map: MapLibreMap, date: string): Promise<void> {
  const src = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
  if (!src) return;

  const index = await loadIndex();
  const entry = monthForDate(index, date);
  const file = entry?.file ?? null;
  if (file === currentFile) return;
  currentFile = file;

  if (!file) {
    src.setData(EMPTY);
    return;
  }
  const data = await loadMonth(file);
  // A newer date change may have superseded us while awaiting; only apply if
  // this is still the desired month.
  if (currentFile === file) src.setData(data);
}

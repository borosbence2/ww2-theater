// Layer registry (Phase 0.2). Each historical layer declares its id, label,
// legend, loader, date-update hook, and the MapLibre layer ids it owns, so the
// map shell can add layers uniformly and the UI can toggle them. New layers
// (units, battles, railways) register here and get toggles/legend for free.
//
// The Stanford control fill (./control) stays unregistered — administrative
// occupation conflicts with the operational front (see MILESTONES M2).

import type { Map as MapLibreMap } from 'maplibre-gl';
import { BORDERS_LAYER_IDS, addBordersLayer, updateBordersDate } from './borders';
import { FRONT_LAYER_IDS, addFrontLayer, updateFrontDate } from './front';
import { CITIES_LAYER_IDS, addCitiesLayer } from './cities';
import { CONTROL_DOTS_LAYER_IDS, addControlDotsLayer, updateControlDotsDate } from './controlDots';
import { UNITS_LAYER_IDS, addUnitsLayer, updateUnitsDate } from './units';

export interface LegendItem {
  /** Swatch shape: line | dash | fill | dot. */
  shape: 'line' | 'dash' | 'fill' | 'dot';
  color: string;
  label: string;
}

export interface LayerDef {
  id: string;
  label: string;
  legend: LegendItem[];
  /** Adds source(s) + layer(s); awaited in registry order after style load. */
  add: (map: MapLibreMap, date: string) => Promise<void>;
  /** Re-filters/re-interpolates to a new date during scrub/playback. */
  updateDate?: (map: MapLibreMap, date: string) => void;
  /** MapLibre layer ids owned by this layer, for visibility toggling. */
  mapLayerIds: string[];
}

const AXIS_COLOR = '#b5402f';
const SOVIET_COLOR = '#2f6fb0';

/** Registry order is also map add order (later entries draw on top). */
export const LAYERS: LayerDef[] = [
  {
    id: 'borders',
    label: 'Country borders',
    legend: [{ shape: 'line', color: '#10141b', label: 'De jure borders (CShapes)' }],
    add: addBordersLayer,
    updateDate: updateBordersDate,
    mapLayerIds: BORDERS_LAYER_IDS,
  },
  {
    id: 'front',
    label: 'Front line',
    legend: [
      { shape: 'line', color: '#16181c', label: 'Main front (interpolated)' },
      { shape: 'fill', color: AXIS_COLOR, label: 'Pocket — Axis encircled' },
      { shape: 'fill', color: SOVIET_COLOR, label: 'Pocket — Soviet encircled' },
      { shape: 'dash', color: '#16181c', label: 'Siege ring (city holds)' },
    ],
    add: addFrontLayer,
    updateDate: updateFrontDate,
    mapLayerIds: FRONT_LAYER_IDS,
  },
  {
    id: 'control',
    label: 'City control',
    legend: [
      { shape: 'dot', color: AXIS_COLOR, label: 'Axis-held (documented dates)' },
      { shape: 'dot', color: SOVIET_COLOR, label: 'Soviet-held (documented dates)' },
    ],
    add: addControlDotsLayer,
    updateDate: updateControlDotsDate,
    mapLayerIds: CONTROL_DOTS_LAYER_IDS,
  },
  {
    id: 'cities',
    label: 'Cities',
    legend: [
      { shape: 'dot', color: AXIS_COLOR, label: 'Capital' },
      { shape: 'dot', color: '#2b2f36', label: 'City (WWII-era names)' },
    ],
    add: addCitiesLayer,
    mapLayerIds: CITIES_LAYER_IDS,
  },
  {
    id: 'units',
    label: 'Military units',
    legend: [
      { shape: 'fill', color: AXIS_COLOR, label: 'German formation (zoom for corps/divisions)' },
      { shape: 'fill', color: SOVIET_COLOR, label: 'Soviet formation' },
    ],
    add: addUnitsLayer,
    updateDate: updateUnitsDate,
    mapLayerIds: UNITS_LAYER_IDS,
  },
];

/** Registry ids, for URL parsing without importing the full defs. */
export const ALL_LAYER_IDS = LAYERS.map((d) => d.id);

/** Apply store visibility to every registered MapLibre layer. */
export function applyVisibility(map: MapLibreMap, hiddenLayers: string[]): void {
  for (const def of LAYERS) {
    const visibility = hiddenLayers.includes(def.id) ? 'none' : 'visible';
    for (const layerId of def.mapLayerIds) {
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', visibility);
    }
  }
}

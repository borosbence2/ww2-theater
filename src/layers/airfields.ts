// Airfields layer. Curated Eastern-Front airfields as clickable points, drawn
// distinctly from city dots: a small runway "roundel" (a ring with a cross bar)
// so they read as airbases, not settlements. Air-unit position keyframes that
// reference a `base` resolve to these fields; selecting one opens the airfield
// panel (resident units on the date). Same load/cache pattern as ./cities.

import type { Map as MapLibreMap } from 'maplibre-gl';
import { loadAirfieldsGeoJSON } from '../data/airfields';

const SOURCE_ID = 'airfields';
const RING_ID = 'airfields-ring';
const DOT_ID = 'airfields-dot';
const LABEL_ID = 'airfields-label';

/** Click/hover target for MapView. */
export const AIRFIELD_DOT_LAYER_ID = RING_ID;
/** All MapLibre layer ids, for registry visibility toggling. */
export const AIRFIELDS_LAYER_IDS = [RING_ID, DOT_ID, LABEL_ID];

const AIRFIELD_COLOR = '#5a4a8a'; // muted violet — distinct from city/front/unit palettes

export async function addAirfieldsLayer(map: MapLibreMap): Promise<void> {
  const data = await loadAirfieldsGeoJSON();
  map.addSource(SOURCE_ID, { type: 'geojson', promoteId: 'id', data, attribution: 'Airfields: curated' });

  // Outer ring (the hit target — a roundel that reads as an airbase).
  map.addLayer({
    id: RING_ID,
    type: 'circle',
    source: SOURCE_ID,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 4, 8, 7],
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-color': AIRFIELD_COLOR,
      'circle-stroke-width': 2,
      'circle-opacity': 1,
    },
  });
  // Inner dot.
  map.addLayer({
    id: DOT_ID,
    type: 'circle',
    source: SOURCE_ID,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 1.4, 8, 2.4],
      'circle-color': AIRFIELD_COLOR,
      'circle-opacity': 0.95,
    },
  });
  // Labels appear once zoomed in a little (airfields are dense around battles).
  map.addLayer({
    id: LABEL_ID,
    type: 'symbol',
    source: SOURCE_ID,
    minzoom: 5.5,
    layout: {
      'text-field': ['get', 'name'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 5.5, 9, 9, 12],
      'text-offset': [0, 0.7],
      'text-anchor': 'top',
      'text-optional': true,
    },
    paint: {
      'text-color': '#463a6e',
      'text-halo-color': '#ffffff',
      'text-halo-width': 1.2,
    },
  });
}

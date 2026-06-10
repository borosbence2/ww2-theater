// Cities layer (M3). A static set of European cities (Natural Earth) with
// capitals emphasized and zoom-dependent density: dots grow with zoom and with
// importance (low scalerank), and labels are collision-managed so only the
// major cities show when zoomed out, more as you zoom in. Period (WWII-era)
// names are applied in the ETL.

import type { ExpressionSpecification, Map as MapLibreMap } from 'maplibre-gl';
import { loadCitiesGeoJSON } from '../data/cities';

const SOURCE_ID = 'cities';
const DOT_ID = 'cities-dot';
const LABEL_ID = 'cities-label';

/** Dot layer id, used by MapView for click-to-select and hover cursor. */
export const CITY_DOT_LAYER_ID = DOT_ID;
/** All MapLibre layer ids, for registry visibility toggling. */
export const CITIES_LAYER_IDS = [DOT_ID, LABEL_ID];

const isCapital: ExpressionSpecification = ['==', ['get', 'capital'], 1];

export async function addCitiesLayer(map: MapLibreMap): Promise<void> {
  const data = await loadCitiesGeoJSON();
  map.addSource(SOURCE_ID, { type: 'geojson', data, attribution: 'Cities: Natural Earth' });

  map.addLayer({
    id: DOT_ID,
    type: 'circle',
    source: SOURCE_ID,
    paint: {
      // Radius grows with zoom; important cities are larger, minor ones shrink
      // to sub-pixel when zoomed out (natural density control).
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['zoom'],
        3, ['interpolate', ['linear'], ['get', 'scalerank'], 0, 3, 7, 0.2],
        6, ['interpolate', ['linear'], ['get', 'scalerank'], 0, 4.5, 7, 1.4],
        10, ['interpolate', ['linear'], ['get', 'scalerank'], 0, 7, 7, 3.5],
      ],
      'circle-color': ['case', isCapital, '#b5402f', '#2b2f36'],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': ['case', isCapital, 1.4, 0.5],
      'circle-opacity': 0.9,
    },
  });

  map.addLayer({
    id: LABEL_ID,
    type: 'symbol',
    source: SOURCE_ID,
    layout: {
      'text-field': ['get', 'name'],
      'text-size': [
        'interpolate',
        ['linear'],
        ['zoom'],
        3, ['case', isCapital, 12, 10],
        8, ['case', isCapital, 16, 12],
      ],
      'text-offset': [0, 0.8],
      'text-anchor': 'top',
      'text-max-width': 7,
      // Capitals first, then by importance; lets minor labels drop on collision.
      'symbol-sort-key': ['+', ['get', 'scalerank'], ['case', isCapital, -10, 0]],
      'text-optional': true,
    },
    paint: {
      'text-color': ['case', isCapital, '#161a20', '#454b54'],
      'text-halo-color': '#ffffff',
      'text-halo-width': 1.2,
    },
  });
}

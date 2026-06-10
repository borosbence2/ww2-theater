// Module-level handle to the single MapLibre map, set by MapView, so UI
// components outside the map tree (omnibox, detail panel) can fly the camera.
// Kept out of the store: the map instance is not serializable state.

import type { Map as MapLibreMap } from 'maplibre-gl';

let map: MapLibreMap | null = null;

export function setMap(m: MapLibreMap | null): void {
  map = m;
}

export function getMap(): MapLibreMap | null {
  return map;
}

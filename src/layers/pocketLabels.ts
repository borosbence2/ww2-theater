// Pocket / siege names (Stalingrad, Courland, Demyansk…). The label ANCHORS are
// emitted into the control-fill source by controlFill() (kind:'pocket-label') —
// reusing that proven per-date pipeline. Here we only add the symbol layer, and
// register it LAST so it sits on top of the unit counters clustered inside a
// pocket (otherwise the counters win the label-collision and the name never
// draws). Text always draws (allow-overlap + ignore-placement), nudged up off
// the counter, and gated by zoom so it doesn't crowd the whole-theatre view.

import type { Map as MapLibreMap } from 'maplibre-gl';

const CONTROL_FILL_SOURCE_ID = 'control-fill';
const LAYER_ID = 'pocket-labels-text';
export const POCKET_LABELS_LAYER_IDS = [LAYER_ID];

// Darkened side colours so the names read against the pocket fills.
const AXIS_INK = '#7a2f1f';
const SOVIET_INK = '#26496f';

export async function addPocketLabelsLayer(map: MapLibreMap): Promise<void> {
  // control-fill (registered first) owns the source + the pocket-label features.
  if (!map.getSource(CONTROL_FILL_SOURCE_ID)) return;
  // No `before` → drawn on top of everything, including the unit counters.
  map.addLayer({
    id: LAYER_ID,
    type: 'symbol',
    source: CONTROL_FILL_SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'pocket-label'],
    minzoom: 4.6,
    layout: {
      'text-field': ['get', 'label'],
      // Openfreemap serves Noto (the default Open Sans fontstack 404s → no glyphs).
      'text-font': ['Noto Sans Italic'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 5, 11, 8, 14],
      'text-max-width': 7,
      'text-offset': [0, -1.8], // sit above the besieged counter at the centroid
      'text-allow-overlap': true, // always draw, even over the counters
      'text-ignore-placement': true,
    },
    paint: {
      'text-color': ['match', ['get', 'side'], 'axis', AXIS_INK, SOVIET_INK] as never,
      'text-halo-color': 'rgba(247,244,239,0.92)',
      'text-halo-width': 1.6,
      'text-halo-blur': 0.4,
    },
  });
}

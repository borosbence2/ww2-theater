// Battles layer (Phase 2). Wikidata battle/siege/operation markers, shown
// while ongoing on the current date (plus a short faded linger after the
// end). Crossed-swords icon generated on canvas; labels appear on zoom.
// Date filtering is a MapLibre filter over precomputed YYYYMMDD ints, so
// scrubbing stays cheap (no geometry rebuild).

import type { FilterSpecification, Map as MapLibreMap } from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';
import { dateToNum } from '../time/dates';
import { loadBattles } from '../data/battles';

const SOURCE_ID = 'battles';
const SYMBOL_ID = 'battles-symbol';
const ICON_ID = 'battle-swords';

/** All MapLibre layer ids, for registry visibility toggling. */
export const BATTLES_LAYER_IDS = [SYMBOL_ID];
/** Click/hover target for MapView. */
export const BATTLES_HIT_LAYER_ID = SYMBOL_ID;

function makeSwordsIcon(): ImageData {
  const PR = 2;
  const S = 26;
  const canvas = document.createElement('canvas');
  canvas.width = S * PR;
  canvas.height = S * PR;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(PR, PR);

  // White disc for contrast on any basemap.
  ctx.fillStyle = 'rgba(252, 250, 245, 0.92)';
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#3d3325';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Crossed swords.
  ctx.strokeStyle = '#3d3325';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(7, 7);
  ctx.lineTo(S - 7, S - 7);
  ctx.moveTo(S - 7, 7);
  ctx.lineTo(7, S - 7);
  ctx.stroke();
  // Hilts.
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(9.5, 14);
  ctx.lineTo(14, 9.5);
  ctx.moveTo(S - 9.5, 14);
  ctx.lineTo(S - 14, 9.5);
  ctx.stroke();

  return ctx.getImageData(0, 0, S * PR, S * PR);
}

/** Battles ongoing on the date (or lingering: start <= d <= linger). */
function dateFilter(date: string): FilterSpecification {
  const d = dateToNum(date);
  return [
    'all',
    ['<=', ['get', 'start'], d],
    ['>=', ['get', 'linger'], d],
  ] as unknown as FilterSpecification;
}

/** Full opacity while ongoing, faded during the post-end linger window. */
function opacityFor(date: string) {
  const d = dateToNum(date);
  return ['case', ['>=', ['get', 'end'], d], 1, 0.5] as never;
}

export async function addBattlesLayer(map: MapLibreMap, date: string): Promise<void> {
  const battles = await loadBattles();
  const features: Feature[] = battles.map((b) => ({
    type: 'Feature',
    properties: {
      id: b.id,
      name: b.name,
      start: b.startNum,
      end: b.endNum,
      linger: b.lingerNum,
    },
    geometry: { type: 'Point', coordinates: [b.lon, b.lat] },
  }));
  const data: FeatureCollection = { type: 'FeatureCollection', features };

  if (!map.hasImage(ICON_ID)) map.addImage(ICON_ID, makeSwordsIcon(), { pixelRatio: 2 });
  map.addSource(SOURCE_ID, { type: 'geojson', data, attribution: 'Battles: Wikidata (CC0)' });

  map.addLayer({
    id: SYMBOL_ID,
    type: 'symbol',
    source: SOURCE_ID,
    filter: dateFilter(date),
    layout: {
      'icon-image': ICON_ID,
      'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.6, 7, 0.95],
      'text-field': ['get', 'name'],
      'text-size': 10.5,
      'text-offset': [0, 1.3],
      'text-anchor': 'top',
      'text-max-width': 9,
      'text-optional': true,
    },
    paint: {
      'icon-opacity': opacityFor(date),
      'text-opacity': opacityFor(date),
      'text-color': '#4a3c22',
      'text-halo-color': '#ffffff',
      'text-halo-width': 1.1,
    },
  });
}

/** Re-filter battles to the given date. */
export function updateBattlesDate(map: MapLibreMap, date: string): void {
  if (!map.getLayer(SYMBOL_ID)) return;
  map.setFilter(SYMBOL_ID, dateFilter(date));
  map.setPaintProperty(SYMBOL_ID, 'icon-opacity', opacityFor(date));
  map.setPaintProperty(SYMBOL_ID, 'text-opacity', opacityFor(date));
}

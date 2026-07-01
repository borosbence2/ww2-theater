// Territorial control fill (the "tide") — two-sided, as a staff-map occupation
// overlay. The daily front line divides the theatre into two regions. Rather
// than closing each region against hand-authored coasts (fragile once the front
// runs inland), each side is closed against a fixed bounding BOX: the front is
// extended straight up/down to the box, then the Axis side wraps to the WEST
// edge and the Soviet side to the EAST edge. Both regions therefore share
// exactly the front polyline and can never overlap — robust for any front shape.
//
// Each side gets a faint flat tint plus a diagonal HATCH (Axis "\" red, Soviet
// "/" blue), so the basemap breathes through and the sides read by colour AND
// hatch direction, meeting cleanly at the front. Pockets are islands (red Axis /
// blue Soviet). The box is padded a little past the sea so the split reaches the
// coasts; a faint tint over the Baltic/Black Sea is accepted for robustness.

import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { FeatureCollection, Position } from 'geojson';
import { mainFrontLineOn, pocketRingsOn, loadFrontFeatures } from './front';

const SOURCE_ID = 'control-fill';
const SOVIET_TINT_ID = 'control-fill-soviet';
const SOVIET_HATCH_ID = 'control-fill-soviet-hatch';
const AXIS_TINT_ID = 'control-fill-axis';
const AXIS_HATCH_ID = 'control-fill-axis-hatch';
export const CONTROL_FILL_LAYER_IDS = [SOVIET_TINT_ID, AXIS_TINT_ID, SOVIET_HATCH_ID, AXIS_HATCH_ID];

const AXIS_COLOR = '#8a2f1c';
const SOVIET_COLOR = '#3c5f8c';

// Bounding box the two sides close against (lon/lat degrees). Padded past the
// theatre so the west/east fills reach the map edges; top/bottom clamp the
// vertical extension of the front's end points.
const WEST = 12;
const EAST = 62;
const TOP = 63;
const BOTTOM = 41;

let lastDate = '';
const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

function controlGeoms(dateISO: string): FeatureCollection {
  const line = mainFrontLineOn(dateISO);
  if (!line || line.length < 2) return EMPTY;
  const north = line[0];
  const south = line[line.length - 1];
  // Extend the front's ends straight to the box, so each side is fully enclosed.
  const topEnd: [number, number] = [north[0], TOP];
  const botEnd: [number, number] = [south[0], BOTTOM];

  // Axis = everything WEST of the front; Soviet = everything EAST.
  const axisRing: Position[] = [topEnd, ...line, botEnd, [WEST, BOTTOM], [WEST, TOP]];
  const sovietRing: Position[] = [topEnd, ...line, botEnd, [EAST, BOTTOM], [EAST, TOP]];

  // Pockets: Soviet pockets = blue islands (holes in the Axis red); Axis pockets
  // = red islands (holes in the Soviet blue).
  const pockets = pocketRingsOn(dateISO);
  const sovietPocketRings: Position[][] = pockets.filter((p) => p.encircled === 'soviet').map((p) => p.ring);
  const axisPocketRings: Position[][] = pockets.filter((p) => p.encircled === 'axis').map((p) => p.ring);

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { side: 'soviet' },
        geometry: { type: 'MultiPolygon', coordinates: [[sovietRing, ...axisPocketRings], ...sovietPocketRings.map((r) => [r])] },
      },
      {
        type: 'Feature',
        properties: { side: 'axis' },
        geometry: { type: 'MultiPolygon', coordinates: [[axisRing, ...sovietPocketRings], ...axisPocketRings.map((r) => [r])] },
      },
    ],
  };
}

/** Build a small repeating diagonal-hatch image (screen-space, DPR-aware). */
function hatchImage(color: string, back: boolean): { id: string; image: { width: number; height: number; data: Uint8ClampedArray }; pixelRatio: number } {
  const pr = Math.max(1, Math.round((typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1));
  const T = 11;
  const cv = document.createElement('canvas');
  cv.width = T * pr;
  cv.height = T * pr;
  const ctx = cv.getContext('2d')!;
  ctx.scale(pr, pr);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.15;
  ctx.lineCap = 'square';
  ctx.beginPath();
  if (back) {
    ctx.moveTo(0, 0);
    ctx.lineTo(T, T);
  } else {
    ctx.moveTo(0, T);
    ctx.lineTo(T, 0);
  }
  ctx.stroke();
  const img = ctx.getImageData(0, 0, T * pr, T * pr);
  return { id: back ? 'ctrl-hatch-axis' : 'ctrl-hatch-soviet', image: { width: img.width, height: img.height, data: img.data }, pixelRatio: pr };
}

export async function addControlFillLayer(map: MapLibreMap, date: string): Promise<void> {
  // The tide is derived from the front line; ensure the front data is loaded
  // before building it (this layer is added before the front layer).
  await loadFrontFeatures();
  lastDate = date;
  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data: controlGeoms(date),
    attribution: 'Territorial control: derived from the curated front (schematic)',
  });
  for (const back of [false, true]) {
    const h = hatchImage(back ? AXIS_COLOR : SOVIET_COLOR, back);
    if (!map.hasImage(h.id)) map.addImage(h.id, h.image, { pixelRatio: h.pixelRatio });
  }
  const firstLayer = map.getStyle().layers?.find((l) => l.id.startsWith('borders'))?.id;
  map.addLayer({ id: SOVIET_TINT_ID, type: 'fill', source: SOURCE_ID, filter: ['==', ['get', 'side'], 'soviet'], paint: { 'fill-color': SOVIET_COLOR, 'fill-opacity': 0.11 } }, firstLayer);
  map.addLayer({ id: AXIS_TINT_ID, type: 'fill', source: SOURCE_ID, filter: ['==', ['get', 'side'], 'axis'], paint: { 'fill-color': AXIS_COLOR, 'fill-opacity': 0.15 } }, firstLayer);
  map.addLayer({ id: SOVIET_HATCH_ID, type: 'fill', source: SOURCE_ID, filter: ['==', ['get', 'side'], 'soviet'], paint: { 'fill-pattern': 'ctrl-hatch-soviet', 'fill-opacity': 0.4 } }, firstLayer);
  map.addLayer({ id: AXIS_HATCH_ID, type: 'fill', source: SOURCE_ID, filter: ['==', ['get', 'side'], 'axis'], paint: { 'fill-pattern': 'ctrl-hatch-axis', 'fill-opacity': 0.5 } }, firstLayer);
}

export function updateControlFillDate(map: MapLibreMap, date: string): void {
  if (date === lastDate) return;
  lastDate = date;
  const src = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
  if (src) src.setData(controlGeoms(date));
}

// Curated operation arrows (Phase 5.4). Big sweeping tapered arrows for the
// signature offensives (Uranus, Citadel, Bagration), shown only during their
// date window — the editorial counterpart to the dynamic advance arrows. Each
// curated axis (control points) is smoothed into a Catmull-Rom curve and turned
// into a filled arrow polygon (shaft + arrowhead) drawn beneath the unit
// counters, with a labelled name. Its own legend toggle so it's easy to hide.

import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { Feature, FeatureCollection, Position } from 'geojson';
import { dateToNum } from '../time/dates';
import { OPERATIONS, type Operation } from '../data/operations';

const SOURCE_ID = 'operations';
const LABEL_SOURCE_ID = 'operations-labels';
const FILL_ID = 'operations-fill';
const OUTLINE_ID = 'operations-outline';
const LABEL_ID = 'operations-label';

export const OPERATIONS_LAYER_IDS = [FILL_ID, OUTLINE_ID, LABEL_ID];

const AXIS_COLOR = '#b5402f';
const SOVIET_COLOR = '#2f6fb0';

const SHAFT_W = 0.3; // arrow shaft width (degrees)
const HEAD_W = 0.72; // arrowhead span (degrees)
const HEAD_FRAC = 0.32; // fraction of the path length taken by the head

/** Catmull-Rom point between p1 and p2 (p0,p3 are the neighbours). */
function cr(p0: Position, p1: Position, p2: Position, p3: Position, t: number): Position {
  const t2 = t * t;
  const t3 = t2 * t;
  return [0, 1].map(
    (k) =>
      0.5 *
      (2 * p1[k] +
        (-p0[k] + p2[k]) * t +
        (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
        (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3),
  ) as Position;
}

/** Smooth a control polyline into a denser curve. */
function smooth(pts: Position[], perSeg = 16): Position[] {
  if (pts.length < 3) return pts;
  const out: Position[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? pts[i + 1];
    for (let j = 0; j < perSeg; j++) out.push(cr(p0, p1, p2, p3, j / perSeg));
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Turn a smoothed centreline into a filled arrow polygon (shaft + head). */
function arrowPolygon(center: Position[], side: string, name: string): Feature {
  const n = center.length;
  const normalAt = (i: number): [number, number] => {
    const a = center[Math.max(0, i - 1)];
    const b = center[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [dy / l, -dx / l];
  };
  let total = 0;
  const cum = [0];
  for (let i = 1; i < n; i++) {
    total += Math.hypot(center[i][0] - center[i - 1][0], center[i][1] - center[i - 1][1]);
    cum.push(total);
  }
  const neckLen = total * (1 - HEAD_FRAC);
  let neck = n - 1;
  for (let i = 1; i < n; i++)
    if (cum[i] >= neckLen) {
      neck = i;
      break;
    }
  const half = SHAFT_W / 2;
  const left: Position[] = [];
  const right: Position[] = [];
  for (let i = 0; i <= neck; i++) {
    const [nx, ny] = normalAt(i);
    left.push([center[i][0] + nx * half, center[i][1] + ny * half]);
    right.push([center[i][0] - nx * half, center[i][1] - ny * half]);
  }
  const [nx, ny] = normalAt(neck);
  const hh = HEAD_W / 2;
  const leftBarb: Position = [center[neck][0] + nx * hh, center[neck][1] + ny * hh];
  const rightBarb: Position = [center[neck][0] - nx * hh, center[neck][1] - ny * hh];
  const tip = center[n - 1];
  const ring = [...left, leftBarb, tip, rightBarb, ...right.reverse()];
  ring.push(ring[0]);
  return {
    type: 'Feature',
    properties: { side, name },
    geometry: { type: 'Polygon', coordinates: [ring] },
  };
}

const activeOps = (dateISO: string): Operation[] => {
  const d = dateToNum(dateISO);
  return OPERATIONS.filter((o) => d >= dateToNum(o.from) && d <= dateToNum(o.to));
};

/** Padded bounding boxes [minX,minY,maxX,maxY] of the operations active on a
 *  date — the dynamic advance arrows suppress themselves inside these so the
 *  editorial arrows aren't doubled by the automatic ones. */
export function activeOperationBoxes(dateISO: string): [number, number, number, number][] {
  const pad = 0.8;
  return activeOps(dateISO).map((op) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const axis of op.arrows)
      for (const [x, y] of axis) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    return [minX - pad, minY - pad, maxX + pad, maxY + pad];
  });
}

function arrowsFor(dateISO: string): FeatureCollection {
  const feats: Feature[] = [];
  for (const op of activeOps(dateISO))
    for (const axis of op.arrows) feats.push(arrowPolygon(smooth(axis), op.side, op.name));
  return { type: 'FeatureCollection', features: feats };
}

function labelsFor(dateISO: string): FeatureCollection {
  const feats: Feature[] = [];
  for (const op of activeOps(dateISO)) {
    feats.push({
      type: 'Feature',
      properties: { name: op.name, side: op.side },
      geometry: { type: 'Point', coordinates: op.labelAt ?? op.arrows[0][0] },
    });
  }
  return { type: 'FeatureCollection', features: feats };
}

const sideColor = ['match', ['get', 'side'], 'axis', AXIS_COLOR, SOVIET_COLOR] as const;

export async function addOperationsLayer(map: MapLibreMap, date: string): Promise<void> {
  map.addSource(SOURCE_ID, { type: 'geojson', data: arrowsFor(date) });
  map.addSource(LABEL_SOURCE_ID, { type: 'geojson', data: labelsFor(date) });

  map.addLayer({
    id: FILL_ID,
    type: 'fill',
    source: SOURCE_ID,
    maxzoom: 8.5, // strategic graphic; fades before the tactical view
    paint: {
      'fill-color': sideColor as never,
      'fill-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.32, 6, 0.42, 8.5, 0],
    },
  });
  map.addLayer({
    id: OUTLINE_ID,
    type: 'line',
    source: SOURCE_ID,
    maxzoom: 8.5,
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': sideColor as never,
      'line-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.7, 8.5, 0],
      'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1, 7, 2],
    },
  });
  map.addLayer({
    id: LABEL_ID,
    type: 'symbol',
    source: LABEL_SOURCE_ID,
    minzoom: 4,
    maxzoom: 8.5,
    layout: {
      'text-field': ['get', 'name'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 4, 11, 7, 15],
      'text-allow-overlap': true,
      'text-ignore-placement': true,
      'text-anchor': 'center',
    },
    paint: {
      'text-color': sideColor as never,
      'text-halo-color': 'rgba(248,248,250,0.95)',
      'text-halo-width': 1.6,
      'text-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0, 4.6, 1, 8, 1, 8.5, 0],
    },
  });
}

export function updateOperationsDate(map: MapLibreMap, date: string): void {
  const src = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
  if (src) src.setData(arrowsFor(date));
  const lsrc = map.getSource(LABEL_SOURCE_ID) as GeoJSONSource | undefined;
  if (lsrc) lsrc.setData(labelsFor(date));
}

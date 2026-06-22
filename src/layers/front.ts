// Front layer. Loads curated, date-stamped front FEATURES — the main front
// (open polyline) plus encirclement pockets and sieges (closed rings), each
// with its own keyframe track and lifespan — and renders the situation for the
// current date by interpolating every active feature between its two
// bracketing keyframes (by real day count). Keyframes are resampled to a fixed
// point count by the ETL, so each feature stays connected and glides as you
// scrub or play. Schematic but grounded; see data/curated/eastern-front.json.

import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';
import { addDays, dateToNum, diffDays } from '../time/dates';
import { activeOperationBoxes } from './operations';
import { loadDerivedUnits } from '../data/units';

const SOURCE_ID = 'front';
const BAND_AXIS_ID = 'front-band-axis';
const BAND_SOVIET_ID = 'front-band-soviet';
const POCKET_FILL_ID = 'front-pocket-fill';
/** Pocket/siege fill — a click target (selects the pocket). */
export const POCKET_FILL_LAYER_ID = POCKET_FILL_ID;
const POCKET_CASING_ID = 'front-pocket-casing';
const POCKET_LINE_ID = 'front-pocket-line';
const SIEGE_LINE_ID = 'front-siege-line';
const CASING_ID = 'front-casing';
const LINE_HALO_ID = 'front-line-halo';
const TEETH_ID = 'front-teeth';
const LINE_ID = 'front-line';
const TEETH_SPRITE = 'feba-tooth';
const ADV_SOURCE_ID = 'front-advance';
const ADV_ID = 'front-advance-arrows';
const ADV_SPRITE = { axis: 'adv-arrow-axis', soviet: 'adv-arrow-soviet' } as const;
const ENC_SOURCE_ID = 'front-encircle';
const ENC_ID = 'front-encircle-arrows';
const DATA_URL = `${import.meta.env.BASE_URL}data/front/eastern-keyframes.json`;

/** All MapLibre layer ids, for registry visibility toggling. */
export const FRONT_LAYER_IDS = [
  BAND_AXIS_ID,
  BAND_SOVIET_ID,
  POCKET_FILL_ID,
  POCKET_CASING_ID,
  POCKET_LINE_ID,
  SIEGE_LINE_ID,
  CASING_ID,
  LINE_HALO_ID,
  TEETH_ID,
  LINE_ID,
  ADV_ID,
  ENC_ID,
];

/** Side colors, matching the control palette (Axis red, Soviet/Allied blue). */
const AXIS_COLOR = '#b5402f';
const SOVIET_COLOR = '#2f6fb0';

export interface FrontKeyframe {
  date: string;
  label?: string;
  start: number;
  coords: [number, number][];
}

export interface FrontFeature {
  id: string;
  kind: 'front' | 'pocket' | 'siege';
  label?: string;
  encircled?: 'axis' | 'soviet';
  closed: boolean;
  from?: string;
  to?: string | null;
  fromNum: number;
  toNum: number;
  /** Unit ids trapped inside (placed in the ring by build-units). */
  garrison?: string[];
  /** Formations blockading the pocket (ids, or {id,from?,to?}). */
  besiegers?: (string | { id: string; from?: string; to?: string })[];
  keyframes: FrontKeyframe[];
}

let features: FrontFeature[] = [];

/** Loaded front features (used by the dev keyframe editor for ghost lines). */
export function getFrontFeatures(): FrontFeature[] {
  return features;
}

/** A pocket/siege feature by id (for the pocket panel). */
export function getPocketFeature(id: string): FrontFeature | undefined {
  return features.find((f) => f.id === id && f.closed);
}

// Cached front-features load, shared by the map layer and the pocket panel (so
// the panel works even if it mounts before the layer is added, e.g. deep link).
let featuresPromise: Promise<FrontFeature[]> | null = null;
export function loadFrontFeatures(): Promise<FrontFeature[]> {
  if (!featuresPromise) {
    featuresPromise = fetch(DATA_URL)
      .then((r) => r.json())
      .then((d) => {
        features = d.features;
        return features;
      });
    // Documented waypoints reshape the line (evidence feedback) — load them too.
    void loadDerivedUnits().then((us) => {
      evidenceUnits = us.filter((u) => u.wp && u.wp.length).map((u) => ({ wp: u.wp!, side: u.side }));
    });
  }
  return featuresPromise;
}

/** Interpolated main front line (N→S) on a date, deformed by documented
 *  evidence, or null. Shared with the control-fill layer + derived placement so
 *  everything tracks the same daily line. */
export function mainFrontLineOn(dateISO: string): [number, number][] | null {
  return resolvedFrontCoords(dateISO, dateToNum(dateISO));
}

/** Active pockets/sieges on a date as closed rings, by encircled side — for
 *  the control fill (Axis pockets = red islands, Soviet pockets = holes). */
export function pocketRingsOn(
  dateISO: string,
): { encircled: 'axis' | 'soviet'; ring: [number, number][] }[] {
  const d = dateToNum(dateISO);
  const out: { encircled: 'axis' | 'soviet'; ring: [number, number][] }[] = [];
  for (const f of features) {
    if (!f.closed || !f.encircled) continue;
    const coords = coordsFor(f, dateISO, d);
    if (coords && coords.length > 2) out.push({ encircled: f.encircled, ring: [...coords, coords[0]] });
  }
  return out;
}

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

// --- Evidence-driven line feedback ------------------------------------------
// Documented division positions (curated waypoints) update the FRONT LINE so it
// stays consistent with the units that override the schematic line: where a
// documented unit sits on the wrong side of the line, the line bulges past it.
// Sparse + local — active only while a waypoint is, so the blast radius is the
// waypoint's date window.
let evidenceUnits: { wp: [number, number, number][]; side: 'axis' | 'soviet' }[] = [];
const EV_MARGIN = 0.12; // line sits this far beyond the documented unit (deg)
const EV_WINDOW = 8; // vertices each side of the bulge
const EV_CAP = 1.6; // max bulge (deg)
const numToISO = (n: number): string => {
  const s = String(n);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
};

/** Documented {pos, side} constraints active on a date (interpolated waypoints). */
function evidenceOn(d: number): { pos: [number, number]; side: 'axis' | 'soviet' }[] {
  const out: { pos: [number, number]; side: 'axis' | 'soviet' }[] = [];
  for (const u of evidenceUnits) {
    const wp = u.wp;
    if (d < wp[0][0] || d > wp[wp.length - 1][0]) continue;
    let i = 0;
    while (i < wp.length - 1 && wp[i + 1][0] <= d) i++;
    const a = wp[i];
    const b = wp[Math.min(i + 1, wp.length - 1)];
    const span = b[0] > a[0] ? diffDays(numToISO(a[0]), numToISO(b[0])) : 0;
    const t = span > 0 ? Math.max(0, Math.min(1, diffDays(numToISO(a[0]), numToISO(d)) / span)) : 0;
    out.push({ pos: [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], side: u.side });
  }
  return out;
}

/** Bulge the line locally so each documented unit is on its own side. */
function deformForEvidence(line: [number, number][] | null, d: number): [number, number][] | null {
  if (!line) return line;
  const cons = evidenceOn(d);
  if (!cons.length) return line;
  const pts = line.map((p) => [p[0], p[1]] as [number, number]);
  const n = pts.length;
  for (const { pos, side } of cons) {
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < n; i++) {
      const dd = (pts[i][0] - pos[0]) ** 2 + (pts[i][1] - pos[1]) ** 2;
      if (dd < bd) {
        bd = dd;
        bi = i;
      }
    }
    const a = pts[Math.max(0, bi - 2)];
    const b = pts[Math.min(n - 1, bi + 2)];
    const tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nsx = -(b[1] - a[1]) / tl; // Soviet-side normal (east / left of southward travel)
    const nsy = (b[0] - a[0]) / tl;
    const N = pts[bi];
    const onSoviet = (pos[0] - N[0]) * nsx + (pos[1] - N[1]) * nsy > 0;
    if (side === 'axis' ? !onSoviet : onSoviet) continue; // already on its own side
    const dir = side === 'axis' ? 1 : -1; // push the line past the unit, toward the enemy
    let dispx = pos[0] + nsx * EV_MARGIN * dir - N[0];
    let dispy = pos[1] + nsy * EV_MARGIN * dir - N[1];
    const dmag = Math.hypot(dispx, dispy);
    if (dmag > EV_CAP) {
      dispx = (dispx / dmag) * EV_CAP;
      dispy = (dispy / dmag) * EV_CAP;
    }
    for (let j = Math.max(1, bi - EV_WINDOW); j <= Math.min(n - 2, bi + EV_WINDOW); j++) {
      const fall = Math.cos((Math.abs(j - bi) / EV_WINDOW) * (Math.PI / 2));
      pts[j][0] += dispx * fall;
      pts[j][1] += dispy * fall;
    }
  }
  return pts;
}

/** The day's main-front coords, deformed by documented evidence (shared by the
 *  rendered line, the tide, and derived unit placement). */
export function resolvedFrontCoords(dateISO: string, d: number): [number, number][] | null {
  const main = features.find((f) => f.kind === 'front');
  return main ? deformForEvidence(coordsFor(main, dateISO, d), d) : null;
}

// --- Dynamic advance arrows -------------------------------------------------
// Where the front MOVED over the last window, draw an arrow in the direction of
// movement, coloured by who advanced (Axis east = red, Soviet west = blue).
// Computed from the same interpolated line at T and T-Δ; index i corresponds
// (every keyframe is resampled to the same point count), so disp = now[i]-past[i].
const ADV_WINDOW = 10; // days looked back
const ADV_STEP = 14; // sample roughly every Nth point (sparse -> uncluttered)
const ADV_MIN = 0.32; // min perpendicular shift (deg ~ 35 km/10d) to draw an arrow
const ADV_MAX_N = 22; // hard cap on arrows

/** Arrow point-features for the front's movement ending on `dateISO`. */
function advanceArrows(dateISO: string): FeatureCollection {
  const now = mainFrontLineOn(dateISO);
  const then = mainFrontLineOn(addDays(dateISO, -ADV_WINDOW));
  if (!now || !then || now.length !== then.length || now.length < 5) return EMPTY;
  const opBoxes = activeOperationBoxes(dateISO); // skip where a curated arrow already tells the story
  const inOpBox = (x: number, y: number) =>
    opBoxes.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
  const out: Feature[] = [];
  for (let i = ADV_STEP; i < now.length - ADV_STEP; i += ADV_STEP) {
    if (inOpBox(now[i][0], now[i][1])) continue;
    const dx = now[i][0] - then[i][0];
    const dy = now[i][1] - then[i][1];
    // local front tangent -> east-pointing normal (Soviet side is east/+x)
    const tx = now[i + 1][0] - now[i - 1][0];
    const ty = now[i + 1][1] - now[i - 1][1];
    const tl = Math.hypot(tx, ty) || 1;
    let nx = ty / tl;
    let ny = -tx / tl;
    if (nx < 0) {
      nx = -nx;
      ny = -ny;
    } // ensure the normal points east (toward the Soviet rear)
    const advance = dx * nx + dy * ny; // signed perpendicular shift; >0 = front moved east = Axis gained
    if (Math.abs(advance) < ADV_MIN) continue;
    const side = advance > 0 ? 'axis' : 'soviet';
    const sgn = advance > 0 ? 1 : -1;
    const bearing = (Math.atan2(sgn * nx, sgn * ny) * 180) / Math.PI; // CW from north
    out.push({
      type: 'Feature',
      properties: { side, bearing, mag: Math.min(Math.abs(advance), 2) },
      geometry: { type: 'Point', coordinates: now[i] },
    });
  }
  // keep the strongest few — big offensives stay legible, quiet days show nothing
  out.sort((a, b) => (b.properties!.mag as number) - (a.properties!.mag as number));
  return { type: 'FeatureCollection', features: out.slice(0, ADV_MAX_N) };
}

/** Pincer arrows pressing in on each active pocket, coloured by the besieging
 *  side (the opposite of who is encircled), scaled to the ring's size. */
function encircleArrows(dateISO: string): FeatureCollection {
  const d = dateToNum(dateISO);
  const out: Feature[] = [];
  for (const f of features) {
    if (!f.closed || !f.encircled) continue;
    const ring = coordsFor(f, dateISO, d);
    if (!ring || ring.length < 3) continue;
    let cx = 0;
    let cy = 0;
    for (const [x, y] of ring) {
      cx += x;
      cy += y;
    }
    cx /= ring.length;
    cy /= ring.length;
    let rad = 0;
    for (const [x, y] of ring) rad += Math.hypot(x - cx, y - cy);
    rad /= ring.length;
    const offset = Math.max(0.08, rad * 0.16);
    const besieger = f.encircled === 'axis' ? 'soviet' : 'axis'; // besiegers oppose the trapped
    const K = 6;
    for (let k = 0; k < K; k++) {
      const [rx, ry] = ring[Math.floor((k / K) * ring.length)];
      let ox = rx - cx;
      let oy = ry - cy;
      const ol = Math.hypot(ox, oy) || 1;
      ox /= ol;
      oy /= ol;
      out.push({
        type: 'Feature',
        properties: { side: besieger, bearing: (Math.atan2(-ox, -oy) * 180) / Math.PI, mag: 0.9 },
        geometry: { type: 'Point', coordinates: [rx + ox * offset, ry + oy * offset] },
      });
    }
  }
  return { type: 'FeatureCollection', features: out };
}

/** Interpolated coords of one feature, or null while it is not active.
 *  Active while fromNum <= d < toNum (`to` is the first day it is gone). */
function coordsFor(f: FrontFeature, dateISO: string, d: number): [number, number][] | null {
  if (d < f.fromNum || d >= f.toNum) return null;
  const kfs = f.keyframes;
  if (d <= kfs[0].start) return kfs[0].coords;
  const last = kfs[kfs.length - 1];
  if (d >= last.start) return last.coords;

  let k0 = kfs[0];
  let k1 = kfs[1];
  for (let i = 0; i < kfs.length - 1; i++) {
    if (d >= kfs[i].start && d < kfs[i + 1].start) {
      k0 = kfs[i];
      k1 = kfs[i + 1];
      break;
    }
  }
  const span = diffDays(k0.date, k1.date);
  const t = span > 0 ? diffDays(k0.date, dateISO) / span : 0;
  return k0.coords.map(([x, y], i) => {
    const [qx, qy] = k1.coords[i];
    return [x + (qx - x) * t, y + (qy - y) * t] as [number, number];
  });
}

/** All active features interpolated to an ISO date. */
function collectionFor(dateISO: string): FeatureCollection {
  if (!features.length) return EMPTY;
  const d = dateToNum(dateISO);
  const out: Feature[] = [];
  for (const f of features) {
    // The main front absorbs documented evidence (bulges around documented
    // units); pockets/sieges are rings, drawn as-authored.
    const coords = f.kind === 'front' ? deformForEvidence(coordsFor(f, dateISO, d), d) : coordsFor(f, dateISO, d);
    if (!coords) continue;
    const properties = { id: f.id, kind: f.kind, encircled: f.encircled ?? '' };
    out.push(
      f.closed
        ? {
            type: 'Feature',
            properties,
            geometry: { type: 'Polygon', coordinates: [[...coords, coords[0]]] },
          }
        : {
            type: 'Feature',
            properties,
            geometry: { type: 'LineString', coordinates: coords },
          },
    );
  }
  return { type: 'FeatureCollection', features: out };
}

/** A small forward-edge "tooth" sprite (filled triangle on a baseline), drawn
 *  in the upper half so it sits to one side of the line once placed. */
function registerTeethSprite(map: MapLibreMap): void {
  if (map.hasImage(TEETH_SPRITE)) return;
  const s = 2; // pixel ratio for crispness
  const w = 16 * s;
  const h = 16 * s;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) return;
  g.fillStyle = '#14171c';
  g.beginPath(); // triangle pointing up, base at vertical centre
  g.moveTo(2 * s, h / 2);
  g.lineTo(w - 2 * s, h / 2);
  g.lineTo(w / 2, 2 * s);
  g.closePath();
  g.fill();
  map.addImage(TEETH_SPRITE, { width: w, height: h, data: g.getImageData(0, 0, w, h).data }, { pixelRatio: s });
}

/** Bold advance-arrow sprites (one per side), pointing up; icon-rotate aims
 *  them along the direction of movement. White outline so they read over tide. */
function registerArrowSprites(map: MapLibreMap): void {
  const s = 2;
  const w = 26 * s;
  const h = 34 * s;
  for (const [side, name] of Object.entries(ADV_SPRITE)) {
    if (map.hasImage(name)) continue;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    if (!g) continue;
    const cx = w / 2;
    g.beginPath();
    g.moveTo(cx, 2 * s); // tip
    g.lineTo(w - 3 * s, h * 0.42); // right barb
    g.lineTo(cx + 5 * s, h * 0.42); // right notch
    g.lineTo(cx + 5 * s, h - 3 * s); // right shaft foot
    g.lineTo(cx - 5 * s, h - 3 * s); // left shaft foot
    g.lineTo(cx - 5 * s, h * 0.42); // left notch
    g.lineTo(3 * s, h * 0.42); // left barb
    g.closePath();
    g.fillStyle = side === 'axis' ? AXIS_COLOR : SOVIET_COLOR;
    g.fill();
    g.lineWidth = 1.4 * s;
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.stroke();
    map.addImage(name, { width: w, height: h, data: g.getImageData(0, 0, w, h).data }, { pixelRatio: s });
  }
}

export async function addFrontLayer(map: MapLibreMap, date: string): Promise<void> {
  await loadFrontFeatures();
  registerTeethSprite(map);
  registerArrowSprites(map);

  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data: collectionFor(date),
    attribution: 'Front line: curated (approximate)',
  });
  map.addSource(ADV_SOURCE_ID, { type: 'geojson', data: advanceArrows(date) });
  map.addSource(ENC_SOURCE_ID, { type: 'geojson', data: encircleArrows(date) });

  const layout = { 'line-cap': 'round', 'line-join': 'round' } as const;
  const isFront = ['==', ['get', 'kind'], 'front'] as const;
  const isPocket = ['==', ['get', 'kind'], 'pocket'] as const;
  const isSiege = ['==', ['get', 'kind'], 'siege'] as const;
  const encircledColor = [
    'match', ['get', 'encircled'], 'axis', AXIS_COLOR, SOVIET_COLOR,
  ] as const;

  // Soft side tint along the main front: Axis to the west (line runs N->S, so
  // a positive offset is to the right of travel = west), Soviet to the east.
  map.addLayer({
    id: BAND_AXIS_ID,
    type: 'line',
    source: SOURCE_ID,
    filter: isFront as never,
    layout,
    paint: {
      'line-color': AXIS_COLOR,
      'line-opacity': 0.13,
      'line-width': ['interpolate', ['linear'], ['zoom'], 3, 14, 7, 36],
      'line-offset': ['interpolate', ['linear'], ['zoom'], 3, 8, 7, 20],
      'line-blur': ['interpolate', ['linear'], ['zoom'], 3, 8, 7, 18],
    },
  });
  map.addLayer({
    id: BAND_SOVIET_ID,
    type: 'line',
    source: SOURCE_ID,
    filter: isFront as never,
    layout,
    paint: {
      'line-color': SOVIET_COLOR,
      'line-opacity': 0.13,
      'line-width': ['interpolate', ['linear'], ['zoom'], 3, 14, 7, 36],
      'line-offset': ['interpolate', ['linear'], ['zoom'], 3, -8, 7, -20],
      'line-blur': ['interpolate', ['linear'], ['zoom'], 3, 8, 7, 18],
    },
  });

  // Pockets and sieges: translucent fill colored by who is inside.
  map.addLayer({
    id: POCKET_FILL_ID,
    type: 'fill',
    source: SOURCE_ID,
    filter: ['!=', ['get', 'kind'], 'front'] as never,
    paint: {
      'fill-color': encircledColor as never,
      'fill-opacity': ['match', ['get', 'kind'], 'siege', 0.08, 0.16] as never,
    },
  });

  // Main front line (FEBA): a soft dark glow, a thin light casing so it reads
  // over the two-sided tide, then a bold dark core — a confident staff-map
  // boundary. Teeth (below) add the forward-edge hatch once you zoom in.
  map.addLayer({
    id: CASING_ID,
    type: 'line',
    source: SOURCE_ID,
    filter: isFront as never,
    layout,
    paint: {
      'line-color': '#0d131d',
      'line-opacity': 0.22,
      'line-width': ['interpolate', ['linear'], ['zoom'], 3, 6, 7, 16],
      'line-blur': ['interpolate', ['linear'], ['zoom'], 3, 3, 7, 7],
    },
  });
  map.addLayer({
    id: LINE_HALO_ID,
    type: 'line',
    source: SOURCE_ID,
    filter: isFront as never,
    layout,
    paint: {
      'line-color': 'rgba(245,247,250,0.55)',
      'line-width': ['interpolate', ['linear'], ['zoom'], 3, 3.2, 7, 7.5],
    },
  });
  // Forward-edge teeth: a sawtooth sprite repeated along the line, on the Axis
  // (west) side, fading in at z>=5 so the strategic view stays a clean line.
  map.addLayer({
    id: TEETH_ID,
    type: 'symbol',
    source: SOURCE_ID,
    filter: isFront as never,
    minzoom: 5,
    layout: {
      'symbol-placement': 'line',
      'symbol-spacing': ['interpolate', ['linear'], ['zoom'], 5, 22, 8, 34],
      'icon-image': TEETH_SPRITE,
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-size': ['interpolate', ['linear'], ['zoom'], 5, 0.5, 8, 0.9],
      'icon-offset': [0, -7], // push the teeth to one side of the line
    },
    paint: {
      'icon-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0, 6, 0.7],
    },
  });
  map.addLayer({
    id: LINE_ID,
    type: 'line',
    source: SOURCE_ID,
    filter: isFront as never,
    layout,
    paint: {
      'line-color': '#14171c',
      'line-width': ['interpolate', ['linear'], ['zoom'], 3, 2.2, 7, 4.4],
    },
  });

  // Pocket outline: same style as the front, thinner (it IS a front, locally).
  map.addLayer({
    id: POCKET_CASING_ID,
    type: 'line',
    source: SOURCE_ID,
    filter: isPocket as never,
    layout,
    paint: {
      'line-color': 'rgba(248,248,250,0.9)',
      'line-width': ['interpolate', ['linear'], ['zoom'], 3, 2.5, 7, 5.5],
    },
  });
  map.addLayer({
    id: POCKET_LINE_ID,
    type: 'line',
    source: SOURCE_ID,
    filter: isPocket as never,
    layout,
    paint: {
      'line-color': '#16181c',
      'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1.2, 7, 2.8],
    },
  });

  // Siege ring: dashed — the city inside still holds.
  map.addLayer({
    id: SIEGE_LINE_ID,
    type: 'line',
    source: SOURCE_ID,
    filter: isSiege as never,
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: {
      'line-color': '#16181c',
      'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1.2, 7, 2.8],
      'line-dasharray': [2, 2],
    },
  });

  // Advance arrows: where the front moved, an arrow in the direction of the
  // push, sized by how far. Sparse + capped, fading out at high zoom so the
  // operational view shows offensives without cluttering the tactical view.
  map.addLayer({
    id: ADV_ID,
    type: 'symbol',
    source: ADV_SOURCE_ID,
    minzoom: 4,
    layout: {
      'icon-image': ['match', ['get', 'side'], 'axis', ADV_SPRITE.axis, ADV_SPRITE.soviet] as never,
      'icon-rotate': ['get', 'bearing'] as never,
      'icon-rotation-alignment': 'map',
      'icon-anchor': 'bottom',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-size': ['interpolate', ['linear'], ['get', 'mag'], 0.3, 0.5, 1.5, 1.05] as never,
    },
    paint: {
      'icon-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0, 4.8, 0.9, 8, 0.9, 9, 0],
    },
  });

  // Encirclement pincers: arrows pressing in on each active pocket, coloured by
  // the besieging side. Kept visible at high zoom (a pocket is a local event).
  map.addLayer({
    id: ENC_ID,
    type: 'symbol',
    source: ENC_SOURCE_ID,
    minzoom: 4,
    layout: {
      'icon-image': ['match', ['get', 'side'], 'axis', ADV_SPRITE.axis, ADV_SPRITE.soviet] as never,
      'icon-rotate': ['get', 'bearing'] as never,
      'icon-rotation-alignment': 'map',
      'icon-anchor': 'bottom',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-size': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 7, 0.95] as never,
    },
    paint: {
      'icon-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0, 4.8, 0.92],
    },
  });
}

export function frontReady(map: MapLibreMap): boolean {
  return Boolean(map.getSource(SOURCE_ID));
}

/** Re-interpolate all front features to the given date. */
export function updateFrontDate(map: MapLibreMap, date: string): void {
  const src = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
  if (!src) return;
  src.setData(collectionFor(date));
  const adv = map.getSource(ADV_SOURCE_ID) as GeoJSONSource | undefined;
  if (adv) adv.setData(advanceArrows(date));
  const enc = map.getSource(ENC_SOURCE_ID) as GeoJSONSource | undefined;
  if (enc) enc.setData(encircleArrows(date));
}

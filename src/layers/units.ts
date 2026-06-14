// Units layer (Phase 1). Renders positioned units as staff-map style symbols:
// a side-colored frame (Axis red / Soviet blue) with the branch symbol inside
// (cross = infantry, ellipse = armoured, both = motorized, empty = HQ) and
// NATO echelon marks above (XX division, XXX corps, XXXX army). Icons are
// generated on a canvas at layer init — no sprite assets.
//
// Echelon-zoom ladder via three symbol layers: armies always visible, corps
// from z5.4, divisions from z6.2 — the map never soups at theater zoom.
// Positions interpolate by date like the front (hold-then-jump for rail/gap
// segments); approximate-confidence segments render slightly transparent.

import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';
import { dateToNum, diffDays } from '../time/dates';
import {
  confidenceOn,
  derivedPlacementOn,
  loadDerivedUnits,
  loadUnitTracks,
  positionOn,
  type DerivedUnit,
  type UnitTrack,
} from '../data/units';
import { getFrontFeatures, type FrontFeature } from './front';

const SOURCE_ID = 'units';
const TOP_ID = 'units-top';
const ARMY_ID = 'units-army';
const CORPS_ID = 'units-corps';
const DIVISION_ID = 'units-division';
const BRIGADE_ID = 'units-brigade';
const SUB_ID = 'units-sub';

/** All MapLibre layer ids, for registry visibility toggling. */
export const UNITS_LAYER_IDS = [TOP_ID, ARMY_ID, CORPS_ID, DIVISION_ID, BRIGADE_ID, SUB_ID];
/** Click/hover targets for MapView. */
export const UNITS_HIT_LAYER_IDS = UNITS_LAYER_IDS;

const SIDE_COLOR = { axis: '#b5402f', soviet: '#2f6fb0' } as const;
const ECH_MARK: Record<string, string> = {
  battalion: 'II',
  regiment: 'III',
  brigade: 'X',
  division: 'XX',
  corps: 'XXX',
  army: 'XXXX',
  front: 'XXXXX',
  'army-group': 'XXXXX',
};
type EchGroup = 'top' | 'army' | 'corps' | 'division' | 'brigade' | 'sub';
const ECH_GROUP = (echelon: string): EchGroup =>
  ['battalion', 'regiment'].includes(echelon)
    ? 'sub' // focus-gated: only when a parent is selected
    : echelon === 'brigade'
      ? 'brigade'
      : echelon === 'corps'
        ? 'corps'
        : echelon === 'army'
          ? 'army'
          : ['front', 'army-group'].includes(echelon)
            ? 'top' // army groups + fronts: the zoomed-out tier
            : 'division';

// Each tier shows in a zoom WINDOW [min, max): senior echelons appear when
// zoomed out and drop off as you zoom into their children, so the map shows
// roughly one-to-two echelons at a time instead of all of them at once.
const ZOOM_WINDOW: Record<EchGroup, [number, number]> = {
  top: [3, 4.8], // army groups / fronts
  army: [4.2, 6.2],
  corps: [5.3, 7.2],
  division: [6.2, 24],
  brigade: [6.9, 24],
  sub: [7.2, 24], // regiments/battalions (also focus-gated)
};

let tracks: UnitTrack[] = [];
let derivedUnits: DerivedUnit[] = [];
const trackIds = new Set<string>();
/** Selected unit id: sub-division units render only for themselves/children
 *  of the focus (progressive disclosure — Tier 2 drill-down). */
let focusId: string | null = null;

// --- Derived positions: fraction along the daily interpolated main front ---

/** Interpolated main-front coords for a date (mirrors front.ts internals). */
function mainFrontLine(dateISO: string, d: number): [number, number][] | null {
  const main = getFrontFeatures().find((f: FrontFeature) => f.kind === 'front');
  if (!main || d < main.fromNum || d >= main.toNum) return null;
  const kfs = main.keyframes;
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

// Rear depth per echelon (degrees off the line): divisions hold the line,
// brigades just behind, then corps HQ, army HQ, and front/army-group in the
// deep rear — so at high zoom the echelons read as staff-map depth layers
// instead of one overlapping row. Mirrored by build-units.mjs' side check.
const ECH_DEPTH: Record<string, number> = {
  division: 0.12,
  brigade: 0.2,
  sub: 0.12,
  corps: 0.36,
  army: 0.62,
  top: 1.25,
};

/** Point at fraction f, offset perpendicular to the line toward `side`. */
function pointAt(line: [number, number][], f: number, side: 'axis' | 'soviet', ech: string): [number, number] {
  const i = Math.max(0, Math.min(line.length - 1, Math.round(f * (line.length - 1))));
  const a = line[Math.max(0, i - 2)];
  const b = line[Math.min(line.length - 1, i + 2)];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  // Line runs N->S. (-dy, dx) is the LEFT of travel = east = Soviet side;
  // Axis offsets the other way (right of travel = west).
  const off = (ECH_DEPTH[ech] ?? 0.3) * (side === 'axis' ? -1 : 1);
  return [line[i][0] + (-dy / len) * off, line[i][1] + (dx / len) * off];
}

/** Position of any unit (curated track first, then derived) on a date. */
export function getUnitPositionOn(id: string, dateISO: string): [number, number] | null {
  const d = dateToNum(dateISO);
  const track = tracks.find((t) => t.id === id);
  if (track) {
    const at = positionOn(track, dateISO, d);
    if (at) return at;
  }
  const du = derivedUnits.find((u) => u.id === id);
  if (!du) return null;
  const place = derivedPlacementOn(du, dateISO, d);
  if (!place) return null;
  if ('at' in place) return place.at; // inside a pocket ring
  const line = mainFrontLine(dateISO, d);
  return line ? pointAt(line, place.frac, du.side, ECH_GROUP(du.echelon)) : null;
}

const numToISO = (n: number): string => {
  const s = String(n);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
};

/** First renderable date of a derived unit (for search jump-in). */
export function firstDerivedDate(id: string): string | null {
  const du = derivedUnits.find((u) => u.id === id);
  if (!du?.segs.length) return null;
  return numToISO(du.segs[0].kfs[0][0]);
}

/** Side of a derived unit, or null if it has no derived track. */
export function derivedUnitSide(id: string): 'axis' | 'soviet' | null {
  return derivedUnits.find((u) => u.id === id)?.side ?? null;
}

/** Has this unit a sector-derived track (vs a curated one)? */
export function isDerivedUnit(id: string): boolean {
  return derivedUnits.some((u) => u.id === id);
}

/**
 * Monthly route of a derived unit: each segment keyframe's fraction resolved
 * against that month's front line. A gap between segments (front reassignment)
 * is a dashed jump, like a rail move. Returns [] for non-derived units.
 */
export function getDerivedRoute(id: string): { date: string; at: [number, number]; jump: boolean }[] {
  const du = derivedUnits.find((u) => u.id === id);
  if (!du) return [];
  const ech = ECH_GROUP(du.echelon);
  const out: { date: string; at: [number, number]; jump: boolean }[] = [];
  du.segs.forEach((seg, si) => {
    seg.kfs.forEach((kf, ki) => {
      const startNum = kf[0];
      const iso = numToISO(startNum);
      if (kf.length === 3) {
        out.push({ date: iso, at: [kf[1], kf[2]], jump: si > 0 && ki === 0 });
      } else {
        const line = mainFrontLine(iso, startNum);
        if (line) out.push({ date: iso, at: pointAt(line, kf[1], du.side, ech), jump: si > 0 && ki === 0 });
      }
    });
  });
  return out;
}

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

function makeIcon(side: 'axis' | 'soviet', type: string, mark: string, hollow = false): ImageData {
  const PR = 2;
  const W = 48;
  const H = 42;
  const canvas = document.createElement('canvas');
  canvas.width = W * PR;
  canvas.height = H * PR;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(PR, PR);

  const color = SIDE_COLOR[side];
  const x = 5;
  const y = 14;
  const w = 38;
  const h = 24;

  // Hollow + dashed frame = derived position (sector + OOB, not documented).
  ctx.fillStyle = hollow ? 'rgba(252, 252, 250, 0.55)' : 'rgba(252, 252, 250, 0.94)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.fillRect(x, y, w, h);
  if (hollow) ctx.setLineDash([4, 3]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);

  ctx.lineWidth = 1.6;
  if (type === 'infantry' || type === 'motorized') {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y + h);
    ctx.moveTo(x + w, y);
    ctx.lineTo(x, y + h);
    ctx.stroke();
  }
  if (type === 'armoured' || type === 'motorized') {
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, type === 'motorized' ? 8 : 11, type === 'motorized' ? 4.5 : 6.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (type === 'cavalry') {
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x + w, y);
    ctx.stroke();
  }

  ctx.fillStyle = color;
  ctx.font = '700 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(mark, x + w / 2, y - 3);

  return ctx.getImageData(0, 0, W * PR, H * PR);
}

function iconId(side: string, type: string, mark: string, hollow = false): string {
  return `u-${side}-${type}-${mark}${hollow ? '-d' : ''}`;
}

function collectionFor(dateISO: string): FeatureCollection {
  if (!tracks.length) return EMPTY;
  const d = dateToNum(dateISO);
  const out: Feature[] = [];
  for (const t of tracks) {
    if (
      ECH_GROUP(t.echelon) === 'sub' &&
      !(focusId !== null && (t.id === focusId || t.parentIds.includes(focusId)))
    ) {
      continue;
    }
    const at = positionOn(t, dateISO, d);
    if (!at) continue;
    out.push({
      type: 'Feature',
      properties: {
        id: t.id,
        short: t.short,
        icon: iconId(t.side, t.type, ECH_MARK[t.echelon] ?? 'XX'),
        ech: ECH_GROUP(t.echelon),
        approx: confidenceOn(t, d) === 'approximate',
      },
      geometry: { type: 'Point', coordinates: at },
    });
  }

  // Derived units ride the daily front line at their sector fraction, or sit
  // inside a pocket ring (absolute placement).
  const line = mainFrontLine(dateISO, d);
  for (const du of derivedUnits) {
    // A curated track wins whenever it is active on this date.
    if (trackIds.has(du.id)) {
      const t = tracks.find((x) => x.id === du.id)!;
      if (positionOn(t, dateISO, d)) continue;
    }
    const place = derivedPlacementOn(du, dateISO, d);
    if (!place) continue;
    const ech = ECH_GROUP(du.echelon);
    let at: [number, number];
    if ('at' in place) at = place.at;
    else if (line) at = pointAt(line, place.frac, du.side, ech);
    else continue;
    out.push({
      type: 'Feature',
      properties: {
        id: du.id,
        short: du.short,
        icon: iconId(du.side, du.type, ECH_MARK[du.echelon] ?? 'XX', true),
        ech,
        approx: false,
      },
      geometry: { type: 'Point', coordinates: at },
    });
  }
  return { type: 'FeatureCollection', features: out };
}

function addEchelonLayer(map: MapLibreMap, id: string, ech: EchGroup): void {
  const [minzoom, maxzoom] = ZOOM_WINDOW[ech];
  map.addLayer({
    id,
    type: 'symbol',
    source: SOURCE_ID,
    minzoom,
    maxzoom,
    filter: ['==', ['get', 'ech'], ech],
    layout: {
      'icon-image': ['get', 'icon'],
      // Legible even at the zoomed-out top tier (z≈3.5).
      'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.82, 6, 0.9, 8, 1.05],
      'icon-allow-overlap': true,
      'text-field': ['get', 'short'],
      'text-size': 10,
      'text-offset': [0, 1.7],
      'text-anchor': 'top',
      'text-optional': true,
      // Senior formations win label collisions.
      'symbol-sort-key': ['match', ['get', 'ech'], 'army', 0, 'corps', 1, 2],
    },
    paint: {
      'icon-opacity': ['case', ['get', 'approx'], 0.78, 1],
      'text-color': '#23272e',
      'text-halo-color': '#ffffff',
      'text-halo-width': 1.1,
    },
  });
}

export async function addUnitsLayer(map: MapLibreMap, date: string): Promise<void> {
  [tracks, derivedUnits] = await Promise.all([loadUnitTracks(), loadDerivedUnits()]);
  trackIds.clear();
  for (const t of tracks) trackIds.add(t.id);

  // One generated icon per (side, type, echelon-mark[, derived]) in use.
  const combos = new Set([
    ...tracks.map((t) => `${t.side}|${t.type}|${ECH_MARK[t.echelon] ?? 'XX'}|0`),
    ...derivedUnits.map((u) => `${u.side}|${u.type}|${ECH_MARK[u.echelon] ?? 'XX'}|1`),
  ]);
  for (const combo of combos) {
    const [side, type, mark, hollow] = combo.split('|') as ['axis' | 'soviet', string, string, string];
    const id = iconId(side, type, mark, hollow === '1');
    if (!map.hasImage(id)) {
      map.addImage(id, makeIcon(side, type, mark, hollow === '1'), { pixelRatio: 2 });
    }
  }

  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data: collectionFor(date),
    attribution: 'Units: curated (Stalingrad pilot, approximate)',
  });
  // Senior tiers first so juniors draw on top where windows overlap.
  addEchelonLayer(map, TOP_ID, 'top');
  addEchelonLayer(map, ARMY_ID, 'army');
  addEchelonLayer(map, CORPS_ID, 'corps');
  addEchelonLayer(map, DIVISION_ID, 'division');
  addEchelonLayer(map, BRIGADE_ID, 'brigade');
  addEchelonLayer(map, SUB_ID, 'sub');
}

/** Re-interpolate unit positions to the given date. */
export function updateUnitsDate(map: MapLibreMap, date: string): void {
  const src = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
  if (!src) return;
  src.setData(collectionFor(date));
}

/** Set the drill-down focus (selected unit) and refresh. */
export function updateUnitsFocus(map: MapLibreMap, unitId: string | null, date: string): void {
  if (focusId === unitId) return;
  focusId = unitId;
  updateUnitsDate(map, date);
}

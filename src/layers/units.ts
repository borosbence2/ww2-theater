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
import { dateToNum } from '../time/dates';
import { confidenceOn, loadUnitTracks, positionOn, type UnitTrack } from '../data/units';

const SOURCE_ID = 'units';
const ARMY_ID = 'units-army';
const CORPS_ID = 'units-corps';
const DIVISION_ID = 'units-division';
const SUB_ID = 'units-sub';

/** All MapLibre layer ids, for registry visibility toggling. */
export const UNITS_LAYER_IDS = [ARMY_ID, CORPS_ID, DIVISION_ID, SUB_ID];
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
type EchGroup = 'army' | 'corps' | 'division' | 'sub';
const ECH_GROUP = (echelon: string): EchGroup =>
  ['battalion', 'regiment', 'brigade'].includes(echelon)
    ? 'sub'
    : echelon === 'corps'
      ? 'corps'
      : ['army', 'front', 'army-group'].includes(echelon)
        ? 'army'
        : 'division';

let tracks: UnitTrack[] = [];
/** Selected unit id: sub-division units render only for themselves/children
 *  of the focus (progressive disclosure — Tier 2 drill-down). */
let focusId: string | null = null;

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

function makeIcon(side: 'axis' | 'soviet', type: string, mark: string): ImageData {
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

  ctx.fillStyle = 'rgba(252, 252, 250, 0.94)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);

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

function iconId(side: string, type: string, mark: string): string {
  return `u-${side}-${type}-${mark}`;
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
  return { type: 'FeatureCollection', features: out };
}

function addEchelonLayer(map: MapLibreMap, id: string, ech: string, minzoom: number): void {
  map.addLayer({
    id,
    type: 'symbol',
    source: SOURCE_ID,
    minzoom,
    filter: ['==', ['get', 'ech'], ech],
    layout: {
      'icon-image': ['get', 'icon'],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 4, 0.72, 8, 1.05],
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
  tracks = await loadUnitTracks();

  // One generated icon per (side, type, echelon-mark) combination in use.
  const combos = new Set(tracks.map((t) => `${t.side}|${t.type}|${ECH_MARK[t.echelon] ?? 'XX'}`));
  for (const combo of combos) {
    const [side, type, mark] = combo.split('|') as ['axis' | 'soviet', string, string];
    const id = iconId(side, type, mark);
    if (!map.hasImage(id)) map.addImage(id, makeIcon(side, type, mark), { pixelRatio: 2 });
  }

  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data: collectionFor(date),
    attribution: 'Units: curated (Stalingrad pilot, approximate)',
  });
  addEchelonLayer(map, ARMY_ID, 'army', 3);
  addEchelonLayer(map, CORPS_ID, 'corps', 5.4);
  addEchelonLayer(map, DIVISION_ID, 'division', 6.2);
  addEchelonLayer(map, SUB_ID, 'sub', 6.8);
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

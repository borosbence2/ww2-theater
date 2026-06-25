// Air forces layer (Luftwaffe / VVS). Renders air formations as a deliberately
// DISTINCT counter from the rectangular ground units: a side-coloured circular
// disc with an aircraft silhouette inside (role-shaped — fighter / bomber /
// Stuka / transport / recon) and a NATO echelon badge above. Air units flow
// through the same data pipeline as ground units (tracks/index/detail) so search,
// deep-links, command tree and the panel work for free; this layer just owns
// their rendering, their command links, and the HOI4-style combat-radius rings.
//
// Two range modes: the selected unit's ring (part of this layer) and an
// all-ranges overlay (a separate registry layer, default hidden).

import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';
import { dateToNum } from '../time/dates';
import { loadUnitTracks, parentOnDate, positionOn, type ParentSpan, type UnitTrack } from '../data/units';
import { AIRCRAFT } from '../data/aircraft';

const SOURCE_ID = 'air-units';
const LINKS_SOURCE_ID = 'air-links';
const LINKS_HALO_ID = 'air-links-halo';
const LINKS_ID = 'air-links';
const RANGE_SOURCE_ID = 'air-range';
const RANGE_FILL_ID = 'air-range-fill';
const RANGE_LINE_ID = 'air-range-line';
const RANGE_LABEL_ID = 'air-range-label';
const HOVER_GLOW_ID = 'air-hover-glow';
const ARMY_ID = 'air-army';
const CORPS_ID = 'air-corps';
const DIVISION_ID = 'air-division';
const SUB_ID = 'air-sub';
const FAMILY_ID = 'air-family';

/** All MapLibre layer ids owned by the "Air forces" registry layer. */
export const AIR_LAYER_IDS = [
  RANGE_FILL_ID,
  RANGE_LINE_ID,
  RANGE_LABEL_ID,
  LINKS_HALO_ID,
  LINKS_ID,
  HOVER_GLOW_ID,
  ARMY_ID,
  CORPS_ID,
  DIVISION_ID,
  SUB_ID,
  FAMILY_ID,
];
/** Click/hover targets (counters only). */
export const AIR_HIT_LAYER_IDS = [ARMY_ID, CORPS_ID, DIVISION_ID, SUB_ID, FAMILY_ID];

// All-ranges overlay (separate registry layer).
const RANGES_SOURCE_ID = 'air-ranges';
const RANGES_FILL_ID = 'air-ranges-fill';
const RANGES_LINE_ID = 'air-ranges-line';
export const AIR_RANGES_LAYER_IDS = [RANGES_FILL_ID, RANGES_LINE_ID];

const SIDE_COLOR = { axis: '#d6543d', soviet: '#4d8fd6' } as const;
const PAL = {
  axis: { line: '#d6543d', ink: '#9c3322', fill: '#fdeae3', bright: '#ef9a80' },
  soviet: { line: '#4d8fd6', ink: '#2c5e93', fill: '#e9f1fb', bright: '#8ab7ef' },
} as const;

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
  echelon === 'army' || echelon === 'front' || echelon === 'army-group'
    ? 'army'
    : echelon === 'corps'
      ? 'corps'
      : echelon === 'division' || echelon === 'brigade'
        ? 'division'
        : 'sub'; // regiment / battalion — focus-gated (Gruppe drill-down)

// Air is a sparse layer (a handful of formations), so the zoom ladder is gentle:
// air armies / Luftflotten always, air corps from z4.5, Geschwader/divisions from
// z5.5, and Gruppen/regiments focus-gated from z7 (only around a selection).
const ZOOM_WINDOW: Record<EchGroup, [number, number]> = {
  army: [3, 24],
  corps: [4.5, 24],
  division: [5.5, 24],
  sub: [7, 24],
};
const ECH_SCALE: Record<EchGroup, number> = { army: 1.1, corps: 1.0, division: 0.9, sub: 0.82 };

type AirTier = { r: number; rim: number; bf: number; bh: number; glow: boolean };
const LADDER: Record<string, AirTier> = {
  regiment: { r: 11, rim: 1.9, bf: 8, bh: 12, glow: false },
  division: { r: 13.5, rim: 2.2, bf: 9, bh: 13, glow: false },
  corps: { r: 16.5, rim: 2.6, bf: 10, bh: 14, glow: false },
  army: { r: 20, rim: 3.0, bf: 11.5, bh: 16, glow: true },
};
const ICON_TIER: Record<string, keyof typeof LADDER> = {
  battalion: 'regiment',
  regiment: 'regiment',
  brigade: 'division',
  division: 'division',
  corps: 'corps',
  army: 'army',
  front: 'army',
  'army-group': 'army',
};

// --- colour helpers (mirror units.ts) ---
function mixHex(a: string, b: string, t: number): string {
  const h = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  const x = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  const A = h(a);
  const B = h(b);
  return '#' + A.map((v, i) => x(v + (B[i] - v) * t)).join('');
}
function rgbaHex(hex: string, a: number): string {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

let tracks: UnitTrack[] = [];
const trackById = new Map<string, UnitTrack>();
const airIds: string[] = [];
let focusId: string | null = null;
let lastDateISO = '';

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

// --- aircraft silhouette ---------------------------------------------------
// Stroke-based top-view, drawn so the role reads at a glance: swept wings for
// fighters, straight broad wings + engine pods for bombers/transport, gull wings
// for the Stuka, a twin-boom for recon. Air HQs (Luftflotte / Air Army / corps)
// get a concentric ring instead of a plane — they command, they don't fly.
function drawPlane(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  role: string,
  ink: string,
): void {
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1.1, s * 0.22);

  const line = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  const dot = (x: number, y: number, r: number) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };

  if (role === 'recon') {
    // twin-boom (Fw 189): short nacelle + two booms back to the tailplane.
    const span = s * 1.0;
    const wingY = cy - s * 0.1;
    line(cx - span, wingY, cx + span, wingY);
    line(cx - span * 0.45, wingY, cx - span * 0.45, cy + s * 0.8);
    line(cx + span * 0.45, wingY, cx + span * 0.45, cy + s * 0.8);
    line(cx - span * 0.6, cy + s * 0.8, cx + span * 0.6, cy + s * 0.8);
    dot(cx, wingY, s * 0.18);
    return;
  }

  const fat = role === 'bomber' || role === 'transport';
  const noseY = cy - s;
  const tailY = cy + s * 0.78;
  // fuselage
  ctx.lineWidth = Math.max(1.3, s * (fat ? 0.34 : 0.22));
  line(cx, noseY, cx, tailY);
  ctx.lineWidth = Math.max(1.1, s * 0.2);

  // wings
  const span = s * (fat ? 1.08 : role === 'recon' ? 0.95 : 0.92);
  const wingY = cy - s * 0.06;
  if (role === 'dive-bomber') {
    // inverted gull wing (Ju 87): up from the root, then down to the tips.
    ctx.beginPath();
    ctx.moveTo(cx - span, wingY + s * 0.1);
    ctx.lineTo(cx - span * 0.42, wingY - s * 0.2);
    ctx.lineTo(cx, wingY);
    ctx.lineTo(cx + span * 0.42, wingY - s * 0.2);
    ctx.lineTo(cx + span, wingY + s * 0.1);
    ctx.stroke();
  } else {
    const sweep =
      role === 'fighter' || role === 'night-fighter' || role === 'heavy-fighter'
        ? s * 0.3
        : role === 'ground-attack'
          ? s * 0.16
          : 0;
    line(cx, wingY, cx - span, wingY + sweep);
    line(cx, wingY, cx + span, wingY + sweep);
  }

  // tailplane
  const tspan = s * 0.36;
  line(cx - tspan, tailY, cx + tspan, tailY);

  // engine pods
  const engines = role === 'transport' ? 3 : role === 'bomber' || role === 'heavy-fighter' ? 2 : 0;
  if (engines >= 2) {
    const ey = wingY + s * 0.02;
    dot(cx - span * 0.5, ey, s * 0.16);
    dot(cx + span * 0.5, ey, s * 0.16);
  }
  if (engines === 3) dot(cx, noseY + s * 0.16, s * 0.16);
}

function makeAirIcon(
  side: 'axis' | 'soviet',
  role: string,
  echelon: string,
  opts: { selected?: boolean } = {},
): ImageData {
  const PR = 2.6;
  const selected = !!opts.selected;
  const lv = LADDER[ICON_TIER[echelon] ?? 'division'] ?? LADDER.division;
  const pal = PAL[side];
  const mark = ECH_MARK[echelon] ?? '';
  const isHq = role === 'air-hq';

  const badgeFont = lv.bf;
  const badgeH = lv.bh;
  const badgePadX = Math.round(badgeFont * 0.55);
  const measure = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D & {
    letterSpacing?: string;
  };
  measure.font = `800 ${badgeFont}px ui-monospace, Menlo, Consolas, monospace`;
  if ('letterSpacing' in measure) measure.letterSpacing = '1.5px';
  const chipW = Math.ceil(measure.measureText(mark).width + badgePadX * 2);

  const D = lv.r * 2;
  const PAD = lv.glow || selected ? 11 : 6;
  const badgeGap = 2;
  const W = Math.max(D, chipW) + PAD * 2;
  const H = PAD + badgeH + badgeGap + D + PAD;
  const cx = W / 2;
  const cy = PAD + badgeH + badgeGap + lv.r;

  const canvas = document.createElement('canvas');
  canvas.width = W * PR;
  canvas.height = H * PR;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D & { letterSpacing?: string };
  ctx.scale(PR, PR);

  // senior glow / selected glow
  if (lv.glow || selected) {
    ctx.save();
    ctx.shadowColor = selected ? 'rgba(241,197,82,0.6)' : rgbaHex(pal.line, 0.4);
    ctx.shadowBlur = selected ? 10 : 7;
    ctx.beginPath();
    ctx.arc(cx, cy, lv.r, 0, Math.PI * 2);
    ctx.fillStyle = mixHex(pal.fill, pal.line, 0.12);
    ctx.fill();
    ctx.restore();
  }

  // disc body + depth shadow
  ctx.save();
  ctx.shadowColor = 'rgba(8,11,16,0.42)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 2;
  const grad = ctx.createLinearGradient(0, cy - lv.r, 0, cy + lv.r);
  grad.addColorStop(0, mixHex(pal.fill, '#ffffff', 0.45));
  grad.addColorStop(1, mixHex(pal.fill, pal.line, 0.14));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, lv.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // rim
  ctx.strokeStyle = mixHex(pal.line, pal.ink, 0.25);
  ctx.lineWidth = lv.rim;
  ctx.beginPath();
  ctx.arc(cx, cy, lv.r, 0, Math.PI * 2);
  ctx.stroke();

  // selected brass ring
  if (selected) {
    ctx.strokeStyle = '#f1c552';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, lv.r + 3, 0, Math.PI * 2);
    ctx.stroke();
  }

  // silhouette (or HQ concentric ring)
  if (isHq) {
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = Math.max(1.4, lv.rim * 0.7);
    ctx.beginPath();
    ctx.arc(cx, cy, lv.r * 0.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = pal.ink;
    ctx.beginPath();
    ctx.arc(cx, cy, lv.r * 0.16, 0, Math.PI * 2);
    ctx.fill();
  } else {
    drawPlane(ctx, cx, cy, lv.r * 0.62, role, pal.ink);
  }

  // echelon badge chip above
  const chipX = cx - chipW / 2;
  const chipY = PAD;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = '#0d131d';
  roundRect(ctx, chipX, chipY, chipW, badgeH, 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = selected ? 'rgba(241,197,82,0.7)' : rgbaHex(pal.line, 0.55);
  ctx.lineWidth = 1;
  roundRect(ctx, chipX, chipY, chipW, badgeH, 2);
  ctx.stroke();
  ctx.font = `800 ${badgeFont}px ui-monospace, Menlo, Consolas, monospace`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '1.5px';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = selected ? '#f6d278' : pal.bright;
  ctx.fillText(mark, cx + 0.75, chipY + badgeH / 2 + 0.5);

  return ctx.getImageData(0, 0, W * PR, H * PR);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
  }
}

function iconId(side: string, role: string, echelon: string, selected = false): string {
  const tier = ICON_TIER[echelon] ?? 'division';
  return `air-${side}-${role}-${tier}${selected ? '-s' : ''}`;
}

// --- combat radius + range rings -------------------------------------------

/** Max combat radius (km) among the unit's aircraft active on the date, or null. */
function combatRadiusOn(track: UnitTrack, dateISO: string): number | null {
  const d = dateToNum(dateISO);
  let best = 0;
  for (const a of track.aircraft ?? []) {
    const af = AIRCRAFT[a.id];
    if (!af) continue;
    const from = a.from ? dateToNum(a.from) : -Infinity;
    const to = a.to ? dateToNum(a.to) : Infinity;
    if (d >= from && d < to) best = Math.max(best, af.radius);
  }
  if (!best) for (const a of track.aircraft ?? []) best = Math.max(best, AIRCRAFT[a.id]?.radius ?? 0);
  return best || null;
}

/** Geodesic-ish circle polygon (closed ring) of `km` around a point. */
function rangeRing(center: [number, number], km: number, n = 72): [number, number][] {
  const [lon, lat] = center;
  const kx = 111 * Math.cos((lat * Math.PI) / 180); // km per degree lon at this lat
  const ky = 111;
  const ring: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = (2 * Math.PI * i) / n;
    ring.push([lon + (km / kx) * Math.cos(a), lat + (km / ky) * Math.sin(a)]);
  }
  return ring;
}

/** Best primary aircraft name on the date (for the ring label). */
function primaryAircraftOn(track: UnitTrack, dateISO: string): string | null {
  const d = dateToNum(dateISO);
  let best: { r: number; name: string } | null = null;
  for (const a of track.aircraft ?? []) {
    const af = AIRCRAFT[a.id];
    if (!af) continue;
    const from = a.from ? dateToNum(a.from) : -Infinity;
    const to = a.to ? dateToNum(a.to) : Infinity;
    if (d >= from && d < to && (!best || af.radius > best.r)) best = { r: af.radius, name: af.name };
  }
  return best?.name ?? null;
}

// --- data + family ---------------------------------------------------------

export function getAirUnitPositionOn(id: string, dateISO: string): [number, number] | null {
  const t = trackById.get(id);
  return t ? positionOn(t, dateISO, dateToNum(dateISO)) : null;
}

/** First mapped date of an air unit (search jump-in). */
export function firstAirDate(id: string): string | null {
  return trackById.get(id)?.keyframes[0]?.date ?? null;
}

/** Is this an air unit this layer owns? */
export function isAirUnit(id: string): boolean {
  return trackById.has(id);
}

const parentsOf = (id: string): ParentSpan[] | undefined => trackById.get(id)?.parents;
const echelonOf = (id: string): string | null => trackById.get(id)?.echelon ?? null;
const SENIOR = new Set(['army', 'army-group', 'front']);

function anchorOf(focus: string, d: number): string {
  if (SENIOR.has(echelonOf(focus) ?? '')) return focus;
  let cur = focus;
  for (let i = 0; i < 6; i++) {
    const p = parentOnDate(parentsOf(cur), d);
    if (!p || !trackById.has(p)) return cur;
    if (SENIOR.has(echelonOf(p) ?? '')) return p;
    cur = p;
  }
  return cur;
}

function buildChildrenIndex(d: number): Map<string, string[]> {
  const idx = new Map<string, string[]>();
  for (const id of airIds) {
    const p = parentOnDate(parentsOf(id), d);
    if (!p || !trackById.has(p)) continue;
    (idx.get(p) ?? idx.set(p, []).get(p)!).push(id);
  }
  return idx;
}

function computeFamily(focus: string, d: number): Set<string> {
  const anchor = anchorOf(focus, d);
  const fam = new Set<string>([anchor, focus]);
  const childrenIndex = buildChildrenIndex(d);
  const queue = [anchor];
  while (queue.length) {
    const x = queue.shift()!;
    for (const c of childrenIndex.get(x) ?? []) {
      if (!fam.has(c)) {
        fam.add(c);
        queue.push(c);
      }
    }
  }
  return fam;
}

function buildLinks(fam: Set<string>, dateISO: string, d: number): FeatureCollection {
  const feats: Feature[] = [];
  for (const id of fam) {
    const p = parentOnDate(parentsOf(id), d);
    if (!p || !fam.has(p)) continue;
    const a = getAirUnitPositionOn(id, dateISO);
    const b = getAirUnitPositionOn(p, dateISO);
    if (!a || !b) continue;
    feats.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [a, b] } });
  }
  return { type: 'FeatureCollection', features: feats };
}

function collectionFor(dateISO: string, d: number, family: Set<string> | null): FeatureCollection {
  const out: Feature[] = [];
  for (const t of tracks) {
    const group = ECH_GROUP(t.echelon);
    if (group === 'sub' && !(focusId !== null && (t.id === focusId || t.parentIds.includes(focusId)))) {
      continue;
    }
    const at = positionOn(t, dateISO, d);
    if (!at) continue;
    out.push({
      type: 'Feature',
      properties: {
        id: t.id,
        short: t.short,
        icon: iconId(t.side, t.type, t.echelon, t.id === focusId),
        ech: group,
        echelon: t.echelon,
        type: t.type,
        side: t.side,
        fam: family ? family.has(t.id) : false,
        dim: family ? !family.has(t.id) : false,
      },
      geometry: { type: 'Point', coordinates: at },
    });
  }
  return { type: 'FeatureCollection', features: out };
}

/** Range-ring feature collection for the focused unit (selection ring). */
function selectionRingFor(dateISO: string): FeatureCollection {
  if (!focusId) return EMPTY;
  const t = trackById.get(focusId);
  if (!t) return EMPTY;
  const at = positionOn(t, dateISO, dateToNum(dateISO));
  const km = combatRadiusOn(t, dateISO);
  if (!at || !km) return EMPTY;
  const plane = primaryAircraftOn(t, dateISO);
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          side: t.side,
          label: `${plane ? plane + ' · ' : ''}~${Math.round(km)} km combat radius`,
        },
        geometry: { type: 'Polygon', coordinates: [rangeRing(at, km)] },
      },
      {
        type: 'Feature',
        properties: { side: t.side, label: '' },
        geometry: { type: 'Point', coordinates: [at[0], at[1] + km / 111] },
      },
    ],
  };
}

function refresh(map: MapLibreMap, dateISO: string): void {
  lastDateISO = dateISO;
  const d = dateToNum(dateISO);
  const family = focusId ? computeFamily(focusId, d) : null;
  (map.getSource(SOURCE_ID) as GeoJSONSource | undefined)?.setData(collectionFor(dateISO, d, family));
  (map.getSource(LINKS_SOURCE_ID) as GeoJSONSource | undefined)?.setData(
    family ? buildLinks(family, dateISO, d) : EMPTY,
  );
  (map.getSource(RANGE_SOURCE_ID) as GeoJSONSource | undefined)?.setData(selectionRingFor(dateISO));
}

function addEchelonLayer(map: MapLibreMap, id: string, ech: EchGroup): void {
  const [minzoom, maxzoom] = ZOOM_WINDOW[ech];
  map.addLayer({
    id,
    type: 'symbol',
    source: SOURCE_ID,
    minzoom,
    maxzoom,
    filter: ['all', ['==', ['get', 'ech'], ech], ['!=', ['get', 'fam'], true]],
    layout: {
      'icon-image': ['get', 'icon'],
      'icon-size': [
        'interpolate',
        ['linear'],
        ['zoom'],
        3,
        0.5 * ECH_SCALE[ech],
        6,
        0.62 * ECH_SCALE[ech],
        9,
        0.78 * ECH_SCALE[ech],
      ],
      'icon-allow-overlap': true,
      'text-field': ['get', 'short'],
      'text-size': 10,
      'text-offset': [0, 1.4],
      'text-anchor': 'top',
      'text-optional': true,
      'text-allow-overlap': false,
      'symbol-sort-key': ['match', ['get', 'ech'], 'army', 0, 'corps', 1, 2],
    },
    paint: {
      'icon-opacity': ['case', ['get', 'dim'], 0.4, 1],
      'text-color': '#1c2733',
      'text-halo-color': '#eaf2fb',
      'text-halo-width': 1.4,
      'text-opacity': ['case', ['get', 'dim'], 0.35, 1],
    },
  });
}

export async function addAirLayer(map: MapLibreMap, date: string): Promise<void> {
  tracks = (await loadUnitTracks()).filter((t) => t.air);
  trackById.clear();
  airIds.length = 0;
  for (const t of tracks) {
    trackById.set(t.id, t);
    airIds.push(t.id);
  }

  // Generate one disc image per (side, role, tier) in use + a selected variant.
  const combos = new Set(tracks.map((t) => `${t.side}|${t.type}|${t.echelon}`));
  for (const combo of combos) {
    const [side, role, echelon] = combo.split('|') as ['axis' | 'soviet', string, string];
    for (const selected of [false, true]) {
      const id = iconId(side, role, echelon, selected);
      if (!map.hasImage(id)) map.addImage(id, makeAirIcon(side, role, echelon, { selected }), { pixelRatio: 2.6 });
    }
  }

  const d0 = dateToNum(date);
  lastDateISO = date;

  // Sources.
  map.addSource(SOURCE_ID, {
    type: 'geojson',
    promoteId: 'id',
    data: collectionFor(date, d0, null),
    attribution: 'Air forces: curated (Stalingrad pilot, approximate)',
  });
  map.addSource(LINKS_SOURCE_ID, { type: 'geojson', data: EMPTY });
  map.addSource(RANGE_SOURCE_ID, { type: 'geojson', data: EMPTY });

  // Range ring (selected unit) — drawn beneath the counters.
  map.addLayer({
    id: RANGE_FILL_ID,
    type: 'fill',
    source: RANGE_SOURCE_ID,
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: {
      'fill-color': ['match', ['get', 'side'], 'axis', SIDE_COLOR.axis, SIDE_COLOR.soviet],
      'fill-opacity': 0.1,
    },
  });
  map.addLayer({
    id: RANGE_LINE_ID,
    type: 'line',
    source: RANGE_SOURCE_ID,
    filter: ['==', ['geometry-type'], 'Polygon'],
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': ['match', ['get', 'side'], 'axis', SIDE_COLOR.axis, SIDE_COLOR.soviet],
      'line-width': 1.6,
      'line-opacity': 0.65,
      'line-dasharray': [3, 2.5],
    },
  });
  map.addLayer({
    id: RANGE_LABEL_ID,
    type: 'symbol',
    source: RANGE_SOURCE_ID,
    filter: ['==', ['geometry-type'], 'Point'],
    minzoom: 5,
    layout: {
      'text-field': ['get', 'label'],
      'text-size': 10,
      'text-anchor': 'bottom',
      'text-offset': [0, -0.3],
      'text-optional': true,
    },
    paint: {
      'text-color': ['match', ['get', 'side'], 'axis', '#9c3322', '#2c5e93'],
      'text-halo-color': '#ffffff',
      'text-halo-width': 1.4,
    },
  });

  // Command links (selected formation).
  map.addLayer({
    id: LINKS_HALO_ID,
    type: 'line',
    source: LINKS_SOURCE_ID,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#1b1e24', 'line-width': 3.2, 'line-opacity': 0.4 },
  });
  map.addLayer({
    id: LINKS_ID,
    type: 'line',
    source: LINKS_SOURCE_ID,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#f1c552', 'line-width': 1.6, 'line-opacity': 0.95 },
  });

  // Hover glow.
  map.addLayer({
    id: HOVER_GLOW_ID,
    type: 'circle',
    source: SOURCE_ID,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 12, 7, 20],
      'circle-blur': 0.7,
      'circle-color': ['match', ['get', 'side'], 'axis', SIDE_COLOR.axis, SIDE_COLOR.soviet],
      'circle-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.32, 0],
    },
  });

  addEchelonLayer(map, SUB_ID, 'sub');
  addEchelonLayer(map, DIVISION_ID, 'division');
  addEchelonLayer(map, CORPS_ID, 'corps');
  addEchelonLayer(map, ARMY_ID, 'army');

  // Selected formation: always visible across zoom with brass labels.
  map.addLayer({
    id: FAMILY_ID,
    type: 'symbol',
    source: SOURCE_ID,
    minzoom: 3,
    filter: ['==', ['get', 'fam'], true],
    layout: {
      'icon-image': ['get', 'icon'],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.6, 6, 0.72, 9, 0.86],
      'icon-allow-overlap': true,
      'text-field': ['get', 'short'],
      'text-size': 11,
      'text-offset': [0, 1.4],
      'text-anchor': 'top',
      'text-allow-overlap': false,
      'symbol-sort-key': ['match', ['get', 'ech'], 'army', 0, 'corps', 1, 2],
    },
    paint: {
      'icon-opacity': 1,
      'text-color': '#13202c',
      'text-halo-color': '#ffe4a0',
      'text-halo-width': 1.8,
    },
  });
}

export function updateAirDate(map: MapLibreMap, date: string): void {
  refresh(map, date);
}

export function updateAirFocus(map: MapLibreMap, unitId: string | null, date: string): void {
  // Only air-unit focus matters; a ground/other selection clears the air focus.
  const next = unitId && trackById.has(unitId) ? unitId : null;
  if (focusId === next) return;
  focusId = next;
  refresh(map, date);
}

// --- all-ranges overlay (separate registry layer) --------------------------

function allRangesCollection(dateISO: string): FeatureCollection {
  const d = dateToNum(dateISO);
  const feats: Feature[] = [];
  for (const t of tracks) {
    const at = positionOn(t, dateISO, d);
    const km = at && combatRadiusOn(t, dateISO);
    if (!at || !km) continue;
    feats.push({
      type: 'Feature',
      properties: { side: t.side },
      geometry: { type: 'Polygon', coordinates: [rangeRing(at, km)] },
    });
  }
  return { type: 'FeatureCollection', features: feats };
}

export async function addAirRangesLayer(map: MapLibreMap, date: string): Promise<void> {
  // Air tracks are loaded by addAirLayer (registry order puts air-ranges first, so
  // load defensively here too).
  if (!tracks.length) {
    tracks = (await loadUnitTracks()).filter((t) => t.air);
    for (const t of tracks) {
      trackById.set(t.id, t);
      if (!airIds.includes(t.id)) airIds.push(t.id);
    }
  }
  map.addSource(RANGES_SOURCE_ID, { type: 'geojson', data: allRangesCollection(date) });
  map.addLayer({
    id: RANGES_FILL_ID,
    type: 'fill',
    source: RANGES_SOURCE_ID,
    paint: {
      'fill-color': ['match', ['get', 'side'], 'axis', SIDE_COLOR.axis, SIDE_COLOR.soviet],
      'fill-opacity': 0.05,
    },
  });
  map.addLayer({
    id: RANGES_LINE_ID,
    type: 'line',
    source: RANGES_SOURCE_ID,
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': ['match', ['get', 'side'], 'axis', SIDE_COLOR.axis, SIDE_COLOR.soviet],
      'line-width': 1,
      'line-opacity': 0.4,
      'line-dasharray': [2, 3],
    },
  });
}

export function updateAirRangesDate(map: MapLibreMap, date: string): void {
  (map.getSource(RANGES_SOURCE_ID) as GeoJSONSource | undefined)?.setData(allRangesCollection(date));
}

// --- hover -----------------------------------------------------------------

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const ROLE_TIP: Record<string, string> = {
  fighter: 'FIGHTER',
  'heavy-fighter': 'HEAVY FIGHTER',
  'dive-bomber': 'DIVE BOMBER',
  'ground-attack': 'GROUND ATTACK',
  bomber: 'BOMBER',
  'night-fighter': 'NIGHT',
  recon: 'RECON',
  transport: 'TRANSPORT',
  'air-hq': 'AIR HQ',
};

function tipHTML(p: Record<string, unknown>): string {
  const side = (p.side === 'soviet' ? 'soviet' : 'axis') as 'axis' | 'soviet';
  const echelon = String(p.echelon ?? '');
  const role = String(p.type ?? '');
  const track = trackById.get(String(p.id ?? ''));
  const meta = [ECH_MARK[echelon] ?? '', ROLE_TIP[role] ?? role.toUpperCase()].filter(Boolean);
  const plane = track ? primaryAircraftOn(track, lastDateISO) : null;
  if (plane) meta.push(plane);
  const km = track ? combatRadiusOn(track, lastDateISO) : null;
  if (km) meta.push(`~${Math.round(km)} km radius`);
  return (
    `<div class="unit-tip-name unit-tip-${side}">${esc(String(p.short ?? ''))}</div>` +
    `<div class="unit-tip-meta">${esc(meta.join(' · '))}</div>`
  );
}

export function setupAirInteractions(map: MapLibreMap): void {
  const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 16, className: 'unit-tip' });
  let hoveredId: string | number | null = null;
  const clearHover = (): void => {
    if (hoveredId !== null) {
      map.setFeatureState({ source: SOURCE_ID, id: hoveredId }, { hover: false });
      hoveredId = null;
    }
    popup.remove();
    map.getCanvas().style.cursor = '';
  };
  for (const layerId of AIR_HIT_LAYER_IDS) {
    map.on('mousemove', layerId, (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const fid = f.id ?? null;
      if (fid !== hoveredId) {
        if (hoveredId !== null) map.setFeatureState({ source: SOURCE_ID, id: hoveredId }, { hover: false });
        hoveredId = fid;
        if (hoveredId !== null) map.setFeatureState({ source: SOURCE_ID, id: hoveredId }, { hover: true });
      }
      map.getCanvas().style.cursor = 'pointer';
      popup.setLngLat(e.lngLat).setHTML(tipHTML(f.properties as Record<string, unknown>)).addTo(map);
    });
    map.on('mouseleave', layerId, clearHover);
  }
}

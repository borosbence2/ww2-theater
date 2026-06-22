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

import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';
import { dateToNum } from '../time/dates';
import {
  confidenceOn,
  derivedPlacementOn,
  loadDerivedUnits,
  loadUnitTracks,
  parentOnDate,
  positionOn,
  type DerivedUnit,
  type ParentSpan,
  type UnitTrack,
} from '../data/units';
import { matchTemplate, type TemplateNode } from '../data/templates';
import { resolvedFrontCoords, frontLineById } from './front';

const SOURCE_ID = 'units';
const LINKS_SOURCE_ID = 'unit-links';
const LINKS_HALO_ID = 'units-links-halo';
const LINKS_ID = 'units-links';
// Soft glow circle behind the hovered counter (feature-state driven). Sits
// beneath the symbols and is not a hit target, so it never steals clicks.
const HOVER_GLOW_ID = 'units-hover-glow';
const TOP_ID = 'units-top';
const ARMY_ID = 'units-army';
const CORPS_ID = 'units-corps';
const DIVISION_ID = 'units-division';
const BRIGADE_ID = 'units-brigade';
const SUB_ID = 'units-sub';
// Selected unit's command family, force-rendered across zoom (so the parent
// army stays visible while you inspect its divisions).
const FAMILY_ID = 'units-family';
// Doctrinal sub-division drill-down: a selected division's organic regiments
// (from its TO&E template) clustered around it (SCALE_PLAN S6). Not a hit target
// — these are doctrinal markers, not indexed units.
const DOCTRINAL_SOURCE_ID = 'unit-doctrinal';
const DOCTRINAL_ID = 'units-doctrinal';

/** All MapLibre layer ids, for registry visibility toggling. */
export const UNITS_LAYER_IDS = [
  LINKS_HALO_ID,
  LINKS_ID,
  HOVER_GLOW_ID,
  TOP_ID,
  ARMY_ID,
  CORPS_ID,
  DIVISION_ID,
  BRIGADE_ID,
  SUB_ID,
  DOCTRINAL_ID,
  FAMILY_ID,
];
/** Click/hover targets for MapView (symbols only, not the link lines). */
export const UNITS_HIT_LAYER_IDS = [
  TOP_ID,
  ARMY_ID,
  CORPS_ID,
  DIVISION_ID,
  BRIGADE_ID,
  SUB_ID,
  FAMILY_ID,
];

// Frame stroke per side (Axis warm-red, Soviet steel-blue); the full counter
// palette (fills, ink, badge tints) lives in PAL below. Used for the hover glow.
const SIDE_COLOR = { axis: '#d6543d', soviet: '#4d8fd6' } as const;
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

// Counter design system — ported verbatim from the "Unit System Spec" board
// (Counter.dc.html). A unit's echelon reads three ways at once: footprint
// (w/h), a dark monospace badge chip above the frame, and fill/stroke intensity
// (t, 0 junior -> 1 senior). Senior HQs (army/front) also get a soft glow.
type IconTier = {
  w: number;
  h: number;
  t: number;
  fw: number; // frame stroke width
  bf: number; // badge font px
  bh: number; // badge height px
  glow: boolean;
};
const LADDER: Record<string, IconTier> = {
  regiment: { w: 40, h: 25, t: 0.0, fw: 1.6, bf: 8, bh: 12, glow: false },
  brigade: { w: 44, h: 27, t: 0.16, fw: 1.8, bf: 8.5, bh: 13, glow: false },
  division: { w: 52, h: 31, t: 0.42, fw: 2.0, bf: 9.5, bh: 14, glow: false },
  corps: { w: 63, h: 36, t: 0.66, fw: 2.3, bf: 10.5, bh: 15, glow: false },
  army: { w: 77, h: 43, t: 0.85, fw: 2.7, bf: 12, bh: 17, glow: true },
  front: { w: 93, h: 51, t: 1.0, fw: 3.1, bf: 13, bh: 19, glow: true },
};
// App echelons -> ladder tier (battalions ride the regiment footprint but keep
// their own 'II' mark; army-groups ride the front footprint).
const ICON_TIER: Record<string, keyof typeof LADDER> = {
  battalion: 'regiment',
  regiment: 'regiment',
  brigade: 'brigade',
  division: 'division',
  corps: 'corps',
  army: 'army',
  front: 'front',
  'army-group': 'front',
};
// Per-side palette (reconciled to units.ts SIDE_COLOR/FILL/INK): line = frame,
// ink = branch symbol, tl/td = light/dark fill tints (mixed by t), bright = badge.
const PAL = {
  axis: { line: '#d6543d', ink: '#9c3322', tl: '#fdeae3', td: '#e0a288', bright: '#ef9a80' },
  soviet: { line: '#4d8fd6', ink: '#2c5e93', tl: '#e9f1fb', td: '#9bc1ed', bright: '#8ab7ef' },
} as const;

// Tiny colour helpers: blend a->b by t (0..1), and hex -> rgba string.
function mixHex(a: string, b: string, t: number): string {
  const h = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  const x = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  const A = h(a),
    B = h(b);
  return '#' + A.map((v, i) => x(v + (B[i] - v) * t)).join('');
}
function rgbaHex(hex: string, a: number): string {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

// Each tier appears at its MIN zoom (so the map doesn't soup with divisions at
// theater zoom) and then PERSISTS as you zoom in — senior HQs stay on screen,
// stacked into the rear by ECH_DEPTH, so a division's army/corps remain visible
// (and labelled) behind it instead of vanishing the moment you zoom in to read
// the divisions. Only the min gates each tier; the rear is otherwise empty.
const ZOOM_WINDOW: Record<EchGroup, [number, number]> = {
  top: [3, 24], // army groups / fronts
  army: [4.2, 24],
  corps: [5.6, 24],
  division: [7, 24], // a whole army's divisions swarm the operational view —
  brigade: [7.8, 24], // hold them (and brigades/regiments) back until you zoom
  sub: [8.4, 24], //     into a sector, so armies/corps read at theater scale
};

// Per-echelon icon-size multiplier (on top of the counter ladder's w/h) so the
// hierarchy reads by size: seniors clearly bigger than the juniors clustered
// around them.
const ECH_SCALE: Record<EchGroup, number> = {
  top: 1.2,
  army: 1.08,
  corps: 0.96,
  division: 0.84,
  brigade: 0.76,
  sub: 0.7,
};

let tracks: UnitTrack[] = [];
let derivedUnits: DerivedUnit[] = [];
const trackIds = new Set<string>();
// By-id lookups for command-link resolution (parent/position of any unit).
const trackById = new Map<string, UnitTrack>();
const derivedById = new Map<string, DerivedUnit>();
const allUnitIds: string[] = [];
/** Selected unit id: sub-division units render only for themselves/children
 *  of the focus (progressive disclosure — Tier 2 drill-down). */
let focusId: string | null = null;
/** Last rendered date, so the hover tooltip can resolve a unit's nominal
 *  establishment strength (TO&E) for that day. */
let lastDateISO = '';

// --- Derived positions: fraction along the daily interpolated main front ---

/** Interpolated main-front coords for a date, deformed by documented evidence —
 *  the single resolved line shared with the rendered front + tide (front.ts), so
 *  derived units cluster on the same line the map draws. */
function mainFrontLine(dateISO: string, d: number): [number, number][] | null {
  return resolvedFrontCoords(dateISO, d);
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

/** Point at fraction f, offset perpendicular to the line toward `side`; `id`
 *  (when given) adds a deterministic per-unit cluster fan for sub-army echelons. */
function pointAt(
  line: [number, number][],
  f: number,
  side: 'axis' | 'soviet',
  ech: string,
  id?: string,
): [number, number] {
  const i = Math.max(0, Math.min(line.length - 1, Math.round(f * (line.length - 1))));
  const a = line[Math.max(0, i - 2)];
  const b = line[Math.min(line.length - 1, i + 2)];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  // Line runs N->S. (-dy, dx) is the LEFT of travel = east = Soviet side;
  // Axis offsets the other way (right of travel = west).
  const sideSign = side === 'axis' ? -1 : 1;
  let depth = ECH_DEPTH[ech] ?? 0.3;
  let along = 0;
  // Cluster sub-army echelons: their build-units fraction is their ARMY's sector
  // centre, so without a spread they'd stack on one point. A deterministic
  // id-hash fan (along the line + a little extra depth) turns them into a compact
  // group around the army instead of an even row strung across the whole sector.
  if (id && (ech === 'division' || ech === 'brigade' || ech === 'corps' || ech === 'sub')) {
    let h = 2166136261;
    for (let k = 0; k < id.length; k++) h = Math.imul(h ^ id.charCodeAt(k), 16777619);
    h >>>= 0;
    along = ((h % 1000) / 1000 - 0.5) * 0.7; // ±0.35° along the front
    depth += (((h >>> 10) % 1000) / 1000) * 0.22; // 0..0.22° extra rear depth
  }
  const tx = dx / len;
  const ty = dy / len;
  return [
    line[i][0] + (-dy / len) * depth * sideSign + tx * along,
    line[i][1] + (dx / len) * depth * sideSign + ty * along,
  ];
}

/** Position of any unit by id (curated track first, then derived) on a date,
 *  given the day's main-front line (pass null if off the front). */
function positionForId(
  id: string,
  dateISO: string,
  d: number,
  line: [number, number][] | null,
): [number, number] | null {
  const track = trackById.get(id);
  if (track) {
    const at = positionOn(track, dateISO, d);
    if (at) return at;
  }
  const du = derivedById.get(id);
  if (!du) return null;
  const place = derivedPlacementOn(du, dateISO, d);
  if (!place) return null;
  if ('at' in place) return place.at; // inside a pocket ring
  const ul = du.front ? frontLineById(du.front, dateISO, d) : line; // Finnish theatre rides its own line
  return ul ? pointAt(ul, place.frac, du.side, ECH_GROUP(du.echelon), du.id) : null;
}

/** Position of any unit (curated track first, then derived) on a date. */
export function getUnitPositionOn(id: string, dateISO: string): [number, number] | null {
  const d = dateToNum(dateISO);
  return positionForId(id, dateISO, d, mainFrontLine(dateISO, d));
}

// --- Command tree: which divisions sit under which army --------------------
// Selecting any unit reveals its whole formation around it: the chain up to its
// army (and army group) and every corps/division under that army, connected by
// leader lines. The family is force-rendered across zoom so the parent army
// stays on screen while you inspect its divisions.

const echelonOf = (id: string): string | null =>
  trackById.get(id)?.echelon ?? derivedById.get(id)?.echelon ?? null;
const parentsOf = (id: string): ParentSpan[] | undefined =>
  trackById.get(id)?.parents ?? derivedById.get(id)?.parents;
const SENIOR = new Set(['army', 'army-group', 'front']);

/** Climb to the army the focus belongs to (or the focus itself if it already
 *  is an army/army-group/front, or the highest ancestor reached). */
function anchorOf(focus: string, d: number): string {
  if (SENIOR.has(echelonOf(focus) ?? '')) return focus;
  let cur = focus;
  for (let i = 0; i < 8; i++) {
    const p = parentOnDate(parentsOf(cur), d);
    if (!p) return cur;
    if (SENIOR.has(echelonOf(p) ?? '')) return p;
    cur = p;
  }
  return cur;
}

/** parentId -> child ids active on the date (over every unit). */
function buildChildrenIndex(d: number): Map<string, string[]> {
  const idx = new Map<string, string[]>();
  for (const id of allUnitIds) {
    const p = parentOnDate(parentsOf(id), d);
    if (!p) continue;
    const arr = idx.get(p);
    if (arr) arr.push(id);
    else idx.set(p, [id]);
  }
  return idx;
}

/** The selected unit's formation: anchor army + its ancestors + every corps/
 *  division under it (descent stops at division/brigade — not regiments). */
function computeFamily(focus: string, d: number): Set<string> {
  const anchor = anchorOf(focus, d);
  const fam = new Set<string>([anchor, focus]);
  let cur = anchor; // ancestors (army group / front)
  for (let i = 0; i < 6; i++) {
    const p = parentOnDate(parentsOf(cur), d);
    if (!p || fam.has(p)) break;
    fam.add(p);
    cur = p;
  }
  const childrenIndex = buildChildrenIndex(d); // descendants down to divisions
  const queue = [anchor];
  while (queue.length) {
    const x = queue.shift()!;
    const g = ECH_GROUP(echelonOf(x) ?? 'division');
    if (g === 'division' || g === 'brigade' || g === 'sub') continue; // leaf
    for (const c of childrenIndex.get(x) ?? []) {
      if (!fam.has(c)) {
        fam.add(c);
        queue.push(c);
      }
    }
  }
  return fam;
}

/** Leader lines: each family unit to its parent (when the parent is in family). */
function buildLinks(
  fam: Set<string>,
  dateISO: string,
  d: number,
  line: [number, number][] | null,
): FeatureCollection {
  const feats: Feature[] = [];
  for (const id of fam) {
    const p = parentOnDate(parentsOf(id), d);
    if (!p || !fam.has(p)) continue;
    const a = positionForId(id, dateISO, d, line);
    const b = positionForId(p, dateISO, d, line);
    if (!a || !b) continue;
    feats.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: [a, b] },
    });
  }
  return { type: 'FeatureCollection', features: feats };
}

/** Doctrinal organic regiments of a focused division/brigade, clustered around
 *  its position (SCALE_PLAN S6 — "select a division, see its regiments"). Only
 *  when the division has no curated sub-units of its own (those real regiments
 *  render instead). Markers come from the TO&E template, drawn dashed/derived,
 *  and are NOT hit targets — they are doctrinal, not indexed units. */
function doctrinalFeatures(
  focus: string,
  dateISO: string,
  d: number,
  line: [number, number][] | null,
): FeatureCollection {
  const fu = trackById.get(focus) ?? derivedById.get(focus);
  if (!fu) return EMPTY;
  const g = ECH_GROUP(fu.echelon);
  if (g !== 'division' && g !== 'brigade') return EMPTY;
  // If this division has its own curated regiments, show those (real) instead.
  const hasCurated = tracks.some(
    (t) => ECH_GROUP(t.echelon) === 'sub' && t.parentIds.includes(focus) && positionOn(t, dateISO, d),
  );
  if (hasCurated) return EMPTY;
  const at = positionForId(focus, dateISO, d, line);
  if (!at) return EMPTY;
  const tmpl = matchTemplate(fu.side, fu.echelon, fu.type, dateISO);
  if (!tmpl) return EMPTY;
  // Top-level organic components, expanded by count (capped to keep it legible).
  const items: { label: string; branch: string; ech: string }[] = [];
  for (const c of tmpl.components as TemplateNode[]) {
    const n = c.count ?? 1;
    for (let i = 0; i < n && items.length < 10; i++) {
      items.push({ label: n > 1 ? `${c.label} ${i + 1}` : c.label, branch: c.branch, ech: c.ech });
    }
  }
  if (!items.length) return EMPTY;
  const R = 0.09; // small ring — only shown at sub-tier zoom
  const feats: Feature[] = items.map((it, i) => {
    const ang = -Math.PI / 2 + (i / items.length) * Math.PI * 2;
    const ech = ['regiment', 'brigade', 'battalion'].includes(it.ech) ? it.ech : 'regiment';
    return {
      type: 'Feature',
      properties: {
        id: `${focus}~r${i}`,
        short: it.label,
        icon: iconId(fu.side, it.branch, ech, ECH_MARK[ech] ?? 'III', true),
        ech: 'sub',
        side: fu.side,
        doctrinal: true,
      },
      geometry: { type: 'Point', coordinates: [at[0] + R * Math.cos(ang), at[1] + R * Math.sin(ang)] },
    };
  });
  return { type: 'FeatureCollection', features: feats };
}

const DOCTRINAL_BRANCHES = [
  'infantry', 'armoured', 'motorized', 'mechanized', 'cavalry', 'recon',
  'artillery', 'antitank', 'engineer', 'signals', 'support', 'hq',
];

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
        const line = du.front ? frontLineById(du.front, iso, startNum) : mainFrontLine(iso, startNum);
        if (line) out.push({ date: iso, at: pointAt(line, kf[1], du.side, ech, du.id), jump: si > 0 && ki === 0 });
      }
    });
  });
  return out;
}

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

type CtxLS = CanvasRenderingContext2D & { letterSpacing?: string };
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
  }
}

// Counter image — a canvas port of the "Unit System Spec" board (Counter.dc.html):
// per-echelon footprint (LADDER) + intensity fill + a dark monospace badge chip,
// branch symbol inset in the central 68%×60%, a single soft depth shadow with a
// coloured glow for senior HQs. Derived = dashed frame + wash (no fill); selected
// = brass ring + glow + gold badge.
function makeIcon(
  side: 'axis' | 'soviet',
  type: string,
  mark: string,
  echelon: string,
  opts: { derived?: boolean; selected?: boolean } = {},
): ImageData {
  const PR = 2.6; // higher pixel ratio for crisp symbols
  const derived = !!opts.derived;
  const selected = !!opts.selected;
  const lv = LADDER[ICON_TIER[echelon] ?? 'division'] ?? LADDER.division;
  const pal = PAL[side];

  // --- fill / stroke colours (mirror Counter.renderVals) ---
  const fill = mixHex(pal.tl, pal.td, lv.t);
  const gtop = mixHex(fill, '#ffffff', 0.5);
  const gbot = mixHex(fill, pal.td, 0.18);
  const strokeCol = mixHex(pal.line, pal.ink, lv.t * 0.5);
  const sw = Math.max(1.4, lv.fw * 0.85); // branch stroke

  // --- badge metrics + measured chip width ---
  const badgeFont = lv.bf;
  const badgeH = lv.bh;
  const badgePadX = Math.round(badgeFont * 0.55);
  const measure = document.createElement('canvas').getContext('2d') as CtxLS;
  measure.font = `800 ${badgeFont}px ui-monospace, Menlo, Consolas, monospace`;
  if ('letterSpacing' in measure) measure.letterSpacing = '1.5px';
  const chipW = Math.ceil(measure.measureText(mark).width + badgePadX * 2);

  // --- canvas geometry: frame centred; room above for the badge, around for
  //     the depth shadow / senior glow / selected ring. ---
  const PAD = lv.glow || selected ? 12 : 7;
  const badgeGap = 3;
  const contentW = Math.max(lv.w, chipW);
  const W = contentW + PAD * 2;
  const H = PAD + badgeH + badgeGap + lv.h + PAD;
  const fx = (W - lv.w) / 2; // frame x (centred)
  const fy = PAD + badgeH + badgeGap; // frame y

  const canvas = document.createElement('canvas');
  canvas.width = W * PR;
  canvas.height = H * PR;
  const ctx = canvas.getContext('2d') as CtxLS;
  ctx.scale(PR, PR);

  // --- glow passes (cast outside the frame; the fills are overpainted below) ---
  if (!derived && lv.glow) {
    ctx.save();
    ctx.shadowColor = rgbaHex(pal.line, 0.4);
    ctx.shadowBlur = 7;
    ctx.fillStyle = gbot;
    roundRectPath(ctx, fx, fy, lv.w, lv.h, 1.5);
    ctx.fill();
    ctx.restore();
  }
  if (selected) {
    ctx.save();
    ctx.shadowColor = 'rgba(241,197,82,0.6)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = gbot;
    roundRectPath(ctx, fx, fy, lv.w, lv.h, 1.5);
    ctx.fill();
    ctx.restore();
  }

  // --- body + depth shadow ---
  ctx.save();
  ctx.shadowColor = `rgba(8,11,16,${derived ? 0.28 : 0.42})`;
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 2;
  if (derived) {
    ctx.fillStyle = rgbaHex(pal.line, 0.1); // wash
    roundRectPath(ctx, fx, fy, lv.w, lv.h, 1.5);
    ctx.fill();
  } else {
    const grad = ctx.createLinearGradient(0, fy, 0, fy + lv.h);
    grad.addColorStop(0, gtop);
    grad.addColorStop(1, gbot);
    ctx.fillStyle = grad;
    roundRectPath(ctx, fx, fy, lv.w, lv.h, 1.5);
    ctx.fill();
  }
  ctx.restore();

  // --- top bevel highlight (documented only) ---
  if (!derived) {
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(fx + 2.5, fy + 1.3);
    ctx.lineTo(fx + lv.w - 2.5, fy + 1.3);
    ctx.stroke();
  }

  // --- frame ---
  ctx.strokeStyle = strokeCol;
  ctx.lineWidth = lv.fw;
  if (derived) ctx.setLineDash([lv.fw * 1.7, lv.fw * 1.1]);
  roundRectPath(ctx, fx, fy, lv.w, lv.h, 1.5);
  ctx.stroke();
  ctx.setLineDash([]);

  // --- selected brass ring ---
  if (selected) {
    ctx.strokeStyle = '#f1c552';
    ctx.lineWidth = 2;
    roundRectPath(ctx, fx - 3.5, fy - 3.5, lv.w + 7, lv.h + 7, 3);
    ctx.stroke();
  }

  // --- branch symbol (inset in the central 68%×60%) ---
  const ix = fx + lv.w * 0.16,
    iy = fy + lv.h * 0.2,
    iw = lv.w * 0.68,
    ih = lv.h * 0.6;
  const cx = ix + iw / 2,
    cy = iy + ih / 2;
  ctx.strokeStyle = pal.ink;
  ctx.fillStyle = pal.ink;
  ctx.lineWidth = sw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const diag = (x1: number, y1: number, x2: number, y2: number): void => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  const cross = (): void => {
    diag(ix, iy, ix + iw, iy + ih);
    diag(ix + iw, iy, ix, iy + ih);
  };
  const oval = (rx: number, ry: number): void => {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  };
  if (type === 'infantry' || type === 'motorized' || type === 'mechanized') cross();
  if (type === 'armoured' || type === 'mechanized') oval(iw * 0.46, ih * 0.48);
  if (type === 'motorized') oval(iw * 0.3, ih * 0.34);
  if (type === 'cavalry' || type === 'recon') diag(ix, iy + ih, ix + iw, iy);
  if (type === 'artillery') {
    ctx.beginPath();
    ctx.arc(cx, cy, Math.min(iw, ih) * 0.24, 0, Math.PI * 2);
    ctx.fill();
  }
  if (type === 'antitank') {
    ctx.beginPath();
    ctx.moveTo(ix, iy + ih);
    ctx.lineTo(cx, iy);
    ctx.lineTo(ix + iw, iy + ih);
    ctx.stroke();
  }
  // type === 'hq' -> empty frame (no symbol)

  // --- echelon badge: dark monospace chip above the frame ---
  const chipX = fx + lv.w / 2 - chipW / 2;
  const chipY = PAD;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = derived ? 'rgba(13,19,29,0.82)' : '#0d131d';
  roundRectPath(ctx, chipX, chipY, chipW, badgeH, 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = selected ? 'rgba(241,197,82,0.7)' : rgbaHex(pal.line, 0.55);
  ctx.lineWidth = 1;
  if (derived && !selected) ctx.setLineDash([3, 2]);
  roundRectPath(ctx, chipX, chipY, chipW, badgeH, 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = `800 ${badgeFont}px ui-monospace, Menlo, Consolas, monospace`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '1.5px';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = selected ? '#f6d278' : pal.bright;
  ctx.fillText(mark, fx + lv.w / 2 + 0.75, chipY + badgeH / 2 + 0.5); // +0.75 ≈ text-indent

  return ctx.getImageData(0, 0, W * PR, H * PR);
}

// Icon id keys on the size tier + mark + state: front/army-group share a 'front'
// image and battalion (II) vs regiment (III) stay distinct within the regiment
// tier; derived and selected each get their own cached image.
function iconId(
  side: string,
  type: string,
  echelon: string,
  mark: string,
  derived = false,
  selected = false,
): string {
  const tier = ICON_TIER[echelon] ?? 'division';
  return `u-${side}-${type}-${tier}-${mark}${derived ? '-d' : ''}${selected ? '-s' : ''}`;
}

function collectionFor(
  dateISO: string,
  d: number,
  line: [number, number][] | null,
  family: Set<string> | null,
): FeatureCollection {
  if (!tracks.length) return EMPTY;
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
        icon: iconId(t.side, t.type, t.echelon, ECH_MARK[t.echelon] ?? 'XX', false, t.id === focusId),
        ech: ECH_GROUP(t.echelon),
        echelon: t.echelon,
        type: t.type,
        side: t.side,
        derived: false,
        approx: confidenceOn(t, d) === 'approximate',
        fam: family ? family.has(t.id) : false,
        // command-focus: dim everything outside the selected formation.
        dim: family ? !family.has(t.id) : false,
      },
      geometry: { type: 'Point', coordinates: at },
    });
  }

  // Derived units ride the daily front line at their sector fraction, or sit
  // inside a pocket ring (absolute placement).
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
    else {
      const ul = du.front ? frontLineById(du.front, dateISO, d) : line; // Finnish theatre line
      if (!ul) continue;
      at = pointAt(ul, place.frac, du.side, ech, du.id);
    }
    out.push({
      type: 'Feature',
      properties: {
        id: du.id,
        short: du.short,
        icon: iconId(du.side, du.type, du.echelon, ECH_MARK[du.echelon] ?? 'XX', true, du.id === focusId),
        ech,
        echelon: du.echelon,
        type: du.type,
        side: du.side,
        derived: true,
        approx: false,
        fam: family ? family.has(du.id) : false,
        dim: family ? !family.has(du.id) : false,
      },
      geometry: { type: 'Point', coordinates: at },
    });
  }
  return { type: 'FeatureCollection', features: out };
}

/** Recompute both sources for a date: unit symbols (family-tagged) and the
 *  selected formation's command links. */
function refresh(map: MapLibreMap, dateISO: string): void {
  lastDateISO = dateISO;
  const d = dateToNum(dateISO);
  const line = mainFrontLine(dateISO, d);
  const family = focusId ? computeFamily(focusId, d) : null;
  const usrc = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
  if (usrc) usrc.setData(collectionFor(dateISO, d, line, family));
  const lsrc = map.getSource(LINKS_SOURCE_ID) as GeoJSONSource | undefined;
  if (lsrc) lsrc.setData(family ? buildLinks(family, dateISO, d, line) : EMPTY);
  const dsrc = map.getSource(DOCTRINAL_SOURCE_ID) as GeoJSONSource | undefined;
  if (dsrc) dsrc.setData(focusId ? doctrinalFeatures(focusId, dateISO, d, line) : EMPTY);
}

function addEchelonLayer(map: MapLibreMap, id: string, ech: EchGroup): void {
  const [minzoom, maxzoom] = ZOOM_WINDOW[ech];
  map.addLayer({
    id,
    type: 'symbol',
    source: SOURCE_ID,
    minzoom,
    maxzoom,
    // Family members are drawn by the always-on FAMILY layer instead, so they
    // stay visible outside this tier's zoom window when a unit is selected.
    filter: ['all', ['==', ['get', 'ech'], ech], ['!=', ['get', 'fam'], true]],
    layout: {
      'icon-image': ['get', 'icon'],
      // Per-echelon size factor amplifies the counter ladder so seniors clearly
      // out-size their clustered juniors (an army reads bigger than its divisions
      // at a glance, not just by the XXXX/XX badge).
      'icon-size': [
        'interpolate',
        ['linear'],
        ['zoom'],
        3,
        0.5 * ECH_SCALE[ech],
        6,
        0.6 * ECH_SCALE[ech],
        8,
        0.72 * ECH_SCALE[ech],
      ],
      'icon-allow-overlap': true,
      // Senior tiers (top/army/corps) are always labelled; division/brigade/sub
      // labels gate behind zoom so names don't soup the map when zoomed out.
      // (zoom must be the top-level input to step, so it wraps the ech test.)
      'text-field': [
        'step',
        ['zoom'],
        ['case', ['in', ['get', 'ech'], ['literal', ['top', 'army', 'corps']]], ['get', 'short'], ''],
        6.8,
        ['get', 'short'],
      ],
      'text-size': 9.5,
      'text-offset': [0, 1.7],
      'text-anchor': 'top',
      'text-optional': true,
      'text-allow-overlap': false, // let collisions hide juniors
      // Senior formations win label collisions.
      'symbol-sort-key': ['match', ['get', 'ech'], 'army', 0, 'corps', 1, 2],
    },
    paint: {
      // A short fade-in over the tier's first half-zoom (zoom must be the
      // top-level interpolate input) so a tier eases in across its gate instead
      // of hard-popping; the stop value carries the command-focus dim/approx case
      // (out-of-formation counters recede when a unit is selected).
      'icon-opacity': [
        'interpolate',
        ['linear'],
        ['zoom'],
        minzoom,
        0,
        minzoom + 0.6,
        ['case', ['get', 'dim'], 0.4, ['get', 'approx'], 0.78, 1],
      ],
      'text-color': '#23272e',
      'text-halo-color': '#ffffff',
      'text-halo-width': 0.9,
      'text-opacity': ['case', ['get', 'dim'], 0.32, 1],
    },
  });
}

export async function addUnitsLayer(map: MapLibreMap, date: string): Promise<void> {
  [tracks, derivedUnits] = await Promise.all([loadUnitTracks(), loadDerivedUnits()]);
  trackIds.clear();
  trackById.clear();
  derivedById.clear();
  allUnitIds.length = 0;
  for (const t of tracks) {
    trackIds.add(t.id);
    trackById.set(t.id, t);
  }
  for (const u of derivedUnits) {
    derivedById.set(u.id, u);
    allUnitIds.push(u.id);
  }
  for (const t of tracks) if (!derivedById.has(t.id)) allUnitIds.push(t.id);

  // One generated icon per (side, type, echelon, derived) in use, plus a
  // selected (brass-ring) variant for each, since any unit can become the focus.
  // The raw echelon is kept so the tier (size) and precise mark are both
  // available; iconId folds same-tier/same-mark echelons together.
  const combos = new Set([
    ...tracks.map((t) => `${t.side}|${t.type}|${t.echelon}|0`),
    ...derivedUnits.map((u) => `${u.side}|${u.type}|${u.echelon}|1`),
  ]);
  for (const combo of combos) {
    const [side, type, echelon, hollow] = combo.split('|') as ['axis' | 'soviet', string, string, string];
    const mark = ECH_MARK[echelon] ?? 'XX';
    const derived = hollow === '1';
    for (const selected of [false, true]) {
      const id = iconId(side, type, echelon, mark, derived, selected);
      if (!map.hasImage(id)) {
        map.addImage(id, makeIcon(side, type, mark, echelon, { derived, selected }), { pixelRatio: 2.6 });
      }
    }
  }
  // Doctrinal regiment icons (dashed/derived) for the sub-division drill-down —
  // every branch × regiment/brigade/battalion, both sides, so any template's
  // organic components have an icon.
  for (const side of ['axis', 'soviet'] as const) {
    for (const branch of DOCTRINAL_BRANCHES) {
      for (const ech of ['regiment', 'brigade', 'battalion']) {
        const id = iconId(side, branch, ech, ECH_MARK[ech] ?? 'III', true);
        if (!map.hasImage(id)) {
          map.addImage(id, makeIcon(side, branch, ECH_MARK[ech] ?? 'III', ech, { derived: true }), {
            pixelRatio: 2.6,
          });
        }
      }
    }
  }

  const d0 = dateToNum(date);
  lastDateISO = date;
  map.addSource(SOURCE_ID, {
    type: 'geojson',
    // promoteId exposes each unit's id as the feature id, so hover feature-state
    // (the glow layer) can be keyed per unit and survive date-driven setData.
    promoteId: 'id',
    data: collectionFor(date, d0, mainFrontLine(date, d0), null),
    attribution: 'Units: curated (Stalingrad pilot, approximate)',
  });
  // Doctrinal sub-division drill-down (selected division's organic regiments).
  map.addSource(DOCTRINAL_SOURCE_ID, { type: 'geojson', data: EMPTY });
  // Command-link lines (selected formation only), beneath the symbols.
  map.addSource(LINKS_SOURCE_ID, { type: 'geojson', data: EMPTY });
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

  // Hover glow: a soft, side-coloured halo behind the counter, lit only on the
  // hovered unit via feature-state. (MapLibre 5 can't drive icon-size from
  // feature-state — layout props take no feature-state — so the hover "lift"
  // is rendered as this circle rather than by scaling the icon.)
  map.addLayer({
    id: HOVER_GLOW_ID,
    type: 'circle',
    source: SOURCE_ID,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 10, 7, 16],
      'circle-blur': 0.7,
      'circle-color': ['match', ['get', 'side'], 'axis', SIDE_COLOR.axis, SIDE_COLOR.soviet],
      'circle-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.32, 0],
    },
  });

  // Juniors first so SENIORS draw on top: an army HQ sits above the divisions
  // clustered around it instead of being buried under them.
  addEchelonLayer(map, SUB_ID, 'sub');
  addEchelonLayer(map, BRIGADE_ID, 'brigade');
  addEchelonLayer(map, DIVISION_ID, 'division');
  addEchelonLayer(map, CORPS_ID, 'corps');
  addEchelonLayer(map, ARMY_ID, 'army');
  addEchelonLayer(map, TOP_ID, 'top');

  // Doctrinal regiments of the selected division (shown only when zoomed in).
  map.addLayer({
    id: DOCTRINAL_ID,
    type: 'symbol',
    source: DOCTRINAL_SOURCE_ID,
    minzoom: 6.5,
    layout: {
      'icon-image': ['get', 'icon'],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 6, 0.5, 8, 0.66],
      'icon-allow-overlap': true,
      'text-field': ['step', ['zoom'], '', 7.4, ['get', 'short']],
      'text-size': 8.5,
      'text-offset': [0, 1.5],
      'text-anchor': 'top',
      'text-optional': true,
    },
    paint: {
      'icon-opacity': 0.92,
      'text-color': '#3a4150',
      'text-halo-color': '#ffffff',
      'text-halo-width': 0.8,
    },
  });

  // Selected formation: always visible across zoom, with brass labels so the
  // parent army stays readable while you inspect its divisions.
  map.addLayer({
    id: FAMILY_ID,
    type: 'symbol',
    source: SOURCE_ID,
    minzoom: 3,
    filter: ['==', ['get', 'fam'], true],
    layout: {
      'icon-image': ['get', 'icon'],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.58, 6, 0.68, 8, 0.82],
      'icon-allow-overlap': true,
      'text-field': ['get', 'short'],
      'text-size': 11,
      'text-offset': [0, 1.6],
      'text-anchor': 'top',
      'text-allow-overlap': false,
      'symbol-sort-key': ['match', ['get', 'ech'], 'army', 0, 'corps', 1, 2],
    },
    paint: {
      'icon-opacity': ['case', ['get', 'approx'], 0.85, 1],
      'text-color': '#1c2026',
      'text-halo-color': '#ffe4a0',
      'text-halo-width': 1.8,
    },
  });
}

/** Re-interpolate unit positions (and command links) to the given date. */
export function updateUnitsDate(map: MapLibreMap, date: string): void {
  refresh(map, date);
}

/** Set the drill-down focus (selected unit) and refresh. */
export function updateUnitsFocus(map: MapLibreMap, unitId: string | null, date: string): void {
  if (focusId === unitId) return;
  focusId = unitId;
  refresh(map, date);
}

// --- Hover: glow the unit under the cursor + a situation-room tooltip --------

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Tooltip body, in the spec's format: name + "XXXX · ARMOUR · ~N est." — the
 *  echelon mark, branch, and nominal establishment strength (TO&E). */
function tipHTML(p: Record<string, unknown>): string {
  const side = (p.side === 'soviet' ? 'soviet' : 'axis') as 'axis' | 'soviet';
  const echelon = String(p.echelon ?? '');
  const type = String(p.type ?? '');
  const meta = [ECH_MARK[echelon] ?? '', type.toUpperCase()].filter(Boolean);
  const tmpl = echelon && type ? matchTemplate(side, echelon, type, lastDateISO) : null;
  if (tmpl?.strength) meta.push(`~${tmpl.strength.toLocaleString()} est.`);
  if (p.derived === true) meta.push('derived');
  return (
    `<div class="unit-tip-name unit-tip-${side}">${esc(String(p.short ?? ''))}</div>` +
    `<div class="unit-tip-meta">${esc(meta.join(' · '))}</div>`
  );
}

/** Wire hover glow (feature-state) + tooltip on the unit symbol layers. Call
 *  once, after the layers are added. */
export function setupUnitInteractions(map: MapLibreMap): void {
  const popup = new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false,
    offset: 16,
    className: 'unit-tip',
  });
  let hoveredId: string | number | null = null;

  const clearHover = (): void => {
    if (hoveredId !== null) {
      map.setFeatureState({ source: SOURCE_ID, id: hoveredId }, { hover: false });
      hoveredId = null;
    }
    popup.remove();
    map.getCanvas().style.cursor = '';
  };

  for (const layerId of UNITS_HIT_LAYER_IDS) {
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

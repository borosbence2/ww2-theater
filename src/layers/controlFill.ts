// Territorial control (the "tide") — the real belligerent landmass PAINTED by
// who controls it, rather than a band or an offset line (which pinched at sharp
// corners). We take the static belligerent-land polygon (built offline, see
// data/pipeline/build-control-tide.mjs) and split it along the daily operational
// front into two spheres: the Axis-controlled west and the Soviet-controlled
// east. Because the split uses `mainFrontLineOn` — the SAME interpolated,
// evidence-deformed line the front layer draws — the colour boundary always sits
// exactly under the front line.
//
// Each sphere is shaded in TWO tones: the home nations (Germany/Italy/co-
// belligerents; the USSR) read a touch darker, while occupied/held ground reads
// lighter — a subtle historical-atlas look. Pockets are painted as enclaves in
// the encircled side's colour (Stalingrad = a red island inside the blue).
//
// The clip runs client-side (polygon-clipping) so it tracks the daily line with
// no keyframe lag; it is coalesced to one recompute per frame for scrubbing.

import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';
import polygonClipping from 'polygon-clipping';
import { mainFrontLineOn, frontLineById, pocketRingsOn, pocketLabelsOn, loadFrontFeatures } from './front';
import { dateToNum } from '../time/dates';

const SOURCE_ID = 'control-fill';
const SPHERE_ID = 'control-fill-sphere';
const POCKET_ID = 'control-fill-pocket';
export const CONTROL_FILL_LAYER_IDS = [SPHERE_ID, POCKET_ID];

// Softened, atlas-like palette: home nations a shade deeper, occupied/held
// ground lighter. Kept muted so the counters and labels read over it.
const AXIS_CORE = '#b0503a'; // Axis home soil (warm brick red)
const AXIS_OCC = '#d7a794'; // Axis-occupied (soft rose)
const SOVIET_CORE = '#3f6ea6'; // the USSR (muted steel blue)
const SOVIET_OCC = '#9fbad6'; // Soviet-held beyond the USSR (soft periwinkle)
const NEUTRAL_COLOR = '#8d9198'; // the neutrals (faint desaturated grey)

type Ring = [number, number][];
type MultiPoly = Ring[][];
const clip = polygonClipping as unknown as {
  intersection: (a: MultiPoly | Ring[], ...b: (MultiPoly | Ring[])[]) => MultiPoly;
};

// The land is pre-split offline into four home/occupied partitions (see the ETL)
// so each frame is just four ring-intersections — no boolean differences.
let LAND: MultiPoly = [];
let AXIS_CORE_LAND: MultiPoly = [];
let AXIS_OCC_LAND: MultiPoly = [];
let SOV_CORE_LAND: MultiPoly = [];
let SOV_OCC_LAND: MultiPoly = [];
let NEUTRAL_LAND: MultiPoly = [];
let BBOX: [number, number, number, number] = [-11, 34, 60, 72];
let landPromise: Promise<void> | null = null;
interface LandData {
  land: MultiPoly;
  coreAxis: MultiPoly;
  notCoreAxis: MultiPoly;
  coreSoviet: MultiPoly;
  notCoreSoviet: MultiPoly;
  neutral: MultiPoly;
  bbox: [number, number, number, number];
}
function loadLand(): Promise<void> {
  if (!landPromise) {
    landPromise = fetch(`${import.meta.env.BASE_URL}data/control-tide/land.json`)
      .then((r) => r.json())
      .then((d: LandData) => {
        LAND = d.land;
        AXIS_CORE_LAND = d.coreAxis ?? [];
        AXIS_OCC_LAND = d.notCoreAxis ?? d.land;
        SOV_CORE_LAND = d.coreSoviet ?? [];
        SOV_OCC_LAND = d.notCoreSoviet ?? [];
        NEUTRAL_LAND = d.neutral ?? [];
        BBOX = d.bbox;
      });
  }
  return landPromise;
}

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

function mpFeature(mp: MultiPoly, props: Record<string, unknown>): Feature | null {
  if (!mp || !mp.length) return null;
  return {
    type: 'Feature',
    properties: props,
    geometry: { type: 'MultiPolygon', coordinates: mp as unknown as number[][][][] },
  };
}

/** The belligerent land split along the front on `date`, in four tones (Axis
 *  home / occupied, Soviet home / held) plus pocket enclaves. */
function controlFill(dateISO: string): FeatureCollection {
  const main = mainFrontLineOn(dateISO) as Ring | null;
  if (!main || main.length < 2 || !LAND.length) return EMPTY;

  // Splice the northern-theatre fronts (Arctic + Finnish, when active) onto the
  // main line so the Axis/Soviet boundary follows the REAL front all the way to
  // the Arctic — Finland's eastern edge tracks the Finnish front and the divide
  // reaches the coast, instead of a straight vertical extension of the main
  // line's Baltic endpoint slicing across the Karelian Isthmus. All three lines
  // are authored N→S, so concatenating them keeps the divide monotonic.
  const d = dateToNum(dateISO);
  const arctic = frontLineById('arctic-front', dateISO, d) as Ring | null;
  const finnish = frontLineById('finnish-front', dateISO, d) as Ring | null;
  const line: Ring = [...(arctic ?? []), ...(finnish ?? []), ...main];

  // Close each side of the front against a box beyond the land, then intersect
  // with the real land so only actual territory is painted (no sea, no box
  // edges). The front is extended straight to the box top/bottom so the far
  // north/south flanks fall to the nearest side.
  const [minX, minY, maxX, maxY] = BBOX;
  const PAD = 6;
  const W = minX - PAD, E = maxX + PAD, T = maxY + PAD, B = minY - PAD;
  const N = line[0], S = line[line.length - 1];
  const divide: Ring = [[N[0], T], ...line, [S[0], B]];
  const westRing: Ring = [...divide, [W, B], [W, T], [N[0], T]];
  const eastRing: Ring = [...divide, [E, B], [E, T], [N[0], T]];

  // Four home/occupied partitions clipped to their side of the front. The
  // regions are disjoint, so they can share one fill layer with no overlap.
  const axisCore = clip.intersection(AXIS_CORE_LAND, [westRing]);
  const axisOcc = clip.intersection(AXIS_OCC_LAND, [westRing]);
  const sovCore = clip.intersection(SOV_CORE_LAND, [eastRing]);
  const sovOcc = clip.intersection(SOV_OCC_LAND, [eastRing]);

  const features: Feature[] = [];
  const add = (mp: MultiPoly, t: string) => {
    const f = mpFeature(mp, { t, kind: 'sphere' });
    if (f) features.push(f);
  };
  add(axisOcc, 'axis-occ');
  add(axisCore, 'axis-core');
  add(sovOcc, 'sov-occ');
  add(sovCore, 'sov-core');
  // Neutrals — folded into the same front-gated fill so ALL country colouring
  // appears together, i.e. only once Barbarossa opens the front (before that
  // `line` is null and we return EMPTY above, leaving the pre-1941 campaigns
  // on the bare basemap).
  add(NEUTRAL_LAND, 'neutral');

  // Pockets: an enclave in the encircled side's home colour, clipped to land so
  // coastal pockets (Sevastopol, Odessa) don't bleed into the sea.
  for (const p of pocketRingsOn(dateISO)) {
    const enc = clip.intersection(LAND, [p.ring]);
    const f = mpFeature(enc, { t: p.encircled === 'axis' ? 'axis-core' : 'sov-core', kind: 'pocket' });
    if (f) features.push(f);
  }
  // Pocket/siege name anchors (a top-of-stack layer draws these — see pocketLabels).
  for (const p of pocketLabelsOn(dateISO)) {
    features.push({
      type: 'Feature',
      properties: { kind: 'pocket-label', label: p.label, side: p.encircled },
      geometry: { type: 'Point', coordinates: p.at },
    });
  }
  return { type: 'FeatureCollection', features };
}

const byTone = [
  'match', ['get', 't'],
  'axis-core', AXIS_CORE,
  'axis-occ', AXIS_OCC,
  'sov-core', SOVIET_CORE,
  'sov-occ', SOVIET_OCC,
  'neutral', NEUTRAL_COLOR,
  '#888888',
] as const;
// Home soil a little stronger; occupied/held ground lighter; neutrals faintest.
const opacityByTone = [
  'match', ['get', 't'],
  'axis-core', 0.4,
  'sov-core', 0.4,
  'axis-occ', 0.3,
  'sov-occ', 0.3,
  'neutral', 0.22,
  0.34,
] as const;

let lastDate = '';

export async function addControlFillLayer(map: MapLibreMap, date: string): Promise<void> {
  // Need both the land polygon and the front features before the first paint.
  await Promise.all([loadFrontFeatures(), loadLand()]);
  lastDate = date;
  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data: controlFill(date),
    attribution: 'Territorial control: the belligerent land split along the operational front',
  });
  const before = map.getStyle().layers?.find((l) => l.id.startsWith('borders'))?.id;
  map.addLayer(
    {
      id: SPHERE_ID,
      type: 'fill',
      source: SOURCE_ID,
      filter: ['==', ['get', 'kind'], 'sphere'],
      paint: { 'fill-color': byTone as never, 'fill-opacity': opacityByTone as never, 'fill-antialias': true },
    },
    before,
  );
  map.addLayer(
    {
      id: POCKET_ID,
      type: 'fill',
      source: SOURCE_ID,
      filter: ['==', ['get', 'kind'], 'pocket'],
      paint: { 'fill-color': byTone as never, 'fill-opacity': 0.44, 'fill-antialias': true },
    },
    before,
  );
}

// Coalesce rapid date changes (timeline scrub/play) to one clip per frame.
let pending: string | null = null;
let scheduled = false;
export function updateControlFillDate(map: MapLibreMap, date: string): void {
  if (date === lastDate) return;
  lastDate = date;
  pending = date;
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    const d = pending;
    pending = null;
    if (d == null) return;
    const src = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    if (src) src.setData(controlFill(d));
  });
}

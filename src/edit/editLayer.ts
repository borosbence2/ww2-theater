// Map wiring for the dev keyframe editor (?edit). Click the map to append a
// waypoint, drag a waypoint to move it; the draft is drawn as an amber line.
// The two keyframes bracketing the current date (of the feature being traced)
// are ghosted underneath as references — scrub the timeline to compare. The
// city-control halos already show who held each city on the date, so tracing
// against them keeps the new keyframe consistent with documented captures.

import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';
import { useStore } from '../store';
import { dateToNum } from '../time/dates';
import { getFrontFeatures } from '../layers/front';
import { useEditStore, type Waypoint } from './editStore';

const DRAFT_SOURCE = 'edit-draft';
const GHOST_SOURCE = 'edit-ghost';
const GHOST_LINE_ID = 'edit-ghost-line';
const DRAFT_LINE_ID = 'edit-draft-line';
const DRAFT_POINT_ID = 'edit-draft-points';

/** Feature whose keyframes are ghosted; the main front is what gets densified. */
const GHOST_FEATURE_ID = 'main';

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

function draftCollection(points: Waypoint[]): FeatureCollection {
  const features: Feature[] = points.map((p, i) => ({
    type: 'Feature',
    properties: { index: i },
    geometry: { type: 'Point', coordinates: p },
  }));
  if (points.length >= 2) {
    features.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: points },
    });
  }
  return { type: 'FeatureCollection', features };
}

/** The keyframes bracketing `date`, labeled prev/next for styling. */
function ghostCollection(dateISO: string): FeatureCollection {
  const feature = getFrontFeatures().find((f) => f.id === GHOST_FEATURE_ID);
  if (!feature) return EMPTY;
  const d = dateToNum(dateISO);
  const kfs = feature.keyframes;
  const prev = [...kfs].reverse().find((k) => k.start <= d);
  const next = kfs.find((k) => k.start > d);
  const features: Feature[] = [];
  for (const [k, which] of [[prev, 'prev'], [next, 'next']] as const) {
    if (!k) continue;
    features.push({
      type: 'Feature',
      properties: { which, date: k.date },
      geometry: { type: 'LineString', coordinates: k.coords },
    });
  }
  return { type: 'FeatureCollection', features };
}

export function addEditLayers(map: MapLibreMap): void {
  map.addSource(GHOST_SOURCE, { type: 'geojson', data: ghostCollection(useStore.getState().date) });
  map.addSource(DRAFT_SOURCE, { type: 'geojson', data: draftCollection(useEditStore.getState().points) });

  map.addLayer({
    id: GHOST_LINE_ID,
    type: 'line',
    source: GHOST_SOURCE,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['match', ['get', 'which'], 'prev', '#7c4dbe', '#2e8b57'] as never,
      'line-opacity': 0.55,
      'line-width': 2,
      'line-dasharray': [3, 2],
    },
  });
  map.addLayer({
    id: DRAFT_LINE_ID,
    type: 'line',
    source: DRAFT_SOURCE,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#c9a227', 'line-width': 2.5 },
  });
  map.addLayer({
    id: DRAFT_POINT_ID,
    type: 'circle',
    source: DRAFT_SOURCE,
    filter: ['==', ['geometry-type'], 'Point'] as never,
    paint: {
      'circle-radius': 5.5,
      'circle-color': '#c9a227',
      'circle-stroke-color': '#0b0e13',
      'circle-stroke-width': 1.5,
    },
  });

  // Redraw the draft whenever its points change, and the ghosts on date change.
  useEditStore.subscribe((s) => {
    (map.getSource(DRAFT_SOURCE) as GeoJSONSource).setData(draftCollection(s.points));
  });
  let lastDate = useStore.getState().date;
  useStore.subscribe((s) => {
    if (s.date === lastDate) return;
    lastDate = s.date;
    (map.getSource(GHOST_SOURCE) as GeoJSONSource).setData(ghostCollection(s.date));
  });

  // --- Interactions: click to append, drag a point to move it. -------------
  let dragIndex: number | null = null;
  let dragged = false;

  map.on('mousedown', DRAFT_POINT_ID, (e) => {
    const f = e.features?.[0];
    if (!f) return;
    e.preventDefault(); // keep the map from panning
    dragIndex = f.properties?.index as number;
    dragged = false;
    map.getCanvas().style.cursor = 'grabbing';
  });

  map.on('mousemove', (e: MapMouseEvent) => {
    if (dragIndex === null) return;
    dragged = true;
    useEditStore.getState().movePoint(dragIndex, [e.lngLat.lng, e.lngLat.lat]);
  });

  map.on('mouseup', () => {
    if (dragIndex === null) return;
    dragIndex = null;
    map.getCanvas().style.cursor = '';
  });

  map.on('click', (e: MapMouseEvent) => {
    // A click lands after every drag mouseup; only append on a true click,
    // and not when picking up an existing point.
    if (dragged) {
      dragged = false;
      return;
    }
    const hits = map.queryRenderedFeatures(e.point, { layers: [DRAFT_POINT_ID] });
    if (hits.length) return;
    useEditStore.getState().addPoint([e.lngLat.lng, e.lngLat.lat]);
  });

  map.on('mouseenter', DRAFT_POINT_ID, () => {
    if (dragIndex === null) map.getCanvas().style.cursor = 'grab';
  });
  map.on('mouseleave', DRAFT_POINT_ID, () => {
    if (dragIndex === null) map.getCanvas().style.cursor = '';
  });
}

// MapLibre GL map centered on the European theater. Adds every registered
// historical layer (see ../layers/registry), applies user visibility toggles,
// handles click-to-select on city dots, and reports viewport changes to the
// store. The map instance is exposed via ./mapRef so the omnibox/panel can
// fly the camera.

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { useStore } from '../store';
import { LAYERS, applyVisibility } from '../layers/registry';
import { CITY_DOT_LAYER_ID } from '../layers/cities';
import {
  UNITS_HIT_LAYER_IDS,
  getUnitPositionOn,
  setupUnitInteractions,
  updateUnitsFocus,
} from '../layers/units';
import { BATTLES_HIT_LAYER_ID } from '../layers/battles';
import { addUnitPathLayers, updateUnitPath } from '../layers/unitPath';
import { loadCities } from '../data/cities';
import { loadBattles } from '../data/battles';
import { setMap } from './mapRef';
import { EDIT_MODE } from '../edit/mode';
import { addEditLayers } from '../edit/editLayer';

// Keyless, CORS-enabled vector basemap. Swappable in later milestones (e.g. a
// period-correct style or a georeferenced historical raster).
const BASEMAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';

// Mute the basemap so the historical layers (tide, front, unit counters) are
// the brightest things on screen: drop POI/transport clutter, lighten labels,
// and quiet roads + admin boundaries. Defensive per-layer — positron's exact
// layer set may shift, and not every layer carries every paint/layout prop.
function muteBasemap(map: maplibregl.Map): void {
  for (const l of map.getStyle().layers ?? []) {
    const id = l.id;
    try {
      if (l.type === 'symbol') {
        if (/poi|housenumber|continent|bus|airport|ferry|aeroway/i.test(id)) {
          map.setLayoutProperty(id, 'visibility', 'none');
        } else if (/label|place|water_name|country|state|town|village|city|road/i.test(id)) {
          map.setPaintProperty(id, 'text-opacity', 0.5);
        }
      } else if (l.type === 'line') {
        if (/road|street|motorway|bridge|tunnel|transport|rail|aeroway/i.test(id)) {
          map.setPaintProperty(id, 'line-opacity', 0.3);
        } else if (/boundary|admin/i.test(id)) {
          map.setPaintProperty(id, 'line-opacity', 0.35);
        }
      }
    } catch {
      // This layer lacks the prop in the current style; leave it untouched.
    }
  }
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const date = useStore((s) => s.date);
  const hiddenLayers = useStore((s) => s.hiddenLayers);
  const selection = useStore((s) => s.selection);
  const trackPath = useStore((s) => s.trackPath);
  const follow = useStore((s) => s.follow);

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current) return;

    const { viewport, setViewport } = useStore.getState();
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      center: [viewport.lng, viewport.lat],
      zoom: viewport.zoom,
      minZoom: 3,
      maxZoom: 12,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    setMap(map);

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    // Without a listener MapLibre console.errors every resource failure.
    // OpenFreeMap is missing a few glyph ranges (font .pbf 404s) — harmless,
    // glyphs fall back; keep the console clean for real errors only.
    map.on('error', (e) => {
      const err = e.error as (Error & { url?: string; status?: number }) | undefined;
      if (err?.status === 404 && /\/fonts\/|\.pbf/.test(err.url ?? '')) return;
      console.error(err ?? e);
    });

    const onMoveEnd = () => {
      const c = map.getCenter();
      setViewport({
        lng: Number(c.lng.toFixed(4)),
        lat: Number(c.lat.toFixed(4)),
        zoom: Number(map.getZoom().toFixed(2)),
      });
    };
    map.on('moveend', onMoveEnd);

    map.on('load', async () => {
      muteBasemap(map);
      const state = useStore.getState();
      for (const def of LAYERS) await def.add(map, state.date);
      // Path lines render beneath the unit symbols.
      addUnitPathLayers(map, UNITS_HIT_LAYER_IDS.find((id) => map.getLayer(id)));
      applyVisibility(map, state.hiddenLayers);
      // Hover glow + tooltip on the unit counters (read-only; safe in edit mode).
      setupUnitInteractions(map);

      if (EDIT_MODE) {
        addEditLayers(map);
      } else {
        // Click priority: unit symbol > battle > city dot; empty map clears.
        const clickable = [...UNITS_HIT_LAYER_IDS, BATTLES_HIT_LAYER_ID, CITY_DOT_LAYER_ID];
        map.on('click', (e) => {
          const hits = map.queryRenderedFeatures(e.point, {
            layers: clickable.filter((id) => map.getLayer(id)),
          });
          const rank = (lid: string) =>
            UNITS_HIT_LAYER_IDS.includes(lid) ? 0 : lid === BATTLES_HIT_LAYER_ID ? 1 : 2;
          const top = [...hits].sort((a, b) => rank(a.layer.id) - rank(b.layer.id))[0];
          const { setSelection } = useStore.getState();
          if (!top) setSelection(null);
          else if (UNITS_HIT_LAYER_IDS.includes(top.layer.id)) {
            setSelection({ kind: 'unit', id: top.properties.id as string });
          } else if (top.layer.id === BATTLES_HIT_LAYER_ID) {
            setSelection({ kind: 'battle', id: top.properties.id as string });
          } else {
            setSelection({ kind: 'city', id: top.properties.name as string });
          }
        });
        for (const id of clickable) {
          map.on('mouseenter', id, () => {
            map.getCanvas().style.cursor = 'pointer';
          });
          map.on('mouseleave', id, () => {
            map.getCanvas().style.cursor = '';
          });
        }
      }
      readyRef.current = true;

      // A deep-linked selection should be in view on arrival.
      const sel = useStore.getState().selection;
      if (sel?.kind === 'city') {
        const city = (await loadCities()).find((c) => c.name === sel.id);
        if (city) {
          map.flyTo({ center: [city.lng, city.lat], zoom: Math.max(map.getZoom(), 5.5) });
        }
      } else if (sel?.kind === 'unit') {
        // Curated or sector-derived (units layer holds this date's geometry).
        const at = getUnitPositionOn(sel.id, useStore.getState().date);
        if (at) map.flyTo({ center: at, zoom: Math.max(map.getZoom(), 6) });
      } else if (sel?.kind === 'battle') {
        const battle = (await loadBattles()).find((b) => b.id === sel.id);
        if (battle) {
          map.flyTo({ center: [battle.lon, battle.lat], zoom: Math.max(map.getZoom(), 5.5) });
        }
      }
    });

    return () => {
      readyRef.current = false;
      map.off('moveend', onMoveEnd);
      setMap(null);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update layers whenever the date changes.
  useEffect(() => {
    const map = mapRef.current;
    if (map && readyRef.current) {
      for (const def of LAYERS) def.updateDate?.(map, date);
    }
  }, [date]);

  // Apply visibility whenever toggles change.
  useEffect(() => {
    const map = mapRef.current;
    if (map && readyRef.current) applyVisibility(map, hiddenLayers);
  }, [hiddenLayers]);

  // Drill-down: sub-division units render only around the selected unit.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    updateUnitsFocus(map, selection?.kind === 'unit' ? selection.id : null, date);
  }, [selection, date]);

  // Path mode: draw the selected unit's route while tracking is on.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const unitId = trackPath && selection?.kind === 'unit' ? selection.id : null;
    void updateUnitPath(map, unitId, date);
  }, [selection, trackPath, date]);

  // Follow mode: keep the camera on the unit as the date moves. Works for
  // curated tracks and sector-derived units alike (getUnitPositionOn covers
  // both); the units layer must already hold this date's front geometry.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !follow || selection?.kind !== 'unit') return;
    const at = getUnitPositionOn(selection.id, date);
    if (at) map.easeTo({ center: at, duration: 180 });
  }, [follow, selection, date]);

  return <div ref={containerRef} className="map" />;
}

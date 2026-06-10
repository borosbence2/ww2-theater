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
import { loadCities } from '../data/cities';
import { setMap } from './mapRef';
import { EDIT_MODE } from '../edit/mode';
import { addEditLayers } from '../edit/editLayer';

// Keyless, CORS-enabled vector basemap. Swappable in later milestones (e.g. a
// period-correct style or a georeferenced historical raster).
const BASEMAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const date = useStore((s) => s.date);
  const hiddenLayers = useStore((s) => s.hiddenLayers);

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
      const state = useStore.getState();
      for (const def of LAYERS) await def.add(map, state.date);
      applyVisibility(map, state.hiddenLayers);

      if (EDIT_MODE) {
        addEditLayers(map);
      } else {
        // Click a city dot to select it; click empty map to clear.
        map.on('click', (e) => {
          if (!map.getLayer(CITY_DOT_LAYER_ID)) return;
          const hits = map.queryRenderedFeatures(e.point, { layers: [CITY_DOT_LAYER_ID] });
          const name = hits[0]?.properties?.name as string | undefined;
          useStore.getState().setSelection(name ? { kind: 'city', id: name } : null);
        });
        map.on('mouseenter', CITY_DOT_LAYER_ID, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', CITY_DOT_LAYER_ID, () => {
          map.getCanvas().style.cursor = '';
        });
      }
      readyRef.current = true;

      // A deep-linked selection should be in view on arrival.
      const sel = useStore.getState().selection;
      if (sel?.kind === 'city') {
        const city = (await loadCities()).find((c) => c.name === sel.id);
        if (city) {
          map.flyTo({ center: [city.lng, city.lat], zoom: Math.max(map.getZoom(), 5.5) });
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

  return <div ref={containerRef} className="map" />;
}

// MapLibre GL map centered on the European theater. Renders the muted basemap,
// the date-filtered borders layer (M1), and reports viewport changes to the
// store. Further historical layers (control, cities, ...) are added in later
// milestones.

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { useStore } from '../store';
import { addBordersLayer, updateBordersDate } from '../layers/borders';
import { addControlLayer, updateControlDate } from '../layers/control';

// Keyless, CORS-enabled vector basemap. Swappable in later milestones (e.g. a
// period-correct style or a georeferenced historical raster).
const BASEMAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const date = useStore((s) => s.date);

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
      const d = useStore.getState().date;
      await addBordersLayer(map, d);
      await addControlLayer(map, d);
      readyRef.current = true;
    });

    return () => {
      readyRef.current = false;
      map.off('moveend', onMoveEnd);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update layers whenever the date changes.
  useEffect(() => {
    const map = mapRef.current;
    if (map && readyRef.current) {
      updateBordersDate(map, date);
      void updateControlDate(map, date);
    }
  }, [date]);

  return <div ref={containerRef} className="map" />;
}

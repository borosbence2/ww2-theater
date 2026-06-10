// City control dots. Colors each city in the curated settlement-control
// timeline (data/curated/city-control.json, copied to public by the fronts
// ETL) by who holds it on the current date — these flips happen on exact
// documented capture/liberation dates, so they are daily-accurate even between
// front keyframes. A city that changed hands within the last few days gets a
// highlighted ring so captures read during playback. Rendered underneath the
// Natural Earth city dots, so it shows as a colored halo around them.

import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';
import { dateToNum, diffDays } from '../time/dates';

const SOURCE_ID = 'control-dots';
const DOT_ID = 'control-dots-circle';
const DATA_URL = `${import.meta.env.BASE_URL}data/cities/control.json`;

/** Days a capture/liberation stays highlighted during playback. */
const HIGHLIGHT_DAYS = 3;

const AXIS_COLOR = '#b5402f';
const SOVIET_COLOR = '#2f6fb0';

interface ControlChange {
  date: string;
  side: 'axis' | 'soviet';
}

interface ControlCity {
  name: string;
  lon: number;
  lat: number;
  init: 'axis' | 'soviet';
  changes: ControlChange[];
}

let cities: ControlCity[] = [];

/** Holder of the city on the date, plus whether it changed hands recently. */
function stateFor(city: ControlCity, dateISO: string, d: number) {
  let side = city.init;
  let recent = false;
  for (const c of city.changes) {
    if (dateToNum(c.date) > d) break;
    side = c.side;
    recent = diffDays(c.date, dateISO) < HIGHLIGHT_DAYS;
  }
  return { side, recent };
}

function collectionFor(dateISO: string): FeatureCollection {
  const d = dateToNum(dateISO);
  const out: Feature[] = cities.map((city) => {
    const { side, recent } = stateFor(city, dateISO, d);
    return {
      type: 'Feature',
      properties: { name: city.name, side, recent },
      geometry: { type: 'Point', coordinates: [city.lon, city.lat] },
    };
  });
  return { type: 'FeatureCollection', features: out };
}

/** Add the control-dot halos beneath the city dots. */
export async function addControlDotsLayer(map: MapLibreMap, date: string): Promise<void> {
  const data = await fetch(DATA_URL).then((r) => r.json());
  cities = data.cities;

  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data: collectionFor(date),
    attribution: 'City control: curated capture/liberation dates',
  });

  const recent = ['get', 'recent'] as const;
  map.addLayer(
    {
      id: DOT_ID,
      type: 'circle',
      source: SOURCE_ID,
      paint: {
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          3, ['case', recent as never, 7, 4.5],
          7, ['case', recent as never, 13, 9],
        ],
        'circle-color': [
          'match', ['get', 'side'], 'axis', AXIS_COLOR, SOVIET_COLOR,
        ] as never,
        'circle-opacity': ['case', recent as never, 0.85, 0.45] as never,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': ['case', recent as never, 2, 0.8] as never,
      },
    },
    // Slot beneath the Natural Earth city dots so these read as halos.
    map.getLayer('cities-dot') ? 'cities-dot' : undefined,
  );
}

/** Recompute holders (and capture highlights) for the given date. */
export function updateControlDotsDate(map: MapLibreMap, date: string): void {
  const src = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
  if (!src) return;
  src.setData(collectionFor(date));
}

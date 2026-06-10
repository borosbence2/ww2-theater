// Shared city data: the Natural Earth city set (also the cities layer source)
// and the curated settlement-control timeline. Fetched once and cached so the
// map layer, the omnibox search, and the detail panel all reuse one copy.
// Phase 1 adds the unit index alongside this with the same pattern.

import type { FeatureCollection, Point } from 'geojson';
import { dateToNum } from '../time/dates';

const CITIES_URL = `${import.meta.env.BASE_URL}data/cities/cities.geojson`;
const CONTROL_URL = `${import.meta.env.BASE_URL}data/cities/control.json`;

export interface City {
  name: string;
  country: string;
  capital: boolean;
  pop: number;
  scalerank: number;
  lng: number;
  lat: number;
}

export interface ControlChange {
  date: string;
  side: 'axis' | 'soviet';
}

export interface ControlCity {
  name: string;
  lon: number;
  lat: number;
  init: 'axis' | 'soviet';
  changes: ControlChange[];
}

let geojsonPromise: Promise<FeatureCollection> | null = null;
let citiesPromise: Promise<City[]> | null = null;
let controlPromise: Promise<ControlCity[]> | null = null;

/** Raw FeatureCollection, for the MapLibre source. */
export function loadCitiesGeoJSON(): Promise<FeatureCollection> {
  if (!geojsonPromise) geojsonPromise = fetch(CITIES_URL).then((r) => r.json());
  return geojsonPromise;
}

/** Flat city list, for search and the detail panel. */
export function loadCities(): Promise<City[]> {
  if (!citiesPromise) {
    citiesPromise = loadCitiesGeoJSON().then((fc) =>
      fc.features.map((f) => {
        const p = f.properties as Record<string, unknown>;
        const [lng, lat] = (f.geometry as Point).coordinates;
        return {
          name: String(p.name),
          country: String(p.country ?? ''),
          capital: p.capital === 1,
          pop: Number(p.pop ?? 0),
          scalerank: Number(p.scalerank ?? 7),
          lng,
          lat,
        };
      }),
    );
  }
  return citiesPromise;
}

/** Curated capture/liberation timeline (copied to public by the fronts ETL). */
export function loadCityControl(): Promise<ControlCity[]> {
  if (!controlPromise) {
    controlPromise = fetch(CONTROL_URL)
      .then((r) => r.json())
      .then((data) => data.cities as ControlCity[]);
  }
  return controlPromise;
}

/** Lowercased, diacritic-folded text for matching (Łódź -> lodz). */
export function foldText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[łŁ]/g, 'l')
    .toLowerCase();
}

/** Prefix matches first, then substring; ties broken by importance. */
export function searchCities(cities: City[], query: string, limit = 8): City[] {
  const q = foldText(query.trim());
  if (q.length < 2) return [];
  const scored: { city: City; score: number }[] = [];
  for (const city of cities) {
    const name = foldText(city.name);
    const score = name.startsWith(q) ? 0 : name.includes(q) ? 1 : -1;
    if (score >= 0) scored.push({ city, score });
  }
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      a.city.scalerank - b.city.scalerank ||
      b.city.pop - a.city.pop,
  );
  return scored.slice(0, limit).map((s) => s.city);
}

/** Holder of a curated city on the given date. */
export function holderOn(city: ControlCity, dateISO: string): 'axis' | 'soviet' {
  const d = dateToNum(dateISO);
  let side = city.init;
  for (const c of city.changes) {
    if (dateToNum(c.date) > d) break;
    side = c.side;
  }
  return side;
}

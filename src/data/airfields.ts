// Shared airfield data: the curated Eastern-Front airfield set, built to public
// by data/pipeline/build-airfields.mjs. Fetched once and cached so the map layer,
// the omnibox search, and the detail panel all reuse one copy. Same pattern as
// ./cities; air-unit position keyframes reference these by id (`base`).

import type { FeatureCollection, Point } from 'geojson';
import { foldText } from './cities';

const BASE = import.meta.env.BASE_URL;
const CATALOG_URL = `${BASE}data/airfields/eastern.json`;
const GEOJSON_URL = `${BASE}data/airfields/eastern.geojson`;

export interface Airfield {
  id: string;
  name: string;
  lon: number;
  lat: number;
  country: string;
  notes?: string;
}

let catalogPromise: Promise<Airfield[]> | null = null;
let geojsonPromise: Promise<FeatureCollection> | null = null;

/** Flat airfield list, for search and the detail panel. */
export function loadAirfields(): Promise<Airfield[]> {
  if (!catalogPromise) {
    catalogPromise = fetch(CATALOG_URL)
      .then((r) => (r.ok ? r.json() : { airfields: [] }))
      .then((d) => d.airfields as Airfield[]);
  }
  return catalogPromise;
}

/** Raw FeatureCollection, for the MapLibre source. */
export function loadAirfieldsGeoJSON(): Promise<FeatureCollection> {
  if (!geojsonPromise) {
    geojsonPromise = fetch(GEOJSON_URL).then((r) =>
      r.ok ? r.json() : ({ type: 'FeatureCollection', features: [] } as FeatureCollection),
    );
  }
  return geojsonPromise;
}

/** Airfield by id (or undefined). */
export async function airfieldById(id: string): Promise<Airfield | undefined> {
  return (await loadAirfields()).find((a) => a.id === id);
}

/** Prefix matches first, then substring, over the field name. */
export function searchAirfields(airfields: Airfield[], query: string, limit = 4): Airfield[] {
  const q = foldText(query.trim());
  if (q.length < 2) return [];
  const scored: { af: Airfield; score: number }[] = [];
  for (const af of airfields) {
    const name = foldText(af.name);
    const score = name.startsWith(q) ? 0 : name.includes(q) ? 1 : -1;
    if (score >= 0) scored.push({ af, score });
  }
  scored.sort((a, b) => a.score - b.score || a.af.name.localeCompare(b.af.name));
  return scored.slice(0, limit).map((s) => s.af);
}

/** Coordinate -> Point geometry helper for callers that just need the position. */
export function airfieldPoint(af: Airfield): Point {
  return { type: 'Point', coordinates: [af.lon, af.lat] };
}

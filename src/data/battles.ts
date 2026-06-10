// Shared battle data (Wikidata-derived, see data/pipeline/build-battles.mjs).
// Fetched once and cached, same pattern as ./cities and ./units.

import { foldText } from './cities';

export interface Battle {
  id: string; // Wikidata QID
  name: string;
  lon: number;
  lat: number;
  start: string;
  end: string;
  startNum: number;
  endNum: number;
  lingerNum: number;
  wiki: string | null;
}

let battlesPromise: Promise<Battle[]> | null = null;

export function loadBattles(): Promise<Battle[]> {
  if (!battlesPromise) {
    battlesPromise = fetch(`${import.meta.env.BASE_URL}data/battles/battles.json`)
      .then((r) => r.json())
      .then((d) => d.battles);
  }
  return battlesPromise;
}

/** Prefix matches first, then substring. */
export function searchBattles(battles: Battle[], query: string, limit = 4): Battle[] {
  const q = foldText(query.trim());
  if (q.length < 2) return [];
  const scored: { b: Battle; score: number }[] = [];
  for (const b of battles) {
    const n = foldText(b.name);
    const score = n.startsWith(q) ? 0 : n.includes(q) ? 1 : -1;
    if (score >= 0) scored.push({ b, score });
  }
  // Longer battles first on ties — multi-month operations are the famous ones.
  scored.sort((a, b) => a.score - b.score || b.b.endNum - b.b.startNum - (a.b.endNum - a.b.startNum));
  return scored.slice(0, limit).map((s) => s.b);
}
